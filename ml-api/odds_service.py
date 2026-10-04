import os
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd
import pymysql
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from history_features import stats_for_subset


MODEL_FILE = Path(__file__).with_name("general_model.pkl")
app = FastAPI(title="Betmylife Odds Model")


class OddsRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    category: str = Field(min_length=1, max_length=40)
    target_hour: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)


class OddsResponse(BaseModel):
    probability: float
    yes_odds: float
    no_odds: float
    general_probability: float
    general_category_supported: bool
    personal_attempts: int
    personal_successes: int


@lru_cache(maxsize=1)
def general_model_bundle():
    if not MODEL_FILE.exists():
        raise RuntimeError(f"General model file not found: {MODEL_FILE}")
    return joblib.load(MODEL_FILE)


def db_connection():
    required = ("TIDB_HOST", "TIDB_USER", "TIDB_PASSWORD", "TIDB_DATABASE")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing database configuration: {', '.join(missing)}")
    return pymysql.connect(
        host=os.environ["TIDB_HOST"],
        port=int(os.getenv("TIDB_PORT", "4000")),
        user=os.environ["TIDB_USER"],
        password=os.environ["TIDB_PASSWORD"],
        database=os.environ["TIDB_DATABASE"],
        ssl=(
            {"ca": os.getenv("TIDB_CA_PATH")}
            if os.getenv("TIDB_CA_PATH")
            else None
        ),
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=10,
        read_timeout=30,
    )


def general_probability(request: OddsRequest, bundle: dict) -> tuple[float, bool]:
    known_categories = bundle.get("known_categories", [])
    if request.category not in known_categories:
        return 0.5, False

    model_input = pd.DataFrame(
        [
            {
                "category": request.category,
                "day_of_week": request.day_of_week,
                "is_weekend": int(request.day_of_week >= 5),
                "target_hour": request.target_hour,
            }
        ],
        columns=bundle["features"],
    )
    probability = float(bundle["model"].predict_proba(model_input)[0, 1])
    return probability, True


def personal_history(user_id: str, category: str) -> pd.DataFrame:
    connection = db_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT success FROM ml_observations
                WHERE user_id = %s AND source = 'app' AND category = %s
                  AND occurred_at < %s
                ORDER BY occurred_at""",
                (
                    user_id,
                    category,
                    datetime.now(timezone.utc).replace(tzinfo=None),
                ),
            )
            rows = cursor.fetchall()
    finally:
        connection.close()
    return pd.DataFrame(rows, columns=["success"])


def fair_odds(probability: float) -> tuple[float, float, float]:
    bounded = min(max(float(probability), 0.01), 0.99)
    return bounded, 1 / bounded, 1 / (1 - bounded)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=OddsResponse)
def predict_odds(request: OddsRequest) -> OddsResponse:
    try:
        bundle = general_model_bundle()
        population_probability, supported = general_probability(request, bundle)
        history = personal_history(request.user_id, request.category)
        probability, attempts = stats_for_subset(history, population_probability)
        probability, yes_odds, no_odds = fair_odds(probability)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Odds model is temporarily unavailable") from error

    successes = int(history["success"].sum()) if attempts else 0
    return OddsResponse(
        probability=probability * 100,
        yes_odds=yes_odds,
        no_odds=no_odds,
        general_probability=population_probability * 100,
        general_category_supported=supported,
        personal_attempts=attempts,
        personal_successes=successes,
    )
