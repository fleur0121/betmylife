import argparse
import os
from datetime import date
from pathlib import Path

import joblib
import pandas as pd
import pymysql
from dotenv import load_dotenv

from history_features import (
    PRIOR_STRENGTH,
    current_streak,
    day_type,
    local_challenge_date,
    personal_context_probability,
    time_bucket,
)


ROOT = Path(__file__).parent
ENV_FILE = ROOT.parent / "betmylife" / "backend" / ".env"
GENERAL_MODEL_FILE = ROOT / "general_model.pkl"


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Preview General and user-history success probabilities "
            "and fair decimal odds."
        )
    )
    parser.add_argument("--category", default="exercise")
    parser.add_argument("--target-hour", type=int, default=22, choices=range(24))
    parser.add_argument("--day-of-week", type=int, choices=range(7))
    parser.add_argument("--user-id")
    parser.add_argument("--as-of", default=date.today().isoformat())
    return parser.parse_args()


def fair_odds(probability):
    probability = min(max(float(probability), 0.01), 0.99)
    return probability, 1 / probability, 1 / (1 - probability)


def general_category_supported(category, known_categories):
    return category in known_categories


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

    if not args.user_id:
        raise SystemExit("--user-id is required")

    general_bundle = joblib.load(GENERAL_MODEL_FILE)
    known_categories = general_bundle["known_categories"]
    user_id = args.user_id
    history = load_db_history(user_id, as_of)

    day_of_week = (
        args.day_of_week
        if args.day_of_week is not None
        else as_of.dayofweek
    )
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

    matching_history = history[history["category"] == args.category]
    matching_successes = int(matching_history["success"].sum())
    (
        blended_success_probability,
        matching_attempts,
        context_attempts,
    ) = personal_context_probability(
        history,
        args.category,
        day_of_week,
        general_probability,
    )
    blended_success_probability, yes_odds, no_odds = fair_odds(
        blended_success_probability
    )

    print("ODDS PREVIEW (Personal history: DB)")
    print(f"as_of={as_of.date()} user_id={user_id}")
    print(
        f"challenge: category={args.category}, day_of_week={day_of_week}, "
        f"target_hour={args.target_hour}"
    )
    print(f"personal_history_rows={len(history)}")
    print(
        f"matching_history: successes={matching_successes}, "
        f"behavior_attempts={matching_attempts}, "
        f"{day_type(day_of_week)}_attempts={context_attempts}"
    )
    if "target_hour" in history.columns:
        matching_time = history[
            history["target_hour"].apply(time_bucket)
            == time_bucket(args.target_hour)
        ]
        print(f"matching_time_attempts={len(matching_time)}")
    if "day_of_week" in history.columns:
        matching_day = history[history["day_of_week"] == day_of_week]
        print(f"matching_day_attempts={len(matching_day)}")
    print(f"current_streak={current_streak(history)}")
    print()
    print(
        f"general_model_prior={general_probability:.1%} "
        f"general_category_supported={has_general_category}"
    )
    print(
        "odds blend: (personal_successes + "
        f"{PRIOR_STRENGTH} * general_model_p) / "
        f"(personal_attempts + {PRIOR_STRENGTH}); other day-type history "
        f"first, then {day_type(day_of_week)} history"
    )
    print(
        f"ODDS_BASE p_success={blended_success_probability:.1%} "
        f"YES x{yes_odds:.2f}  NO x{no_odds:.2f}"
    )
    print("market adjustment: not applied")
    print("odds are fair decimal odds; no margin is applied")


if __name__ == "__main__":
    main()