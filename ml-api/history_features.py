import json
from datetime import timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pandas as pd


ROOT = Path(__file__).parent
DATA_FILE = ROOT.parent / "data" / "fitbit_challenges.csv"

# General prior を「何件分のデータ」として扱うか
PRIOR_STRENGTH = 5


def time_bucket(hour):
    """
    Convert an hour into a broad time period.

    5-11   -> morning
    12-16  -> afternoon
    17-21  -> evening
    22-4   -> night
    """
    if hour is None or pd.isna(hour):
        return "unknown"

    hour = float(hour)

    if 5 <= hour <= 11:
        return "morning"
    if 12 <= hour <= 16:
        return "afternoon"
    if 17 <= hour <= 21:
        return "evening"

    return "night"


def deadline_bucket(hours):
    """
    Group available time before the deadline.

    <= 1 hour  -> very_short
    <= 3 hours -> short
    <= 8 hours -> medium
    > 8 hours  -> long
    """
    if hours is None or pd.isna(hours):
        return "unknown"

    hours = float(hours)

    if hours <= 1:
        return "very_short"
    if hours <= 3:
        return "short"
    if hours <= 8:
        return "medium"

    return "long"


def normalize_weather(weather):
    """
    Normalize weather values so values like
    'Rain', 'rain', ' RAIN ' are treated the same.
    """
    if weather is None or pd.isna(weather):
        return None

    return str(weather).strip().lower()


def blended_probability(successes, attempts, general_prior):
    """
    Blend General knowledge with Personal history.

    Formula:

        P = (successes + m * general_prior)
            / (attempts + m)

    where m = PRIOR_STRENGTH.

    With little personal history:
        General has more influence.

    With lots of personal history:
        Personal history dominates.
    """
    general_prior = float(general_prior)

    if attempts == 0:
        return general_prior

    return (
        successes + PRIOR_STRENGTH * general_prior
    ) / (
        attempts + PRIOR_STRENGTH
    )


def stats_for_subset(subset, general_prior):
    """
    Calculate the personalized probability for
    one specific context.
    """
    attempts = len(subset)

    if attempts == 0:
        return float(general_prior), 0

    successes = int(subset["success"].sum())

    probability = blended_probability(
        successes=successes,
        attempts=attempts,
        general_prior=general_prior,
    )

    return probability, attempts


def day_type(day_of_week):
    """Weekend (Sat/Sun) or weekday."""
    return "weekend" if int(day_of_week) >= 5 else "weekday"


def personal_context_probability(history, category, day_of_week, general_prior):
    """
    Personalize the General prior with weekday/weekend history.

    1. The user's history for the same behavior on the OTHER day type
       is blended with the General prior.
    2. That result is the prior for the history on the SAME day type
       (weekend for a Saturday challenge, weekday for a Tuesday one).

    Each observation is counted once. A user with no day-type gap gets
    the same result as a plain category blend, while someone who wakes
    up reliably on weekdays but not on weekends gets lower odds for a
    Saturday wake-up than for a Tuesday one.

    history needs "category" and "success" columns, plus "day_of_week"
    for the day-type split. Returns
    (probability, category_attempts, same_day_type_attempts).
    """
    if history.empty or "category" not in history.columns:
        return float(general_prior), 0, 0

    same_category = history[history["category"] == category]
    if "day_of_week" not in same_category.columns:
        probability, attempts = stats_for_subset(same_category, general_prior)
        return probability, attempts, 0

    is_same_day_type = (
        same_category["day_of_week"].apply(day_type) == day_type(day_of_week)
    )
    other_day_type_probability, _ = stats_for_subset(
        same_category[~is_same_day_type],
        general_prior,
    )
    probability, context_attempts = stats_for_subset(
        same_category[is_same_day_type],
        other_day_type_probability,
    )
    return probability, len(same_category), context_attempts


def current_streak(history):
    """
    Count consecutive successes from the user's
    most recent challenges.
    """
    if history.empty:
        return 0

    if "date" in history.columns:
        history = history.sort_values("date")

    streak = 0

    for success in reversed(history["success"].tolist()):
        if int(success) == 1:
            streak += 1
        else:
            break

    return streak


