from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from history_features import (
    build_history_features,
    time_bucket,
)


ROOT = Path(__file__).parent
DATA_DIR = ROOT.parent / "data"

DATA_FILE = DATA_DIR / "fitbit_challenges.csv"
TRAINING_FILE = DATA_DIR / "personal_training.csv"
MODEL_FILE = ROOT / "personal_model.pkl"


# ---------------------------------------------------------
# Features actually used by the Personal Model
#
# Weather and deadline are NOT included yet because
# the current Fitbit dataset has no real data for them.
#
# Once the app collects those fields, we can add:
#
# weather_probability
# weather_attempts
# deadline_probability
# deadline_attempts
# ---------------------------------------------------------

FEATURES = [
    "behavior_probability",
    "behavior_attempts",

    "time_probability",
    "time_attempts",

    "day_probability",
    "day_attempts",

    "current_streak",
]


def make_model():
    """
    Personal prediction model.
    """

    return make_pipeline(
        StandardScaler(),
        LogisticRegression(max_iter=1000),
    )


def safe_mean(df, fallback):
    """
    Return success rate of a subset.

    If there are no rows, use fallback.
    """

    if len(df) == 0:
        return float(fallback)

    return float(df["success"].mean())


def general_priors_for_challenge(
    population,
    challenge_row,
):
    """
    Build General Context Priors using OTHER USERS.

    These represent population-level tendencies.

    Example:

    behavior:
        How successful are people at steps?

    time:
        How successful are people doing this type
        of challenge at this time of day?

    day:
        How successful are people doing this type
        of challenge on this day of the week?
    """

    overall_prior = float(
        population["success"].mean()
    )

    category = challenge_row["category"]

    # -------------------------------------------------
    # 1. BEHAVIOR GENERAL PRIOR
    # -------------------------------------------------

    same_behavior = population[
        population["category"] == category
    ]

    behavior_prior = safe_mean(
        same_behavior,
        overall_prior,
    )

    # -------------------------------------------------
    # 2. TIME GENERAL PRIOR
    #
    # Prefer:
    # same behavior + same time period
    #
    # Example:
    # running at night
    #
    # If there is not enough matching data,
    # fall back to general time behavior.
    # -------------------------------------------------

    challenge_time_bucket = time_bucket(
        challenge_row["target_hour"]
    )

    population = population.copy()

    population["time_bucket"] = (
        population["target_hour"]
        .apply(time_bucket)
    )

    same_behavior_time = population[
        (population["category"] == category)
        &
        (
            population["time_bucket"]
            == challenge_time_bucket
        )
    ]

    same_time = population[
        population["time_bucket"]
        == challenge_time_bucket
    ]

    if len(same_behavior_time) > 0:
        time_prior = safe_mean(
            same_behavior_time,
            overall_prior,
        )
    else:
        time_prior = safe_mean(
            same_time,
            overall_prior,
        )

    # -------------------------------------------------
    # 3. DAY GENERAL PRIOR
    #
    # Prefer:
    # same behavior + same weekday
    # -------------------------------------------------

    day = challenge_row["day_of_week"]

    same_behavior_day = population[
        (population["category"] == category)
        &
        (population["day_of_week"] == day)
    ]

    same_day = population[
        population["day_of_week"] == day
    ]

    if len(same_behavior_day) > 0:
        day_prior = safe_mean(
            same_behavior_day,
            overall_prior,
        )
    else:
        day_prior = safe_mean(
            same_day,
            overall_prior,
        )

    # -------------------------------------------------
    # Weather / Deadline
    #
    # Current Fitbit data does not contain these.
    #
    # Neutral prior for now.
    #
    # Later:
    #
    # rain + outdoor
    # late night
    # short deadline
    # sleep window
    #
    # can come from the real General Context system.
    # -------------------------------------------------

    weather_prior = 0.50
    deadline_prior = 0.50

    return {
        "behavior": behavior_prior,
        "weather": weather_prior,
        "time": time_prior,
        "day": day_prior,
        "deadline": deadline_prior,
    }


def personal_features_for_challenge(history, challenge, population):
    """Build Personal Model features with training-time General priors."""
    general_priors = general_priors_for_challenge(
        population,
        challenge,
    )
    features = build_history_features(
        history=history,
        challenge=challenge,
        general_priors=general_priors,
    )
    return features, general_priors


