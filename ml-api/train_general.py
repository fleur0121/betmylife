from pathlib import Path

import joblib

from sklearn.compose import make_column_transformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from db_data import load_observations


ROOT = Path(__file__).parent
MODEL_FILE = ROOT / "general_model.pkl"


# Categorical features
CAT_FEATURES = [
    "category",
    "day_of_week",
]

# Numeric features
NUM_FEATURES = [
    "is_weekend",
    "target_hour",
]

FEATURES = CAT_FEATURES + NUM_FEATURES


def load_data():
    return load_observations(("fitbit", "atus"))


def make_model():
    preprocessing = make_column_transformer(
        (
            OneHotEncoder(
                handle_unknown="ignore"
            ),
            CAT_FEATURES,
        ),
        (
            StandardScaler(),
            NUM_FEATURES,
        ),
    )

    return make_pipeline(
        preprocessing,
        LogisticRegression(
            max_iter=1000
        ),
    )


def main():
    df = load_data()

    print()
    print("GENERAL BEHAVIOR DATA")
    print("---------------------")

    report = (
        df.groupby("category")
        .success
        .agg(
            rows="size",
            success_rate="mean",
        )
        .round(3)
    )

    print(report)

    X = df[FEATURES]
    y = df["success"]

    model = make_model()

    model.fit(
        X,
        y,
    )

    known_categories = sorted(
        df["category"].unique()
    )

    bundle = {
        "model": model,
        "known_categories": known_categories,
        "features": FEATURES,
    }

    joblib.dump(
        bundle,
        MODEL_FILE,
    )

    print()
    print("Features:")
    print(FEATURES)

    print()
    print("Known categories:")
    print(known_categories)

    print()
    print(
        f"Saved model -> {MODEL_FILE}"
    )


if __name__ == "__main__":
    main()
