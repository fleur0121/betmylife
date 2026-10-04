import os
import json
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai

try:
    from .ml_prediction import (
        build_history,
        build_prediction_features,
        request_prediction,
    )
except ImportError:
    from ml_prediction import (
        build_history,
        build_prediction_features,
        request_prediction,
    )

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
    "photo",
    "live_camera",
    "before_after",
    "timer",
    "focus_session",
    "location",
    "duration",
    "gps_route",
    "distance",
    "motion_session",
    "ai_quiz",
    "text_artifact",
    "word_count",
    "friend_witness",
    "checkpoint",
    "qr_checkin",
    "screen_time",
    "health_steps",
    "health_sleep",
    "health_workout",
    "self_report",
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
    username: str = Field(
        min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$"
    )
    password: str = Field(min_length=4, max_length=128)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 120_000
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 120_000
    ).hex()
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


class LeaderboardEntry(BaseModel):
    id: str
    username: str
    display_name: str
    nickname: str | None = None
    avatar: str = ""
    points: int
    accuracy: int
    streak: int


class UserSummary(BaseModel):
    id: str
    username: str
    nickname: str | None = None
    display_name: str
    avatar: str


class FriendRequestResponse(BaseModel):
    id: str
    requester_id: str
    requester_name: str
    requester_username: str
    status: Literal["pending", "accepted", "declined"]
    created_at: str


class SentFriendRequestResponse(BaseModel):
    id: str
    recipient_id: str
    recipient_name: str
    recipient_username: str
    status: Literal["pending"]
    created_at: str


class FriendRequestDecision(BaseModel):
    decision: Literal["accept", "decline"]


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
    analysis: dict | None = None
    proof_plan: dict | None = None
    user_input: dict | None = None


class ChallengeResponse(ChallengeCreateRequest):
    id: str
    user_id: str
    user_name: str
    user_handle: str
    created_at: str
    probability: float
    yes_odds: float
    no_odds: float
    prediction_source: str = "fallback"
    prediction_model_version: str | None = None
    prediction_meta: dict | None = None
    result: Literal["success", "failed"] | None = None
    resolved_at: str | None = None


class ChallengeResultRequest(BaseModel):
    result: Literal["success", "failed"]


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
WELCOME_BONUS_POINTS = 1000


def _state_data(value: object) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _timestamp(value: object) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def gemini_client() -> genai.Client:
    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/challenge-analyze/schema")
def challenge_schema():
    return AnalyzeResponse.model_json_schema()


@app.post("/challenge-analyze", response_model=AnalyzeResponse)
def challenge_analyze(request: AnalyzeRequest):
    print("[challenge-nlp] requested " + request.model_dump_json(), flush=True)
    try:
        result = analyze(request)
    except HTTPException as error:
        print(
            "[challenge-nlp] failed "
            + json.dumps(error.detail, ensure_ascii=False),
            flush=True,
        )
        raise
    print(
        "[challenge-nlp] analyzed "
        + json.dumps(result, ensure_ascii=False, indent=2),
        flush=True,
    )
    return result


@app.post("/db/init")
def initialize_database() -> dict[str, str]:
    """Create or upgrade the application tables after TiDB is configured."""
    init_db()
    return {"status": "ok", "message": "users table is ready"}


@app.post("/auth/register", response_model=AuthResponse, status_code=201)
def register(request: AuthRequest) -> AuthResponse:
    user_id = str(uuid.uuid4())
    welcome_bonus_at = datetime.now(timezone.utc).isoformat()
    welcome_transaction = {
        "id": "WELCOME_BONUS",
        "reason": "WELCOME_BONUS",
        "amount": WELCOME_BONUS_POINTS,
        "createdAt": welcome_bonus_at,
    }
    initial_state = json.dumps(
        {
            "wallet": WELCOME_BONUS_POINTS,
            "pointsBalance": WELCOME_BONUS_POINTS,
            "transactions": [welcome_transaction],
        },
        separators=(",", ":"),
        ensure_ascii=False,
    )
    try:
        with get_connection() as connection:
            connection.begin()
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "INSERT INTO users (id, username, display_name, password_hash, points) VALUES (%s, %s, %s, %s, %s)",
                        (
                            user_id,
                            request.username,
                            request.username,
                            hash_password(request.password),
                            WELCOME_BONUS_POINTS,
                        ),
                    )
                    cursor.execute(
                        "INSERT INTO point_transactions (user_id, reason, amount) VALUES (%s, %s, %s)",
                        (user_id, "WELCOME_BONUS", WELCOME_BONUS_POINTS),
                    )
                    cursor.execute(
                        "INSERT INTO user_app_states (user_id, version, state_json) VALUES (%s, %s, %s)",
                        (user_id, 2, initial_state),
                    )
                connection.commit()
            except Exception:
                connection.rollback()
                raise
    except Exception as error:
        if "Duplicate" in str(error):
            raise HTTPException(
                status_code=409, detail="Username is already taken"
            ) from error
        raise
    return AuthResponse(
        user_id=user_id, username=request.username, profile_complete=False
    )