def json_object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def local_challenge_date(row):
    user_input = json_object(row.get("user_input_json"))
    analysis = json_object(row.get("analysis_json"))
    data = analysis.get("data")
    context = data.get("context") if isinstance(data, dict) else {}
    context = context if isinstance(context, dict) else {}
    timezone_name = user_input.get("timezone") or context.get("timezone")
    try:
        user_zone = ZoneInfo(timezone_name) if isinstance(timezone_name, str) else timezone.utc
    except ZoneInfoNotFoundError:
        user_zone = timezone.utc

    event_time = None
    actions = data.get("actions") if isinstance(data, dict) else None
    if isinstance(actions, list):
        for action in actions:
            times = action.get("times") if isinstance(action, dict) else None
            if not isinstance(times, list):
                continue
            ordered = sorted(
                (item for item in times if isinstance(item, dict)),
                key=lambda item: item.get("kind") != "event",
            )
            for item in ordered:
                resolved_at = item.get("resolved_at")
                if not isinstance(resolved_at, str):
                    continue
                try:
                    event_time = pd.Timestamp(resolved_at)
                except (TypeError, ValueError):
                    continue
                break
            if event_time is not None:
                break

    if event_time is None:
        event_time = pd.Timestamp(row.get("deadline_at"))
        if pd.isna(event_time):
            event_time = pd.Timestamp(row["occurred_at"])
            event_time = event_time.tz_localize("UTC") if event_time.tzinfo is None else event_time
        else:
            event_time = event_time.tz_localize("UTC") if event_time.tzinfo is None else event_time
    elif event_time.tzinfo is None:
        event_time = event_time.tz_localize(user_zone)

    return pd.Timestamp(event_time.tz_convert(user_zone).date())


def get_prior(general_priors, name):
    """
    Safely get a General prior.

    If the General system does not know anything
    about this context yet, use neutral 50/50.
    """
    value = general_priors.get(name, 0.5)

    if value is None or pd.isna(value):
        return 0.5

    return float(value)


def build_history_features(
    history,
    challenge,
    general_priors,
):
    """
    Build personalized context features.

    general_priors example:

    {
        "behavior": 0.46,
        "weather": 0.40,
        "time": 0.48,
        "day": 0.52,
        "deadline": 0.35,
    }

    Each General prior is gradually replaced by
    this user's own history as attempts increase.
    """

    # -------------------------------------------------
    # General priors
    # -------------------------------------------------

    behavior_prior = get_prior(general_priors, "behavior")
    weather_prior = get_prior(general_priors, "weather")
    time_prior = get_prior(general_priors, "time")
    day_prior = get_prior(general_priors, "day")
    deadline_prior = get_prior(general_priors, "deadline")

    # -------------------------------------------------
    # 1. BEHAVIOR
    # -------------------------------------------------

    behavior = challenge.get("category")

    if behavior is not None and "category" in history.columns:
        behavior_history = history[
            history["category"] == behavior
        ]
    else:
        behavior_history = history.iloc[0:0]

    (
        behavior_probability,
        behavior_attempts,
    ) = stats_for_subset(
        behavior_history,
        behavior_prior,
    )

    # -------------------------------------------------
    # 2. WEATHER
    # -------------------------------------------------

    weather = normalize_weather(
        challenge.get("weather")
    )

    if (
        weather is not None
        and "weather" in history.columns
    ):
        weather_series = (
            history["weather"]
            .apply(normalize_weather)
        )

        weather_history = history[
            weather_series == weather
        ]
    else:
        weather_history = history.iloc[0:0]

    (
        weather_probability,
        weather_attempts,
    ) = stats_for_subset(
        weather_history,
        weather_prior,
    )

    # -------------------------------------------------
    # 3. TIME OF DAY
    # -------------------------------------------------

    target_hour = challenge.get("target_hour")
    target_time_bucket = time_bucket(target_hour)

    if "target_hour" in history.columns:
        history_time_buckets = (
            history["target_hour"]
            .apply(time_bucket)
        )

        time_history = history[
            history_time_buckets == target_time_bucket
        ]
    else:
        time_history = history.iloc[0:0]

    (
        time_probability,
        time_attempts,
    ) = stats_for_subset(
        time_history,
        time_prior,
    )

    # -------------------------------------------------
    # 4. DAY OF WEEK
    # -------------------------------------------------

    day = challenge.get("day_of_week")

    if (
        day is not None
        and "day_of_week" in history.columns
    ):
        day_history = history[
            history["day_of_week"] == day
        ]
    else:
        day_history = history.iloc[0:0]

    (
        day_probability,
        day_attempts,
    ) = stats_for_subset(
        day_history,
        day_prior,
    )

    # -------------------------------------------------
    # 5. TIME UNTIL DEADLINE
    # -------------------------------------------------

    hours_until_deadline = challenge.get(
        "hours_until_deadline"
    )

    challenge_deadline_bucket = deadline_bucket(
        hours_until_deadline
    )

    if "hours_until_deadline" in history.columns:
        history_deadline_buckets = (
            history["hours_until_deadline"]
            .apply(deadline_bucket)
        )

        deadline_history = history[
            history_deadline_buckets
            == challenge_deadline_bucket
        ]
    else:
        deadline_history = history.iloc[0:0]

    (
        deadline_probability,
        deadline_attempts,
    ) = stats_for_subset(
        deadline_history,
        deadline_prior,
    )

    # -------------------------------------------------
    # Final features for Personal ML
    # -------------------------------------------------

    return {
        "behavior_probability": behavior_probability,
        "behavior_attempts": behavior_attempts,

        "weather_probability": weather_probability,
        "weather_attempts": weather_attempts,

        "time_probability": time_probability,
        "time_attempts": time_attempts,

        "day_probability": day_probability,
        "day_attempts": day_attempts,

        "deadline_probability": deadline_probability,
        "deadline_attempts": deadline_attempts,

        "current_streak": current_streak(history),
    }


