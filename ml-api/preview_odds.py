import argparse
import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import joblib
import pandas as pd
import pymysql
from dotenv import load_dotenv

from history_features import PRIOR_STRENGTH, stats_for_subset
from train_personal import personal_features_for_challenge


ROOT = Path(__file__).parent
DATA_FILE = ROOT.parent / "data" / "fitbit_challenges.csv"
ENV_FILE = ROOT.parent / "betmylife" / "backend" / ".env"
GENERAL_MODEL_FILE = ROOT / "general_model.pkl"
PERSONAL_MODEL_FILE = ROOT / "personal_model.pkl"


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Preview General and Personal success probabilities "
            "and fair decimal odds from local Fitbit history."
        )
    )
    parser.add_argument("--category", default="exercise")
    parser.add_argument("--target-hour", type=int, default=22, choices=range(24))
    parser.add_argument("--day-of-week", type=int, choices=range(7))
    parser.add_argument("--user-id")
    parser.add_argument(
        "--history-source",
        choices=("db", "csv"),
        default="db",
        help="Personal history source. General training data always comes from Fitbit CSV.",
    )
    parser.add_argument("--as-of", default=date.today().isoformat())
    return parser.parse_args()


def fair_odds(probability):
    probability = min(max(float(probability), 0.01), 0.99)
    return probability, 1 / probability, 1 / (1 - probability)


def general_category_supported(category, known_categories):
    return category in known_categories


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