@app.post("/auth/login", response_model=AuthResponse)
def login(request: AuthRequest) -> AuthResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, username, password_hash, nickname, age, gender FROM users WHERE username = %s",
                (request.username,),
            )
            user = cursor.fetchone()
    if user is None or not verify_password(
        request.password, user["password_hash"]
    ):
        raise HTTPException(
            status_code=401, detail="Invalid username or password"
        )
    return AuthResponse(
        user_id=user["id"],
        username=user["username"],
        profile_complete=is_profile_complete(user),
    )


@app.patch("/users/{user_id}/profile/setup", response_model=ProfileSetupRequest)
def setup_profile(
    user_id: str, request: ProfileSetupRequest
) -> ProfileSetupRequest:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "UPDATE users SET nickname = %s, age = %s, gender = %s, display_name = %s WHERE id = %s",
                (
                    request.nickname,
                    request.age,
                    request.gender,
                    request.nickname,
                    user_id,
                ),
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
def update_profile(
    user_id: str, request: ProfileUpdateRequest
) -> ProfileResponse:
    updates = request.model_dump(exclude_none=True)
    if not updates:
        return get_profile(user_id)
    assignments = ", ".join(f"{field} = %s" for field in updates)
    values = [*updates.values(), user_id]
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"UPDATE users SET {assignments} WHERE id = %s", values
            )
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
                cursor.execute(
                    "SELECT id, points FROM users WHERE id = %s FOR UPDATE",
                    (user_id,),
                )
                user = cursor.fetchone()
                if user is None:
                    raise HTTPException(
                        status_code=404, detail="User not found"
                    )
                cursor.execute(
                    "SELECT state_json FROM user_app_states WHERE user_id = %s FOR UPDATE",
                    (user_id,),
                )
                cursor.fetchone()
                cursor.execute(
                    "SELECT badge_id, unlocked_at, reward_points_granted FROM user_achievements WHERE user_id = %s",
                    (user_id,),
                )
                badge_rows = cursor.fetchall()
                cursor.execute(
                    "SELECT reason, amount, created_at FROM point_transactions WHERE user_id = %s",
                    (user_id,),
                )
                point_rows = cursor.fetchall()
                unlocks = dict(data.get("badgeUnlocks") or {})
                transactions = list(data.get("transactions") or [])
                transaction_ids = {
                    item.get("id")
                    for item in transactions
                    if isinstance(item, dict)
                }
                wallet = data.get("wallet")
                wallet = wallet if isinstance(wallet, int) else user["points"]
                for row in badge_rows:
                    badge_id = row["badge_id"]
                    unlocks[badge_id] = {
                        "unlockedAt": unlocks.get(badge_id, {}).get(
                            "unlockedAt", _timestamp(row["unlocked_at"])
                        ),
                        "rewardPointsGranted": row["reward_points_granted"],
                    }
                for row in point_rows:
                    if row["reason"] not in transaction_ids:
                        transactions.append(
                            {
                                "id": row["reason"],
                                "reason": row["reason"],
                                "amount": row["amount"],
                                "createdAt": _timestamp(row["created_at"]),
                            }
                        )
                # The transaction ledger restores history. The wallet snapshot and
                # users.points already include those transactions; summing them here
                # would duplicate badge rewards on the next state save.
                data["badgeUnlocks"] = unlocks
                data["transactions"] = transactions
                data["wallet"] = wallet
                data["pointsBalance"] = wallet
                database_badges = {row["badge_id"] for row in badge_rows}
                data["pendingBadgeClaims"] = [
                    badge_id
                    for badge_id in (data.get("pendingBadgeClaims") or [])
                    if badge_id not in database_badges
                ]
                serialized_state = json.dumps(
                    data, separators=(",", ":"), ensure_ascii=False
                )
                if len(serialized_state.encode("utf-8")) > 1_000_000:
                    raise HTTPException(
                        status_code=413, detail="App state is too large"
                    )
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
                cursor.execute(
                    "UPDATE users SET points = %s WHERE id = %s",
                    (wallet, user_id),
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    return {"status": "saved"}


def _challenge_response(row: dict) -> ChallengeResponse:
    def load_json(name: str):
        value = row.get(name)
        if isinstance(value, (str, bytes, bytearray)):
            try:
                return json.loads(value)
            except (ValueError, TypeError):
                return None
        return value

    resolved_at = row.get("resolved_at")
    return ChallengeResponse(
        id=row["id"],
        user_id=row["user_id"],
        user_name=row["user_name"],
        user_handle=row["user_handle"],
        title=row["title"],
        category=row["category"],
        difficulty=row["difficulty"],
        confidence=row["confidence"],
        visibility=row["visibility"],
        deadline_at=row["deadline_at"].isoformat(),
        deadline_label=row["deadline_label"],
        probability=float(row["probability"]),
        yes_odds=float(row["yes_odds"]),
        no_odds=float(row["no_odds"]),
        analysis=load_json("analysis_json"),
        proof_plan=load_json("proof_plan_json"),
        user_input=load_json("user_input_json"),
        prediction_source=row.get("prediction_source") or "fallback",
        prediction_model_version=row.get("prediction_model_version"),
        prediction_meta=load_json("prediction_meta_json"),
        result=row.get("result"),
        resolved_at=_timestamp(resolved_at) if resolved_at else None,
        created_at=row["created_at"].isoformat(),
    )


@app.post(
    "/users/{user_id}/challenges",
    response_model=ChallengeResponse,
    status_code=201,
)
def create_challenge(
    user_id: str, request: ChallengeCreateRequest
) -> ChallengeResponse:
    challenge_id = str(uuid.uuid4())
    try:
        deadline_at = request.deadline_at.replace("Z", "+00:00")
        from datetime import datetime, timezone

        parsed_deadline = datetime.fromisoformat(deadline_at)
        if parsed_deadline.tzinfo is None:
            parsed_deadline = parsed_deadline.replace(tzinfo=timezone.utc)
        prediction_deadline = parsed_deadline
        parsed_deadline = parsed_deadline.astimezone(timezone.utc).replace(
            tzinfo=None
        )
    except ValueError as error:
        raise HTTPException(
            status_code=422, detail="deadline_at must be an ISO datetime"
        ) from error
    features = build_prediction_features(
        request.title,
        request.category,
        request.difficulty,
        request.confidence,
        prediction_deadline,
        request.analysis,
        request.user_input,
    )
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            analysis_data = _state_data(
                (request.analysis or {}).get("data")
            ) or (request.analysis or {})
            analysis_actions = analysis_data.get("actions") or []
            primary_action = (
                analysis_actions[0]
                if analysis_actions and isinstance(analysis_actions[0], dict)
                else {}
            )
            history = build_history(
                cursor,
                user_id,
                features["category"],
                primary_action.get("subcategory"),
                features["goal_type"],
                features.get("goal_unit"),
            )
    prediction = request_prediction(features, history)
    probability = round(float(prediction["success_probability"]) * 100, 2)
    prediction_meta = {
        "breakdown": prediction.get("breakdown", {}),
        "ml_request": prediction.get(
            "request", {**features, "history": history}
        ),
        "difficulty_used": prediction.get(
            "difficulty_used", request.difficulty
        ),
        "category": prediction.get("category", features["category"]),
        "goal_type": prediction.get("goal_type", features["goal_type"]),
    }
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                """INSERT INTO challenges
                (id, user_id, title, category, difficulty, confidence, visibility,
                 deadline_at, deadline_label, probability, yes_odds, no_odds,
                 analysis_json, proof_plan_json, user_input_json, prediction_source,
                 prediction_model_version, prediction_meta_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    challenge_id,
                    user_id,
                    request.title.strip(),
                    request.category,
                    request.difficulty,
                    request.confidence,
                    request.visibility,
                    parsed_deadline,
                    request.deadline_label,
                    probability,
                    prediction["yes_odds"],
                    prediction["no_odds"],
                    (
                        json.dumps(request.analysis, ensure_ascii=False)
                        if request.analysis is not None
                        else None
                    ),
                    (
                        json.dumps(request.proof_plan, ensure_ascii=False)
                        if request.proof_plan is not None
                        else None
                    ),
                    json.dumps(request.user_input or {}, ensure_ascii=False),
                    prediction["prediction_source"],
                    prediction.get("model_version"),
                    json.dumps(prediction_meta, ensure_ascii=False),
                ),
            )
            cursor.execute(
                """SELECT c.*, COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS user_name,
                u.username AS user_handle
                FROM challenges c JOIN users u ON u.id = c.user_id WHERE c.id = %s""",
                (challenge_id,),
            )
            return _challenge_response(cursor.fetchone())


@app.get("/users/{user_id}/challenges", response_model=list[ChallengeResponse])
def list_challenges(
    user_id: str, viewer_id: str | None = None, limit: int = 50, offset: int = 0
) -> list[ChallengeResponse]:
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            can_view_private = viewer_id == user_id
            if viewer_id and viewer_id != user_id:
                cursor.execute(
                    "SELECT 1 FROM user_follows WHERE follower_id = %s AND followed_id = %s",
                    (viewer_id, user_id),
                )
                can_view_private = cursor.fetchone() is not None
            cursor.execute(
                """SELECT c.*, COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS user_name,
                u.username AS user_handle
                FROM challenges c JOIN users u ON u.id = c.user_id
                WHERE c.user_id = %s AND (%s = 1 OR c.visibility = 'public')
                ORDER BY c.created_at DESC LIMIT %s OFFSET %s""",
                (user_id, int(can_view_private), limit, offset),
            )
            return [_challenge_response(row) for row in cursor.fetchall()]


@app.get("/challenges", response_model=list[ChallengeResponse])
def list_public_challenges(
    viewer_id: str | None = None, limit: int = 50, offset: int = 0
) -> list[ChallengeResponse]:
    """Return public challenges, plus posts shared with the signed-in viewer."""
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            if viewer_id:
                cursor.execute(
                    "SELECT id FROM users WHERE id = %s", (viewer_id,)
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404, detail="User not found"
                    )
            cursor.execute(
                """SELECT c.*, COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS user_name,
                u.username AS user_handle
                FROM challenges c JOIN users u ON u.id = c.user_id
                WHERE c.visibility = 'public'
                   OR (%s IS NOT NULL AND c.user_id = %s)
                   OR (%s IS NOT NULL AND c.visibility = 'friends' AND EXISTS (
                       SELECT 1 FROM user_follows f
                       WHERE f.follower_id = %s AND f.followed_id = c.user_id
                   ))
                ORDER BY c.created_at DESC LIMIT %s OFFSET %s""",
                (viewer_id, viewer_id, viewer_id, viewer_id, limit, offset),
            )
            return [_challenge_response(row) for row in cursor.fetchall()]


@app.post("/users/{user_id}/challenges/{challenge_id}/result")
def record_challenge_result(
    user_id: str, challenge_id: str, request: ChallengeResultRequest
) -> dict[str, object]:
    """Record the verified outcome once so later predictions learn from it."""
    from datetime import datetime, timezone

    with get_connection() as connection:
        try:
            connection.begin()
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM challenges WHERE id = %s AND user_id = %s FOR UPDATE",
                    (challenge_id, user_id),
                )
                challenge = cursor.fetchone()
                if challenge is None:
                    raise HTTPException(
                        status_code=404, detail="Challenge not found"
                    )
                if (
                    challenge.get("result")
                    and challenge["result"] != request.result
                ):
                    raise HTTPException(
                        status_code=409,
                        detail="Challenge already has a different result",
                    )
                created = challenge.get("result") is None
                resolved_at = challenge.get("resolved_at") or datetime.now(
                    timezone.utc
                ).replace(tzinfo=None)
                if created:
                    cursor.execute(
                        "UPDATE challenges SET result = %s, resolved_at = %s WHERE id = %s",
                        (request.result, resolved_at, challenge_id),
                    )
                metadata = _state_data(challenge.get("prediction_meta_json"))
                features = _state_data(metadata.get("ml_request"))
                analysis = _state_data(challenge.get("analysis_json"))
                data = _state_data(analysis.get("data")) or analysis
                actions = data.get("actions") or []
                action = (
                    actions[0]
                    if actions and isinstance(actions[0], dict)
                    else {}
                )
                history_features = features or {
                    "category": "other",
                    "goal_type": "task",
                    "goal_value": None,
                    "goal_unit": None,
                    "target_hour": None,
                    "day_of_week": None,
                }
                observation_id = hashlib.sha256(
                    f"app:{user_id}:{challenge_id}".encode("utf-8")
                ).hexdigest()
                cursor.execute(
                    """INSERT IGNORE INTO ml_observations
                    (id, source, user_id, challenge_id, occurred_at, app_category,
                     category, subcategory, goal, goal_unit, goal_type, target_hour,
                     day_of_week, success)
                    VALUES (%s, 'app', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (
                        observation_id,
                        user_id,
                        challenge_id,
                        resolved_at,
                        challenge["category"],
                        history_features.get("category", "other"),
                        action.get("subcategory"),
                        history_features.get("goal_value"),
                        history_features.get("goal_unit"),
                        history_features.get("goal_type"),
                        (
                            int(history_features["target_hour"])
                            if history_features.get("target_hour") is not None
                            else None
                        ),
                        history_features.get("day_of_week"),
                        1 if request.result == "success" else 0,
                    ),
                )
                connection.commit()
                return {
                    "status": "recorded",
                    "result": request.result,
                    "created": created,
                }
        except Exception:
            connection.rollback()
            raise


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
    return {
        "badges": [
            {**row, "unlocked_at": _timestamp(row["unlocked_at"])}
            for row in rows
        ]
    }


@app.post(
    "/users/{user_id}/badges/{badge_id}/claim",
    response_model=BadgeClaimResponse,
)
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
                cursor.execute(
                    "SELECT id, points FROM users WHERE id = %s FOR UPDATE",
                    (user_id,),
                )
                user = cursor.fetchone()
                if user is None:
                    raise HTTPException(
                        status_code=404, detail="User not found"
                    )
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
                cursor.execute(
                    "SELECT state_json FROM user_app_states WHERE user_id = %s FOR UPDATE",
                    (user_id,),
                )
                saved = cursor.fetchone()
                data = _state_data(saved["state_json"]) if saved else {}
                wallet = max(
                    int(user["points"] or 0), int(data.get("wallet", 0) or 0)
                )
                if reward_granted:
                    wallet += reward
                    cursor.execute(
                        "UPDATE users SET points = %s WHERE id = %s",
                        (wallet, user_id),
                    )
                unlocks = dict(data.get("badgeUnlocks") or {})
                unlocks[badge_id] = {
                    "unlockedAt": _timestamp(badge["unlocked_at"]),
                    "rewardPointsGranted": badge["reward_points_granted"],
                }
                data["badgeUnlocks"] = unlocks
                transactions = list(data.get("transactions") or [])
                if reward_granted and not any(
                    isinstance(item, dict) and item.get("id") == reason
                    for item in transactions
                ):
                    transactions.append(
                        {
                            "id": reason,
                            "reason": reason,
                            "amount": reward,
                            "createdAt": _timestamp(badge["unlocked_at"]),
                        }
                    )
                data["transactions"] = transactions
                data["wallet"] = wallet
                data["pointsBalance"] = wallet
                data["pendingBadgeClaims"] = [
                    item
                    for item in (data.get("pendingBadgeClaims") or [])
                    if item != badge_id
                ]
                if saved:
                    cursor.execute(
                        "UPDATE user_app_states SET state_json = %s WHERE user_id = %s",
                        (
                            json.dumps(
                                data, separators=(",", ":"), ensure_ascii=False
                            ),
                            user_id,
                        ),
                    )
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


@app.get("/users/{user_id}/leaderboard", response_model=list[LeaderboardEntry])
def get_leaderboard(user_id: str) -> list[LeaderboardEntry]:
    """Rank the signed-in user and followed users using persisted account data."""
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                "SELECT followed_id FROM user_follows WHERE follower_id = %s",
                (user_id,),
            )
            member_ids = [user_id, *(row["followed_id"] for row in cursor.fetchall())]
            placeholders = ",".join(["%s"] * len(member_ids))
            cursor.execute(
                f"""SELECT u.id, u.username, u.display_name, u.nickname, u.avatar,
                    u.points, s.state_json
                    FROM users u LEFT JOIN user_app_states s ON s.user_id = u.id
                    WHERE u.id IN ({placeholders})""",
                member_ids,
            )
            rows = cursor.fetchall()

    entries: list[LeaderboardEntry] = []
    for row in rows:
        state = _state_data(row.get("state_json"))
        predictions = state.get("stakedPredictions") or {}
        if isinstance(predictions, dict):
            predictions = predictions.values()
        settled = [
            item for item in predictions
            if isinstance(item, dict) and item.get("status") in {"won", "lost"}
        ]
        wins = sum(item.get("status") == "won" for item in settled)
        accuracy = round(wins * 100 / len(settled)) if settled else 0

        successful_days: set[str] = set()
        for challenge in state.get("challenges") or []:
            if not isinstance(challenge, dict) or challenge.get("result") != "success":
                continue
            resolved_at = challenge.get("resolvedAt")
            if not resolved_at:
                continue
            try:
                resolved = datetime.fromisoformat(str(resolved_at).replace("Z", "+00:00"))
                if resolved.tzinfo is None:
                    resolved = resolved.replace(tzinfo=timezone.utc)
                successful_days.add(resolved.astimezone(timezone.utc).date().isoformat())
            except ValueError:
                continue
        streak = 0
        day = datetime.now(timezone.utc).date()
        if day.isoformat() not in successful_days:
            day -= timedelta(days=1)
        while day.isoformat() in successful_days:
            streak += 1
            day -= timedelta(days=1)

        entries.append(LeaderboardEntry(
            id=row["id"], username=row["username"], display_name=row["display_name"],
            nickname=row.get("nickname"), avatar=row.get("avatar") or "",
            points=int(row.get("points") or 0), accuracy=accuracy, streak=streak,
        ))
    return sorted(entries, key=lambda entry: (-entry.points, entry.username.casefold()))


