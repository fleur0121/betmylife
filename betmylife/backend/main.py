import os
import json
import hashlib
import hmac
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
try:
    from .challenge_nlp import AnalyzeRequest, AnalyzeResponse, analyze
except ImportError:
    from challenge_nlp import AnalyzeRequest, AnalyzeResponse, analyze
try:
    from .db import get_connection, init_db
except ImportError:  # Supports `uvicorn main:app` from the backend directory.
    from db import get_connection, init_db

load_dotenv()
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:8081,http://127.0.0.1:8081",
    ).split(",")
    if origin.strip()
]
app = FastAPI(title="Predict My Life AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ProofMethod = Literal[
    "photo", "live_camera", "before_after", "timer", "focus_session",
    "location", "duration", "gps_route", "distance", "motion_session",
    "ai_quiz", "text_artifact", "word_count", "friend_witness",
    "checkpoint", "qr_checkin", "screen_time", "health_steps",
    "health_sleep", "health_workout", "self_report",
]

class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    source_language: str = "en"
    target_language: str = "ja"

class TranslateResponse(BaseModel):
    translated_text: str

class ProofRequirement(BaseModel):
    id: str
    method: ProofMethod
    label: str
    instructions: str
    required: bool = True
    config: dict = Field(default_factory=dict)

class ProofPlanResponse(BaseModel):
    category: str
    title: str
    summary: str
    logic: Literal["all", "any"]
    requirements: list[ProofRequirement]
    explanation: str
    verification_strength: Literal["basic", "medium", "strong"]
    fallback_allowed: bool = True

class ProofPlanRequest(BaseModel):
    title: str
    category: str
    difficulty: int
    confidence: int
    deadline: str
    capabilities: dict[str, bool] = Field(default_factory=dict)


class ProfileResponse(BaseModel):
    id: str
    username: str
    nickname: str | None = None
    age: int | None = None
    gender: str | None = None
    display_name: str
    avatar: str
    bio: str
    points: int
    profile_frame: str
    badge: str
    background: str
    custom_title: str


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    avatar: str | None = Field(default=None, max_length=255)
    bio: str | None = Field(default=None, max_length=255)
    custom_title: str | None = Field(default=None, max_length=80)


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    password: str = Field(min_length=4, max_length=128)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(actual, expected)


class AuthResponse(BaseModel):
    user_id: str
    username: str
    profile_complete: bool


class ProfileSetupRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=80)
    age: int = Field(ge=1, le=120)
    gender: Literal["male", "female", "other"]


class AppStateRequest(BaseModel):
    version: int = Field(ge=1)
    data: dict


class FollowingResponse(BaseModel):
    followed_ids: list[str]


class BadgeClaimResponse(BaseModel):
    badge_id: str
    unlocked_at: str
    reward_points_granted: int
    reward_granted: bool
    created: bool
    wallet: int


class ChallengeCreateRequest(BaseModel):
    title: str = Field(min_length=5, max_length=1000)
    category: Literal["Study", "Fitness", "Lifestyle"]
    difficulty: int = Field(ge=1, le=5)
    confidence: int = Field(ge=0, le=100)
    visibility: Literal["public", "friends"] = "public"
    deadline_at: str
    deadline_label: str = Field(min_length=1, max_length=120)
    probability: float = Field(ge=0, le=100)
    yes_odds: float = Field(gt=0)
    no_odds: float = Field(gt=0)
    user_input: dict | None = None
    analysis: dict | None = None
    proof_plan: dict | None = None


class ChallengeResultRequest(BaseModel):
    outcome: Literal["success", "failed"]


class ChallengeResponse(ChallengeCreateRequest):
    id: str
    user_id: str
    created_at: str
    result: Literal["success", "failed"] | None = None
    resolved_at: str | None = None


def is_profile_complete(user: dict) -> bool:
    return bool(user.get("nickname") and user.get("age") and user.get("gender"))

SYSTEM_PROMPT = """
You are Predict My Life's verification recipe planner.
Return only JSON matching the requested schema. Self report is the last resort.
Prefer combinations of supported methods: before_after for transformations,
focus_session plus ai_quiz for study, live_camera for time-sensitive check-ins,
text_artifact plus word_count for writing, friend_witness for social challenges,
and checkpoint for repeated habits. Never invent unsupported capabilities.
"""

