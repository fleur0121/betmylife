import csv
import os
import uuid
from pathlib import Path

import pymysql
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent

CSV_FILE = ROOT / "data" / "fitbit_challenges.csv"
ENV_FILE = ROOT / "betmylife" / "backend" / ".env"

# 200 rows = 1 SQL request
BATCH_SIZE = 200


def get_connection():
    load_dotenv(ENV_FILE, override=True)

    return pymysql.connect(
        host=os.getenv("TIDB_HOST"),
        port=int(os.getenv("TIDB_PORT", "4000")),
        user=os.getenv("TIDB_USER"),
        password=os.getenv("TIDB_PASSWORD"),
        database=os.getenv(
            "TIDB_DATABASE",
            "predict_my_life",
        ),
        ssl=(
            {"ca": os.getenv("TIDB_CA_PATH")}
            if os.getenv("TIDB_CA_PATH")
            else None
        ),
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=10,
        read_timeout=60,
        write_timeout=60,
    )


def value_or_none(value):
    if value is None:
        return None

    value = str(value).strip()

    if value == "":
        return None

    return value


def make_observation_id(row):
    key = "|".join(
        [
            str(row["source"]),
            str(row["user_id"]),
            str(row["date"]),
            str(row["category"]),
            str(row["goal"]),
            str(row["target_hour"]),
            str(row["success"]),
        ]
    )

    return str(
        uuid.uuid5(
            uuid.NAMESPACE_URL,
            key,
        )
    )


def build_row(row):
    goal = value_or_none(row.get("goal"))
    target_hour = value_or_none(
        row.get("target_hour")
    )

    return (
        make_observation_id(row),
        row["source"],
        str(row["user_id"]),
        row["date"],
        row["category"],
        (
            float(goal)
            if goal is not None
            else None
        ),
        (
            int(float(target_hour))
            if target_hour is not None
            else None
        ),
        int(row["success"]),
    )


def main():
    print("Reading CSV...")

    rows = []

    with CSV_FILE.open(
        newline="",
        encoding="utf-8",
    ) as file:
        reader = csv.DictReader(file)

        for row in reader:
            rows.append(build_row(row))

    print(f"Loaded {len(rows)} observations")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            total = len(rows)

            for start in range(
                0,
                total,
                BATCH_SIZE,
            ):
                batch = rows[
                    start:start + BATCH_SIZE
                ]

                # One placeholder group per row.
                value_group = """
                    (
                        %s,
                        %s,
                        %s,
                        NULL,
                        %s,
                        %s,
                        %s,
                        %s,
                        NULL,
                        NULL,
                        %s
                    )
                """

                values_sql = ",".join(
                    [value_group] * len(batch)
                )

                sql = f"""
                    INSERT IGNORE INTO ml_observations (
                        id,
                        source,
                        user_id,
                        challenge_id,
                        occurred_at,
                        category,
                        goal,
                        target_hour,
                        weather,
                        hours_until_deadline,
                        success
                    )
                    VALUES
                    {values_sql}
                """

                params = []

                for row in batch:
                    params.extend(row)

                cursor.execute(
                    sql,
                    params,
                )

                connection.commit()

                done = min(
                    start + BATCH_SIZE,
                    total,
                )

                print(
                    f"Imported {done}/{total}"
                )

    except BaseException:
        connection.rollback()
        raise

    finally:
        connection.close()

    print()
    print("FITBIT IMPORT COMPLETE")
    print()


if __name__ == "__main__":
    main()