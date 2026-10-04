"""
prepare_fitbit.py
Turn Fitbit data into "challenge" rows for the Predict My Life model.

Input : files found anywhere under data/fitbit/ (a March folder is picked up too):
          dailyActivity_merged.csv   steps / exercise per day
          sleepDay_merged.csv        minutes asleep per night
          minuteSleep_merged.csv     sleep minute by minute -> bedtime, wake-up time
          hourlySteps_merged.csv     steps per hour -> steps by a deadline
Output: data/fitbit/fitbit_challenges.csv
        data/fitbit/typical.json     typical person's levels (for auto difficulty in the API)

Challenges (category / goal_type), all real data:
  steps    / amount    "Walk 10,000 steps today"
  steps    / deadline  "Walk 5,000 steps by 3 PM"
  exercise / amount    "30 active minutes today"
  sleep    / amount    "Sleep 7 hours"
  sleep    / deadline  "Asleep by 11 PM"            (bedtime)
  wake_up  / deadline  "Wake up by 7 AM"
Simulated: user_confidence (Fitbit has no confidence data)
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).parent / "data" / "fitbit"
OUT_FILE = DATA_DIR / "fitbit_challenges.csv"
TYPICAL_FILE = DATA_DIR / "typical.json"
rng = np.random.default_rng(42)
PRIOR_STRENGTH = 5  # shrinkage for past_success_rate

# How each challenge type is built
#   goals       : possible goals (one picked at random per person-day)
#   kind        : "ratio"   -> value must reach the goal (more is better)
#                 "earlier" -> value (a clock hour) must be at or before the goal
#   hour        : deadline hour for "amount" goals (daily totals have no time)
#   deadlines   : steps/deadline only - the hour the steps must be reached by
SPECS = {
    ("steps", "amount"):    {"goals": [5000, 7500, 10000, 12500], "kind": "ratio", "hour": 22},
    ("steps", "deadline"):  {"goals": [2500, 5000, 7500], "kind": "ratio", "deadlines": [12, 15, 18]},
    ("exercise", "amount"): {"goals": [15, 30, 45, 60], "kind": "ratio", "hour": 22},
    ("sleep", "amount"):    {"goals": [360, 420, 480], "kind": "ratio", "hour": 8},
    # Bedtime hours after midnight are written as 24, 25 (= 12 AM, 1 AM)
    ("sleep", "deadline"):  {"goals": [22, 23, 24, 25], "kind": "earlier"},
    ("wake_up", "deadline"): {"goals": [6, 7, 8, 9], "kind": "earlier"},
}


def read_all(pattern):
    files = [f for f in DATA_DIR.rglob(pattern)]
    if not files:
        print(f"{pattern} not found - skipping the challenges that need it")
        return None
    return pd.concat([pd.read_csv(f) for f in files], ignore_index=True)


def worn_days():
    act = read_all("dailyActivity_merged.csv")
    act["date"] = pd.to_datetime(act.ActivityDate, format="mixed").dt.normalize()
    act = act.drop_duplicates(["Id", "date"])
    # Drop days the tracker clearly wasn't worn
    return act[(act.TotalSteps > 0) & (act.SedentaryMinutes < 1440)]


def sleep_sessions():
    """Main night sleep per person: start (bedtime) and end (wake-up)."""
    m = read_all("minuteSleep_merged.csv")
    if m is None:
        return None
    m["t"] = pd.to_datetime(m["date"], format="mixed")
    m = m.drop_duplicates(["Id", "t"])
    s = m.groupby(["Id", "logId"]).t.agg(start="min", end="max", minutes="size").reset_index()
    s["wake_hour"] = s.end.dt.hour + s.end.dt.minute / 60
    # Main night sleep: 3h+ long, ending between 3 AM and 2 PM
    s = s[(s.minutes >= 180) & s.wake_hour.between(3, 14)]
    return s.sort_values("end").groupby(["Id", s.end.dt.normalize()]).tail(1)


def challenge_values():
    """One row per person-day per challenge type, with the measured value."""
    parts = []
    act = worn_days()
    base = act[["Id", "date"]]
    parts.append(base.assign(category="steps", goal_type="amount", value=act.TotalSteps))
    parts.append(base.assign(category="exercise", goal_type="amount",
                             value=act.VeryActiveMinutes + act.FairlyActiveMinutes))

    sleep = read_all("sleepDay_merged.csv")
    if sleep is not None:
        sleep["date"] = pd.to_datetime(sleep.SleepDay, format="mixed").dt.normalize()
        sleep = sleep.drop_duplicates(["Id", "date"])
        sleep = sleep[sleep.TotalMinutesAsleep >= 120]          # drop naps / partial records
        parts.append(sleep[["Id", "date"]].assign(category="sleep", goal_type="amount",
                                                  value=sleep.TotalMinutesAsleep))

    s = sleep_sessions()
    if s is not None:
        # Wake-up: the morning the session ends
        parts.append(pd.DataFrame({"Id": s.Id, "date": s.end.dt.normalize(), "category": "wake_up",
                                   "goal_type": "deadline", "value": s.wake_hour.round(2)}))
        # Bedtime: the evening the session starts (after midnight -> previous evening, hour + 24)
        start_hour = s.start.dt.hour + s.start.dt.minute / 60
        after_midnight = start_hour < 12
        bed_hour = np.where(after_midnight, start_hour + 24, start_hour)
        evening = s.start.dt.normalize() - pd.to_timedelta(after_midnight.astype(int), unit="D")
        bed = pd.DataFrame({"Id": s.Id, "date": evening, "category": "sleep",
                            "goal_type": "deadline", "value": np.round(bed_hour, 2)})
        parts.append(bed[bed.value.between(18, 30)])           # 6 PM - 6 AM only

    hourly = read_all("hourlySteps_merged.csv")
    if hourly is not None:
        hourly["t"] = pd.to_datetime(hourly.ActivityHour, format="mixed")
        hourly["date"], hourly["hour"] = hourly.t.dt.normalize(), hourly.t.dt.hour
        hourly = hourly.drop_duplicates(["Id", "t"]).sort_values("t")
        # Cumulative steps completed BEFORE each deadline hour
        cum = {}
        for (pid, day), g in hourly.groupby(["Id", "date"]):
            if len(g) < 24:                                        # incomplete day
                continue
            steps_by_hour = g.set_index("hour").StepTotal
            cum[(pid, day)] = {d: int(steps_by_hour[steps_by_hour.index < d].sum())
                               for d in SPECS[("steps", "deadline")]["deadlines"]}
        worn = set(zip(act.Id, act.date))
        rows = [{"Id": k[0], "date": k[1], "category": "steps", "goal_type": "deadline", "value": v}
                for k, v in cum.items() if k in worn]
        parts.append(pd.DataFrame(rows))

    return pd.concat(parts, ignore_index=True)


def to_difficulty(goal, usual, kind):
    """1-5: how hard the goal is compared with this person's usual level."""
    if kind == "earlier":
        earlier = usual - goal                     # hours earlier than usual
        return int(np.digitize(earlier, [-1.0, -0.25, 0.25, 1.0]) + 1)
    ratio = goal / max(usual, 1)
    return int(np.digitize(ratio, [0.7, 0.9, 1.1, 1.3]) + 1)


