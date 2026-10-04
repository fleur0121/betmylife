# ml-api — Predict My Life ML Service

FastAPI service that turns a challenge (“wake up by 7 AM”, “run 5 km”, “finish homework by 9 PM”) into a **success probability** and **game odds**.

```
User text ──► NLP service (Gemini) ──► POST /predict-from-nlp ──► probability + odds (per action)
                                        ▲
              App adds confidence + backend adds the user's history

(or build the request yourself and call POST /predict directly)
```

- **Model:** Logistic Regression (scikit-learn), trained on real data from Fitbit (2016) and the American Time Use Survey (college students, 2003–2015)
- **Personalization:** every prediction uses the user's own record, the community's record and today's situation — results update immediately after each success or failure, no retraining needed

---

## Contents

1. [Folder structure](#1-folder-structure)
2. [Setup](#2-setup)
3. [Build the model](#3-build-the-model)
4. [Run the server](#4-run-the-server)
5. [Endpoints](#5-endpoints)
6. [`POST /predict` — request](#6-post-predict--request)
7. [`POST /predict` — response](#7-post-predict--response)
8. [Examples](#8-examples)
9. [`POST /predict-from-nlp` — use the NLP output directly](#9-post-predict-from-nlp--use-the-nlp-output-directly)
10. [For the backend: what to store and count](#10-for-the-backend-what-to-store-and-count)
11. [How a prediction is calculated](#11-how-a-prediction-is-calculated)
12. [Errors & troubleshooting](#12-errors--troubleshooting)
13. [Limitations](#13-limitations)
14. [Data sources](#14-data-sources)

---

## 1. Folder structure

```
ml-api/
├── main.py              # FastAPI server (/predict, /categories, /health)
├── features.py          # Feature definitions shared by training and the API
├── nlp_adapter.py       # Converts the NLP service output into /predict requests
├── train.py             # Trains the model -> model.joblib
├── model.joblib         # Trained model (committed, so teammates can run the API)
├── prepare_fitbit.py    # Fitbit CSVs -> data/fitbit/fitbit_challenges.csv
├── prepare_atus.py      # ATUS CSVs   -> data/atus/atus_challenges.csv
├── model_report.py      # Accuracy report for the Fitbit data
├── atus_report.py       # Accuracy report for the ATUS data
├── ML_Data_Report.md    # Findings and pitch numbers
├── requirements.txt
├── .gitignore           # keeps .venv/ and data/ out of Git
└── data/                # NOT in Git (download yourself, see section 3)
    ├── fitbit/
    └── atus/
```

> **Just want to run the API?** You only need `main.py`, `features.py`, `nlp_adapter.py`, `model.joblib` and `requirements.txt`. Skip to [section 4](#4-run-the-server).

---

## 2. Setup

Requires **Python 3.10+**.

**Windows (PowerShell)**

```powershell
cd ml-api
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell blocks activation, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**macOS / Linux**

```bash
cd ml-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Your prompt should start with `(.venv)`.

---

## 3. Build the model

Only needed if you want to retrain. `model.joblib` is already in the repo.

### 3.1 Download the data

| Dataset | Where | Files → folder |
|---|---|---|
| Fitbit Fitness Tracker Data | [kaggle.com/datasets/arashnic/fitbit](https://www.kaggle.com/datasets/arashnic/fitbit) (folder `mturkfitbit_export_4.12.16-5.12.16`) | `dailyActivity_merged.csv`, `sleepDay_merged.csv`, `minuteSleep_merged.csv`, `hourlySteps_merged.csv` → `data/fitbit/` |
| American Time Use Survey | [kaggle.com/datasets/bls/american-time-use-survey](https://www.kaggle.com/datasets/bls/american-time-use-survey) | `atusact.csv`, `atussum.csv` → `data/atus/` |

Optional: the March Fitbit folder (`mturkfitbit_export_3.12.16-4.11.16`) can go in a subfolder of `data/fitbit/` — it is picked up automatically.

### 3.2 Run the pipeline

```powershell
python prepare_fitbit.py   # ~10 s  -> data/fitbit/fitbit_challenges.csv + typical.json
python prepare_atus.py     # ~1-2 min (reads a 400 MB file) -> data/atus/atus_challenges.csv + typical.json
python train.py            # compares feature sets, saves model.joblib
python model_report.py     # optional: detailed report (Fitbit)
python atus_report.py      # optional: detailed report (ATUS)
```

`train.py` prints accuracy per category + goal type, calibration and example predictions. Commit the new `model.joblib` afterwards.

---

## 4. Run the server

```powershell
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see `Uvicorn running on http://0.0.0.0:8000`. Leave the window open (Ctrl+C stops it). `--reload` restarts automatically when you save `main.py`.

| What | URL |
|---|---|
| Interactive test page | http://localhost:8000/docs |
| From a phone (same Wi-Fi) | `http://YOUR_LAPTOP_IP:8000` — find the IP with `ipconfig` (Windows, “IPv4 Address”) or `ipconfig getifaddr en0` (macOS) |

If Windows asks to allow Python through the firewall, click **Allow** (needed for phones).

**Venue Wi-Fi tip:** hackathon networks often block phone → laptop traffic. Backup options: phone hotspot, a tunnel (`cloudflared` / `ngrok`), or deploying the API online.

---

## 5. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server status and model version |
| `GET` | `/categories` | Trained categories, goal types and combinations (the LLM should use exactly these keys) |
| `POST` | `/predict` | One challenge (our format) → probability, odds and explanation |
| `POST` | `/predict-from-nlp` | NLP service output → one prediction per action ([section 9](#9-post-predict-from-nlp--use-the-nlp-output-directly)) |

`GET /health` example:

```json
{"status": "ok", "model_version": "v2", "feature_set": "category*goal_type_wake_weekend",
 "trained_on": {"fitbit": 3703, "atus": 1910}}
```

---

## 6. `POST /predict` — request

### Top-level fields

| Field | Type | Required | From | Description |
|---|---|---|---|---|
| `category` | string | **yes** | LLM | `steps`, `exercise`, `sleep`, `wake_up`, `study`, `cook`, or any new category (e.g. `reading`) |
| `is_new_category` | bool | no (default `false`) | LLM | `true` if the LLM created a category not in the list above |
| `goal_type` | string | no | LLM | `amount`, `deadline`, `start_time`, `task` — inferred if omitted (number → amount, time → deadline, neither → task) |
| `target_hour` | number 0–23.99 | no | LLM | Deadline or start hour, 24-hour clock, minutes as decimals (7:30 PM = `19.5`). Bedtimes after midnight are fine (`1` = 1 AM) |
| `goal_value` | number | no | LLM | The amount, e.g. `10000`, `2`, `5`, `30` |
| `goal_unit` | string | no | LLM | Any unit: `steps`, `minutes`, `hours`, `km`, `miles`, `pages`, `liters`… (see [units](#units)) |
| `activity` | string | no | LLM | For distance goals: `run` (default), `walk`, `bike`, `swim` |
| `day_of_week` | int 0–6 | no | App | Day of the challenge: `0` = Monday … `6` = Sunday. **Default: today** |
| `difficulty` | int 1–5 | no | User | Only if the user set it — otherwise auto-calculated |
| `user_confidence` | float 0–1 | **yes** | User | The user's own estimate (80% → `0.8`) |
| `history` | object | no | Backend | The user's and community's past results (below). Omit for a brand-new user |

### `history` object

Each record is `{"attempts": int, "successes": int}` counting **finished** challenges only. Every field is optional (missing = 0).

| Field | Counts |
|---|---|
| `user_overall` | This user, all categories |
| `user_category` | This user, this category |
| `user_subgoal` | This user, this category + goal type |
| `community_category` | All users, this category |
| `community_subgoal` | All users, this category + goal type |
| `current_streak` | int — this user's successes in a row in this category |
| `usual_value` | number — optional: this user's usual amount/time for this goal (e.g. median pages read, usual wake-up hour). Improves difficulty |

### Categories and goal types

| Category | Trained goal types | Example |
|---|---|---|
| `steps` | `amount`, `deadline` | “10,000 steps”, “5,000 steps by 3 PM” |
| `exercise` | `amount`, `deadline`, `start_time` | “Run 5 km”, “Gym before noon”, “Start my run by 8 AM” |
| `sleep` | `amount`, `deadline` | “Sleep 8 hours”, “Asleep by 11 PM” |
| `wake_up` | `deadline` | “Wake up by 7 AM” |
| `study` | `amount`, `deadline`, `start_time` | “Study 2 h by 11 PM”, “Finish homework by 9 PM”, “Start studying by 4 PM” |
| `cook` | `amount`, `deadline`, `start_time` | “Cook 30+ min”, “Cook dinner by 7 PM”, “Start cooking by 6 PM” |

Other combinations (e.g. `study` + `task`) and new categories still work — see `prediction_source` in the response.

### Units

| Unit given | Converted to | Rate |
|---|---|---|
| `seconds`, `minutes`, `hours` (+ `s`, `min`, `h`, `hr`…) | minutes | — |
| `km`, `miles`, `meters` → **steps** category | steps | 1 km ≈ 1,300 steps |
| `km`, `miles`, `meters` → **exercise** category | minutes | run 6, walk 12, bike 3, swim 25 min/km |
| minutes → **steps** category | steps | 100 steps/min |
| steps → **exercise** category | minutes | 100 steps/min |
| anything else (`pages`, `liters`, `chapters`…) | not converted | compared with `history.usual_value` if given |

---

## 7. `POST /predict` — response

| Field | Description |
|---|---|
| `success_probability` | 0.05–0.95 |
| `yes_odds` / `no_odds` | Decimal odds = 1 / probability, capped at 1.1–5.0 (1.2–3.0 for new categories with < 50 community results) |
| `model_version` | e.g. `v2` — store it with the prediction |
| `prediction_source` | `trained` (exact category + goal type learned from data), `trained_category` (category learned, goal type new), `community_category` (new category with community data), `user_traits_only` (new category, no data yet) |
| `category`, `category_known`, `goal_type` | How the challenge was read |
| `difficulty_used`, `difficulty_source` | 1–5, and whether it came from the `user`, was calculated (`auto`) or is the `default` (3) |
| `goal_used` | How the amount was interpreted, e.g. `"5 km run ≈ 30 minutes"` (or `null`) |
| `breakdown.starting_rate` | Probability based on records (user → community → typical person) |
| `breakdown.starting_from` | Text explaining the starting point, e.g. `"your record in this category (18/20)"` |
| `breakdown.adjustment_today` | Change from today's situation (difficulty, deadline, weekend, streak), in probability points |
| `breakdown.adjustment_confidence` | Change from the user's confidence |

**App idea:** show the breakdown as “Based on your record (18/20) · −24% because it's the weekend”.

---

## 8. Examples

### Wake up by 7 AM on Saturday — user with history

Request:

```json
{
  "category": "wake_up",
  "goal_type": "deadline",
  "target_hour": 7,
  "day_of_week": 5,
  "user_confidence": 0.6,
  "history": {
    "user_overall":  {"attempts": 25, "successes": 21},
    "user_category": {"attempts": 20, "successes": 18},
    "current_streak": 5
  }
}
```

Response (numbers depend on the trained model):

```json
{
  "success_probability": 0.61,
  "yes_odds": 1.64,
  "no_odds": 2.56,
  "model_version": "v2",
  "prediction_source": "trained",
  "category": "wake_up",
  "category_known": true,
  "goal_type": "deadline",
  "difficulty_used": 3,
  "difficulty_source": "default",
  "goal_used": null,
  "breakdown": {
    "starting_rate": 0.856,
    "starting_from": "your record in this category (18/20)",
    "adjustment_today": -0.244,
    "adjustment_confidence": -0.003
  }
}
```

### Run 5 km — new user

```json
{
  "category": "exercise",
  "goal_type": "amount",
  "goal_value": 5,
  "goal_unit": "km",
  "activity": "run",
  "day_of_week": 2,
  "user_confidence": 0.7
}
```

→ `goal_used: "5 km run ≈ 30 minutes"`, `difficulty_used: 4 (auto)`, `success_probability: ~0.37`

### More request bodies

```json
{"category": "sleep", "goal_type": "deadline", "target_hour": 23, "user_confidence": 0.5}
{"category": "study", "goal_type": "amount", "goal_value": 2, "goal_unit": "hours", "target_hour": 23, "user_confidence": 0.8}
{"category": "study", "goal_type": "start_time", "target_hour": 16, "user_confidence": 0.6}
{"category": "cook", "goal_type": "deadline", "target_hour": 19, "user_confidence": 0.7}
{"category": "reading", "is_new_category": true, "goal_type": "amount", "goal_value": 30, "goal_unit": "pages",
 "user_confidence": 0.6, "history": {"usual_value": 20, "community_category": {"attempts": 40, "successes": 28}}}
```

### Calling it

**PowerShell**

```powershell
Invoke-RestMethod -Uri http://localhost:8000/predict -Method Post -ContentType "application/json" `
  -Body '{"category":"wake_up","target_hour":7,"user_confidence":0.6}'
```

**curl**

```bash
curl -X POST http://localhost:8000/predict -H "Content-Type: application/json" \
  -d '{"category":"wake_up","target_hour":7,"user_confidence":0.6}'
```

**TypeScript (React Native / Expo)**

```ts
const API_URL = "http://192.168.1.23:8000"; // your laptop's IP, or the deployed URL

export async function predict(challenge: object) {
  const res = await fetch(`${API_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(challenge),
  });
  if (!res.ok) throw new Error(`Predict failed: ${res.status} ${await res.text()}`);
  return res.json(); // { success_probability, yes_odds, no_odds, breakdown, ... }
}

// With the NLP service output:
export async function predictFromNlp(nlp: object, userConfidence: number, history?: object) {
  const res = await fetch(`${API_URL}/predict-from-nlp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nlp, user_confidence: userConfidence, history }),
  });
  if (!res.ok) throw new Error(`Predict failed: ${res.status} ${await res.text()}`);
  return res.json(); // [{ request, prediction }, ...]
}
```

---

## 9. `POST /predict-from-nlp` — use the NLP output directly

The NLP service (Gemini, `schema_version 1.0`) returns `actions[]` with `category`, `subcategory`, `measurements` and `times`. This endpoint converts it with `nlp_adapter.py` and returns **one prediction per action** — so the app can pass the NLP response straight through.

### Request

```json
{
  "nlp": { "...": "the whole NLP response, or just its data object" },
  "user_confidence": 0.6,
  "difficulty": null,
  "history": { "...": "same as /predict" }
}
```

| Field | Required | Description |
|---|---|---|
| `nlp` | **yes** | The NLP service response as-is |
| `user_confidence` | no* | From the app slider (0–1). Overrides `user_reported.confidence_percent`. *If neither is given, 0.5 is used |
| `difficulty` | no | From the app (1–5). Overrides `user_reported.difficulty` |
| `history` | no | Same object as `/predict` ([section 6](#history-object)) |

### Response

A list — one entry per action:

```json
[
  {
    "request": {
      "category": "wake_up",
      "is_new_category": false,
      "goal_type": "deadline",
      "target_hour": 8.0,
      "day_of_week": 6,
      "user_confidence": 0.6,
      "history": { "...": "..." }
    },
    "prediction": {
      "success_probability": 0.45,
      "yes_odds": 2.21,
      "no_odds": 1.83,
      "prediction_source": "trained",
      "difficulty_used": 3,
      "breakdown": {
        "starting_rate": 0.706,
        "starting_from": "your record in this category (8/10)",
        "adjustment_today": -0.301,
        "adjustment_confidence": 0.048
      },
      "...": "same fields as /predict"
    }
  }
]
```

**Store `request` with the challenge** — its `category` and `goal_type` are what the backend counts history by.

### How the NLP fields are mapped

| NLP output | Becomes |
|---|---|
| `subcategory` (checked first), then `category` | Our category via a synonym table, e.g. `wake_up` → `wake_up`, `fitness` / `running` / `gym` → `exercise`, `education` / `homework` → `study`, `cooking` / `meal` → `cook`, `walking` → `steps` |
| A label not in the table (e.g. `reading`) | New category with that label, `is_new_category: true` |
| `subcategory` `bedtime` / `go_to_bed` (or “bed” in the action) | `sleep` + `deadline` |
| `measurements[0]` `value` + `unit` (also accepts `amount` / `quantity`) | `goal_value` + `goal_unit` → [unit conversion](#units) |
| `running`, `walking`, `cycling`, `swimming` in the labels | `activity`: `run` / `walk` / `bike` / `swim` |
| `times[0].clock_time` (`"19:30"`) | `target_hour` (`19.5`) |
| `times[0].kind` `deadline` / `start` | `goal_type` `deadline` / `start_time` |
| Has a measurement / only a time / neither | `amount` / `deadline` / `task` (wake-up is always `deadline`) |
| `times[0].weekday`, `date`, `resolved_at`, `day_offset`, or `context.submitted_at` + `timezone` | `day_of_week` |
| `user_reported.confidence_percent` (`70`) | `user_confidence` (`0.7`) |
| `user_reported.difficulty` | `difficulty` |

The synonym tables are at the top of `nlp_adapter.py` — add new NLP labels there.

### Which day is the challenge?

When the text has no date, the time decides — using the user's timezone:

| Text, sent Saturday 11 PM | Day used |
|---|---|
| “Wake up by 8 AM” | **Sunday** — 8 AM has already passed today |
| “Go to bed by 11:30 PM” | Saturday (still tonight) |
| “Asleep by 12:30 AM” | Saturday night (bedtimes after midnight count as the same evening) |
| “Wake up by 7 on Monday” | Monday (an explicit weekday or date wins) |

The day matters: weekends change predictions a lot (e.g. wake-ups).

### Several actions in one text

“Wake up at 7 and go to the gym” → two actions → two predictions. All actions share the `history` you send; for exact history per action, call `/predict` once per action with that action's own history (use each `request` from this endpoint as a starting point).

### Rules for the NLP service

1. **Prefer our keys** in `subcategory` when they fit: `steps`, `exercise`, `sleep`, `wake_up`, `study`, `cook` (check `GET /categories`). Other labels work if they're in the synonym table.
2. **New categories:** lowercase single word or `snake_case` (`reading`, `meditation`), and reuse the same label every time.
3. **Times:** `clock_time` as `HH:MM`; `kind` = `deadline` for “by / before”, `start` for “start at / by”.
4. **Pass units as written** (`km`, `pages`, `liters`) — the API converts what it can.
5. **One goal per action** (already the case).
6. **Weekly goals** (“gym 3 times this week”) aren't supported yet — split into daily challenges.

### Calling `/predict` directly instead

If you build the request yourself, use the fields in [section 6](#6-post-predict--request). Example of what the adapter produces for “study 2 hours by 11 PM”:

```json
{"category": "study", "goal_type": "amount", "goal_value": 2, "goal_unit": "hours",
 "target_hour": 23, "day_of_week": 5, "user_confidence": 0.6}
```

---

## 10. For the backend: what to store and count

### Store on every challenge

| Column | Notes |
|---|---|
| `category`, `goal_type`, `is_new_category` | From the `request` returned by `/predict-from-nlp` (or what you sent to `/predict`) — **store exactly** (needed for history and retraining) |
| `goal_value`, `goal_unit`, `activity`, `target_hour`, `day_of_week` | Same `request` |
| `source_text` | The user's original text (from the NLP output) |
| `difficulty`, `user_confidence` | From the app |
| `success_probability`, `yes_odds`, `no_odds`, `model_version`, `prediction_source` | From the API response |
| `outcome` | `true` / `false` once the challenge is finished |

### Count before every `/predict` call

The API doesn't store anything — it only knows the history you send. Recount it before each call so predictions react to the latest results:

| `history` field | How to count (finished challenges only) |
|---|---|
| `user_overall` | This user, all categories: total, and how many succeeded |
| `user_category` | This user, same `category` |
| `user_subgoal` | This user, same `category` **and** `goal_type` |
| `community_category` | All users, same `category` |
| `community_subgoal` | All users, same `category` and `goal_type` |
| `current_streak` | This user, same `category`, ordered by date: successes in a row since the last failure |
| `usual_value` | Optional: median `goal_value` (or achieved value) of this user's past challenges of the same category + goal type + unit |

---

## 11. How a prediction is calculated

1. **Difficulty** — the user's rating if given; otherwise calculated from the goal vs. a typical person's level (for users without history); otherwise 3.
2. **Baseline** — the trained model's probability for this category + goal type on a neutral day (new categories: overall average).
3. **Starting rate** — the baseline is blended with the community's records, the user's general tendency, then the user's records for this category and goal type. Few results → stays near the baseline; many results → the user's record dominates. Formula: `(successes + strength × previous level) / (attempts + strength)`, strength 5 for users, 20 for the community.
4. **Today's adjustment (ML)** — the model compares today (difficulty, deadline, weekend, streak) with a neutral day and shifts the starting rate by the difference.
5. **Confidence** — moves the result 25% of the way (in log-odds) toward the user's own estimate.
6. **Clip & odds** — probability kept within 5–95%; odds = 1 / probability with caps.

**In one sentence:** the ML model learns how situations affect success; each user's own record decides where they start.

### Model accuracy (cross-validated on people the model never saw)

Run `python train.py` to see the latest numbers. Earlier results: Fitbit ≈ 78% accuracy (AUC 0.84), ATUS ≈ 70% (AUC 0.73), both well calibrated (“70%” ≈ 70% actual). See `ML_Data_Report.md`.

---

## 12. Errors & troubleshooting

| Problem | Fix |
|---|---|
| `uvicorn` / `python` not recognized | Activate the venv: `.venv\Scripts\Activate.ps1` |
| `ModuleNotFoundError: fastapi` | `pip install -r requirements.txt` (venv active) |
| `FileNotFoundError: model.joblib` | `git pull` or run `python train.py` |
| `ModuleNotFoundError: features` | Run uvicorn from inside `ml-api/` |
| Port 8000 already in use | Stop the other server or use `--port 8001` |
| **422** response | A field is missing or invalid — the body says which, e.g. `user_confidence: Field required`, or `80` instead of `0.8` |
| Phone can't connect | Same Wi-Fi? Firewall allowed? Try a hotspot or tunnel |
| `train.py`: “no goal_type column” | Re-run `prepare_fitbit.py` and `prepare_atus.py` |
| `ModuleNotFoundError: nlp_adapter` | `nlp_adapter.py` must be in `ml-api/` next to `main.py` |
| NLP challenge got the wrong category | Its label isn't in the synonym table — add it to `LABEL_TO_CATEGORY` in `nlp_adapter.py` |
| `/predict-from-nlp` returns `[]` | The NLP output had no `actions` |

---

## 13. Limitations

- **Small, older data:** 33 Fitbit users (2016) and ~1,700 college students in ATUS (one day each, 2003–2015).
- **`user_confidence` was simulated in training** — its 25% weight is a design choice until real app data exists.
- **Difficulty in training was calculated precisely**; self-rated difficulty in the app is noisier, so real accuracy will be somewhat lower.
- **`task` goals and new categories** aren't learned by the model yet — they rely on personal and community records.
- **Single-day challenges only**; weekly goals aren't supported.
- **Unit conversions are averages** (e.g. 6 min/km running) — users' own history refines predictions over time.
- **Retraining is manual:** run `train.py` again once the app has collected real outcomes.

---

## 14. Data sources

- Fitbit Fitness Tracker Data — Kaggle, arashnic/fitbit (2016, CC0)
- American Time Use Survey — U.S. Bureau of Labor Statistics, via Kaggle bls/american-time-use-survey (2003–2015)
- [ATUS Activity Lexicon](https://www.bls.gov/tus/lexicons/lexiconnoex0320.pdf) and [ATUS User's Guide](https://www.bls.gov/tus/atususersguide.pdf) (BLS)
