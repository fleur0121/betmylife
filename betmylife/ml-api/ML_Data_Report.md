# ML Data Report — Predict My Life

<aside>
📊

**Snapshot**

**Model:** Logistic Regression (scikit-learn)
**Data:** 2 real sources · 6 categories · 4,402 challenges
**Test method:** 5-fold cross-validation split by person (every prediction is for someone the model never saw)
**Status:** Data ready · next step `train.py`

</aside>

---

## 1. Data Sources

| Source | Categories | Challenges | People | Personal history? |
| --- | --- | --- | --- | --- |
| Fitbit (Kaggle, 2016) | `steps`, `exercise`, `sleep`, `wake_up` | 2,492 | 33 | ✅ Yes (~1 month each) |
| ATUS — American Time Use Survey (2003–2015) | `study`, `cook` | 1,910 | 1,712 college students (18–24) | ❌ No (1 day each) |

All outcomes are **real behavior**. Only `user_confidence` is simulated.

### Challenges created

| Category | Example challenge | Success means |
| --- | --- | --- |
| `steps` | Walk 5k / 7.5k / 10k / 12.5k steps | Daily steps ≥ goal |
| `exercise` | 15 / 30 / 45 / 60 active minutes | Very + fairly active minutes ≥ goal |
| `sleep` | Sleep 6 / 7 / 8 hours | Minutes asleep ≥ goal |
| `wake_up` | Wake up by 6 / 7 / 8 / 9 AM | Last asleep minute before the deadline |
| `cook` | Cook dinner by 6 / 7 / 8 / 9 PM | 15+ min of cooking (after 3 PM) before the deadline |
| `study` | Study 1 / 2 / 3 hours by 9 / 10 / 11 PM | Homework time before the deadline ≥ goal |

---

## 2. Model Accuracy

<aside>
✅

**The model beats the baselines on both datasets and is well calibrated.**

</aside>

| Metric | Fitbit model | ATUS model |
| --- | --- | --- |
| Brier score ↓ | **0.161** (baseline 0.254) | **0.196** (baseline 0.227) |
| Log loss ↓ | 0.496 (baseline 0.701) | 0.575 (baseline 0.647) |
| Accuracy | **78%** | **70%** |
| AUC | **0.84** | **0.73** |

- Fitbit also beats “past success rate only” (Brier 0.198), so the model adds value beyond the user’s track record.
- ATUS is harder to predict: one day per person, so there is no history to learn from.

### Accuracy by category (Brier, lower = better)

| Category | Rows | Success rate | Model | Baseline |
| --- | --- | --- | --- | --- |
| `wake_up` | 385 | 52% | **0.132** | 0.250 |
| `steps` | 856 | 46% | 0.152 | 0.249 |
| `exercise` | 856 | 41% | 0.168 | 0.242 |
| `cook` | 568 | 72% | 0.172 | 0.202 |
| `sleep` | 395 | 57% | 0.189 | 0.245 |
| `study` | 1,342 | 61% | 0.206 | 0.237 |

### Calibration — does “70%” mean 70%?

| Model said | Fitbit actual | ATUS actual |
| --- | --- | --- |
| 0–20% | 13% (pred 13%) | — |
| 20–40% | 28% (pred 30%) | 37% (pred 34%) |
| 40–60% | 53% (pred 52%) | 45% (pred 48%) |
| 60–80% | 70% (pred 71%) | 70% (pred 71%) |
| 80–100% | 85% (pred 86%) | 87% (pred 85%) |

Predictions match reality closely → safe to build odds directly from these probabilities.

---

## 3. Key Findings (Habit DNA material)

### 🎯 Difficulty is the strongest factor — in every category

| Category | d1 | d2 | d3 | d4 | d5 |
| --- | --- | --- | --- | --- | --- |
| `exercise` | 79% | 59% | 46% | 35% | 16% |
| `sleep` | 100%* | 86% | 53% | 25% | 18% |
| `steps` | 87% | 66% | 52% | 27% | 10% |
| `wake_up` | 86% | 65% | 50% | 8% | 5% |
| `cook` | 86% | 70% | — | 43% | — |
| `study` | 84% | 60% | — | 40% | — |

\* fewer than 20 challenges — noisy

