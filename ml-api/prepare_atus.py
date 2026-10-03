"""
prepare_atus.py
Turn American Time Use Survey (ATUS) diaries into "study" and "cook" challenges
for the Predict My Life model.

Input : data/atus/atusact.csv  (activities with times, ~400 MB)
        data/atus/atussum.csv  (one row per person: age, day, school enrollment)
Output: data/atus/atus_challenges.csv  (same columns as fitbit_challenges.csv)

Each ATUS person filled in ONE day, so these rows have no personal history:
they are treated like a brand-new user (0 attempts, 0 streak, average rate).
user_confidence is SIMULATED, as with Fitbit.
"""

from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data"
ATUS_DIR = DATA_DIR / "atus"
OUT_FILE = ATUS_DIR / "atus_challenges.csv"
rng = np.random.default_rng(7)

# ---- Who to include (match our target users) ----
AGE_MIN, AGE_MAX = 18, 24
COLLEGE_ONLY = True          # enrolled in college/university

# ---- ATUS activity codes (see codes.csv) ----
COOK_CODES = [20201]                 # Food and drink preparation
STUDY_CODES = [60301, 60302]         # Research/homework for class

# ---- Challenge settings ----
COOK_DEADLINES = [18, 19, 20, 21]    # "cook dinner by 6/7/8/9 PM"
DINNER_FROM_HOUR = 15                # only cooking that starts after 3 PM counts as dinner
COOK_MIN_MINUTES = 15                # must cook at least this long before the deadline
STUDY_GOALS = [60, 120, 180]         # "study 1/2/3 hours"
STUDY_DEADLINES = [21, 22, 23]       # "...by 9/10/11 PM"

# Only make a challenge for people who did the activity at some point that day.
# Reason: app users post goals they INTEND to do. Most ATUS people simply weren't
# planning to cook/study that day; counting them as "failures" would be wrong.
# With this on, the question becomes "did they hit the goal/deadline?".
INTENDED_ONLY = True

DIARY_START_HOUR = 4                 # ATUS diaries run 4 AM -> 4 AM next day
PRIOR_STRENGTH = 5


def minutes_since_4am(hour):
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
    """Read the big activity file in chunks, keeping only cooking/studying rows."""
    cols = ["tucaseid", "trcodep", "tuactdur24", "tucumdur24"]
    wanted = set(COOK_CODES + STUDY_CODES)
    parts, seen = [], set()
    for chunk in pd.read_csv(ATUS_DIR / "atusact.csv", usecols=cols, encoding="utf-8-sig",
                             dtype={"tucaseid": str}, chunksize=500_000):
        chunk = chunk[chunk.tucaseid.isin(case_ids)]
        seen.update(chunk.tucaseid.unique())
        parts.append(chunk[chunk.trcodep.isin(wanted)])
    a = pd.concat(parts, ignore_index=True)
    # Position in the diary, in minutes since 4 AM
    a["end_min"] = a.tucumdur24
    a["start_min"] = a.tucumdur24 - a.tuactdur24
    return a, seen


def minutes_before(acts, deadline_min):
    """Total activity minutes completed before the deadline (partial overlap counted)."""
    if acts.empty:
        return 0
    return float((deadline_min - acts.start_min).clip(lower=0).clip(upper=acts.tuactdur24).sum())


def to_difficulty_ratio(goal, usual):
    ratio = goal / max(usual, 1)
    return int(np.digitize(ratio, [0.7, 0.9, 1.1, 1.3]) + 1)


def to_difficulty_earlier(goal_hour, usual_hour):
    earlier = usual_hour - goal_hour
    return int(np.digitize(earlier, [-1.0, -0.25, 0.25, 1.0]) + 1)


def build_rows(people, acts):
    cook_acts = acts[acts.trcodep.isin(COOK_CODES)
                     & (acts.start_min >= minutes_since_4am(DINNER_FROM_HOUR))]
    study_acts = acts[acts.trcodep.isin(STUDY_CODES)]

    # "Usual" levels for a typical person in this group (like a new app user):
    # - study: median daily study minutes among those who studied
    # - cook: median clock time dinner cooking is DONE (end of first dinner session),
    #         since "cook by X PM" means finished cooking by then
    study_totals = study_acts.groupby("tucaseid").tuactdur24.sum()
    usual_study = study_totals.median() if len(study_totals) else 120
    first_dinner_end = cook_acts.groupby("tucaseid").end_min.min()
    usual_cook_hour = (first_dinner_end.median() / 60 + DIARY_START_HOUR) if len(first_dinner_end) else 19

    cook_by_person = dict(tuple(cook_acts.groupby("tucaseid")))
    study_by_person = dict(tuple(study_acts.groupby("tucaseid")))
    empty = acts.iloc[0:0]

    rows = []
    for _, p in people.iterrows():
        base = {
            "user_id": p.tucaseid,
            "date": f"{p.tuyear}",          # ATUS gives the year, not the exact date
            "day_of_week": int(p.day_of_week),
            "is_weekend": int(p.day_of_week >= 5),
            "current_streak": 0,
            "previous_attempts": 0,
        }

        # Cook: "cook dinner by X PM"
        cook = cook_by_person.get(p.tucaseid, empty)
        if not (INTENDED_ONLY and cook.tuactdur24.sum() < COOK_MIN_MINUTES):
            deadline = int(rng.choice(COOK_DEADLINES))
            cooked = minutes_before(cook, minutes_since_4am(deadline))
            rows.append({**base, "category": "cook", "goal": deadline, "target_hour": deadline,
                         "difficulty": to_difficulty_earlier(deadline, usual_cook_hour),
                         "success": int(cooked >= COOK_MIN_MINUTES)})

        # Study: "study N hours by X PM"
        study = study_by_person.get(p.tucaseid, empty)
        if not (INTENDED_ONLY and study.empty):
            goal = int(rng.choice(STUDY_GOALS))
            deadline = int(rng.choice(STUDY_DEADLINES))
            studied = minutes_before(study, minutes_since_4am(deadline))
            rows.append({**base, "category": "study", "goal": goal, "target_hour": deadline,
                         "difficulty": to_difficulty_ratio(goal, usual_study),
                         "success": int(studied >= goal)})

    print(f"Typical student: studies {usual_study:.0f} min on study days, "
          f"finishes cooking dinner around {usual_cook_hour:.1f}h")
    return pd.DataFrame(rows)


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
    df = add_rate_and_confidence(build_rows(people, acts))
    df["source"] = "atus"
    cols = ["user_id", "date", "category", "goal", "day_of_week", "is_weekend",
            "target_hour", "difficulty", "user_confidence", "past_success_rate",
            "current_streak", "previous_attempts", "success", "source"]
    df[cols].to_csv(OUT_FILE, index=False)

    print(f"Saved {len(df)} rows -> {OUT_FILE}")
    print(df.groupby("category").success.agg(rows="size", success_rate="mean").round(2))
    print("\nWeekday vs weekend success:")
    print(df.groupby(["category", "is_weekend"]).success.mean().unstack().round(2))


if __name__ == "__main__":
    main()