def streak(outcomes):
    n = 0
    for o in reversed(outcomes):
        if not o:
            break
        n += 1
    return n


def typical_levels(values):
    """Typical person's level per challenge type (median), for auto difficulty."""
    typical = {}
    for (cat, gt), g in values.groupby(["category", "goal_type"]):
        spec = SPECS[(cat, gt)]
        if "deadlines" in spec:                    # steps by deadline: one level per hour
            level = {str(d): float(np.median([v[d] for v in g.value])) for d in spec["deadlines"]}
        else:
            level = float(g.value.median())
        typical[f"{cat}|{gt}"] = {"kind": spec["kind"], "value": level}
    return typical


def build_rows(values, typical):
    rows = []
    # History (streak, attempts) is per person per CATEGORY, in date order
    for (cat, user), g in values.groupby(["category", "Id"]):
        g = g.sort_values(["date", "goal_type"])
        outcomes = []                               # results from EARLIER challenges only
        prior = {}                                  # earlier values per goal_type (for "usual")
        for _, r in g.iterrows():
            spec = SPECS[(cat, r.goal_type)]
            key = f"{cat}|{r.goal_type}"
            goal = int(rng.choice(spec["goals"]))
            earlier_values = prior.setdefault(r.goal_type, [])

            if "deadlines" in spec:                 # steps by a deadline hour
                deadline = int(rng.choice(spec["deadlines"]))
                value = r.value[deadline]
                past = [v[deadline] for v in earlier_values]
                usual = np.median(past) if past else typical[key]["value"][str(deadline)]
                target_hour = deadline
            else:
                value = r.value
                usual = np.median(earlier_values) if earlier_values else typical[key]["value"]
                target_hour = goal if spec["kind"] == "earlier" else spec["hour"]

            success = int(value <= goal) if spec["kind"] == "earlier" else int(value >= goal)
            rows.append({
                "user_id": user,
                "date": r.date.date(),
                "category": cat,
                "goal_type": r.goal_type,
                "goal": goal,
                "day_of_week": r.date.dayofweek,      # 0 = Monday
                "is_weekend": int(r.date.dayofweek >= 5),
                "target_hour": target_hour,
                "difficulty": to_difficulty(goal, usual, spec["kind"]),
                "successes_before": sum(outcomes),
                "previous_attempts": len(outcomes),
                "current_streak": streak(outcomes),
                "success": success,
            })
            outcomes.append(success)
            earlier_values.append(r.value)
    return pd.DataFrame(rows)


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
    values = challenge_values()
    typical = typical_levels(values)
    df = add_rate_and_confidence(build_rows(values, typical))
    df["source"] = "fitbit"
    cols = ["user_id", "date", "category", "goal_type", "goal", "day_of_week", "is_weekend",
            "target_hour", "difficulty", "user_confidence", "past_success_rate",
            "current_streak", "previous_attempts", "success", "source"]
    df = df[cols].sort_values(["user_id", "category", "date", "goal_type"])
    df.to_csv(OUT_FILE, index=False)
    TYPICAL_FILE.write_text(json.dumps(typical, indent=2))

    print(f"Saved {len(df)} rows from {df.user_id.nunique()} users -> {OUT_FILE}")
    print(df.groupby(["category", "goal_type"]).success.agg(rows="size", success_rate="mean").round(2))
    print(f"Typical levels -> {TYPICAL_FILE.name}")


if __name__ == "__main__":
    main()
