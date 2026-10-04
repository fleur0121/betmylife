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
       your record for this sub-goal       ("study / amount")
     ← your record for this category       ("study")
     ← community record for this sub-goal / category (all users)
     ← your general tendency (all your challenges)
     ← overall average
   Each level only counts as much as its data allows (few results -> leans on the
   level below). Missing levels are simply skipped, so a brand-new sub-goal or
   category still gets a sensible number.
   The bottom of the chain is the category's baseline: the trained model for
   steps/exercise/sleep/wake_up/study/cook, an average category otherwise.
2. TODAY'S ADJUSTMENTS - difficulty, deadline, weekend and streak, from the model.
3. CONFIDENCE - a gentle nudge toward the user's own estimate.

Goal types (sub-goals inside a category)
----------------------------------------
  amount     "study 2 hours", "walk 10,000 steps"        goal_value + goal_unit
  deadline   "finish homework by 9 PM", "wake up by 7"   target_hour = deadline
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

from features import add_features

MODEL_FILE = Path(__file__).parent / "model.joblib"
artifact = joblib.load(MODEL_FILE)
MODEL = artifact["model"]
FEATURES = artifact["features"]
KNOWN = set(artifact["categories"])
CATEGORY_RATE = artifact["category_success_rate"]      # trained average per category
OVERALL_RATE = artifact["overall_success_rate"]
MODEL_VERSION = artifact["model_version"]

# How many results a record needs before it "counts" (shrinkage strength)
USER_STRENGTH = 5           # a user's own record
COMMUNITY_STRENGTH = 20     # all users' record for a category / sub-goal
COMMUNITY_TRUSTED = 50      # community results after which a new category gets normal odds caps
CONFIDENCE_WEIGHT = 0.25    # how much the user's own estimate moves the prediction (0 = ignore)
TENDENCY_WEIGHT = 0.5       # how much a user's GENERAL record (other categories) carries over

P_MIN, P_MAX = 0.05, 0.95   # never claim certainty
ODDS_CAP_KNOWN = (1.1, 5.0)
ODDS_CAP_UNKNOWN = (1.2, 3.0)
DEFAULT_TARGET_HOUR = 22    # "by the end of the day"

GoalType = Literal["amount", "deadline", "start_time", "task"]

# Typical person's level (from the training data), used to auto-calculate difficulty
TYPICAL_AMOUNT = {          # "amount" goals
    "steps": 7400,          # steps per day (Fitbit median)
    "exercise": 21,         # active minutes per day (Fitbit median)
    "sleep": 433,           # minutes asleep (Fitbit median, ~7.2 h)
    "study": 150,           # study minutes on study days (ATUS students)
}
TYPICAL_DEADLINE = {        # "deadline" goals: usual clock hour it's done
    "wake_up": 7.25,        # ~7:15 AM
    "cook": 18.5,           # dinner cooking done ~6:30 PM
}
# The "neutral day" that today's adjustments are measured against:
# medium difficulty, a Tuesday, and a typical deadline for the category
NEUTRAL = {"difficulty": 3, "day_of_week": 1}
NEUTRAL_HOUR = {"steps": 22, "exercise": 22, "sleep": 8, "wake_up": 8, "study": 22, "cook": 19}


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
    target_hour: Optional[int] = Field(None, ge=0, le=23, description="Deadline (or start) hour, 0-23")
    goal_value: Optional[float] = Field(None, description="e.g. 10000 steps, 2 hours")
    goal_unit: Optional[Literal["steps", "minutes", "hours"]] = None
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
    prediction_source: Literal["trained_category", "community_category", "user_traits_only"]
    category: str
    category_known: bool
    goal_type: GoalType
    difficulty_used: int
    difficulty_source: Literal["user", "auto", "default"]
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


def auto_difficulty(req: PredictRequest, category: str, goal_type: GoalType):
    """Goal vs. usual level -> 1-5 (same rules as the training data). None if not possible."""
    if goal_type == "amount" and category in TYPICAL_AMOUNT and req.goal_value is not None:
        goal = req.goal_value * 60 if req.goal_unit == "hours" else req.goal_value
        usual = req.history.usual_value or TYPICAL_AMOUNT[category]
        return int(np.digitize(goal / max(usual, 1), [0.7, 0.9, 1.1, 1.3]) + 1)
    if goal_type == "deadline" and category in TYPICAL_DEADLINE and req.target_hour is not None:
        usual = req.history.usual_value or TYPICAL_DEADLINE[category]
        return int(np.digitize(usual - req.target_hour, [-1.0, -0.25, 0.25, 1.0]) + 1)
    return None


