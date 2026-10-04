"""
prepare_atus.py
Turn American Time Use Survey (ATUS) diaries into study, cook and exercise
challenges for the Predict My Life model.

Input : data/atus/atusact.csv  (activities with start/stop times, ~400 MB)
        data/atus/atussum.csv  (one row per person: age, day, school enrollment)
Output: data/atus/atus_challenges.csv  (same columns as fitbit_challenges.csv)
        data/atus/typical.json         (typical student's levels, for auto difficulty)

Challenges (category / goal_type):
  study    / amount      "Study 2 hours by 11 PM"
  study    / deadline    "Finish studying by 9 PM"
  study    / start_time  "Start studying by 4 PM"
  cook     / amount      "Cook dinner for 30+ minutes"
  cook     / deadline    "Cook dinner by 7 PM"
  cook     / start_time  "Start cooking dinner by 6 PM"
  exercise / deadline    "Work out before 5 PM"
  exercise / start_time  "Start working out by 8 AM"

Each ATUS person filled in ONE day, so these rows have no personal history:
they are treated like a brand-new user (0 attempts, 0 streak, average rate).
user_confidence is SIMULATED, as with Fitbit.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

ATUS_DIR = Path(__file__).parent / "data" / "atus"
OUT_FILE = ATUS_DIR / "atus_challenges.csv"
TYPICAL_FILE = ATUS_DIR / "typical.json"
rng = np.random.default_rng(7)

# ---- Who to include (match our target users) ----
AGE_MIN, AGE_MAX = 18, 24
COLLEGE_ONLY = True          # enrolled in college/university

DIARY_START_HOUR = 4         # ATUS diaries run 4 AM -> 4 AM next day
DEFAULT_HOUR = 22            # deadline used for "amount" goals with no time of their own


def is_activity(codes):
    """Map ATUS activity codes (see codes.csv) to our categories."""
    out = pd.Series(None, index=codes.index, dtype="object")
    out[codes == 20201] = "cook"                          # Food and drink preparation
    out[codes.isin([60301, 60302])] = "study"             # Research/homework for class
    out[codes.between(130101, 130199)] = "exercise"       # Participating in sports/exercise
    return out


# Only make a challenge for people who did the activity that day ("intended" to).
# App users post goals they INTEND to do; most ATUS people simply weren't planning
# to cook/study/exercise that day, so counting them as failures would be wrong.
MIN_MINUTES = {"cook": 15, "study": 1, "exercise": 10}
DINNER_FROM_HOUR = 15        # only cooking that starts after 3 PM counts as dinner
COOK_DONE_MINUTES = 15       # "cook dinner by X" = 15+ minutes of cooking done before X

# How each challenge type is built
#   goals : possible goals (one picked at random per person)
#   kind  : "ratio" (amount must be reached) or "earlier" (clock hour must be at/before goal)
SPECS = {
    ("study", "amount"):        {"goals": [60, 120, 180], "deadlines": [21, 22, 23], "kind": "ratio"},
    ("study", "deadline"):      {"goals": [20, 21, 22, 23], "kind": "earlier"},
    ("study", "start_time"):    {"goals": [10, 13, 16, 19], "kind": "earlier"},
    ("cook", "amount"):         {"goals": [15, 30, 45, 60], "kind": "ratio"},
    ("cook", "deadline"):       {"goals": [18, 19, 20, 21], "kind": "earlier"},
    ("cook", "start_time"):     {"goals": [17, 18, 19, 20], "kind": "earlier"},
    ("exercise", "deadline"):   {"goals": [9, 12, 17, 20], "kind": "earlier"},
    ("exercise", "start_time"): {"goals": [8, 11, 15, 18], "kind": "earlier"},
}


def clock(minutes_since_start):
    """Diary minutes since 4 AM -> clock hour (after midnight = 24, 25, ...)."""
    return DIARY_START_HOUR + minutes_since_start / 60


def diary_min(hour):
    return (hour - DIARY_START_HOUR) * 60


def load_people():
    cols = ["tucaseid", "teage", "teschenr", "teschlvl", "tudiaryday", "tuyear"]
    p = pd.read_csv(ATUS_DIR / "atussum.csv", usecols=cols, encoding="utf-8-sig",
                    dtype={"tucaseid": str})
    keep = p.teage.between(AGE_MIN, AGE_MAX)
    if COLLEGE_ONLY:
        keep &= (p.teschenr == 1) & (p.teschlvl == 2)
    p = p[keep].copy()
    # ATUS: 1 = Sunday ... 7 = Saturday  ->  0 = Monday ... 6 = Sunday
    p["day_of_week"] = (p.tudiaryday + 5) % 7
    return p


def load_activities(case_ids):
    """Read the big activity file in chunks, keeping only cook/study/exercise rows."""
    cols = ["tucaseid", "trcodep", "tuactdur24", "tucumdur24"]
    parts, seen = [], set()
    for chunk in pd.read_csv(ATUS_DIR / "atusact.csv", usecols=cols, encoding="utf-8-sig",
                             dtype={"tucaseid": str}, chunksize=500_000):
        chunk = chunk[chunk.tucaseid.isin(case_ids)]
        seen.update(chunk.tucaseid.unique())
        chunk = chunk.assign(category=is_activity(chunk.trcodep)).dropna(subset=["category"])
        parts.append(chunk)
    a = pd.concat(parts, ignore_index=True)
    a["end_min"] = a.tucumdur24                         # minutes since 4 AM
    a["start_min"] = a.tucumdur24 - a.tuactdur24
    # Cooking only counts as dinner if it starts after 3 PM
    a = a[(a.category != "cook") | (a.start_min >= diary_min(DINNER_FROM_HOUR))]
    return a, seen


def minutes_before(acts, deadline_hour):
    """Activity minutes completed before the deadline (partial overlap counted)."""
    left = diary_min(deadline_hour) - acts.start_min
    return float(left.clip(lower=0).clip(upper=acts.tuactdur24).sum())


def done_by_hour(acts, minutes_needed):
    """Clock hour when `minutes_needed` minutes of the activity were completed."""
    total = 0.0
    for _, a in acts.sort_values("start_min").iterrows():
        if total + a.tuactdur24 >= minutes_needed:
            return clock(a.start_min + (minutes_needed - total))
        total += a.tuactdur24
    return np.inf


def person_summary(acts):
    """The values each challenge type needs, for one person and one activity."""
    return {
        "total": float(acts.tuactdur24.sum()),
        "first_start": clock(acts.start_min.min()),
        "last_end": clock(acts.end_min.max()),
        "first_end": clock(acts.sort_values("start_min").end_min.iloc[0]),
        "cook_done": done_by_hour(acts, COOK_DONE_MINUTES),
        "acts": acts,
    }


# What "value" each challenge type measures (for success and for the typical level)
VALUE = {
    ("study", "amount"): "total",
    ("study", "deadline"): "last_end",          # all studying finished
    ("study", "start_time"): "first_start",
    ("cook", "amount"): "total",
    ("cook", "deadline"): "cook_done",          # 15 min of dinner cooking done
    ("cook", "start_time"): "first_start",
    ("exercise", "deadline"): "first_end",      # a workout completed
    ("exercise", "start_time"): "first_start",
}


def to_difficulty(goal, usual, kind):
    if kind == "earlier":
        return int(np.digitize(usual - goal, [-1.0, -0.25, 0.25, 1.0]) + 1)
    return int(np.digitize(goal / max(usual, 1), [0.7, 0.9, 1.1, 1.3]) + 1)


def build_rows(people, acts):
    # Summaries for everyone who did each activity that day
    summaries = {}
    for (cid, cat), g in acts.groupby(["tucaseid", "category"]):
        if g.tuactdur24.sum() >= MIN_MINUTES[cat]:
            summaries[(cid, cat)] = person_summary(g)

    # Typical student's level per challenge type (median over people who did it)
    typical = {}
    for (cat, gt), field in VALUE.items():
        vals = [s[field] for (cid, c), s in summaries.items() if c == cat and np.isfinite(s[field])]
        if vals:
            typical[f"{cat}|{gt}"] = {"kind": SPECS[(cat, gt)]["kind"], "value": round(float(np.median(vals)), 2)}

    rows = []
    for _, p in people.iterrows():
        base = {"user_id": p.tucaseid, "date": f"{p.tuyear}",       # ATUS gives the year only
                "day_of_week": int(p.day_of_week), "is_weekend": int(p.day_of_week >= 5),
                "current_streak": 0, "previous_attempts": 0}
        for (cat, gt), spec in SPECS.items():
            s = summaries.get((p.tucaseid, cat))
            key = f"{cat}|{gt}"
            if s is None or key not in typical:
                continue
            goal = int(rng.choice(spec["goals"]))
            usual = typical[key]["value"]
            if (cat, gt) == ("study", "amount"):
                deadline = int(rng.choice(spec["deadlines"]))
                success = int(minutes_before(s["acts"], deadline) >= goal)
            elif spec["kind"] == "ratio":
                deadline = DEFAULT_HOUR
                success = int(s[VALUE[(cat, gt)]] >= goal)
            else:
                deadline = goal
                success = int(s[VALUE[(cat, gt)]] <= goal)
            rows.append({**base, "category": cat, "goal_type": gt, "goal": goal,
                         "target_hour": deadline,
                         "difficulty": to_difficulty(goal, usual, spec["kind"]),
                         "success": success})
    return pd.DataFrame(rows), typical


def add_rate_and_confidence(df):
    # No history: everyone is a "new user", so the shrunk rate = category average
    df["past_success_rate"] = df.groupby("category").success.transform("mean").round(3)
    conf = (
        df.past_success_rate
        - 0.08 * (df.difficulty - 3)
        + 0.10                                   # overconfidence bias (same as Fitbit)
        + rng.normal(0, 0.12, len(df))
    )
    df["user_confidence"] = conf.clip(0.05, 0.95).round(2)
    return df


def main():
    people = load_people()
    acts, seen = load_activities(set(people.tucaseid))
    people = people[people.tucaseid.isin(seen)]   # must have a diary
    print(f"People matching filter: {len(people)}")
    if people.empty:
        print("No matching people found - check the files in data/atus/")
        return
    rows, typical = build_rows(people, acts)
    df = add_rate_and_confidence(rows)
    df["source"] = "atus"
    cols = ["user_id", "date", "category", "goal_type", "goal", "day_of_week", "is_weekend",
            "target_hour", "difficulty", "user_confidence", "past_success_rate",
            "current_streak", "previous_attempts", "success", "source"]
    df[cols].to_csv(OUT_FILE, index=False)
    TYPICAL_FILE.write_text(json.dumps(typical, indent=2))

    print(f"Saved {len(df)} rows -> {OUT_FILE}")
    print(df.groupby(["category", "goal_type"]).success.agg(rows="size", success_rate="mean").round(2))
    print("\nTypical student:")
    for k, v in typical.items():
        print(f"  {k:<20} {v['value']}")


if __name__ == "__main__":
    main()
