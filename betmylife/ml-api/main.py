"""
main.py
FastAPI server for Predict My Life: turns a challenge into a success
probability and game odds.

Run (from ml-api, venv active):
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
Test page:
    http://localhost:8000/docs

Flow:
    user text -> friend's LLM (category, goal_type, target_hour, goal_value...) -> POST /predict

How a probability is built
--------------------------
1. STARTING RATE - the best available record, most specific first:
       your record for this goal type     ("study / deadline")
     ← your record for this category      ("study")
     ← your general tendency (all your challenges)
     ← community record for this goal type / category (all users)
     ← baseline: the trained model for this category + goal type
   Each level only counts as much as its data allows; missing levels are skipped.
2. TODAY'S ADJUSTMENTS - difficulty, deadline, weekend and streak, from the model.
3. CONFIDENCE - a gentle nudge toward the user's own estimate.

Trained category + goal type combinations (real data):
  steps    amount, deadline          sleep    amount, deadline (bedtime)
  exercise amount, deadline, start   wake_up  deadline
  study    amount, deadline, start   cook     amount, deadline, start
Anything else (new categories, "task" goals) still works: it uses whatever the
model knows about the category and goal type separately, plus the records.

Goal types
----------
  amount     "study 2 hours", "walk 10,000 steps"        goal_value + goal_unit
  deadline   "finish homework by 9 PM", "asleep by 11"   target_hour = deadline
  start_time "start studying at 3 PM"                    target_hour = start hour
  task       "finish my essay" (no number or time)       nothing extra
"""

import math
from datetime import datetime
from pathlib import Path
from typing import Literal, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from features import add_features, model_hour
from nlp_adapter import nlp_to_requests

MODEL_FILE = Path(__file__).parent / "model.joblib"
artifact = joblib.load(MODEL_FILE)
MODEL = artifact["model"]
FEATURES = artifact["features"]
KNOWN = set(artifact["categories"])
TRAINED_COMBOS = set(artifact["trained_combos"])          # e.g. "study|deadline"
CATEGORY_RATE = artifact["category_success_rate"]
OVERALL_RATE = artifact["overall_success_rate"]
NEUTRAL_HOUR = artifact["neutral_hour"]                    # typical deadline per combination
TYPICAL = artifact["typical"]                              # typical levels for auto difficulty
MODEL_VERSION = artifact["model_version"]

# How many results a record needs before it "counts" (shrinkage strength)
USER_STRENGTH = 5           # a user's own record
COMMUNITY_STRENGTH = 20     # all users' record for a category / goal type
COMMUNITY_TRUSTED = 50      # community results after which a new category gets normal odds caps
CONFIDENCE_WEIGHT = 0.25    # how much the user's own estimate moves the prediction (0 = ignore)
TENDENCY_WEIGHT = 0.5       # how much a user's GENERAL record (other categories) carries over

P_MIN, P_MAX = 0.05, 0.95   # never claim certainty
ODDS_CAP_KNOWN = (1.1, 5.0)
ODDS_CAP_UNKNOWN = (1.2, 3.0)
DEFAULT_TARGET_HOUR = 22    # "by the end of the day"
NEUTRAL_DAY, NEUTRAL_DIFFICULTY = 1, 3   # a Tuesday, medium difficulty

GoalType = Literal["amount", "deadline", "start_time", "task"]


# ---------- Request / response ----------

class Record(BaseModel):
    attempts: int = Field(0, ge=0)
    successes: int = Field(0, ge=0)


class History(BaseModel):
    """Past results, counted by the backend from Supabase (finished challenges only)."""
    user_overall: Record = Field(Record(), description="This user, ALL categories")
    user_category: Record = Field(Record(), description="This user, this category")
    user_subgoal: Record = Field(Record(), description="This user, this category + goal_type")
    community_category: Record = Field(Record(), description="ALL users, this category")
    community_subgoal: Record = Field(Record(), description="ALL users, this category + goal_type")
    current_streak: int = Field(0, ge=0, description="This user's successes in a row in this category")
    usual_value: Optional[float] = Field(
        None, description="User's usual level for this goal (steps, minutes or clock hour). Optional.")


class PredictRequest(BaseModel):
    # From the LLM
    category: str = Field(..., examples=["study"])
    is_new_category: bool = False
    goal_type: Optional[GoalType] = Field(None, description="Omit to infer from the other fields")
    target_hour: Optional[float] = Field(None, ge=0, lt=24,
                                        description="Deadline (or start) hour, 0-23.99 (7:30 PM = 19.5)")
    goal_value: Optional[float] = Field(None, description="e.g. 10000, 2, 5, 30")
    goal_unit: Optional[str] = Field(
        None, description="Any unit, e.g. steps, minutes, hours, km, miles, pages, liters. "
                          "Time, distance and steps are converted automatically; other units "
                          "are compared with the user's usual_value (same unit) if given.")
    activity: Optional[str] = Field(
        None, description="For distance goals: run, walk, bike or swim (default run)")
    # When
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="0 = Monday ... 6 = Sunday; default today")
    # From the user
    difficulty: Optional[int] = Field(None, ge=1, le=5, description="Self-rated; omit to auto-calculate")
    user_confidence: float = Field(..., ge=0, le=1, description="Required. User's own estimate, 0-1 (80% = 0.8)")
    history: History = History()