# -----------------------------------------------------
# TEST / DEMO
# -----------------------------------------------------

def main():
    df = pd.read_csv(DATA_FILE)

    df["date"] = pd.to_datetime(df["date"])

    # Pick the user with the most history
    user_id = (
        df.groupby("user_id")
        .size()
        .idxmax()
    )

    user_df = (
        df[df["user_id"] == user_id]
        .sort_values("date")
        .copy()
    )

    # Last challenge = the challenge we want to predict
    challenge_row = user_df.iloc[-1]

    # IMPORTANT:
    # only use history BEFORE the challenge
    history = user_df[
        user_df["date"] < challenge_row["date"]
    ].copy()

    # Other users are used here only to create
    # simple demo General priors.
    #
    # Later these values will come from
    # our real General Context Model.
    other_users = df[
        df["user_id"] != user_id
    ].copy()

    overall_prior = other_users["success"].mean()

    # -------------------------------------------------
    # Behavior prior
    # -------------------------------------------------

    same_behavior = other_users[
        other_users["category"]
        == challenge_row["category"]
    ]

    if len(same_behavior) > 0:
        behavior_prior = same_behavior["success"].mean()
    else:
        behavior_prior = overall_prior

    # -------------------------------------------------
    # Time prior
    # -------------------------------------------------

    challenge_time = time_bucket(
        challenge_row["target_hour"]
    )

    other_users["time_bucket"] = (
        other_users["target_hour"]
        .apply(time_bucket)
    )

    same_time = other_users[
        other_users["time_bucket"]
        == challenge_time
    ]

    if len(same_time) > 0:
        time_prior = same_time["success"].mean()
    else:
        time_prior = overall_prior

    # -------------------------------------------------
    # Day prior
    # -------------------------------------------------

    same_day = other_users[
        other_users["day_of_week"]
        == challenge_row["day_of_week"]
    ]

    if len(same_day) > 0:
        day_prior = same_day["success"].mean()
    else:
        day_prior = overall_prior

    # -------------------------------------------------
    # Current dataset has no real weather /
    # hours-until-deadline data yet.
    #
    # So use neutral 50/50 for now.
    # -------------------------------------------------

    general_priors = {
        "behavior": behavior_prior,
        "weather": 0.50,
        "time": time_prior,
        "day": day_prior,
        "deadline": 0.50,
    }

    challenge = {
        "category": challenge_row["category"],
        "day_of_week": challenge_row["day_of_week"],
        "target_hour": challenge_row["target_hour"],

        # Future app data:
        "weather": None,
        "hours_until_deadline": None,
    }

    features = build_history_features(
        history=history,
        challenge=challenge,
        general_priors=general_priors,
    )

    print()
    print("USER")
    print(user_id)

    print()
    print("CHALLENGE")
    print(challenge)

    print()
    print("GENERAL PRIORS")

    for key, value in general_priors.items():
        print(f"{key:20s} {value:.3f}")

    print()
    print("PERSONALIZED FEATURES")

    for key, value in features.items():
        if "probability" in key:
            print(f"{key:25s} {value:.3f}")
        else:
            print(f"{key:25s} {value}")

    print()


if __name__ == "__main__":
    main()