def load_db_history(user_id, as_of):
    load_dotenv(ENV_FILE)
    required = ("TIDB_HOST", "TIDB_USER", "TIDB_PASSWORD", "TIDB_DATABASE")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise SystemExit(
            f"Missing DB settings in {ENV_FILE}: {', '.join(missing)}"
        )

    connection = pymysql.connect(
        host=os.environ["TIDB_HOST"],
        port=int(os.getenv("TIDB_PORT", "4000")),
        user=os.environ["TIDB_USER"],
        password=os.environ["TIDB_PASSWORD"],
        database=os.environ["TIDB_DATABASE"],
        ssl=(
            {"ca": os.getenv("TIDB_CA_PATH")}
            if os.getenv("TIDB_CA_PATH")
            else None
        ),
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
        read_timeout=30,
    )
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT o.category, o.occurred_at, o.goal, o.target_hour,
                o.weather, o.hours_until_deadline, o.success,
                c.deadline_at, c.user_input_json, c.analysis_json
                FROM ml_observations AS o
                LEFT JOIN challenges AS c ON c.id = o.challenge_id
                    AND c.user_id = o.user_id
                WHERE o.user_id = %s AND o.source = 'app'
                ORDER BY o.occurred_at""",
                (user_id,),
            )
            rows = cursor.fetchall()
    finally:
        connection.close()

    history_rows = []
    as_of_utc = pd.Timestamp(as_of).tz_localize("UTC")
    for row in rows:
        recorded_at = pd.Timestamp(row["occurred_at"])
        if recorded_at.tzinfo is None:
            recorded_at = recorded_at.tz_localize("UTC")
        if recorded_at >= as_of_utc:
            continue
        history_rows.append(
            {
                "date": local_challenge_date(row),
                "category": row["category"],
                "target_hour": row["target_hour"],
                "weather": row["weather"],
                "hours_until_deadline": row["hours_until_deadline"],
                "success": int(row["success"]),
            }
        )

    columns = [
        "date", "category", "target_hour", "weather",
        "hours_until_deadline", "success",
    ]
    history = pd.DataFrame(history_rows, columns=columns)
    history["date"] = pd.to_datetime(history["date"])
    if not history.empty:
        history["day_of_week"] = history["date"].dt.dayofweek
    else:
        history["day_of_week"] = pd.Series(dtype="int64")
    return history


def main():
    args = parse_args()
    try:
        as_of = pd.Timestamp(args.as_of)
    except ValueError as error:
        raise SystemExit("--as-of must be a valid date such as 2026-10-04") from error

    if not DATA_FILE.exists():
        raise SystemExit(f"Training data not found: {DATA_FILE}")
    if args.history_source == "db" and not args.user_id:
        raise SystemExit("--user-id is required when --history-source=db")

    data = pd.read_csv(DATA_FILE, dtype={"user_id": str})
    data["date"] = pd.to_datetime(data["date"])
    eligible_data = data[data["date"] < as_of].copy()

    general_bundle = joblib.load(GENERAL_MODEL_FILE)
    personal_bundle = joblib.load(PERSONAL_MODEL_FILE)
    known_categories = general_bundle["known_categories"]
    if args.history_source == "db":
        user_id = args.user_id
        history = load_db_history(user_id, as_of)
        population = eligible_data
    else:
        if eligible_data.empty:
            raise SystemExit("No historical rows exist before the selected --as-of date.")
        user_id = args.user_id or eligible_data.groupby("user_id").size().idxmax()
        history = eligible_data[eligible_data["user_id"] == user_id].copy()
        population = eligible_data[eligible_data["user_id"] != user_id].copy()

    day_of_week = (
        args.day_of_week
        if args.day_of_week is not None
        else as_of.dayofweek
    )
    challenge = {
        "category": args.category,
        "day_of_week": day_of_week,
        "target_hour": args.target_hour,
        "weather": None,
        "hours_until_deadline": None,
    }

    general_input = pd.DataFrame(
        [
            {
                "category": args.category,
                "day_of_week": day_of_week,
                "is_weekend": int(day_of_week >= 5),
                "target_hour": args.target_hour,
            }
        ],
        columns=general_bundle["features"],
    )
    has_general_category = general_category_supported(
        args.category,
        known_categories,
    )
    general_probability = (
        float(general_bundle["model"].predict_proba(general_input)[0, 1])
        if has_general_category
        else 0.5
    )

    if population.empty:
        raise SystemExit("General training population is empty; cannot build Personal features.")
    features, priors = personal_features_for_challenge(
        history=history,
        challenge=challenge,
        population=population,
    )
    category_rate = float(priors["behavior"])
    matching_history = history[history["category"] == args.category]
    matching_attempts = len(matching_history)
    matching_successes = int(matching_history["success"].sum())

    personal_input = pd.DataFrame(
        [{name: features[name] for name in personal_bundle["features"]}],
        columns=personal_bundle["features"],
    )

    personal_probability = personal_bundle["model"].predict_proba(personal_input)[0, 1]
    blended_success_probability, personal_support = stats_for_subset(
        matching_history,
        general_probability,
    )
    blended_success_probability, yes_odds, no_odds = fair_odds(
        blended_success_probability
    )

    print(f"LOCAL ODDS PREVIEW (Personal history: {args.history_source.upper()})")
    print(f"as_of={as_of.date()} user_id={user_id}")
    print(
        f"challenge: category={args.category}, day_of_week={day_of_week}, "
        f"target_hour={args.target_hour}"
    )
    print(f"personal_history_rows={len(history)}")
    print(
        f"matching_history: successes={matching_successes}, "
        f"behavior_attempts={matching_attempts}, "
        f"time_attempts={features['time_attempts']}, "
        f"day_attempts={features['day_attempts']}, "
        f"streak={features['current_streak']}"
    )
    print()
    print(
        f"general_model_prior={general_probability:.1%} "
        f"general_category_supported={has_general_category} "
        f"category_rate_diagnostic={category_rate:.1%}"
    )
    print(
        f"personal_model_context_p={personal_probability:.1%} (diagnostic only)"
    )
    print(
        "odds blend: (personal_successes + "
        f"{PRIOR_STRENGTH} * general_model_p) / "
        f"(personal_attempts + {PRIOR_STRENGTH})"
    )
    print(
        f"ODDS_BASE p_success={blended_success_probability:.1%} "
        f"YES x{yes_odds:.2f}  NO x{no_odds:.2f}"
    )
    print("market adjustment: not applied")
    print("odds are fair decimal odds; no margin is applied")


if __name__ == "__main__":
    main()