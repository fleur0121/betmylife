# Unified ML Prediction API

This is the single model-serving API used by the app backend. It exposes `GET /health` and `POST /predict`; it has no TiDB credentials and does not read app data. The backend aggregates history and sends a complete request.

The serving model and feature pipeline are from the `feature/ml-prediction` implementation. Real outcome rows come from Fitbit (2,492 daily observations from 33 people) and ATUS (1,910 observations from 1,712 people). Confidence values in model training were simulated; weather and deadline distance are not claimed as trained features. The checked-in `model.joblib` is the trained artifact. See [ML_Data_Report.md](ML_Data_Report.md) and `model_report.py` for provenance and metrics.

Run locally:

```bash
cd ml-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Point the app backend at it with `ML_API_URL=http://127.0.0.1:8001/predict`. In Docker Compose use `ML_API_URL=http://ml-api:8000/predict`. If the service is unavailable, the backend logs the cause and stores a 50% / 2.0 / 2.0 fallback prediction.

The training/preparation scripts are included, but Fitbit/ATUS source files are not redistributed. Once you have those source files and have generated normalized challenge CSVs with `prepare_fitbit.py` / `prepare_atus.py`, import them from the repository root with:

```bash
python betmylife/ml-api/import_observations.py betmylife/ml-api/data/fitbit/fitbit_challenges.csv betmylife/ml-api/data/atus/atus_challenges.csv
```

The importer accepts only rows marked `fitbit` or `atus`, uses stable IDs, and inserts idempotently. Set the existing TiDB variables in `backend/.env` first. Imported examples feed community history; user history only uses that app user's own completed challenge results.

The model blends population rates, imported community observations, and a user's completed app challenges. Personal history is shrunk toward the trained model prior until it has enough observations. Unseen categories use the model's unknown-category path. The output includes a breakdown and source so the result can be explained.
