"""
train.py
Train the final Predict My Life model and save it as model.joblib.

Run after prepare_fitbit.py and prepare_atus.py:
    python train.py

Steps:
  1. Load Fitbit (steps, exercise, sleep, wake_up) + ATUS (study, cook) challenges
  2. Compare the feature sets in features.FEATURE_SETS with cross-validation
     split by person, and keep the one with the lowest Brier score:
       - wake_weekend_only             : one weekend interaction (wake-up), shared hour slope
       - weekend_per_category          : a weekend effect per category, shared hour slope
       - weekend_and_hour_per_category : weekend AND deadline effect per category
  3. Train the chosen model on ALL data and save model.joblib
     (model + feature list + defaults the API needs)

user_confidence is no longer a model feature (it was simulated); main.py applies it.
"""

from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import make_column_transformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from features import CATEGORIES, FEATURE_SETS, add_features

ROOT = Path(__file__).parent
DATA_FILES = {
    "fitbit": ROOT / "data" / "fitbit" / "fitbit_challenges.csv",
    "atus": ROOT / "data" / "atus" / "atus_challenges.csv",
}
MODEL_FILE = ROOT / "model.joblib"
MODEL_VERSION = "v2"


def load_data():
    frames = []
    for name, path in DATA_FILES.items():
        if path.exists():
            df = pd.read_csv(path, dtype={"user_id": str})
            frames.append(df)
            print(f"Loaded {len(df):>5} rows from {name:<6} ({path.name})")
        else:
            print(f"WARNING: {path} not found - skipping {name}")
    if not frames:
        raise FileNotFoundError("No training data found. Run prepare_fitbit.py / prepare_atus.py first.")
    df = pd.concat(frames, ignore_index=True)
    # Make IDs unique across sources so cross-validation never mixes people
    df["person"] = df.source + "_" + df.user_id.astype(str)
    return add_features(df)


def make_model(features):
    numeric = [f for f in features if f != "category"]
    pre = make_column_transformer(
        (OneHotEncoder(handle_unknown="ignore"), ["category"]),
        (StandardScaler(), numeric),
    )
    return make_pipeline(pre, LogisticRegression(max_iter=2000))


def cross_validate(df, features, n_splits=5):
    """Out-of-sample predictions: every row is predicted by a model that never saw that person."""
    pred = np.zeros(len(df))
    for train_idx, test_idx in GroupKFold(n_splits=n_splits).split(df, df.success, df.person):
        model = make_model(features).fit(df.iloc[train_idx][features], df.success.iloc[train_idx])
        pred[test_idx] = model.predict_proba(df.iloc[test_idx][features])[:, 1]
    return pred


def scores(y, p):
    return {
        "brier": brier_score_loss(y, p),
        "log_loss": log_loss(y, p),
        "accuracy": accuracy_score(y, p > 0.5),
        "auc": roc_auc_score(y, p),
    }


