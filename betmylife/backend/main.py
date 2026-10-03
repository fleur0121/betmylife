import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from google import genai

load_dotenv()
app = FastAPI(title="Predict My Life AI")

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
