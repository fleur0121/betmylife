"""
prepare_fitbit.py
Turn Fitbit daily data into "challenge" rows for the Predict My Life model.

Input : every dailyActivity_merged.csv, sleepDay_merged.csv and
        minuteSleep_merged.csv found under data/fitbit/
        (so the March folder is picked up automatically if you put it under data/fitbit/ later)
Output: data/fitbit/fitbit_challenges.csv

Categories produced (real data): steps, exercise, sleep, wake_up
Simulated: user_confidence (Fitbit has no confidence data)
"""

from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data" / "fitbit"
OUT_FILE = DATA_DIR / "fitbit_challenges.csv"
rng = np.random.default_rng(42)

# Possible goals per category (one is picked at random per person-day)
GOALS = {
    "steps": [5000, 7500, 10000, 12500],   # steps
    "exercise": [15, 30, 45, 60],          # very + fairly active minutes
    "sleep": [360, 420, 480],              # minutes asleep (6h, 7h, 8h)
    "wake_up": [6, 7, 8, 9],               # "wake up by X AM" (hour)
}
LOWER_IS_BETTER = {"wake_up"}  # success = value <= goal (earlier wake-up)
# Deadline hour used for each category (daily totals have no real time)
TARGET_HOUR = {"steps": 22, "exercise": 22, "sleep": 8}
PRIOR_STRENGTH = 5  # shrinkage for past_success_rate


def load(pattern, date_col):
    files = list(DATA_DIR.rglob(pattern))
    if not files:
        raise FileNotFoundError(f"No {pattern} found under {DATA_DIR}")
    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    df["date"] = pd.to_datetime(df[date_col], format="mixed").dt.normalize()
    return df.drop_duplicates(["Id", "date"])


def daily_values():
    """One row per person-day per category with the measured value."""
    act = load("dailyActivity_merged.csv", "ActivityDate")
    # Drop days the tracker clearly wasn't worn
    act = act[(act.TotalSteps > 0) & (act.SedentaryMinutes < 1440)]

    steps = act[["Id", "date"]].assign(category="steps", value=act.TotalSteps)
    exercise = act[["Id", "date"]].assign(
        category="exercise", value=act.VeryActiveMinutes + act.FairlyActiveMinutes
    )

    sleep = load("sleepDay_merged.csv", "SleepDay")
    sleep = sleep[sleep.TotalMinutesAsleep >= 120]  # drop naps / partial records
    sleep = sleep[["Id", "date"]].assign(category="sleep", value=sleep.TotalMinutesAsleep)

    return pd.concat([steps, exercise, sleep, wake_times()], ignore_index=True)


def wake_times():
    """Wake-up hour per person-morning from minute-level sleep data."""
    files = list(DATA_DIR.rglob("minuteSleep_merged.csv"))
    if not files:
        print("minuteSleep_merged.csv not found - skipping wake_up")
        return pd.DataFrame(columns=["Id", "date", "category", "value"])
    m = pd.concat([pd.read_csv(f) for f in files], ignore_index=True)
    m["t"] = pd.to_datetime(m["date"], format="mixed")
    m = m.drop_duplicates(["Id", "t"])

    # One sleep session per logId: its last minute = wake-up time
    s = m.groupby(["Id", "logId"]).t.agg(start="min", end="max", minutes="size").reset_index()
    s["wake_hour"] = s.end.dt.hour + s.end.dt.minute / 60
    # Keep main night sleep: 3h+ long, ending between 3 AM and 2 PM
    s = s[(s.minutes >= 180) & s.wake_hour.between(3, 14)]
    s["date"] = s.end.dt.normalize()
    # If several sessions end on the same morning, use the last one
    s = s.sort_values("end").groupby(["Id", "date"]).tail(1)
    return s[["Id", "date"]].assign(category="wake_up", value=s.wake_hour.round(2))


def to_difficulty(goal, usual, cat):
    """1-5: how hard the goal is compared with this person's usual level."""
    if cat in LOWER_IS_BETTER:
        # wake_up: hours earlier than usual (target 7, usual 8 -> 1 hour earlier)
        earlier = usual - goal
        return int(np.digitize(earlier, [-1.0, -0.25, 0.25, 1.0]) + 1)
    ratio = goal / max(usual, 1)
    return int(np.digitize(ratio, [0.7, 0.9, 1.1, 1.3]) + 1)


def build_rows(values):
    rows = []
    for cat, cat_df in values.groupby("category"):
        overall_median = cat_df.value.median()
        for user, g in cat_df.groupby("Id"):
            g = g.sort_values("date")
            history = []  # values and outcomes from EARLIER days only
            for _, r in g.iterrows():
                goal = rng.choice(GOALS[cat])
                prior_values = [h["value"] for h in history]
                usual = np.median(prior_values) if prior_values else overall_median
                outcomes = [h["success"] for h in history]
                rows.append({
                    "user_id": user,
                    "date": r.date.date(),
                    "category": cat,
                    "goal": goal,
                    "day_of_week": r.date.dayofweek,  # 0 = Monday
                    "is_weekend": int(r.date.dayofweek >= 5),
                    # wake_up: the deadline IS the goal hour; others use a fixed hour
                    "target_hour": int(goal) if cat == "wake_up" else TARGET_HOUR[cat],
                    "difficulty": to_difficulty(goal, usual, cat),
                    "successes_before": sum(outcomes),
                    "previous_attempts": len(outcomes),
                    "current_streak": streak(outcomes),
                    "success": int(r.value <= goal) if cat in LOWER_IS_BETTER
                               else int(r.value >= goal),
                })
                history.append({"value": r.value, "success": rows[-1]["success"]})
    return pd.DataFrame(rows)


def streak(outcomes):
    n = 0
    for o in reversed(outcomes):
        if not o:
            break
        n += 1
    return n


def add_rate_and_confidence(df):
    # Shrunk past success rate: new users start at the category average
    cat_avg = df.groupby("category").success.transform("mean")
    df["past_success_rate"] = (
        (df.successes_before + PRIOR_STRENGTH * cat_avg)
        / (df.previous_attempts + PRIOR_STRENGTH)
    ).round(3)

    # SIMULATED confidence: based on the person's record, harder goals feel
    # less certain, plus a small overconfidence bias and personal noise
    conf = (
        df.past_success_rate
        - 0.08 * (df.difficulty - 3)
        + 0.10                                    # overconfidence bias
        + rng.normal(0, 0.12, len(df))
    )
    df["user_confidence"] = conf.clip(0.05, 0.95).round(2)
    return df.drop(columns="successes_before")


def main():
    df = add_rate_and_confidence(build_rows(daily_values()))
    df["source"] = "fitbit"
    cols = ["user_id", "date", "category", "goal", "day_of_week", "is_weekend",
            "target_hour", "difficulty", "user_confidence", "past_success_rate",
            "current_streak", "previous_attempts", "success", "source"]
    df = df[cols].sort_values(["user_id", "category", "date"])
    df.to_csv(OUT_FILE, index=False)

    print(f"Saved {len(df)} rows from {df.user_id.nunique()} users -> {OUT_FILE}")
    print(df.groupby("category").success.agg(rows="size", success_rate="mean").round(2))


if __name__ == "__main__":
    main()