def build_training_data(df):
    """
    Convert historical Fitbit challenges into
    Personal Model training rows.

    IMPORTANT:

    For every challenge:

    - General priors come from OTHER USERS.
    - Personal history comes only from this user's
      EARLIER challenges.

    So the model cannot see the future.
    """

    rows = []

    df = df.copy()

    df["date"] = pd.to_datetime(df["date"])

    df = df.sort_values(
        ["user_id", "date"]
    )

    for user_id, user_df in df.groupby("user_id"):

        user_df = (
            user_df
            .sort_values("date")
            .copy()
        )

        # Population evidence must come from
        # everybody except the current person.
        population = df[
            df["user_id"] != user_id
        ].copy()

        for _, challenge_row in user_df.iterrows():

            # -----------------------------------------
            # Personal history = ONLY previous days
            # -----------------------------------------

            history = user_df[
                user_df["date"]
                < challenge_row["date"]
            ].copy()

            # -----------------------------------------
            # General Context Priors
            # -----------------------------------------

            # -----------------------------------------
            # Current challenge
            # -----------------------------------------

            challenge = {
                "category":
                    challenge_row["category"],

                "day_of_week":
                    challenge_row["day_of_week"],

                "target_hour":
                    challenge_row["target_hour"],

                # Not available in Fitbit yet
                "weather": None,
                "hours_until_deadline": None,
            }

            # -----------------------------------------
            # General + Personal History
            # -----------------------------------------

            features, general_priors = personal_features_for_challenge(
                history=history,
                challenge=challenge,
                population=population,
            )

            # -----------------------------------------
            # Training row
            # -----------------------------------------

            row = {
                "user_id": user_id,
                "date": challenge_row["date"],
                "category": challenge_row["category"],
                "success": int(
                    challenge_row["success"]
                ),

                # Keep these for debugging/reporting.
                "general_behavior_prior":
                    general_priors["behavior"],

                "general_time_prior":
                    general_priors["time"],

                "general_day_prior":
                    general_priors["day"],

                **features,
            }

            rows.append(row)

    return pd.DataFrame(rows)


def evaluate_model(training):
    """
    Evaluate on users the model did not train on.
    """

    X = training[FEATURES]
    y = training["success"]
    groups = training["user_id"]

    predictions = np.zeros(len(training))

    cv = GroupKFold(n_splits=5)

    for train_idx, test_idx in cv.split(
        X,
        y,
        groups,
    ):

        model = make_model()

        model.fit(
            X.iloc[train_idx],
            y.iloc[train_idx],
        )

        predictions[test_idx] = (
            model.predict_proba(
                X.iloc[test_idx]
            )[:, 1]
        )

    predictions = np.clip(
        predictions,
        0.01,
        0.99,
    )

    print()
    print("PERSONAL MODEL EVALUATION")
    print("-------------------------")

    print(
        f"Brier:    "
        f"{brier_score_loss(y, predictions):.3f}"
    )

    print(
        f"LogLoss:  "
        f"{log_loss(y, predictions):.3f}"
    )

    print(
        f"Accuracy: "
        f"{accuracy_score(y, predictions >= 0.5):.1%}"
    )

    print(
        f"AUC:      "
        f"{roc_auc_score(y, predictions):.3f}"
    )

    return predictions


def print_weights(model):
    """
    Show what Personal Context matters most.
    """

    logistic = model.named_steps[
        "logisticregression"
    ]

    coefficients = logistic.coef_[0]

    importance = pd.DataFrame(
        {
            "feature": FEATURES,
            "weight": coefficients,
        }
    )

    importance["abs_weight"] = (
        importance["weight"].abs()
    )

    importance = importance.sort_values(
        "abs_weight",
        ascending=False,
    )

    print()
    print("WHAT PERSONAL HISTORY MATTERS")
    print("-----------------------------")

    for _, row in importance.iterrows():

        print(
            f"{row['feature']:25s} "
            f"{row['weight']:+.3f}"
        )


def main():

    print(
        "Building personalized training data..."
    )

    df = pd.read_csv(DATA_FILE)

    training = build_training_data(df)

    training.to_csv(
        TRAINING_FILE,
        index=False,
    )

    print(
        f"Created {len(training)} rows"
    )

    print(
        f"Users: "
        f"{training['user_id'].nunique()}"
    )

    print(
        f"Saved training data -> "
        f"{TRAINING_FILE}"
    )

    # -------------------------------------------------
    # Cross-validation
    # -------------------------------------------------

    evaluate_model(training)

    # -------------------------------------------------
    # Train final model on all available data
    # -------------------------------------------------

    final_model = make_model()

    final_model.fit(
        training[FEATURES],
        training["success"],
    )

    print_weights(final_model)

    # -------------------------------------------------
    # Save model + metadata
    # -------------------------------------------------

    bundle = {
        "model": final_model,
        "features": FEATURES,

        "description":
            "Personal model using "
            "General Context Priors blended "
            "with user-specific historical behavior.",
    }

    joblib.dump(
        bundle,
        MODEL_FILE,
    )

    print()
    print(
        f"Saved personal model -> "
        f"{MODEL_FILE}"
    )


if __name__ == "__main__":
    main()
