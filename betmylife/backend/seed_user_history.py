"""Add deterministic local history for existing demo users.

These rows are clearly marked as seed history, are private/resolved, and are
safe to regenerate without touching real user history or open challenges.
"""
from __future__ import annotations

import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from db import get_connection


SOURCE = "app"  # build_history intentionally includes completed app observations
TAG = "seed-history-v1"
TARGETS = {
    "fleur0121": {"study": .82, "exercise": .64, "sleep": .38, "steps": .58},
    "heppocoman": {"study": .72, "exercise": .78, "sleep": .46, "steps": .70},
    "kumakuma": {"study": .60, "exercise": .70, "sleep": .52, "steps": .76},
    "fukaaa": {"study": .78, "exercise": .55, "sleep": .30, "steps": .50},
    "bob_01": {"study": .65, "exercise": .60, "sleep": .62, "steps": .60},
    "alice_01": {"study": .88, "exercise": .50, "sleep": .66, "steps": .72},
}

TEMPLATES = {
    "study": ("Study", "exam_preparation", "Finish a study session", "minutes", 60),
    "exercise": ("Fitness", "strength_training", "Complete a workout", "minutes", 45),
    "sleep": ("Lifestyle", "wake_up", "Wake up by 7am", None, None),
    "steps": ("Fitness", "walking", "Walk 8000 steps", "steps", 8000),
}


def stable_id(kind: str, username: str, index: int) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"betmylife:{TAG}:{username}:{kind}:{index}"))


def main() -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            usernames = tuple(TARGETS)
            marks = ",".join(["%s"] * len(usernames))
            cursor.execute(f"SELECT id, username FROM users WHERE username IN ({marks})", usernames)
            users = {row["username"]: row["id"] for row in cursor.fetchall()}
            missing = set(TARGETS) - set(users)
            if missing:
                raise RuntimeError(f"Users not found: {', '.join(sorted(missing))}")

            # Remove only this generator's previous rows; real and other demo data stay intact.
            cursor.execute(
                f"DELETE FROM ml_observations WHERE challenge_id LIKE %s AND user_id IN ({marks})",
                ("seed-%", *users.values()),
            )
            cursor.execute(
                f"DELETE FROM challenges WHERE id LIKE %s AND user_id IN ({marks})",
                ("seed-%", *users.values()),
            )

            challenge_rows = []
            observation_rows = []
            for username, rates in TARGETS.items():
                rng = random.Random(f"{SOURCE}:{username}")
                user_id = users[username]
                for index in range(56):
                    kind = tuple(TEMPLATES)[index % 4]
                    app_category, subcategory, title, unit, goal = TEMPLATES[kind]
                    days_ago = 7 + index * 2 + rng.randrange(0, 3)
                    deadline = now - timedelta(days=days_ago)
                    created = deadline - timedelta(hours=8 + rng.randrange(0, 8))
                    resolved = deadline + timedelta(minutes=30)
                    success = int(rng.random() < rates[kind])
                    confidence = max(25, min(95, round((rates[kind] + rng.uniform(-.12, .12)) * 100)))
                    challenge_id = f"seed-{TAG}-{username}-{index}"
                    observation_id = stable_id(kind, username, index)
                    analysis = {"data": {"actions": [{
                        "category": {"study": "learning", "exercise": "exercise", "sleep": "sleep", "steps": "exercise"}[kind],
                        "subcategory": subcategory,
                        "action": title.lower(),
                        "measurements": ([{"metric": "activity_duration", "value": goal, "unit": unit}] if goal else []),
                        "times": [{"clock_time": "07:00", "kind": "deadline"}],
                    }]}}
                    user_input = {"goal_type": "deadline" if kind == "sleep" else "amount", "seed_source": TAG}
                    challenge_rows.append((
                        challenge_id, user_id, title, app_category, 3, confidence, "private",
                        deadline, deadline.strftime("%b %d, %Y"), 50.0, 2.0, 2.0,
                        json.dumps(user_input), json.dumps(analysis),
                        "success" if success else "failed", resolved, created,
                    ))
                    observation_rows.append((
                        observation_id, SOURCE, user_id, challenge_id, resolved,
                        app_category, kind, subcategory, goal, unit, "deadline",
                        deadline.hour, deadline.weekday(),
                        round((deadline - created).total_seconds() / 3600, 2), success,
                    ))

            cursor.executemany(
                """INSERT INTO challenges
                (id,user_id,title,category,difficulty,confidence,visibility,deadline_at,
                 deadline_label,probability,yes_odds,no_odds,user_input_json,analysis_json,
                 result,resolved_at,created_at)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                challenge_rows,
            )
            cursor.executemany(
                """INSERT INTO ml_observations
                (id,source,user_id,challenge_id,occurred_at,app_category,category,subcategory,
                 goal,goal_unit,goal_type,target_hour,day_of_week,hours_until_deadline,success)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                observation_rows,
            )
        connection.commit()
    print(f"Added {len(challenge_rows)} completed challenges and {len(observation_rows)} observations for {len(TARGETS)} users.")


if __name__ == "__main__":
    main()