class Breakdown(BaseModel):
    """Why the model gave this number - handy for the app and the demo."""
    starting_rate: float
    starting_from: str
    adjustment_today: float     # difficulty, deadline, weekend, streak (in probability points)
    adjustment_confidence: float


class PredictResponse(BaseModel):
    success_probability: float
    yes_odds: float
    no_odds: float
    model_version: str
    prediction_source: Literal["trained", "trained_category", "community_category", "user_traits_only"]
    category: str
    category_known: bool
    goal_type: GoalType
    difficulty_used: int
    difficulty_source: Literal["user", "auto", "default"]
    goal_used: Optional[str] = None      # how the goal was read, e.g. "5 km run ≈ 30 minutes"
    breakdown: Breakdown


# ---------- Helpers ----------

def clip(p, lo=0.01, hi=0.99):
    return min(max(p, lo), hi)


def logit(p):
    p = clip(p)
    return math.log(p / (1 - p))


def sigmoid(z):
    return 1 / (1 + math.exp(-z))


def shrink(record: Record, prior: float, strength: int) -> float:
    """Few results -> stay near the prior; many results -> trust the record."""
    return (record.successes + strength * prior) / (record.attempts + strength)


def shift(p: float, from_rate: float, to_rate: float) -> float:
    """Move p by the same log-odds difference as from_rate -> to_rate."""
    return sigmoid(logit(p) + logit(to_rate) - logit(from_rate))


def infer_goal_type(req: PredictRequest) -> GoalType:
    if req.goal_type:
        return req.goal_type
    if req.goal_value is not None:
        return "amount"
    if req.target_hour is not None:
        return "deadline"
    return "task"


# ---------- Unit conversion ----------

UNIT_ALIASES = {
    "steps": ["step", "steps"],
    "seconds": ["s", "sec", "secs", "second", "seconds"],
    "minutes": ["min", "mins", "minute", "minutes"],
    "hours": ["h", "hr", "hrs", "hour", "hours"],
    "km": ["km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"],
    "miles": ["mi", "mile", "miles"],
    "meters": ["m", "meter", "meters", "metre", "metres"],
}
CANONICAL = {alias: unit for unit, aliases in UNIT_ALIASES.items() for alias in aliases}
TO_MINUTES = {"seconds": 1 / 60, "minutes": 1, "hours": 60}
TO_KM = {"km": 1, "miles": 1.609, "meters": 0.001}

STEPS_PER_KM = 1300          # average walking stride (~0.77 m)
STEPS_PER_MINUTE = 100       # brisk walking
MIN_PER_KM = {"run": 6, "walk": 12, "bike": 3, "swim": 25}   # typical paces

# Unit each trained category measures "amount" goals in
MODEL_UNIT = {"steps": "steps", "exercise": "minutes", "sleep": "minutes",
              "study": "minutes", "cook": "minutes"}


def convert_goal(category, value, unit, activity):
    """
    Convert the LLM's goal into the unit the model uses for this category.
    Returns (converted value or None, readable description or None).
    """
    if value is None:
        return None, None
    raw = (unit or "").strip().lower()
    u = CANONICAL.get(raw, raw)
    target = MODEL_UNIT.get(category)
    if target is None:
        return None, None
    act = (activity or "run").strip().lower()

    if target == "steps":
        if u in ("steps", ""):
            return value, None
        if u in TO_KM:
            steps = value * TO_KM[u] * STEPS_PER_KM
            return steps, f"{value:g} {raw} ≈ {steps:,.0f} steps"
        if u in TO_MINUTES:
            steps = value * TO_MINUTES[u] * STEPS_PER_MINUTE
            return steps, f"{value:g} {raw} of walking ≈ {steps:,.0f} steps"
        return None, None

    # target == "minutes"
    if u in TO_MINUTES:
        minutes = value * TO_MINUTES[u]
        return minutes, (None if u == "minutes" else f"{value:g} {raw} = {minutes:g} minutes")
    if u in TO_KM and category == "exercise":
        minutes = value * TO_KM[u] * MIN_PER_KM.get(act, MIN_PER_KM["run"])
        return minutes, f"{value:g} {raw} {act} ≈ {minutes:.0f} minutes"
    if u == "steps" and category == "exercise":
        minutes = value / STEPS_PER_MINUTE
        return minutes, f"{value:,.0f} steps ≈ {minutes:.0f} minutes of walking"
    return None, None


