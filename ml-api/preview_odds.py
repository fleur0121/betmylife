import argparse
from datetime import date
from pathlib import Path

import joblib
import pandas as pd

from history_features import PRIOR_STRENGTH, build_history_features
from train_personal import general_priors_for_challenge


ROOT = Path(__file__).parent
DATA_FILE = ROOT.parent / "data" / "fitbit_challenges.csv"
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
    parser.add_argument("--as-of", default=date.today().isoformat())
    return parser.parse_args()


def fair_odds(probability):
    probability = min(max(float(probability), 0.01), 0.99)
    return probability, 1 / probability, 1 / (1 - probability)


def main():
    args = parse_args()
    try:
        as_of = pd.Timestamp(args.as_of)
    except ValueError as error:
        raise SystemExit("--as-of must be a valid date such as 2026-10-04") from error

    if not DATA_FILE.exists():
        raise SystemExit(f"Training data not found: {DATA_FILE}")

    data = pd.read_csv(DATA_FILE, dtype={"user_id": str})
    data["date"] = pd.to_datetime(data["date"])
    eligible_data = data[data["date"] < as_of].copy()

    general_bundle = joblib.load(GENERAL_MODEL_FILE)
    personal_bundle = joblib.load(PERSONAL_MODEL_FILE)
    known_categories = general_bundle["known_categories"]
    if args.category not in known_categories:
        choices = ", ".join(known_categories)
        raise SystemExit(
            f"Unsupported category {args.category!r}. "
            f"The General model currently knows: {choices}."
        )

    if eligible_data.empty:
        raise SystemExit("No historical rows exist before the selected --as-of date.")

    user_id = args.user_id or eligible_data.groupby("user_id").size().idxmax()
    history = eligible_data[eligible_data["user_id"] == user_id].copy()
    population = eligible_data[eligible_data["user_id"] != user_id].copy()
    if population.empty:
        raise SystemExit("General prediction needs historical rows from other users.")

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
    general_probability = float(
        general_bundle["model"].predict_proba(general_input)[0, 1]
    )

    priors = general_priors_for_challenge(population, challenge)
    category_rate = float(priors["behavior"])
    priors["behavior"] = general_probability
    features = build_history_features(history, challenge, priors)
    matching_history = history[history["category"] == args.category]
    matching_attempts = len(matching_history)
    matching_successes = int(matching_history["success"].sum())

    personal_input = pd.DataFrame(
        [{name: features[name] for name in personal_bundle["features"]}],
        columns=personal_bundle["features"],
    )

    personal_probability = personal_bundle["model"].predict_proba(personal_input)[0, 1]
    personal_support = features["behavior_attempts"]
    blended_success_probability = (
        general_probability
        if personal_support == 0
        else (
            personal_support * personal_probability
            + PRIOR_STRENGTH * general_probability
        )
        / (personal_support + PRIOR_STRENGTH)
    )
    blended_success_probability, yes_odds, no_odds = fair_odds(
        blended_success_probability
    )

    print("LOCAL ODDS PREVIEW (Fitbit CSV)")
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
        f"category_rate_diagnostic={category_rate:.1%}"
    )
    print(
        f"personal_model_context_p={personal_probability:.1%}"
    )
    print(
        "model blend: (personal_model_p * behavior_attempts + "
        f"general_model_p * {PRIOR_STRENGTH}) / "
        f"(behavior_attempts + {PRIOR_STRENGTH})"
    )
    print(
        f"ODDS_BASE p_success={blended_success_probability:.1%} "
        f"YES x{yes_odds:.2f}  NO x{no_odds:.2f}"
    )
    print("market adjustment: not applied")
    print("odds are fair decimal odds; no margin is applied")


if __name__ == "__main__":
    main()