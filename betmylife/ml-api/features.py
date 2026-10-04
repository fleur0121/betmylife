"""
features.py
Shared feature definitions for the Predict My Life model.

Used by BOTH train.py (training) and main.py (the /predict API), so the model
always receives features built exactly the same way.
"""

import pandas as pd

CATEGORIES = ["steps", "exercise", "sleep", "wake_up", "study", "cook"]
GOAL_TYPES = ["amount", "deadline", "start_time", "task"]

# Text columns -> one-hot encoded by the model
CATEGORICAL = ["category", "goal_type", "cat_goal"]

# Number columns that come straight from the challenge / user history
BASE_NUMERIC = [
    "is_weekend",
    "target_hour",
    "difficulty",
    "user_confidence",
    "past_success_rate",
    "current_streak",
    "previous_attempts",
]

# One weekend flag per category
# (weekends hurt wake-up but help sleep/study/cook, so one shared weight isn't enough)
WEEKEND_BY_CATEGORY = [f"weekend_{c}" for c in CATEGORIES]

# Feature sets that train.py compares (it keeps the one with the best Brier score)
FEATURE_SETS = {
    # Ignores goal_type (the old model)
    "category_only": ["category"] + BASE_NUMERIC + WEEKEND_BY_CATEGORY,
    # Goal type has its own effect, the same for every category
    "category+goal_type": ["category", "goal_type"] + BASE_NUMERIC + WEEKEND_BY_CATEGORY,
    # Every category + goal type combination gets its own baseline
    # (still keeps category and goal_type alone, so unseen combinations fall back to them)
    "category*goal_type": ["category", "goal_type", "cat_goal"] + BASE_NUMERIC + WEEKEND_BY_CATEGORY,
    # Same, but only the wake-up weekend interaction
    "category*goal_type_wake_weekend": ["category", "goal_type", "cat_goal"] + BASE_NUMERIC
                                       + ["weekend_wake_up"],
}


def model_hour(category: str, goal_type: str, hour: float) -> float:
    """
    Hour as the model expects it. Bedtimes after midnight are 24, 25 ...
    ("asleep by 1 AM" = 25), so later bedtimes stay larger numbers.
    """
    if category == "sleep" and goal_type == "deadline" and hour < 12:
        return hour + 24
    return hour


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with all derived feature columns added."""
    df = df.copy()
    if "is_weekend" not in df and "day_of_week" in df:
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    if "goal_type" not in df:
        df["goal_type"] = "amount"
    df["goal_type"] = df["goal_type"].fillna("amount")
    df["cat_goal"] = df["category"] + "|" + df["goal_type"]
    for cat in CATEGORIES:
        df[f"weekend_{cat}"] = ((df["category"] == cat) & (df["is_weekend"] == 1)).astype(int)
    return df