### 😴 Weekend wake-ups are much harder

| Category | Weekday | Weekend |
| --- | --- | --- |
| `wake_up` | 59% | **33%** |
| `exercise` | 42% | 37% |
| `steps` | 47% | 43% |
| `sleep` | 55% | 61% |
| `cook` | 69% | 76% |
| `study` | 59% | 64% |

Weekends hurt **wake-up** most, but **sleep, cooking and studying go slightly better** on weekends — the effect depends on the category.

### 🔥 Streaks predict success

| Category | Streak 0 | 1 | 2 | 3+ |
| --- | --- | --- | --- | --- |
| `exercise` | 26% | 53% | 55% | 76% |
| `sleep` | 47% | 56% | 65% | 73% |
| `steps` | 34% | 51% | 65% | 69% |
| `wake_up` | 43% | 56% | 53% | 74% |

A 3-day streak roughly **doubles** the success rate vs. no streak.

### ⏰ Later deadlines are easier

| Wake up by | 6 AM | 7 AM | 8 AM | 9 AM |
| --- | --- | --- | --- | --- |
| Success | 23% | 44% | 64% | 83% |

| Cook dinner by | 6 PM | 7 PM | 8 PM | 9 PM |
| --- | --- | --- | --- | --- |
| Success | 43% | 70% | 81% | 91% |

| Study by | 9 PM | 10 PM | 11 PM |
| --- | --- | --- | --- |
| Success | 52% | 63% | 68% |

### 📚 Study goal length

| Goal | 1 hour | 2 hours | 3 hours |
| --- | --- | --- | --- |
| Success | 84% | 60% | 40% |

### 📅 Day-of-week notes

- **Sunday** is the weakest day for `exercise` (31%), `steps` (36%) and `wake_up` (32%).
- **Friday** is the weakest day for `cook` (50%).
- `sleep` is best on Wednesday and Sunday.

---

## 4. What the Model Relies On

| Feature | Fitbit weight | ATUS weight | Meaning |
| --- | --- | --- | --- |
| `difficulty` | **−1.31** | **−0.72** | Harder goal → less likely (strongest) |
| `category` | ±0.6–0.7 | ±0.56 | Baseline differences between goal types |
| `target_hour` | +0.54 | +0.43 | Later deadline → more likely |
| `past_success_rate` | +0.36 | — | Good track record → more likely |
| `wake_up × weekend` | −0.25 | — | Extra penalty for weekend wake-ups |
| `is_weekend` | −0.05 | +0.12 | Small on its own |
| `current_streak` | +0.04 | — | Mostly captured by past success rate |
| `user_confidence` | −0.08 | −0.02 | No effect (simulated) |

---

## 5. Limitations

<aside>
⚠️

Say these honestly in the pitch.

</aside>

- **Difficulty is calculated precisely** from real behavior. App users self-rate it, so real-world accuracy will be lower.
- **`user_confidence` is simulated** → its weight means nothing yet.
- **Fitbit: only 33 people over ~1 month** (2016 Mechanical Turk workers, not students).
- **ATUS: one day per person** → no streaks or history for study/cook.
- **ATUS only includes people who cooked/studied that day** (they “intended” to), so success = hitting the goal by the deadline.
- **Study difficulty = goal length** (1h → d1, 2h → d2, 3h → d4), so those two tables show the same thing.
- **Goals are assigned, not chosen** — real users pick goals they think they can hit, so real success rates may be higher.

---

## 6. Pitch Lines

> “Trained on real data from **33 Fitbit users** and **1,712 college students**, our model predicts goal success with **78% accuracy** on people it has never seen — and when it says 70%, about 70% of those challenges succeed.”

> “Weekend wake-ups succeed only **33%** of the time vs. **59%** on weekdays, and a **3-day streak** roughly doubles your chance of success.”

---

## 7. Next Steps

- [ ]  `train.py` — combine Fitbit + ATUS, train the final model, save `model.joblib`
- [ ]  `main.py` — FastAPI `POST /predict` with capped odds
- [ ]  Give frontend a sample `/predict` response
- [ ]  (Optional) Add the March Fitbit folder and rerun
- [ ]  (Optional) Friend diary study for real confidence data