BADGE_REWARD_POINTS = {
    "first_challenge": 50,
    "goal_getter": 100,
    "big_achiever": 250,
    "habit_hero": 500,
    "challenge_champion": 750,
    "streak_starter": 50,
    "three_day_streak": 100,
    "seven_day_streak": 250,
    "fourteen_day_streak": 500,
    "thirty_day_streak": 1000,
    "consistency": 300,
    "perfect_week": 300,
    "comeback": 150,
    "fitness_hero": 200,
    "knowledge_builder": 200,
    "positive_habits": 200,
    "early_bird": 100,
    "night_owl": 100,
    "focus_mode": 150,
    "ai_explorer": 100,
    "ai_slayer": 300,
    "prediction_master": 300,
    "social_butterfly": 200,
    "points_collector": 250,
    "reward_hunter": 150,
}


def _state_data(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _timestamp(value: object) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _json_object(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _stored_text(value: object, max_length: int = 40) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized if normalized and len(normalized) <= max_length else None


def _action_target_hour(action: dict, analysis: dict, challenge: dict) -> int | None:
    times = action.get("times")
    if isinstance(times, list):
        ordered_times = sorted(
            (item for item in times if isinstance(item, dict)),
            key=lambda item: item.get("kind") != "event",
        )
        for item in ordered_times:
            resolved_at = item.get("resolved_at")
            if isinstance(resolved_at, str):
                try:
                    return datetime.fromisoformat(
                        resolved_at.replace("Z", "+00:00")
                    ).hour
                except ValueError:
                    pass
            clock_time = item.get("clock_time")
            if isinstance(clock_time, str):
                for time_format in ("%H:%M", "%I:%M %p", "%I:%M%p"):
                    try:
                        return datetime.strptime(clock_time.strip(), time_format).hour
                    except ValueError:
                        continue

    deadline_at = challenge.get("deadline_at")
    if deadline_at is None:
        return None
    analysis_data = analysis.get("data")
    context = analysis_data.get("context") if isinstance(analysis_data, dict) else {}
    context = context if isinstance(context, dict) else {}
    user_input = _json_object(challenge.get("user_input_json"))
    timezone_name = context.get("timezone") or user_input.get("timezone")
    try:
        zone = ZoneInfo(timezone_name) if isinstance(timezone_name, str) else timezone.utc
    except ZoneInfoNotFoundError:
        return None
    return deadline_at.replace(tzinfo=timezone.utc).astimezone(zone).hour


def _observation_features(challenge: dict) -> dict:
    analysis = _json_object(challenge.get("analysis_json"))
    analysis_data = analysis.get("data")
    actions = analysis_data.get("actions") if isinstance(analysis_data, dict) else None
    action = next(
        (item for item in actions if isinstance(item, dict)),
        {},
    ) if isinstance(actions, list) else {}

    measurements = action.get("measurements")
    measurement = next(
        (
            item
            for item in measurements
            if isinstance(item, dict) and isinstance(item.get("value"), (int, float))
        ),
        {},
    ) if isinstance(measurements, list) else {}
    conditions = action.get("conditions")
    conditions = conditions if isinstance(conditions, dict) else {}

    return {
        "category": _stored_text(action.get("category")) or "other",
        "subcategory": _stored_text(action.get("subcategory")),
        "goal": measurement.get("value"),
        "goal_unit": _stored_text(measurement.get("unit")),
        "target_hour": _action_target_hour(action, analysis, challenge),
        "weather": _stored_text(conditions.get("weather_requirement")),
    }

def gemini_client() -> genai.Client:
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])

@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get('/challenge-analyze/schema')
def challenge_schema():
    return AnalyzeResponse.model_json_schema()