@app.get("/users/search", response_model=list[UserSummary])
def search_users(q: str = "", viewer_id: str | None = None, limit: int = 20) -> list[UserSummary]:
    query = q.strip()
    if not query:
        return []
    safe_limit = max(1, min(limit, 50))
    pattern = f"%{query}%"
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """SELECT id, username, nickname, display_name, avatar
                FROM users
                WHERE (id LIKE %s OR username LIKE %s OR nickname LIKE %s OR display_name LIKE %s)
                  AND (%s IS NULL OR id <> %s)
                ORDER BY CASE WHEN id = %s OR username = %s THEN 0 ELSE 1 END,
                         COALESCE(NULLIF(nickname, ''), NULLIF(display_name, ''), username)
                LIMIT %s""",
                (pattern, pattern, pattern, pattern, viewer_id, viewer_id, query, query, safe_limit),
            )
            return [UserSummary(**row) for row in cursor.fetchall()]


@app.get("/users/{user_id}/following/details", response_model=list[UserSummary])
def get_following_details(user_id: str) -> list[UserSummary]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                """SELECT u.id, u.username, u.nickname, u.display_name, u.avatar
                FROM user_follows f JOIN users u ON u.id = f.followed_id
                WHERE f.follower_id = %s ORDER BY f.created_at DESC""",
                (user_id,),
            )
            return [UserSummary(**row) for row in cursor.fetchall()]