def section(title):
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def main():
    df = load_data()
    y = df.success
    print(f"Total: {len(df)} challenges, {df.person.nunique()} people, "
          f"categories: {', '.join(sorted(df.category.unique()))}")

    # ---- 1. Compare feature sets ----
    section("1. FEATURE SET COMPARISON (cross-validated, unseen people)")
    print(f"{'Feature set':<32}{'Brier':>8}{'LogLoss':>9}{'Acc':>7}{'AUC':>7}")
    results, preds = {}, {}
    for name, features in FEATURE_SETS.items():
        preds[name] = cross_validate(df, features)
        results[name] = scores(y, preds[name])
        s = results[name]
        print(f"{name:<32}{s['brier']:>8.4f}{s['log_loss']:>9.4f}{s['accuracy']:>7.1%}{s['auc']:>7.3f}")

    ranked = sorted(results, key=lambda n: results[n]["brier"])
    best, runner_up = ranked[0], ranked[1]
    gain = results[runner_up]["brier"] - results[best]["brier"]
    print(f"\nChosen: {best}  (Brier better than {runner_up} by {gain:.4f})")

    # ---- 2. Detail for the chosen model ----
    section(f"2. CHOSEN MODEL BY CATEGORY ({best})")
    pred = preds[best]
    print(f"{'Category':<10}{'Source':<8}{'Rows':>6}{'Success':>9}{'Brier':>8}{'Baseline':>10}")
    for cat in [c for c in CATEGORIES if c in set(df.category)]:
        k = (df.category == cat).to_numpy()
        yk = y[k]
        print(f"{cat:<10}{df.source[k].iloc[0]:<8}{k.sum():>6}{yk.mean():>9.0%}"
              f"{brier_score_loss(yk, pred[k]):>8.3f}"
              f"{brier_score_loss(yk, np.full(k.sum(), yk.mean())):>10.3f}")

    print("\nCalibration (model said -> actually happened):")
    bins = pd.cut(pred, [0, 0.2, 0.4, 0.6, 0.8, 1.0])
    calib = (pd.DataFrame({"p": pred, "y": y}).groupby(bins, observed=True)
             .agg(n=("y", "size"), predicted=("p", "mean"), actual=("y", "mean")))
    for interval, r in calib.iterrows():
        print(f"  {interval.left:.0%}-{interval.right:.0%}: predicted {r.predicted:.0%}, "
              f"actual {r.actual:.0%}  ({int(r.n)} rows)")

    # ---- 3. Train on all data and save ----
    section("3. FINAL MODEL")
    features = FEATURE_SETS[best]
    final = make_model(features).fit(df[features], y)

    names = [n.split("__")[1] for n in final[0].get_feature_names_out()]
    weights = pd.Series(final[-1].coef_[0], index=names)
    print("Weights (+ = more likely to succeed):")
    for name, w in weights.reindex(weights.abs().sort_values(ascending=False).index).items():
        print(f"  {name:<22}{w:>+6.2f}  {'#' * int(round(abs(w) * 10))}")

    # Defaults the API needs for brand-new users (no history yet)
    category_rate = df.groupby("category").success.mean().round(3).to_dict()
    artifact = {
        "model": final,
        "features": features,
        "feature_set": best,
        "categories": CATEGORIES,
        "category_success_rate": category_rate,   # new-user past_success_rate
        "overall_success_rate": round(float(y.mean()), 3),
        "model_version": MODEL_VERSION,
        "trained_on": {k: int((df.source == k).sum()) for k in DATA_FILES},
        "trained_date": date.today().isoformat(),
        "cv_scores": {k: round(v, 4) for k, v in results[best].items()},
    }
    joblib.dump(artifact, MODEL_FILE)
    print(f"\nSaved -> {MODEL_FILE.name}  (version {MODEL_VERSION}, feature set '{best}')")

    # ---- 4. Sanity check: example predictions ----
    section("4. EXAMPLE PREDICTIONS")
    examples = [
        ("Wake up by 7 AM, weekday, medium",   "wake_up", 0, 7, 3),
        ("Wake up by 7 AM, weekend, medium",   "wake_up", 1, 7, 3),
        ("Study 1h by 11 PM, weekday",         "study",   0, 23, 1),
        ("Study 3h by 9 PM, weekday",          "study",   0, 21, 4),
        ("Cook dinner by 6 PM, weekday",       "cook",    0, 18, 4),
        ("Cook dinner by 8 PM, weekend",       "cook",    1, 20, 1),
        ("Walk 10k steps, hard for me",        "steps",   0, 22, 5),
        ("Sleep 7h, weekend, medium",          "sleep",   1, 8, 3),
    ]
    rows = []
    for label, cat, weekend, hour, diff in examples:
        rows.append({"label": label, "category": cat, "is_weekend": weekend,
                     "day_of_week": 5 if weekend else 1, "target_hour": hour,
                     "difficulty": diff,
                     "past_success_rate": category_rate.get(cat, artifact["overall_success_rate"]),
                     "current_streak": 0, "previous_attempts": 0})
    ex = add_features(pd.DataFrame(rows))
    ex["p"] = final.predict_proba(ex[features])[:, 1]
    print("(new user: no history)")
    for _, r in ex.iterrows():
        print(f"  {r.label:<36}{r.p:>6.0%}")


if __name__ == "__main__":
    main()
