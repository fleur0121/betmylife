"""
Seed three demo personas with consistent challenge history.

Each persona is a set of simulation parameters:

    skill            base success probability
    cat_skill        per-behavior adjustment (e.g. Leo is weak at the gym)
    weekend_penalty  success drop on Saturday/Sunday (Sora falls apart)
    overconf         stated confidence minus true probability
    cat_pref         how often each behavior is chosen

One generator produces every persona's history, so their charts and
predictions come from the same rules. Rows go through the same tables the
app uses:

    users            the persona accounts (log in with --password)
    challenges       resolved past challenges with user_input/analysis JSON
    ml_observations  one source='app' result per challenge, linked by
                     challenge_id, exactly like POST .../result writes

Finally each persona posts the same open demo challenge,
"Wake up by 7am on Saturday", priced with the same General model and
personal_context_probability blend as odds_service.py.

    .venv/bin/python seed_personas.py --dry-run   # preview, no DB access
    .venv/bin/python seed_personas.py             # replace persona data

Re-running is safe: persona rows are deleted and regenerated. Other users'
data is never touched.
"""

import argparse
import hashlib
import json
import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd

from history_features import day_type, personal_context_probability


ROOT = Path(__file__).parent
GENERAL_MODEL_FILE = ROOT / "general_model.pkl"


@dataclass(frozen=True)
class Persona:
    key: str
    username: str
    name: str
    avatar: str
    age: int
    gender: str
    bio: str
    title: str
    skill: float
    cat_skill: dict
    weekend_penalty: float
    overconf: float
    cat_pref: dict
    demo_confidence: int


PERSONAS = (
    Persona(
        key="maya",
        username="maya_earlybird",
        name="Maya",
        avatar="🌅",
        age=22,
        gender="female",
        bio="Up before the sun. Still not sure I'm good at this.",
        title="The Early Bird",
        skill=0.78,
        cat_skill={"wake_up": 0.14, "gym": 0.0, "study": 0.02},
        weekend_penalty=0.03,
        overconf=-0.15,
        cat_pref={"wake_up": 0.5, "gym": 0.25, "study": 0.25},
        demo_confidence=70,
    ),
    Persona(
        key="leo",
        username="leo_allin",
        name="Leo",
        avatar="🔥",
        age=24,
        gender="male",
        bio="90% sure about everything. Usually.",
        title="The Overconfident One",
        skill=0.55,
        cat_skill={"wake_up": 0.0, "gym": -0.22, "study": 0.07},
        weekend_penalty=0.08,
        overconf=0.42,
        cat_pref={"wake_up": 0.3, "gym": 0.45, "study": 0.25},
        demo_confidence=90,
    ),
    Persona(
        key="sora",
        username="sora_grinder",
        name="Sora",
        avatar="📚",
        age=21,
        gender="female",
        bio="Monday to Friday I'm unstoppable. Weekends are a mystery.",
        title="The Weekday Grinder",
        skill=0.80,
        cat_skill={"wake_up": 0.06, "gym": -0.05, "study": 0.13},
        weekend_penalty=0.74,
        overconf=0.05,
        cat_pref={"wake_up": 0.45, "gym": 0.15, "study": 0.4},
        demo_confidence=75,
    ),
)

# Each template mirrors what challenge-analyze returns for that sentence.
TEMPLATES = {
    "wake_up": {
        "app_category": "Lifestyle",
        "category": "sleep",
        "subcategory": "wake_up",
        "action": "wake up",
        "object": None,
        "difficulty": 3,
        "measurement": None,
        "time_kind": "deadline",
    },
    "gym": {
        "app_category": "Fitness",
        "category": "exercise",
        "subcategory": "strength_training",
        "action": "work out",
        "object": "gym",
        "difficulty": 3,
        "measurement": {"metric": "activity_duration", "value": 45, "unit": "minute"},
        "time_kind": "event",
    },
    "study": {
        "app_category": "Study",
        "category": "learning",
        "subcategory": "exam_preparation",
        "action": "study",
        "object": None,
        "difficulty": 2,
        "measurement": {"metric": "activity_duration", "value": 2, "unit": "hour"},
        "time_kind": "deadline",
    },
}

DEMO_TITLE = "Wake up by 7am on Saturday"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--days", type=int, default=84, help="days of history")
    parser.add_argument("--as-of", default=date.today().isoformat())
    parser.add_argument("--timezone", default="Asia/Tokyo")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--password", default="demo1234")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def persona_id(persona):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"betmylife:persona:{persona.key}"))