def auto_difficulty(req: PredictRequest, combo: str, hour, goal):
    """Goal vs. usual level -> 1-5 (same rules as the training data). None if not possible."""
    typical = TYPICAL.get(combo)
    if typical is None:
        return None
    if typical["kind"] == "ratio":
        if goal is None:
            return None
        usual = req.history.usual_value or typical["value"]
        if isinstance(usual, dict):                     # steps by a deadline: level per hour
            if hour is None:
                return None
            nearest = min(usual, key=lambda h: abs(int(h) - hour))
            usual = usual[nearest]
        return int(np.digitize(goal / max(usual, 1), [0.7, 0.9, 1.1, 1.3]) + 1)
    if hour is None:                                     # "earlier" kinds need a time
        return None
    usual = req.history.usual_value or typical["value"]
    return int(np.digitize(usual - hour, [-1.0, -0.25, 0.25, 1.0]) + 1)


def starting_rate(h: History, baseline: float):
    """Chain the records from general to specific. Returns (rate, description)."""
    comm_cat = shrink(h.community_category, baseline, COMMUNITY_STRENGTH)
    comm_sub = shrink(h.community_subgoal, comm_cat, COMMUNITY_STRENGTH)

    # Personal tendency: how this user does in general vs. the average person
    user_general = shrink(h.user_overall, OVERALL_RATE, USER_STRENGTH)
    rate = sigmoid(logit(comm_sub) + TENDENCY_WEIGHT * (logit(user_general) - logit(OVERALL_RATE)))

    # This user's own record in the category, then in the goal type
    user_cat = shrink(h.user_category, rate, USER_STRENGTH)
    sub_prior = shift(user_cat, comm_cat, comm_sub)      # apply the goal type's effect
    user_sub = shrink(h.user_subgoal, sub_prior, USER_STRENGTH)

    if h.user_subgoal.attempts:
        source = f"your record for this goal type ({h.user_subgoal.successes}/{h.user_subgoal.attempts})"
    elif h.user_category.attempts:
        source = f"your record in this category ({h.user_category.successes}/{h.user_category.attempts})"
    elif h.community_subgoal.attempts:
        source = f"community record for this goal type ({h.community_subgoal.successes}/{h.community_subgoal.attempts})"
    elif h.community_category.attempts:
        source = f"community record ({h.community_category.successes}/{h.community_category.attempts})"
    elif h.user_overall.attempts:
        source = "your general track record"
    else:
        source = "typical person for this kind of goal"
    return user_sub, source


def model_p(category, goal_type, day, hour, difficulty, past_rate, streak, attempts):
    row = pd.DataFrame([{
        "category": category, "goal_type": goal_type, "day_of_week": day, "is_weekend": int(day >= 5),
        "target_hour": hour, "difficulty": difficulty, "user_confidence": 0.5,
        "past_success_rate": past_rate, "current_streak": streak, "previous_attempts": attempts,
    }])
    return float(MODEL.predict_proba(add_features(row)[FEATURES])[0, 1])


def odds(p, cap):
    lo, hi = cap
    return round(float(min(max(1 / p, lo), hi)), 2)


# ---------- App ----------

app = FastAPI(title="Predict My Life - ML API", version=MODEL_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION,
            "feature_set": artifact["feature_set"], "trained_on": artifact["trained_on"]}


