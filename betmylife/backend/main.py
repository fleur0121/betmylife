import os
import json
import hashlib
import hmac
import json
import secrets
import uuid
from typing import Literal

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
    analysis: dict | None = None
    proof_plan: dict | None = None


class ChallengeResponse(ChallengeCreateRequest):
    id: str
    user_id: str
    created_at: str


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
    serialized_state = json.dumps(request.data, separators=(",", ":"), ensure_ascii=False)
    if len(serialized_state.encode("utf-8")) > 1_000_000:
        raise HTTPException(status_code=413, detail="App state is too large")
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            if cursor.fetchone() is None:
                raise HTTPException(status_code=404, detail="User not found")
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
    return {"status": "saved"}


def _challenge_response(row: dict) -> ChallengeResponse:
    return ChallengeResponse(
        id=row["id"], user_id=row["user_id"], title=row["title"],
        category=row["category"], difficulty=row["difficulty"], confidence=row["confidence"],
        visibility=row["visibility"], deadline_at=row["deadline_at"].isoformat(),
        deadline_label=row["deadline_label"], probability=float(row["probability"]),
        yes_odds=float(row["yes_odds"]), no_odds=float(row["no_odds"]),
        analysis=json.loads(row["analysis_json"]) if isinstance(row["analysis_json"], str) else row["analysis_json"],
        proof_plan=json.loads(row["proof_plan_json"]) if isinstance(row["proof_plan_json"], str) else row["proof_plan_json"],
        created_at=row["created_at"].isoformat(),
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
            cursor.execute(
                """INSERT INTO challenges
                (id, user_id, title, category, difficulty, confidence, visibility,
                 deadline_at, deadline_label, probability, yes_odds, no_odds,
                 analysis_json, proof_plan_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (challenge_id, user_id, request.title.strip(), request.category, request.difficulty,
                 request.confidence, request.visibility, parsed_deadline, request.deadline_label,
                 request.probability, request.yes_odds, request.no_odds,
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