def hash_password(password):
    # Same format as betmylife/backend/main.py so /auth/login accepts it.
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 120_000
    ).hex()
    return f"{salt}${digest}"


def clock_label(hour, minute):
    suffix = "am" if hour < 12 else "pm"
    display_hour = hour % 12 or 12
    return f"{display_hour}{suffix}" if minute == 0 else f"{display_hour}:{minute:02d}{suffix}"


def challenge_text(kind, local_time, weekday_name):
    label = clock_label(local_time.hour, local_time.minute)
    if kind == "wake_up":
        return f"Wake up by {label} on {weekday_name}"
    if kind == "gym":
        return f"Hit the gym for 45 minutes at {label} on {weekday_name}"
    return f"Study for 2 hours before {label} on {weekday_name}"


def challenge_time(kind, rng):
    if kind == "wake_up":
        return time(6, int(rng.choice([0, 30]))) if rng.random() < 0.6 else time(7, 0)
    if kind == "gym":
        return time(int(rng.choice([7, 18, 19])), 0)
    return time(22, 0)


def analysis_json(kind, text, local_time, submitted_at, zone_name, confidence):
    template = TEMPLATES[kind]
    measurement = template["measurement"]
    resolved_at = local_time.isoformat()
    return {
        "data": {
            "schema_version": "1.0",
            "source_text": text,
            "context": {"submitted_at": submitted_at.isoformat(), "timezone": zone_name},
            "actions": [
                {
                    "original": text,
                    "action": template["action"],
                    "object": template["object"],
                    "category": template["category"],
                    "subcategory": template["subcategory"],
                    "measurements": (
                        [{
                            "original": text,
                            "metric": measurement["metric"],
                            "operator": "gte",
                            "value": measurement["value"],
                            "unit": measurement["unit"],
                        }]
                        if measurement
                        else []
                    ),
                    "completion_condition": None,
                    "times": [{
                        "original": text,
                        "kind": template["time_kind"],
                        "operator": "lte" if template["time_kind"] == "deadline" else "eq",
                        "date_text": local_time.strftime("%A"),
                        "clock_time": local_time.strftime("%H:%M"),
                        "date": local_time.date().isoformat(),
                        "weekday": local_time.strftime("%A").lower(),
                        "timezone": zone_name,
                        "day_offset": None,
                        "resolved_at": resolved_at,
                    }],
                    "frequency": None,
                    "challenge_period": None,
                    "conditions": {"indoor_outdoor": None, "weather_requirement": None},
                    "clarification_questions": [],
                }
            ],
            "user_reported": {
                "difficulty": None,
                "confidence_percent": confidence,
                "confidence_original": None,
            },
            "clarification_questions": [],
        },
        "usage": {},
        "model": "seeded-persona",
        "cached": False,
    }


class GeneralModel:
    def __init__(self):
        self.bundle = joblib.load(GENERAL_MODEL_FILE)

    def probability(self, category, day_of_week, target_hour):
        if category not in self.bundle["known_categories"]:
            return 0.5
        features = pd.DataFrame(
            [{
                "category": category,
                "day_of_week": day_of_week,
                "is_weekend": int(day_of_week >= 5),
                "target_hour": target_hour,
            }],
            columns=self.bundle["features"],
        )
        return float(self.bundle["model"].predict_proba(features)[0, 1])


def price(general, history, category, local_time):
    """Odds exactly as odds_service.predict_odds computes them."""
    general_probability = general.probability(
        category, local_time.weekday(), local_time.hour
    )
    probability, _, _ = personal_context_probability(
        history, category, local_time.weekday(), general_probability
    )
    probability = min(max(probability, 0.01), 0.99)
    return round(probability * 100, 2), round(1 / probability, 2), round(1 / (1 - probability), 2)