@app.get("/categories")
def categories():
    """Keys the model was trained on (the LLM should reuse exactly these)."""
    return {"known_categories": sorted(KNOWN),
            "goal_types": ["amount", "deadline", "start_time", "task"],
            "trained_combinations": sorted(TRAINED_COMBOS)}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    category = req.category.strip().lower().replace(" ", "_")
    known = category in KNOWN and not req.is_new_category
    goal_type = infer_goal_type(req)
    combo = f"{category}|{goal_type}"
    h = req.history

    hour = model_hour(category, goal_type, req.target_hour) if req.target_hour is not None else None
    neutral_hour = NEUTRAL_HOUR.get(combo, DEFAULT_TARGET_HOUR)
    # No time given (e.g. "sleep 8 hours"): use the usual deadline for this kind of goal
    target_hour = hour if hour is not None else neutral_hour

    # Difficulty: user's rating wins; else auto-calculate vs. a TYPICAL person
    # (only if we know the user's usual level or they have no record yet - otherwise
    # their own record already reflects how hard this is for them); else neutral 3
    has_record = h.user_category.attempts > 0
    goal, goal_used = convert_goal(category, req.goal_value, req.goal_unit, req.activity) if known else (None, None)
    if goal is not None:
        auto = auto_difficulty(req, combo, hour, goal)
    elif req.goal_value is not None and h.usual_value:
        # Any other unit (pages, liters, chapters...): compare with the user's usual amount
        auto = int(np.digitize(req.goal_value / h.usual_value, [0.7, 0.9, 1.1, 1.3]) + 1)
        goal_used = f"{req.goal_value:g} {req.goal_unit or ''} vs. your usual {h.usual_value:g}".strip()
    elif known and req.goal_value is None:
        auto = auto_difficulty(req, combo, hour, None)       # deadline / start-time goals
    else:
        auto = None
        if req.goal_value is not None:
            goal_used = f"{req.goal_value:g} {req.goal_unit or ''} (can't convert; difficulty from the user)".strip()
    if req.difficulty is not None:
        difficulty, diff_source = req.difficulty, "user"
    elif auto is not None and (h.usual_value is not None or not has_record):
        difficulty, diff_source = auto, "auto"
    else:
        difficulty, diff_source = 3, "default"

    day = req.day_of_week if req.day_of_week is not None else datetime.now().weekday()
    model_cat = category if known else "other"           # unseen by the model -> average category

    # 1. Baseline on a neutral day (trained model for known categories, average otherwise)
    if known:
        baseline = model_p(model_cat, goal_type, NEUTRAL_DAY, neutral_hour, NEUTRAL_DIFFICULTY,
                           CATEGORY_RATE.get(category, OVERALL_RATE), 0, 0)
    else:
        baseline = OVERALL_RATE

    # 2. Starting rate: community -> personal tendency -> your category -> your goal type
    start, start_desc = starting_rate(h, baseline)

    # 3. Today's adjustments from the model: difficulty, deadline, weekend, streak
    neutral = model_p(model_cat, goal_type, NEUTRAL_DAY, neutral_hour, NEUTRAL_DIFFICULTY,
                      start, 0, h.user_category.attempts)
    today = model_p(model_cat, goal_type, day, target_hour, difficulty, start,
                    h.current_streak, h.user_category.attempts)
    p = sigmoid(logit(start) + logit(today) - logit(neutral))
    before_conf = p

    # 4. Confidence: nudge toward the user's own estimate
    p = sigmoid(logit(p) + CONFIDENCE_WEIGHT * (logit(req.user_confidence) - logit(p)))
    p = clip(p, P_MIN, P_MAX)

    if known:
        source = "trained" if combo in TRAINED_COMBOS else "trained_category"
        cap = ODDS_CAP_KNOWN
    else:
        source = "community_category" if h.community_category.attempts else "user_traits_only"
        cap = ODDS_CAP_KNOWN if h.community_category.attempts >= COMMUNITY_TRUSTED else ODDS_CAP_UNKNOWN

    return PredictResponse(
        success_probability=round(p, 2),
        yes_odds=odds(p, cap),
        no_odds=odds(1 - p, cap),
        model_version=MODEL_VERSION,
        prediction_source=source,
        category=category,
        category_known=known,
        goal_type=goal_type,
        difficulty_used=difficulty,
        difficulty_source=diff_source,
        goal_used=goal_used,
        breakdown=Breakdown(
            starting_rate=round(start, 3),
            starting_from=start_desc,
            adjustment_today=round(before_conf - start, 3),
            adjustment_confidence=round(p - before_conf, 3),
        ),
    )


# ---------- NLP service integration ----------

class NlpPredictRequest(BaseModel):
    """Output of the challenge-NLP service + what the app/backend knows."""
    nlp: dict = Field(..., description="The NLP response (the whole thing, or its `data` object)")
    user_confidence: Optional[float] = Field(
        None, ge=0, le=1, description="From the app slider (0-1). Overrides the NLP value.")
    difficulty: Optional[int] = Field(None, ge=1, le=5, description="From the app. Overrides the NLP value.")
    history: History = History()


class NlpPrediction(BaseModel):
    request: dict          # the /predict request built from the NLP output (store it with the challenge)
    prediction: PredictResponse


@app.post("/predict-from-nlp", response_model=list[NlpPrediction])
def predict_from_nlp(body: NlpPredictRequest):
    """
    One prediction per action in the NLP output.
    Uses the same history for every action - for best results with several
    actions, call /predict per action with that action's own history.
    """
    results = []
    for req in nlp_to_requests(body.nlp):
        if body.user_confidence is not None:
            req["user_confidence"] = body.user_confidence
        if body.difficulty is not None:
            req["difficulty"] = body.difficulty
        req.setdefault("user_confidence", 0.5)
        req["history"] = body.history.model_dump()
        prediction = predict(PredictRequest(**req))
        results.append(NlpPrediction(request=req, prediction=prediction))
    return results