@app.put("/users/{user_id}/following/{followed_id}", status_code=204)
def follow_user(user_id: str, followed_id: str) -> None:
    if user_id == followed_id:
        raise HTTPException(
            status_code=400, detail="You cannot follow yourself"
        )
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
                """DELETE FROM user_follows
                WHERE (follower_id = %s AND followed_id = %s)
                   OR (follower_id = %s AND followed_id = %s)""",
                (user_id, followed_id, followed_id, user_id),
            )


def _friend_request(row: dict) -> FriendRequestResponse:
    return FriendRequestResponse(**{**row, "created_at": _timestamp(row["created_at"])})


@app.post("/users/{user_id}/friend-requests/{recipient_id}", response_model=FriendRequestResponse, status_code=201)
def send_friend_request(user_id: str, recipient_id: str) -> FriendRequestResponse:
    if user_id == recipient_id:
        raise HTTPException(status_code=400, detail="You cannot send a request to yourself")
    request_id = str(uuid.uuid4())
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id IN (%s, %s)", (user_id, recipient_id))
            if len(cursor.fetchall()) != 2:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute("SELECT 1 FROM user_follows WHERE follower_id = %s AND followed_id = %s", (user_id, recipient_id))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="You are already friends")
            cursor.execute("SELECT id FROM friend_requests WHERE requester_id = %s AND recipient_id = %s AND status = 'pending'", (user_id, recipient_id))
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="Friend request already sent")
            cursor.execute("INSERT INTO friend_requests (id, requester_id, recipient_id) VALUES (%s, %s, %s)", (request_id, user_id, recipient_id))
            cursor.execute("""SELECT r.id, r.requester_id,
                COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS requester_name,
                u.username AS requester_username, r.status, r.created_at
                FROM friend_requests r JOIN users u ON u.id = r.requester_id WHERE r.id = %s""", (request_id,))
            return _friend_request(cursor.fetchone())