def challenge_row(persona, kind, local_time, submitted_at, zone_name, confidence, odds):
    template = TEMPLATES[kind]
    user_id = persona_id(persona)
    text = challenge_text(kind, local_time, local_time.strftime("%A"))
    if local_time.hour == 7 and kind == "wake_up" and local_time.weekday() == 5:
        text = DEMO_TITLE
    challenge_id = str(uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"betmylife:persona:{persona.key}:{local_time.isoformat()}:{kind}",
    ))
    deadline_utc = local_time.astimezone(timezone.utc).replace(tzinfo=None)
    user_input = {
        "schema_version": 1,
        "capture_status": "seeded_persona",
        "title": text,
        "category": template["app_category"],
        "difficulty": template["difficulty"],
        "confidence": confidence,
        "visibility": "public",
        "deadline_at": local_time.astimezone(timezone.utc).isoformat(),
        "deadline_label": local_time.strftime("%a %H:%M"),
        "timezone": zone_name,
    }
    return {
        "id": challenge_id,
        "user_id": user_id,
        "title": text,
        "category": template["app_category"],
        "difficulty": template["difficulty"],
        "confidence": confidence,
        "visibility": "public",
        "deadline_at": deadline_utc,
        "deadline_label": user_input["deadline_label"],
        "probability": odds[0],
        "yes_odds": odds[1],
        "no_odds": odds[2],
        "user_input_json": json.dumps(user_input, ensure_ascii=False),
        "analysis_json": json.dumps(
            analysis_json(kind, text, local_time, submitted_at, zone_name, confidence),
            ensure_ascii=False,
        ),
        "created_at": submitted_at.astimezone(timezone.utc).replace(tzinfo=None),
    }


def generate(persona, general, as_of, days, zone, rng):
    """Return (challenges, observations, demo_challenge) for one persona."""
    zone_name = zone.key
    kinds = list(persona.cat_pref)
    weights = np.array([persona.cat_pref[kind] for kind in kinds])
    challenges, observations = [], []
    # Systematic sampling: each (behavior, day type) bucket accumulates its
    # success probability and succeeds whenever the total crosses 1, so a
    # dozen weekend wake-ups still show the persona's real weekend rate.
    accumulated = {}
    history = pd.DataFrame(columns=["category", "success", "day_of_week"])

    for offset in range(days, 0, -1):
        day = as_of - timedelta(days=offset)
        kind = str(rng.choice(kinds, p=weights / weights.sum()))
        template = TEMPLATES[kind]
        local_time = datetime.combine(day, challenge_time(kind, rng), zone)
        submitted_at = local_time - timedelta(hours=10)

        is_weekend = local_time.weekday() >= 5
        p_true = persona.skill + persona.cat_skill[kind]
        p_true -= persona.weekend_penalty if is_weekend else 0
        p_true = float(np.clip(p_true, 0.03, 0.97))
        confidence = int(np.clip(
            round((p_true + persona.overconf + rng.normal(0, 0.05)) * 20) * 5,
            5, 95,
        ))
        bucket = (kind, is_weekend)
        accumulated[bucket] = accumulated.get(bucket, rng.random()) + p_true
        success = int(accumulated[bucket] >= 1)
        accumulated[bucket] -= success

        odds = price(general, history, template["category"], local_time)
        row = challenge_row(persona, kind, local_time, submitted_at, zone_name, confidence, odds)
        resolved_at = (local_time + timedelta(minutes=30)).astimezone(timezone.utc).replace(tzinfo=None)
        row["result"] = "success" if success else "failed"
        row["resolved_at"] = resolved_at
        challenges.append(row)

        measurement = template["measurement"] or {}
        observations.append({
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"betmylife:app:{row['id']}")),
            "user_id": row["user_id"],
            "challenge_id": row["id"],
            "occurred_at": resolved_at,
            "app_category": template["app_category"],
            "category": template["category"],
            "subcategory": template["subcategory"],
            "goal": measurement.get("value"),
            "goal_unit": measurement.get("unit"),
            "target_hour": local_time.hour,
            "hours_until_deadline": round(
                (local_time - submitted_at).total_seconds() / 3600, 2
            ),
            "success": success,
            "day_of_week": local_time.weekday(),
            "kind": kind,
            "confidence": confidence,
        })
        history = pd.concat(
            [history, pd.DataFrame([{
                "category": template["category"],
                "success": success,
                "day_of_week": local_time.weekday(),
            }])],
            ignore_index=True,
        )

    days_to_saturday = (5 - as_of.weekday()) % 7 or 7
    demo_time = datetime.combine(as_of + timedelta(days=days_to_saturday), time(7, 0), zone)
    demo_odds = price(general, history, "sleep", demo_time)
    demo = challenge_row(
        persona, "wake_up", demo_time, datetime.combine(as_of, time(12, 0), zone),
        zone_name, persona.demo_confidence, demo_odds,
    )
    demo["result"] = None
    demo["resolved_at"] = None
    return challenges, observations, demo