@app.post('/challenge-analyze', response_model=AnalyzeResponse)
def challenge_analyze(request: AnalyzeRequest):
    print('[challenge-nlp] requested ' + request.model_dump_json(), flush=True)
    try:
        result = analyze(request)
    except HTTPException as error:
        print('[challenge-nlp] failed ' + json.dumps(error.detail, ensure_ascii=False), flush=True)
        raise
    print('[challenge-nlp] analyzed ' + json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return result


@app.post("/db/init")
def initialize_database() -> dict[str, str]:
    """Create or upgrade the application tables after TiDB is configured."""
    init_db()
    return {"status": "ok", "message": "users table is ready"}


@app.post("/auth/register", response_model=AuthResponse, status_code=201)
def register(request: AuthRequest) -> AuthResponse:
    user_id = str(uuid.uuid4())
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO users (id, username, display_name, password_hash) VALUES (%s, %s, %s, %s)",
                    (user_id, request.username, request.username, hash_password(request.password)),
                )
    except Exception as error:
        if "Duplicate" in str(error):
            raise HTTPException(status_code=409, detail="Username is already taken") from error
        raise
    return AuthResponse(user_id=user_id, username=request.username, profile_complete=False)


@app.post("/auth/login", response_model=AuthResponse)
def login(request: AuthRequest) -> AuthResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, username, password_hash, nickname, age, gender FROM users WHERE username = %s", (request.username,))
            user = cursor.fetchone()
    if user is None or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return AuthResponse(user_id=user["id"], username=user["username"], profile_complete=is_profile_complete(user))


@app.patch("/users/{user_id}/profile/setup", response_model=ProfileSetupRequest)
def setup_profile(user_id: str, request: ProfileSetupRequest) -> ProfileSetupRequest:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET nickname = %s, age = %s, gender = %s, display_name = %s WHERE id = %s",
                (request.nickname, request.age, request.gender, request.nickname, user_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
    return request


@app.get("/users/{user_id}/profile", response_model=ProfileResponse)
def get_profile(user_id: str) -> ProfileResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
            profile = cursor.fetchone()
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return ProfileResponse(**profile)


@app.patch("/users/{user_id}/profile", response_model=ProfileResponse)
def update_profile(user_id: str, request: ProfileUpdateRequest) -> ProfileResponse:
    updates = request.model_dump(exclude_none=True)
    if not updates:
        return get_profile(user_id)
    assignments = ", ".join(f"{field} = %s" for field in updates)
    values = [*updates.values(), user_id]
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"UPDATE users SET {assignments} WHERE id = %s", values)
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
    return get_profile(user_id)


@app.get("/users/{user_id}/app-state")
def get_app_state(user_id: str) -> dict | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "SELECT version, state_json FROM user_app_states WHERE user_id = %s",
                (user_id,),
            )
            saved = cursor.fetchone()
    if saved is None:
        return None
    data = saved["state_json"]
    if isinstance(data, (str, bytes, bytearray)):
        data = json.loads(data)
    return {"version": saved["version"], "data": data}


@app.put("/users/{user_id}/app-state")
def save_app_state(user_id: str, request: AppStateRequest) -> dict[str, str]:
    data = dict(request.data)
    with get_connection() as connection:
        connection.begin()
        try:
          with connection.cursor() as cursor:
            cursor.execute("SELECT id, points FROM users WHERE id = %s FOR UPDATE", (user_id,))
            user = cursor.fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute("SELECT state_json FROM user_app_states WHERE user_id = %s FOR UPDATE", (user_id,))
            cursor.fetchone()
            cursor.execute("SELECT badge_id, unlocked_at, reward_points_granted FROM user_achievements WHERE user_id = %s", (user_id,))
            badge_rows = cursor.fetchall()
            cursor.execute("SELECT reason, amount, created_at FROM point_transactions WHERE user_id = %s", (user_id,))
            point_rows = cursor.fetchall()
            unlocks = dict(data.get("badgeUnlocks") or {})
            transactions = list(data.get("transactions") or [])
            transaction_ids = {item.get("id") for item in transactions if isinstance(item, dict)}
            wallet = data.get("wallet")
            wallet = wallet if isinstance(wallet, int) else user["points"]
            for row in badge_rows:
                badge_id = row["badge_id"]
                unlocks[badge_id] = {
                    "unlockedAt": unlocks.get(badge_id, {}).get("unlockedAt", _timestamp(row["unlocked_at"])),
                    "rewardPointsGranted": row["reward_points_granted"],
                }
            for row in point_rows:
                if row["reason"] not in transaction_ids:
                    transactions.append({
                        "id": row["reason"], "reason": row["reason"], "amount": row["amount"],
                        "createdAt": _timestamp(row["created_at"]),
                    })
            # The transaction ledger restores history. The wallet snapshot and
            # users.points already include those transactions; summing them here
            # would duplicate badge rewards on the next state save.
            data["badgeUnlocks"] = unlocks
            data["transactions"] = transactions
            data["wallet"] = wallet
            data["pointsBalance"] = wallet
            database_badges = {row["badge_id"] for row in badge_rows}
            data["pendingBadgeClaims"] = [badge_id for badge_id in (data.get("pendingBadgeClaims") or []) if badge_id not in database_badges]
            serialized_state = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
            if len(serialized_state.encode("utf-8")) > 1_000_000:
                raise HTTPException(status_code=413, detail="App state is too large")
            cursor.execute(
                """
                INSERT INTO user_app_states (user_id, version, state_json)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    version = VALUES(version),
                    state_json = VALUES(state_json)
                """,
                (user_id, request.version, serialized_state),
            )
            cursor.execute("UPDATE users SET points = %s WHERE id = %s", (wallet, user_id))
          connection.commit()
        except Exception:
          connection.rollback()
          raise
    return {"status": "saved"}



