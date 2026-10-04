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

from history_features import build_history_features
from train_general import (
    make_model,
    FEATURES as GENERAL_FEATURES,
)


ROOT = Path(__file__).parent

DATA_FILE = (
    ROOT.parent
    / "data"
    / "fitbit_challenges.csv"
)

TRAINING_FILE = (
    ROOT.parent
    / "data"
    / "personal_delta_training.csv"
)

MODEL_FILE = (
    ROOT
    / "personal_delta_model.pkl"
)


DELTA_FEATURES = [
    "general_probability",

    "overall_delta",
    "overall_attempts",

    "behavior_delta",
    "behavior_attempts",

    "time_delta",
    "time_attempts",

    "day_delta",
    "day_attempts",

    "current_streak",
]


def make_delta_model():
    return make_pipeline(
        StandardScaler(),
        LogisticRegression(
            max_iter=1000
        ),
    )


def build_training_data(df):
    rows = []

    users = df["user_id"].unique()

    for user_id in users:

        # -----------------------------
        # General model:
        # train WITHOUT current user
        # -----------------------------

        general_train = df[
            df["user_id"] != user_id
        ]

        general_model = make_model()

        general_model.fit(
            general_train[
                GENERAL_FEATURES
            ],
            general_train[
                "success"
            ],
        )

        # -----------------------------
        # Current user's challenges
        # -----------------------------

        user_data = (
            df[
                df["user_id"] == user_id
            ]
            .copy()
            .sort_values(
                [
                    "date",
                    "category",
                ]
            )
        )

        for _, challenge_row in user_data.iterrows():

            # -------------------------
            # General probability
            # -------------------------

            challenge_frame = pd.DataFrame(
                [
                    {
                        "category":
                            challenge_row[
                                "category"
                            ],

                        "day_of_week":
                            challenge_row[
                                "day_of_week"
                            ],

                        "is_weekend":
                            challenge_row[
                                "is_weekend"
                            ],

                        "target_hour":
                            challenge_row[
                                "target_hour"
                            ],
                    }
                ]
            )

            general_probability = float(
                general_model
                .predict_proba(
                    challenge_frame[
                        GENERAL_FEATURES
                    ]
                )[0][1]
            )

            # -------------------------
            # Only previous history
            # -------------------------

            history = user_data[
                user_data["date"]
                < challenge_row["date"]
            ].copy()

            challenge = {
                "category":
                    challenge_row[
                        "category"
                    ],

                "day_of_week":
                    int(
                        challenge_row[
                            "day_of_week"
                        ]
                    ),

                "target_hour":
                    int(
                        challenge_row[
                            "target_hour"
                        ]
                    ),

                "weather":
                    None,
            }

            history_features = (
                build_history_features(
                    history=history,
                    challenge=challenge,
                    general_probability=
                        general_probability,
                )
            )

            # -------------------------
            # Convert rates -> deltas
            # -------------------------

            overall_delta = (
                history_features[
                    "overall_success_rate"
                ]
                - general_probability
            )

            behavior_delta = (
                history_features[
                    "behavior_success_rate"
                ]
                - general_probability
            )

            time_delta = (
                history_features[
                    "time_success_rate"
                ]
                - general_probability
            )

            day_delta = (
                history_features[
                    "day_success_rate"
                ]
                - general_probability
            )

            row = {
                "user_id":
                    user_id,

                "date":
                    challenge_row[
                        "date"
                    ],

                "general_probability":
                    general_probability,

                "overall_delta":
                    overall_delta,

                "overall_attempts":
                    history_features[
                        "overall_attempts"
                    ],

                "behavior_delta":
                    behavior_delta,

                "behavior_attempts":
                    history_features[
                        "behavior_attempts"
                    ],

                "time_delta":
                    time_delta,

                "time_attempts":
                    history_features[
                        "time_attempts"
                    ],

                "day_delta":
                    day_delta,

                "day_attempts":
                    history_features[
                        "day_attempts"
                    ],

                "current_streak":
                    history_features[
                        "current_streak"
                    ],

                "success":
                    int(
                        challenge_row[
                            "success"
                        ]
                    ),
            }

            rows.append(row)

    return pd.DataFrame(rows)


def evaluate_model(training):
    X = training[
        DELTA_FEATURES
    ]

    y = training[
        "success"
    ]

    groups = training[
        "user_id"
    ]

    predictions = np.zeros(
        len(training)
    )

    splitter = GroupKFold(
        n_splits=min(
            5,
            groups.nunique(),
        )
    )

    for train_idx, test_idx in splitter.split(
        X,
        y,
        groups,
    ):
        model = make_delta_model()

        model.fit(
            X.iloc[train_idx],
            y.iloc[train_idx],
        )

        predictions[test_idx] = (
            model
            .predict_proba(
                X.iloc[test_idx]
            )[:, 1]
        )

    predictions = np.clip(
        predictions,
        0.01,
        0.99,
    )

    print()
    print("DELTA MODEL EVALUATION")
    print("----------------------")

    print(
        f"Brier:   "
        f"{brier_score_loss(y, predictions):.3f}"
    )

    print(
        f"LogLoss: "
        f"{log_loss(y, predictions):.3f}"
    )

    print(
        f"Accuracy: "
        f"{accuracy_score(y, predictions > 0.5):.1%}"
    )

    print(
        f"AUC:      "
        f"{roc_auc_score(y, predictions):.3f}"
    )

    # -------------------------
    # General-only baseline
    # -------------------------

    general = training[
        "general_probability"
    ].clip(
        0.01,
        0.99,
    )

    print()
    print("GENERAL-ONLY BASELINE")
    print("---------------------")

    print(
        f"Brier:   "
        f"{brier_score_loss(y, general):.3f}"
    )

    print(
        f"LogLoss: "
        f"{log_loss(y, general):.3f}"
    )


def show_weights(model):
    weights = pd.Series(
        model[-1].coef_[0],
        index=DELTA_FEATURES,
    )

    weights = weights.reindex(
        weights
        .abs()
        .sort_values(
            ascending=False
        )
        .index
    )

    print()
    print(
        "WHAT PERSONAL DEVIATIONS MATTER"
    )
    print(
        "-------------------------------"
    )

    for name, weight in weights.items():
        print(
            f"{name:<28} "
            f"{weight:+.3f}"
        )


def main():
    df = pd.read_csv(
        DATA_FILE,
        dtype={
            "user_id": str
        },
    )

    df["date"] = pd.to_datetime(
        df["date"]
    )

    print(
        "Building delta training data..."
    )

    training = build_training_data(
        df
    )

    training.to_csv(
        TRAINING_FILE,
        index=False,
    )

    print(
        f"Created "
        f"{len(training)} rows"
    )

    print(
        f"Users: "
        f"{training.user_id.nunique()}"
    )

    print(
        f"Saved -> {TRAINING_FILE}"
    )

    evaluate_model(
        training
    )

    X = training[
        DELTA_FEATURES
    ]

    y = training[
        "success"
    ]

    final_model = make_delta_model()

    final_model.fit(
        X,
        y,
    )

    show_weights(
        final_model
    )

    bundle = {
        "model":
            final_model,

        "features":
            DELTA_FEATURES,
    }

    joblib.dump(
        bundle,
        MODEL_FILE,
    )

    print()
    print(
        f"Saved delta model -> "
        f"{MODEL_FILE}"
    )


if __name__ == "__main__":
    main()
