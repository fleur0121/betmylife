"""
train.py
Train the final Predict My Life model and save it as model.joblib.

Run after prepare_fitbit.py and prepare_atus.py:
    python train.py

Steps:
  1. Load Fitbit (steps, exercise, sleep, wake_up) + ATUS (study, cook, exercise)
     challenges, each labelled with a goal_type (amount / deadline / start_time)
  2. Compare the feature sets in features.py with cross-validation split by person
     (e.g. ignoring goal_type vs. giving every category + goal type its own baseline)
     and keep the one with the lowest Brier score
  3. Show accuracy for every category + goal type
  4. Train the chosen model on ALL data and save model.joblib
     (model + feature list + everything the API needs)
"""

import json
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

from features import CATEGORICAL, CATEGORIES, FEATURE_SETS, add_features

ROOT = Path(__file__).parent
DATA_FILES = {
    "fitbit": ROOT / "data" / "fitbit" / "fitbit_challenges.csv",
    "atus": ROOT / "data" / "atus" / "atus_challenges.csv",
}
TYPICAL_FILES = [ROOT / "data" / "fitbit" / "typical.json", ROOT / "data" / "atus" / "typical.json"]
MODEL_FILE = ROOT / "model.joblib"
MODEL_VERSION = "v2"


def load_data():
    frames = []
    for name, path in DATA_FILES.items():
        if path.exists():
            df = pd.read_csv(path, dtype={"user_id": str})
            if "goal_type" not in df:
                raise ValueError(f"{path.name} has no goal_type column - rerun prepare_{name}.py")
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


def load_typical():
    typical = {}
    for path in TYPICAL_FILES:
        if path.exists():
            typical.update(json.loads(path.read_text()))
    return typical


def make_model(features):
    cats = [f for f in features if f in CATEGORICAL]
    numeric = [f for f in features if f not in CATEGORICAL]
    pre = make_column_transformer(
        (OneHotEncoder(handle_unknown="ignore"), cats),
        (StandardScaler(), numeric),
    )
    return make_pipeline(pre, LogisticRegression(max_iter=3000))


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
    print(f"\n{'=' * 64}\n{title}\n{'=' * 64}")


def main():
    df = load_data()
    y = df.success
    print(f"Total: {len(df)} challenges, {df.person.nunique()} people, "
          f"{df.cat_goal.nunique()} category + goal type combinations")

    # ---- 1. Compare feature sets ----
    section("1. FEATURE SET COMPARISON (cross-validated, unseen people)")
    print(f"{'Feature set':<34}{'Brier':>8}{'LogLoss':>9}{'Acc':>7}{'AUC':>7}")
    results, preds = {}, {}
    for name, features in FEATURE_SETS.items():
        preds[name] = cross_validate(df, features)
        results[name] = scores(y, preds[name])
        s = results[name]
        print(f"{name:<34}{s['brier']:>8.4f}{s['log_loss']:>9.4f}{s['accuracy']:>7.1%}{s['auc']:>7.3f}")
    best = min(results, key=lambda n: results[n]["brier"])
    print(f"\nChosen: {best}")

    # ---- 2. By category + goal type ----
    section(f"2. ACCURACY BY CATEGORY + GOAL TYPE ({best})")
    pred = preds[best]
    print(f"{'Category':<10}{'Goal type':<12}{'Source':<8}{'Rows':>6}{'Success':>9}{'Brier':>8}{'Baseline':>10}")
    for (cat, gt), g in df.groupby(["category", "goal_type"]):
        k = g.index.to_numpy()
        yk = y.iloc[k]
        print(f"{cat:<10}{gt:<12}{g.source.iloc[0]:<8}{len(k):>6}{yk.mean():>9.0%}"
              f"{brier_score_loss(yk, pred[k]):>8.3f}"
              f"{brier_score_loss(yk, np.full(len(k), yk.mean())):>10.3f}")

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
    print("Largest weights (+ = more likely to succeed):")
    top = weights.reindex(weights.abs().sort_values(ascending=False).index).head(15)
    for name, w in top.items():
        print(f"  {name:<28}{w:>+6.2f}  {'#' * int(round(abs(w) * 10))}")

    combos = df.groupby("cat_goal")
    artifact = {
        "model": final,
        "features": features,
        "feature_set": best,
        "categories": CATEGORIES,
        "trained_combos": sorted(df.cat_goal.unique()),
        "category_success_rate": df.groupby("category").success.mean().round(3).to_dict(),
        "combo_success_rate": combos.success.mean().round(3).to_dict(),
        "neutral_hour": combos.target_hour.median().round().astype(int).to_dict(),
        "typical": load_typical(),                 # typical levels for auto difficulty
        "overall_success_rate": round(float(y.mean()), 3),
        "model_version": MODEL_VERSION,
        "trained_on": {k: int((df.source == k).sum()) for k in DATA_FILES},
        "trained_date": date.today().isoformat(),
        "cv_scores": {k: round(v, 4) for k, v in results[best].items()},
    }
    joblib.dump(artifact, MODEL_FILE)
    print(f"\nSaved -> {MODEL_FILE.name}  (version {MODEL_VERSION}, feature set '{best}')")

    # ---- 4. Sanity check: example predictions ----
    section("4. EXAMPLE PREDICTIONS (new user, no history, confidence 60%, medium difficulty)")
    examples = [
        ("Wake up by 7 AM, weekday",         "wake_up",  "deadline",   0, 7),
        ("Wake up by 7 AM, weekend",         "wake_up",  "deadline",   1, 7),
        ("Asleep by 11 PM, weekday",         "sleep",    "deadline",   0, 23),
        ("Asleep by 1 AM, weekday",          "sleep",    "deadline",   0, 25),
        ("5,000 steps by 3 PM",              "steps",    "deadline",   0, 15),
        ("Study 2h by 11 PM",                "study",    "amount",     0, 23),
        ("Finish studying by 9 PM",          "study",    "deadline",   0, 21),
        ("Start studying by 1 PM",           "study",    "start_time", 0, 13),
        ("Start cooking dinner by 6 PM",     "cook",     "start_time", 0, 18),
        ("Cook dinner 30+ min",              "cook",     "amount",     0, 22),
        ("Work out before 12 PM",            "exercise", "deadline",   0, 12),
        ("Start working out by 8 AM",        "exercise", "start_time", 0, 8),
    ]
    rate = artifact["category_success_rate"]
    rows = [{"label": label, "category": cat, "goal_type": gt, "is_weekend": wk,
             "day_of_week": 5 if wk else 1, "target_hour": hour, "difficulty": 3,
             "user_confidence": 0.6, "past_success_rate": rate.get(cat, artifact["overall_success_rate"]),
             "current_streak": 0, "previous_attempts": 0}
            for label, cat, gt, wk, hour in examples]
    ex = add_features(pd.DataFrame(rows))
    ex["p"] = final.predict_proba(ex[features])[:, 1]
    for _, r in ex.iterrows():
        print(f"  {r.label:<34}{r.p:>6.0%}")


if __name__ == "__main__":
    main()
