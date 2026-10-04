"""Import prepared Fitbit/ATUS CSV outcomes into TiDB for community history."""
from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "backend" / ".env")
sys.path.insert(0, str(ROOT))

from backend.db import connection_config  # noqa: E402
import pymysql  # noqa: E402

BATCH_SIZE = 500
ALLOWED_SOURCES = {"fitbit", "atus"}


def _occurred_at(value: str) -> datetime:
    value = (value or "").strip()
    if len(value) == 4 and value.isdigit():
        value = f"{value}-01-01"
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _row(source: str, raw: dict[str, str]) -> tuple:
    row_source = (raw.get("source") or source).strip().lower()
    if row_source not in ALLOWED_SOURCES:
        raise ValueError(f"Only real Fitbit/ATUS rows can be imported, got source={row_source!r}")
    user_id = str(raw.get("user_id") or "").strip()
    category = str(raw.get("category") or "").strip().lower()
    if not user_id or not category or raw.get("success") not in {"0", "1"}:
        raise ValueError("CSV rows require user_id, category, and binary success")
    occurred_at = _occurred_at(raw.get("date", ""))
    key = "|".join((row_source, user_id, occurred_at.isoformat(), category,
                    raw.get("goal_type", ""), raw.get("goal", ""), raw["success"]))
    observation_id = hashlib.sha256(key.encode("utf-8")).hexdigest()
    goal = raw.get("goal") or None
    target_hour = raw.get("target_hour") or None
    day_of_week = raw.get("day_of_week") or None
    return (
        observation_id, row_source, f"community:{row_source}:{user_id}", occurred_at,
        category, float(goal) if goal else None,
        str(raw.get("goal_unit") or "")[:40] or None,
        str(raw.get("goal_type") or "")[:24] or None,
        int(float(target_hour)) if target_hour else None,
        int(float(day_of_week)) if day_of_week else None,
        int(raw["success"]),
    )


def import_csv(path: Path, connection) -> int:
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        pending = []
        inserted = 0
        with connection.cursor() as cursor:
            for raw in reader:
                source = (raw.get("source") or path.stem.split("_")[0]).strip().lower()
                pending.append(_row(source, raw))
                if len(pending) >= BATCH_SIZE:
                    cursor.executemany(_INSERT, pending)
                    inserted += cursor.rowcount
                    pending.clear()
            if pending:
                cursor.executemany(_INSERT, pending)
                inserted += cursor.rowcount
        connection.commit()
    return inserted


_INSERT = """INSERT IGNORE INTO ml_observations
(id, source, user_id, occurred_at, app_category, category, goal, goal_unit,
 goal_type, target_hour, day_of_week, success)
VALUES (%s, %s, %s, %s, NULL, %s, %s, %s, %s, %s, %s, %s)"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", nargs="+", type=Path, help="Prepared Fitbit/ATUS challenge CSV files")
    paths = parser.parse_args().csv
    connection = pymysql.connect(**connection_config())
    try:
        total = sum(import_csv(path, connection) for path in paths)
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()
    print(f"Imported {total} new real-world outcome rows; existing IDs were skipped.")


if __name__ == "__main__":
    main()