def _challenge_response(row: dict) -> ChallengeResponse:
    return ChallengeResponse(
        id=row["id"], user_id=row["user_id"], title=row["title"],
        category=row["category"], difficulty=row["difficulty"], confidence=row["confidence"],
        visibility=row["visibility"], deadline_at=row["deadline_at"].isoformat(),
        deadline_label=row["deadline_label"], probability=float(row["probability"]),
        yes_odds=float(row["yes_odds"]), no_odds=float(row["no_odds"]),
        user_input=json.loads(row["user_input_json"]) if isinstance(row.get("user_input_json"), str) else row.get("user_input_json"),
        analysis=json.loads(row["analysis_json"]) if isinstance(row["analysis_json"], str) else row["analysis_json"],
        proof_plan=json.loads(row["proof_plan_json"]) if isinstance(row["proof_plan_json"], str) else row["proof_plan_json"],
        created_at=row["created_at"].isoformat(),
        result=row.get("result"),
        resolved_at=_timestamp(row["resolved_at"]) if row.get("resolved_at") else None,
    )


@app.post("/users/{user_id}/challenges", response_model=ChallengeResponse, status_code=201)
def create_challenge(user_id: str, request: ChallengeCreateRequest) -> ChallengeResponse:
    challenge_id = str(uuid.uuid4())
    try:
        deadline_at = request.deadline_at.replace("Z", "+00:00")
        from datetime import datetime
        parsed_deadline = datetime.fromisoformat(deadline_at).replace(tzinfo=None)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="deadline_at must be an ISO datetime") from error
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            user_input = request.user_input or {
                "title": request.title,
                "category": request.category,
                "difficulty": request.difficulty,
                "confidence": request.confidence,
                "visibility": request.visibility,
                "deadline_at": request.deadline_at,
                "deadline_label": request.deadline_label,
            }
            cursor.execute(
                """INSERT INTO challenges
                (id, user_id, title, category, difficulty, confidence, visibility,
                 deadline_at, deadline_label, probability, yes_odds, no_odds,
                 user_input_json, analysis_json, proof_plan_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (challenge_id, user_id, request.title.strip(), request.category, request.difficulty,
                 request.confidence, request.visibility, parsed_deadline, request.deadline_label,
                 request.probability, request.yes_odds, request.no_odds,
                 json.dumps(user_input, ensure_ascii=False),
                 json.dumps(request.analysis, ensure_ascii=False) if request.analysis is not None else None,
                 json.dumps(request.proof_plan, ensure_ascii=False) if request.proof_plan is not None else None),
            )
            cursor.execute("SELECT * FROM challenges WHERE id = %s", (challenge_id,))
            return _challenge_response(cursor.fetchone())


@app.get("/users/{user_id}/challenges", response_model=list[ChallengeResponse])
def list_challenges(user_id: str, limit: int = 50, offset: int = 0) -> list[ChallengeResponse]:
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute("SELECT * FROM challenges WHERE user_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s", (user_id, limit, offset))
            return [_challenge_response(row) for row in cursor.fetchall()]


@app.post("/users/{user_id}/challenges/{challenge_id}/result")
def save_challenge_result(
    user_id: str,
    challenge_id: str,
    request: ChallengeResultRequest,
) -> dict[str, object]:
    observation_id = str(
        uuid.uuid5(uuid.NAMESPACE_URL, f"betmylife:app:{challenge_id}")
    )
    with get_connection() as connection:
        connection.begin()
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    """SELECT id, category, created_at, deadline_at,
                    analysis_json, user_input_json, result, resolved_at
                    FROM challenges WHERE id = %s AND user_id = %s FOR UPDATE""",
                    (challenge_id, user_id),
                )
                challenge = cursor.fetchone()
                if challenge is None:
                    raise HTTPException(status_code=404, detail="Challenge not found")
                if challenge.get("result") not in (None, request.outcome):
                    raise HTTPException(status_code=409, detail="Challenge result is already final")

                resolved_at = challenge.get("resolved_at") or datetime.now(timezone.utc).replace(tzinfo=None)
                if challenge.get("result") is None:
                    cursor.execute(
                        "UPDATE challenges SET result = %s, resolved_at = %s WHERE id = %s",
                        (request.outcome, resolved_at, challenge_id),
                    )

                created_at = challenge["created_at"]
                deadline_at = challenge["deadline_at"]
                hours_until_deadline = None
                if created_at is not None and deadline_at is not None:
                    hours_until_deadline = (
                        deadline_at - created_at
                    ).total_seconds() / 3600
                features = _observation_features(challenge)

                cursor.execute(
                    """INSERT IGNORE INTO ml_observations
                    (id, source, user_id, challenge_id, occurred_at, app_category,
                     category, subcategory, goal, goal_unit, target_hour, weather,
                     hours_until_deadline, success)
                    VALUES (%s, 'app', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        observation_id,
                        user_id,
                        challenge_id,
                        resolved_at,
                        challenge["category"],
                        features["category"],
                        features["subcategory"],
                        features["goal"],
                        features["goal_unit"],
                        features["target_hour"],
                        features["weather"],
                        hours_until_deadline,
                        int(request.outcome == "success"),
                    ),
                )
                created = cursor.rowcount == 1
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
    return {"observation_id": observation_id, "created": created}


