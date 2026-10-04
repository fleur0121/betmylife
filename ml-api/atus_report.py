"""
atus_report.py
Print a report of what the model learns from data/atus/atus_challenges.csv
(study and cook challenges from the American Time Use Survey).

Run after prepare_atus.py:
    python atus_report.py

Sections:
  1. Accuracy vs. a simple baseline (tested on people the model never saw)
  2. Accuracy by category
  3. Calibration (does "70%" really mean 70%?)
  4. Patterns in the data (difficulty, weekend, day of week, deadline, goal)
  5. Model weights (what the model relies on)

Note: each ATUS person recorded ONE day, so there is no personal history.
past_success_rate / current_streak / previous_attempts are the same for
everyone and are left out of this model (Fitbit data covers them).
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

DATA_FILE = Path(__file__).parent / "data" / "atus" / "atus_challenges.csv"
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

CAT_FEATURES = ["category"]
NUM_FEATURES = ["is_weekend", "target_hour", "difficulty", "user_confidence"]
FEATURES = CAT_FEATURES + NUM_FEATURES


def make_model():
    pre = make_column_transformer(
        (OneHotEncoder(handle_unknown="ignore"), CAT_FEATURES),
        (StandardScaler(), NUM_FEATURES),
    )
    return make_pipeline(pre, LogisticRegression(max_iter=1000))


def section(title):
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def hour_label(h):
    h = int(h)
    return f"{h - 12} PM" if h > 12 else f"{h} AM" if h < 12 else "12 PM"


def main():
    df = pd.read_csv(DATA_FILE, dtype={"user_id": str})
    # Show every category + goal type separately, e.g. "study/deadline"
    if "goal_type" in df:
        df["category"] = df.category + "/" + df.goal_type
    y = df.success

    print("MODEL REPORT - Predict My Life (ATUS: study & cook)")
    print(f"Data: {len(df)} challenges from {df.user_id.nunique()} college students "
          f"(ATUS {df.date.min()}-{df.date.max()})")
    print("Test method: 5-fold cross-validation split by PERSON "
          "(every prediction is for an unseen person)")

    # ---- Out-of-sample predictions, split by person ----
    pred = np.zeros(len(df))
    base = np.zeros(len(df))
    for train_idx, test_idx in GroupKFold(n_splits=5).split(df, y, df.user_id):
        train, test = df.iloc[train_idx], df.iloc[test_idx]
        model = make_model().fit(train[FEATURES], train.success)
        pred[test_idx] = model.predict_proba(test[FEATURES])[:, 1]
        # Baseline: the category's average success rate (from training people only)
        cat_avg = train.groupby("category").success.mean()
        base[test_idx] = test.category.map(cat_avg).fillna(train.success.mean())

    # ---- 1. Overall accuracy ----
    section("1. ACCURACY (lower Brier / log loss = better)")
    print(f"{'Method':<28}{'Brier':>8}{'LogLoss':>9}{'Acc':>7}{'AUC':>7}")
    for name, p in [("Guess the category average", base), ("Our model", pred)]:
        p = np.clip(p, 0.01, 0.99)
        print(f"{name:<28}{brier_score_loss(y, p):>8.3f}{log_loss(y, p):>9.3f}"
              f"{accuracy_score(y, p > 0.5):>7.0%}{roc_auc_score(y, p):>7.2f}")

    # ---- 2. By category ----
    section("2. ACCURACY BY CATEGORY (Brier)")
    print(f"{'Category':<22}{'Rows':>6}{'Success':>9}{'Model':>8}{'Baseline':>10}")
    for cat in sorted(df.category.unique()):
        k = (df.category == cat).to_numpy()
        yk = y[k]
        print(f"{cat:<22}{k.sum():>6}{yk.mean():>9.0%}"
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

    def by_category(col, labels, data=df):
        """Success rate per category x value, as a table."""
        g = data.groupby(["category", col]).success
        rate, n = g.mean().unstack(), g.size().unstack()
        print(f"  {'':<20}" + "".join(f"{labels(v):>8}" for v in rate.columns))
        for cat in rate.index:
            cells = []
            for v in rate.columns:
                r, k = rate.loc[cat, v], n.loc[cat, v]
                cells.append("     -" if pd.isna(r) else f"{r:>6.0%}{'*' if k < 20 else ' '}")
            print(f"  {cat:<20}" + "".join(f"{c:>8}" for c in cells))

    print("\nBy difficulty:")
    by_category("difficulty", lambda v: f"d{v}")

    print("\nWeekday vs. weekend:")
    by_category("is_weekend", lambda v: "weekend" if v else "weekday")

    print("\nBy day of week:")
    by_category("day_of_week", lambda v: DAYS[v])

    print("\nBy deadline:")
    by_category("target_hour", hour_label)

    study = df[df.category.isin(["study", "study/amount"])]
    if len(study):
        print("\nStudy by goal length:")
        by_category("goal", lambda v: f"{int(v) // 60}h", data=study)

    # ---- 5. Model weights ----
    section("5. WHAT THE MODEL RELIES ON (weights; + = more likely to succeed)")
    final = make_model().fit(df[FEATURES], y)
    names = [n.split("__")[1] for n in final[0].get_feature_names_out()]
    weights = pd.Series(final[-1].coef_[0], index=names)
    for name, w in weights.reindex(weights.abs().sort_values(ascending=False).index).items():
        bar = "#" * int(round(abs(w) * 10))
        print(f"  {name:<20}{w:>+6.2f}  {bar}")

    section("NOTES")
    print("- Only people who cooked/studied that day are included (they 'intended' to),")
    print("  so success = hitting the goal/deadline, not whether they did it at all.")
    print("- One day per person: no streak or past-success data (Fitbit covers that).")
    print("- difficulty compares the goal with a TYPICAL student, not each person.")
    print("- user_confidence is SIMULATED, so its weight means nothing yet.")


if __name__ == "__main__":
    main()
