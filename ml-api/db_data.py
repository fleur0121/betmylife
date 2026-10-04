import os
from pathlib import Path

import pandas as pd
import pymysql
from dotenv import load_dotenv


ROOT = Path(__file__).parent
ENV_FILE = ROOT.parent / "betmylife" / "backend" / ".env"


def connect(**options):
    """Connect to the app database configured in betmylife/backend/.env."""
    load_dotenv(ENV_FILE)
    required = ("TIDB_HOST", "TIDB_USER", "TIDB_PASSWORD", "TIDB_DATABASE")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing DB settings in {ENV_FILE}: {', '.join(missing)}")
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
        **options,
    )


def load_observations(sources: tuple[str, ...]) -> pd.DataFrame:
    if not sources:
        raise ValueError("At least one observation source is required")

    placeholders = ", ".join(["%s"] * len(sources))
    connection = connect(read_timeout=60)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""SELECT user_id, occurred_at, category, goal, target_hour, success
                FROM ml_observations
                WHERE source IN ({placeholders})
                ORDER BY user_id, occurred_at""",
                sources,
            )
            rows = cursor.fetchall()
    finally:
        connection.close()

    if not rows:
        raise RuntimeError(
            f"No ML observations found in the database for sources: {sources}"
        )

    data = pd.DataFrame(rows)
    data["user_id"] = data["user_id"].astype(str)
    data["date"] = pd.to_datetime(data.pop("occurred_at")).dt.normalize()
    data["day_of_week"] = data["date"].dt.dayofweek
    data["is_weekend"] = (data["day_of_week"] >= 5).astype(int)
    data["success"] = data["success"].astype(int)
    data = data.dropna(subset=["category", "target_hour", "success"])
    data["target_hour"] = data["target_hour"].astype(int)
    if data.empty:
        raise RuntimeError("ML observations have no complete training rows")
    return data.reset_index(drop=True)