@app.get("/users/{user_id}/friend-requests", response_model=list[FriendRequestResponse])
def get_friend_requests(user_id: str) -> list[FriendRequestResponse]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute("""SELECT r.id, r.requester_id,
                COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS requester_name,
                u.username AS requester_username, r.status, r.created_at
                FROM friend_requests r JOIN users u ON u.id = r.requester_id
                WHERE r.recipient_id = %s AND r.status = 'pending' ORDER BY r.created_at DESC""", (user_id,))
            return [_friend_request(row) for row in cursor.fetchall()]


@app.get("/users/{user_id}/friend-requests/sent", response_model=list[SentFriendRequestResponse])
def get_sent_friend_requests(user_id: str) -> list[SentFriendRequestResponse]:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
            cursor.execute(
                """SELECT r.id, r.recipient_id,
                    COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS recipient_name,
                    u.username AS recipient_username, r.status, r.created_at
                    FROM friend_requests r JOIN users u ON u.id = r.recipient_id
                    WHERE r.requester_id = %s AND r.status = 'pending'
                    ORDER BY r.created_at DESC""",
                (user_id,),
            )
            rows = cursor.fetchall()
    return [
        SentFriendRequestResponse(**{**row, "created_at": _timestamp(row["created_at"])})
        for row in rows
    ]