@app.get("/users/{user_id}/ml-observations")
def list_ml_observations(
    user_id: str,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, list[dict[str, object]]]:
    limit = min(max(limit, 1), 500)
    offset = max(offset, 0)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                """SELECT id, source, challenge_id, occurred_at, app_category,
                category, subcategory, goal, goal_unit, target_hour, weather,
                hours_until_deadline, success
                FROM ml_observations WHERE user_id = %s
                ORDER BY occurred_at DESC LIMIT %s OFFSET %s""",
                (user_id, limit, offset),
            )
            observations = [
                {
                    **row,
                    "occurred_at": _timestamp(row["occurred_at"]),
                    "success": bool(row["success"]),
                }
                for row in cursor.fetchall()
            ]
    return {"observations": observations}


@app.get("/users/{user_id}/badges")
def get_user_badges(user_id: str) -> dict[str, list[dict]]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "SELECT badge_id, unlocked_at, reward_points_granted FROM user_achievements WHERE user_id = %s ORDER BY unlocked_at DESC",
                (user_id,),
            )
            rows = cursor.fetchall()
    return {"badges": [{**row, "unlocked_at": _timestamp(row["unlocked_at"])} for row in rows]}


@app.post("/users/{user_id}/badges/{badge_id}/claim", response_model=BadgeClaimResponse)
def claim_badge(user_id: str, badge_id: str) -> BadgeClaimResponse:
    reward = BADGE_REWARD_POINTS.get(badge_id)
    if reward is None:
        raise HTTPException(status_code=404, detail="Badge not found")
    created = False
    reward_granted = False
    with get_connection() as connection:
        connection.begin()
        try:
          with connection.cursor() as cursor:
            cursor.execute("SELECT id, points FROM users WHERE id = %s FOR UPDATE", (user_id,))
            user = cursor.fetchone()
            if user is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "INSERT IGNORE INTO user_achievements (user_id, badge_id, reward_points_granted) VALUES (%s, %s, %s)",
                (user_id, badge_id, reward),
            )
            created = cursor.rowcount == 1
            reason = f"BADGE_REWARD:{badge_id}"
            if created:
                cursor.execute(
                    "INSERT IGNORE INTO point_transactions (user_id, reason, amount) VALUES (%s, %s, %s)",
                    (user_id, reason, reward),
                )
                reward_granted = cursor.rowcount == 1
            cursor.execute(
                "SELECT badge_id, unlocked_at, reward_points_granted FROM user_achievements WHERE user_id = %s AND badge_id = %s",
                (user_id, badge_id),
            )
            badge = cursor.fetchone()
            cursor.execute("SELECT state_json FROM user_app_states WHERE user_id = %s FOR UPDATE", (user_id,))
            saved = cursor.fetchone()
            data = _state_data(saved["state_json"]) if saved else {}
            wallet = max(int(user["points"] or 0), int(data.get("wallet", 0) or 0))
            if reward_granted:
                wallet += reward
                cursor.execute("UPDATE users SET points = %s WHERE id = %s", (wallet, user_id))
            unlocks = dict(data.get("badgeUnlocks") or {})
            unlocks[badge_id] = {"unlockedAt": _timestamp(badge["unlocked_at"]), "rewardPointsGranted": badge["reward_points_granted"]}
            data["badgeUnlocks"] = unlocks
            transactions = list(data.get("transactions") or [])
            if reward_granted and not any(isinstance(item, dict) and item.get("id") == reason for item in transactions):
                transactions.append({"id": reason, "reason": reason, "amount": reward, "createdAt": _timestamp(badge["unlocked_at"])})
            data["transactions"] = transactions
            data["wallet"] = wallet
            data["pointsBalance"] = wallet
            data["pendingBadgeClaims"] = [item for item in (data.get("pendingBadgeClaims") or []) if item != badge_id]
            if saved:
                cursor.execute("UPDATE user_app_states SET state_json = %s WHERE user_id = %s", (json.dumps(data, separators=(",", ":"), ensure_ascii=False), user_id))
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    return BadgeClaimResponse(
        badge_id=badge_id,
        unlocked_at=_timestamp(badge["unlocked_at"]),
        reward_points_granted=badge["reward_points_granted"],
        reward_granted=reward_granted,
        created=created,
        wallet=wallet,
    )



