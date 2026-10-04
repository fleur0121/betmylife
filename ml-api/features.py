"""
features.py
Shared feature definitions for the Predict My Life model.

Used by BOTH train.py (training) and main.py (the /predict API), so the model
always receives features built exactly the same way.
"""

import pandas as pd

CATEGORIES = ["steps", "exercise", "sleep", "wake_up", "study", "cook"]

# "Neutral" deadline hour per category. Hour features are measured relative to this,
# and main.py uses it as the default when a challenge has no real deadline.
TYPICAL_HOUR = {"steps": 22, "exercise": 22, "sleep": 8, "wake_up": 8, "study": 22, "cook": 19}

# Categories whose deadline really varies in the training data.
# (steps / exercise / sleep always use one fixed hour, so there is nothing to learn there.)
HOUR_CATEGORIES = ["wake_up", "study", "cook"]

# Columns that come straight from the challenge / user history.
# user_confidence is NOT here: it was simulated from past_success_rate + difficulty,
# so the model can't learn anything real from it. main.py applies it separately.
BASE_NUMERIC = [
    "is_weekend",
    "difficulty",
    "past_success_rate",
    "current_streak",
    "previous_attempts",
]

# One weekend flag per category
# (weekends hurt wake-up but help sleep/study/cook, so one shared weight isn't enough)
WEEKEND_BY_CATEGORY = [f"weekend_{c}" for c in CATEGORIES]

# One deadline slope per category, in hours later than typical
# (later wake-up deadline helps a lot; later study deadline only a little)
HOUR_BY_CATEGORY = [f"hour_{c}" for c in HOUR_CATEGORIES]

# Feature sets that train.py compares
FEATURE_SETS = {
    # Old setups: one shared target_hour slope for every category
    "wake_weekend_only": ["category", "target_hour"] + BASE_NUMERIC + ["weekend_wake_up"],
    "weekend_per_category": ["category", "target_hour"] + BASE_NUMERIC + WEEKEND_BY_CATEGORY,
    # New: weekend AND deadline effects per category
    "weekend_and_hour_per_category": ["category"] + BASE_NUMERIC + WEEKEND_BY_CATEGORY + HOUR_BY_CATEGORY,
}


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with all derived feature columns added."""
    df = df.copy()
    if "is_weekend" not in df and "day_of_week" in df:
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    for cat in CATEGORIES:
        df[f"weekend_{cat}"] = ((df["category"] == cat) & (df["is_weekend"] == 1)).astype(int)
    typical = df["category"].map(TYPICAL_HOUR)
    hours_later = (df["target_hour"] - typical).fillna(0)   # unknown category -> no hour effect
    for cat in HOUR_CATEGORIES:
        df[f"hour_{cat}"] = hours_later.where(df["category"] == cat, 0.0)
    return df