@app.patch("/users/{user_id}/friend-requests/{request_id}", response_model=FriendRequestResponse)
def respond_to_friend_request(user_id: str, request_id: str, request: FriendRequestDecision) -> FriendRequestResponse:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, requester_id, recipient_id, status FROM friend_requests WHERE id = %s AND recipient_id = %s", (request_id, user_id))
            existing = cursor.fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Friend request not found")
            if existing["status"] != "pending":
                raise HTTPException(status_code=409, detail="Friend request already handled")
            status = "accepted" if request.decision == "accept" else "declined"
            cursor.execute("UPDATE friend_requests SET status = %s, responded_at = CURRENT_TIMESTAMP WHERE id = %s", (status, request_id))
            if status == "accepted":
                cursor.execute("INSERT IGNORE INTO user_follows (follower_id, followed_id) VALUES (%s, %s), (%s, %s)", (existing["requester_id"], user_id, user_id, existing["requester_id"]))
            cursor.execute("""SELECT r.id, r.requester_id,
                COALESCE(NULLIF(u.nickname, ''), NULLIF(u.display_name, ''), u.username) AS requester_name,
                u.username AS requester_username, r.status, r.created_at
                FROM friend_requests r JOIN users u ON u.id = r.requester_id WHERE r.id = %s""", (request_id,))
            return _friend_request(cursor.fetchone())


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
        raise HTTPException(
            status_code=503, detail="Translation service unavailable"
        ) from error


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
        raise HTTPException(
            status_code=503, detail="Proof planner unavailable"
        ) from error