@app.get("/users/{user_id}/following", response_model=FollowingResponse)
def get_following(user_id: str) -> FollowingResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "SELECT followed_id FROM user_follows WHERE follower_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            followed_ids = [row["followed_id"] for row in cursor.fetchall()]
    return FollowingResponse(followed_ids=followed_ids)


@app.put("/users/{user_id}/following/{followed_id}", status_code=204)
def follow_user(user_id: str, followed_id: str) -> None:
    if user_id == followed_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "INSERT IGNORE INTO user_follows (follower_id, followed_id) VALUES (%s, %s)",
                (user_id, followed_id),
            )


@app.delete("/users/{user_id}/following/{followed_id}", status_code=204)
def unfollow_user(user_id: str, followed_id: str) -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "DELETE FROM user_follows WHERE follower_id = %s AND followed_id = %s",
                (user_id, followed_id),
            )

@app.post("/translate", response_model=TranslateResponse)
def translate_text(request: TranslateRequest) -> TranslateResponse:
    try:
        client = gemini_client()
        response = client.interactions.create(
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
            input=(
                f"Translate the following UI or user text from {request.source_language} "
                f"to {request.target_language}. Preserve numbers, emojis, names, and line breaks. "
                f"Return only the translation.\n\n{request.text}"
            ),
        )
        return TranslateResponse(translated_text=response.output_text.strip())
    except Exception as error:
        raise HTTPException(status_code=503, detail="Translation service unavailable") from error

@app.post("/proof-plan", response_model=ProofPlanResponse)
def proof_plan(request: ProofPlanRequest) -> ProofPlanResponse:
    try:
        client = gemini_client()
        prompt = (
            f"{SYSTEM_PROMPT}\n\nChallenge: {request.title}\nCategory: {request.category}\n"
            f"Difficulty: {request.difficulty}\nConfidence: {request.confidence}\n"
            f"Deadline: {request.deadline}\nCapabilities: {request.capabilities}"
        )
        response = client.interactions.create(
            model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"),
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": ProofPlanResponse.model_json_schema(),
            },
        )
        return ProofPlanResponse.model_validate_json(response.output_text)
    except Exception as error:
        raise HTTPException(status_code=503, detail="Proof planner unavailable") from error