def summarize(persona, observations, demo):
    frame = pd.DataFrame(observations)
    frame["day_type"] = frame["day_of_week"].apply(day_type)
    print(f"\n{persona.avatar} {persona.name} ({persona.title}) "
          f"user_id={persona_id(persona)} username={persona.username}")
    print(f"  {len(frame)} challenges, success {frame.success.mean():.0%}, "
          f"avg stated confidence {frame.confidence.mean():.0f}%")
    table = (
        frame.groupby(["kind", "day_type"]).success
        .agg(["size", "mean"]).unstack("day_type")
    )
    for kind, values in table.iterrows():
        cells = []
        for current in ("weekday", "weekend"):
            attempts = values.get(("size", current))
            rate = values.get(("mean", current))
            if attempts and not pd.isna(attempts):
                cells.append(f"{current} {rate:.0%} ({int(attempts)})")
        print(f"  {kind:<8} " + "  ".join(cells))
    print(f"  demo: {demo['probability']:.0f}% YES x{demo['yes_odds']:.2f} "
          f"NO x{demo['no_odds']:.2f} (says {demo['confidence']}%)")


CHALLENGE_COLUMNS = (
    "id", "user_id", "title", "category", "difficulty", "confidence", "visibility",
    "deadline_at", "deadline_label", "probability", "yes_odds", "no_odds",
    "user_input_json", "analysis_json", "result", "resolved_at", "created_at",
)
OBSERVATION_COLUMNS = (
    "id", "user_id", "challenge_id", "occurred_at", "app_category", "category",
    "subcategory", "goal", "goal_unit", "target_hour", "hours_until_deadline",
    "success",
)


def write(persona_rows, password):
    from db_data import connect

    user_ids = [persona_id(persona) for persona, *_ in persona_rows]
    placeholders = ", ".join(["%s"] * len(user_ids))
    connection = connect(autocommit=False, read_timeout=60, write_timeout=60)
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM ml_observations WHERE source = 'app' AND user_id IN ({placeholders})",
                user_ids,
            )
            cursor.execute(
                f"DELETE FROM challenges WHERE user_id IN ({placeholders})",
                user_ids,
            )
            for persona, challenges, observations, demo in persona_rows:
                cursor.execute(
                    """INSERT INTO users
                    (id, username, password_hash, nickname, age, gender,
                     display_name, avatar, bio, custom_title)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE
                    username = VALUES(username), password_hash = VALUES(password_hash),
                    nickname = VALUES(nickname), age = VALUES(age),
                    gender = VALUES(gender), display_name = VALUES(display_name),
                    avatar = VALUES(avatar), bio = VALUES(bio),
                    custom_title = VALUES(custom_title)""",
                    (
                        persona_id(persona), persona.username, hash_password(password),
                        persona.name, persona.age, persona.gender, persona.name,
                        persona.avatar, persona.bio, persona.title,
                    ),
                )
                cursor.executemany(
                    f"INSERT INTO challenges ({', '.join(CHALLENGE_COLUMNS)}) "
                    f"VALUES ({', '.join(['%s'] * len(CHALLENGE_COLUMNS))})",
                    [tuple(row[column] for column in CHALLENGE_COLUMNS)
                     for row in [*challenges, demo]],
                )
                cursor.executemany(
                    f"INSERT INTO ml_observations (source, {', '.join(OBSERVATION_COLUMNS)}) "
                    f"VALUES ('app', {', '.join(['%s'] * len(OBSERVATION_COLUMNS))})",
                    [tuple(row[column] for column in OBSERVATION_COLUMNS)
                     for row in observations],
                )
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    args = parse_args()
    zone = ZoneInfo(args.timezone)
    as_of = date.fromisoformat(args.as_of)
    rng = np.random.default_rng(args.seed)
    general = GeneralModel()

    persona_rows = []
    for persona in PERSONAS:
        challenges, observations, demo = generate(
            persona, general, as_of, args.days, zone, rng
        )
        persona_rows.append((persona, challenges, observations, demo))
        summarize(persona, observations, demo)

    print(f"\nDemo: \"{DEMO_TITLE}\" ({persona_rows[0][3]['deadline_label']}, {args.timezone})")
    for persona, *_, demo in persona_rows:
        print(f"  {persona.name:<5} {demo['probability']:>3.0f}%  "
              f"YES x{demo['yes_odds']:.2f}  NO x{demo['no_odds']:.2f}")

    if args.dry_run:
        print("\n--dry-run: nothing written")
        return
    write(persona_rows, args.password)
    print(f"\nSaved {sum(len(rows[1]) + 1 for rows in persona_rows)} challenges and "
          f"{sum(len(rows[2]) for rows in persona_rows)} observations. "
          f"Log in as maya_earlybird / leo_allin / sora_grinder with password "
          f"'{args.password}'.")


if __name__ == "__main__":
    main()
