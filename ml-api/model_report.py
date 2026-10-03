"""
model_report.py
Print a report of what the model learns from data/fitbit/fitbit_challenges.csv.

Run after prepare_fitbit.py:
    python model_report.py

Sections:
  1. Accuracy vs. simple baselines (tested on users the model never saw)
  2. Accuracy by category
  3. Calibration (does "70%" really mean 70%?)
  4. Patterns in the data (difficulty, weekend, streak, day of week)
  5. Model weights (what the model relies on)
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import make_column_transformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

DATA_FILE = Path(__file__).parent / "data" / "fitbit" / "fitbit_challenges.csv"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

CAT_FEATURES = ["category"]
NUM_FEATURES = ["is_weekend", "target_hour", "difficulty", "user_confidence",
                "past_success_rate", "current_streak", "previous_attempts",
                "wake_weekend"]
FEATURES = CAT_FEATURES + NUM_FEATURES


def make_model():
    pre = make_column_transformer(
        (OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        (StandardScaler(), NUM_FEATURES),
    )
    return make_pipeline(pre, LogisticRegression(max_iter=1000))


def section(title):
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def pct(x):
    return f"{x:.0%}"


def main():
    df = pd.read_csv(DATA_FILE)
    # Interaction: weekend wake-ups are much harder than weekday ones
    df["wake_weekend"] = ((df.category == "wake_up") & (df.is_weekend == 1)).astype(int)
    y = df.success

    print("MODEL REPORT - Predict My Life")
    print(f"Data: {len(df)} challenges from {df.user_id.nunique()} Fitbit users, "
          f"{df.date.min()} to {df.date.max()}")
    print("Test method: 5-fold cross-validation split by USER "
          "(every prediction is for an unseen person)")

    # ---- Out-of-sample predictions, split by user ----
    pred = np.zeros(len(df))
    base = np.zeros(len(df))
    for train_idx, test_idx in GroupKFold(n_splits=5).split(df, y, df.user_id):
        train, test = df.iloc[train_idx], df.iloc[test_idx]
        model = make_model().fit(train[FEATURES], train.success)
        pred[test_idx] = model.predict_proba(test[FEATURES])[:, 1]
        base[test_idx] = train.success.mean()

    # ---- 1. Overall accuracy ----
    section("1. ACCURACY (lower Brier / log loss = better)")
    rows = [
        ("Always guess the average", base),
        ("Past success rate only", df.past_success_rate.clip(0.01, 0.99).to_numpy()),
        ("Our model", pred),
    ]
    print(f"{'Method':<28}{'Brier':>8}{'LogLoss':>9}{'Acc':>7}{'AUC':>7}")
    for name, p in rows:
        # AUC means nothing for a constant guess, so skip it there
        auc = "-" if p is base else f"{roc_auc_score(y, p):.2f}"
        print(f"{name:<28}{brier_score_loss(y, p):>8.3f}{log_loss(y, p):>9.3f}"
              f"{accuracy_score(y, p > 0.5):>7.0%}{auc:>7}")

    # ---- 2. By category ----
    section("2. ACCURACY BY CATEGORY (Brier)")
    print(f"{'Category':<12}{'Rows':>6}{'Success':>9}{'Model':>8}{'Baseline':>10}")
    for cat in sorted(df.category.unique()):
        k = (df.category == cat).to_numpy()
        yk = y[k]
        print(f"{cat:<12}{k.sum():>6}{yk.mean():>9.0%}"
              f"{brier_score_loss(yk, pred[k]):>8.3f}"
              f"{brier_score_loss(yk, np.full(k.sum(), yk.mean())):>10.3f}")

    # ---- 3. Calibration ----
    section("3. CALIBRATION (predicted vs. what actually happened)")
    bins = pd.cut(pred, [0, 0.2, 0.4, 0.6, 0.8, 1.0])
    calib = (pd.DataFrame({"pred": pred, "actual": y})
             .groupby(bins, observed=True)
             .agg(n=("actual", "size"), predicted=("pred", "mean"), actual=("actual", "mean")))
    print(f"{'Model said':<14}{'Rows':>6}{'Predicted':>11}{'Actual':>8}")
    for interval, r in calib.iterrows():
        label = f"{interval.left:.0%}-{interval.right:.0%}"
        print(f"{label:<14}{int(r.n):>6}{r.predicted:>11.0%}{r.actual:>8.0%}")

    # ---- 4. Patterns in the data ----
    section("4. PATTERNS IN THE DATA (actual success rates)")

    print("(cells with fewer than 20 challenges are marked * - treat them as noisy)")

    def by_category(col, labels):
        """Success rate per category x value, as a table."""
        g = df.groupby(["category", col]).success
        rate, n = g.mean().unstack(), g.size().unstack()
        print(f"  {'':<10}" + "".join(f"{labels(v):>8}" for v in rate.columns))
        for cat in rate.index:
            cells = []
            for v in rate.columns:
                r, k = rate.loc[cat, v], n.loc[cat, v]
                cells.append("     -" if pd.isna(r) else f"{r:>6.0%}{'*' if k < 20 else ' '}")
            print(f"  {cat:<10}" + "".join(f"{c:>8}" for c in cells))

    print("\nBy difficulty:")
    by_category("difficulty", lambda v: f"d{v}")

    print("\nWeekday vs. weekend:")
    by_category("is_weekend", lambda v: "weekend" if v else "weekday")

    print("\nBy current streak:")
    df["streak_group"] = df.current_streak.clip(upper=3)
    by_category("streak_group", lambda v: f"{v}+" if v == 3 else str(v))

    print("\nBy day of week:")
    by_category("day_of_week", lambda v: DAYS[v])

    wake = df[df.category == "wake_up"]
    if len(wake):
        print("\nWake-up by target time:")
        for h, rate in wake.groupby("target_hour").success.mean().items():
            print(f"  by {h} AM: {pct(rate)}")

    # ---- 5. Model weights ----
    section("5. WHAT THE MODEL RELIES ON (weights; + = more likely to succeed)")
    final = make_model().fit(df[FEATURES], y)
    names = [n.split("__")[1] for n in final[0].get_feature_names_out()]
    weights = pd.Series(final[-1].coef_[0], index=names)
    for name, w in weights.reindex(weights.abs().sort_values(ascending=False).index).items():
        bar = "#" * int(round(abs(w) * 10))
        print(f"  {name:<20}{w:>+6.2f}  {bar}")

    section("NOTES")
    print("- difficulty is computed precisely from Fitbit data; app users self-rate it,")
    print("  so real-world accuracy will be lower.")
    print("- user_confidence is SIMULATED, so its weight means nothing yet.")
    print("- target_hour only truly varies for wake_up.")


if __name__ == "__main__":
    main()