def starting_rate(h: History, category_prior: float):
    """Chain the records from general to specific. Returns (rate, description)."""
    # Community: category, then sub-goal (relative to the category)
    comm_cat = shrink(h.community_category, category_prior, COMMUNITY_STRENGTH)
    comm_sub = shrink(h.community_subgoal, comm_cat, COMMUNITY_STRENGTH)

    # Personal tendency: how this user does in general vs. the average person
    user_general = shrink(h.user_overall, OVERALL_RATE, USER_STRENGTH)
    rate = sigmoid(logit(comm_sub) + TENDENCY_WEIGHT * (logit(user_general) - logit(OVERALL_RATE)))

    # This user's own record in the category, then in the sub-goal
    user_cat = shrink(h.user_category, rate, USER_STRENGTH)
    sub_prior = shift(user_cat, comm_cat, comm_sub)        # apply the sub-goal's effect
    user_sub = shrink(h.user_subgoal, sub_prior, USER_STRENGTH)

    if h.user_subgoal.attempts:
        source = f"your record for this goal type ({h.user_subgoal.successes}/{h.user_subgoal.attempts})"
    elif h.user_category.attempts:
        source = f"your record in this category ({h.user_category.successes}/{h.user_category.attempts})"
    elif h.community_category.attempts:
        source = f"community record ({h.community_category.successes}/{h.community_category.attempts})"
    elif h.user_overall.attempts:
        source = "your general track record"
    else:
        source = "typical person for this category"
    return user_sub, source


def model_p(category, day, target_hour, difficulty, confidence, past_rate, streak, attempts):
    row = pd.DataFrame([{
        "category": category, "day_of_week": day, "is_weekend": int(day >= 5),
        "target_hour": target_hour, "difficulty": difficulty,
        "user_confidence": confidence, "past_success_rate": past_rate,
        "current_streak": streak, "previous_attempts": attempts,
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
    """Category keys the model was trained on (the LLM should reuse exactly these)."""
    return {"known_categories": sorted(KNOWN), "category_success_rate": CATEGORY_RATE,
            "goal_types": ["amount", "deadline", "start_time", "task"]}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    category = req.category.strip().lower().replace(" ", "_")
    known = category in KNOWN and not req.is_new_category
    goal_type = infer_goal_type(req)
    h = req.history

    # Difficulty: user's rating wins; else auto-calculate vs. a TYPICAL person
    # (only if we know the user's usual level or they have no record yet - otherwise
    # their own record already reflects how hard this is for them); else neutral 3
    has_record = h.user_category.attempts > 0
    auto = auto_difficulty(req, category, goal_type)
    if req.difficulty is not None:
        difficulty, diff_source = req.difficulty, "user"
    elif auto is not None and (h.usual_value is not None or not has_record):
        difficulty, diff_source = auto, "auto"
    else:
        difficulty, diff_source = 3, "default"

    day = req.day_of_week if req.day_of_week is not None else datetime.now().weekday()
    target_hour = req.target_hour if req.target_hour is not None else DEFAULT_TARGET_HOUR
    model_cat = category if known else "other"         # unseen by the model -> average category
    neutral_hour = NEUTRAL_HOUR.get(category, DEFAULT_TARGET_HOUR) if known else DEFAULT_TARGET_HOUR

    # 1. Category baseline on a neutral day: trained model for known categories, average otherwise
    if known:
        cat_rate = CATEGORY_RATE.get(category, OVERALL_RATE)
        category_prior = model_p(model_cat, NEUTRAL["day_of_week"], neutral_hour, NEUTRAL["difficulty"],
                                 0.5, cat_rate, 0, 0)
    else:
        category_prior = OVERALL_RATE

    # 2. Starting rate: community -> personal tendency -> your category -> your sub-goal
    start, start_desc = starting_rate(h, category_prior)

    # 3. Today's adjustments from the model: difficulty, deadline, weekend, streak
    neutral = model_p(model_cat, NEUTRAL["day_of_week"], neutral_hour, NEUTRAL["difficulty"],
                      0.5, start, 0, h.user_category.attempts)
    today = model_p(model_cat, day, target_hour, difficulty, 0.5, start,
                    h.current_streak, h.user_category.attempts)
    p = sigmoid(logit(start) + logit(today) - logit(neutral))

    if known:
        source, cap = "trained_category", ODDS_CAP_KNOWN
    else:
        source = "community_category" if h.community_category.attempts else "user_traits_only"
        cap = ODDS_CAP_KNOWN if h.community_category.attempts >= COMMUNITY_TRUSTED else ODDS_CAP_UNKNOWN

    before_conf = p
    # Confidence: nudge toward the user's own estimate (simulated in training, so applied here)
    p = sigmoid(logit(p) + CONFIDENCE_WEIGHT * (logit(req.user_confidence) - logit(p)))

    p = clip(p, P_MIN, P_MAX)
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
        breakdown=Breakdown(
            starting_rate=round(start, 3),
            starting_from=start_desc,
            adjustment_today=round(before_conf - start, 3),
            adjustment_confidence=round(p - before_conf, 3),
        ),
    )
