"""Translate challenge NLP + TiDB outcomes into one ML serving request."""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

logger = logging.getLogger(__name__)

MODEL_CATEGORIES = {"steps", "exercise", "sleep", "wake_up", "study", "cook"}
CATEGORY_MAP = {
    "sleep": "sleep", "bedtime": "sleep", "sleep_onset": "sleep", "nap": "sleep",
    "wake_up": "wake_up", "get_out_of_bed": "wake_up",
    "exercise": "exercise", "running": "exercise", "strength_training": "exercise",
    "stretching": "exercise", "walking": "exercise", "steps": "steps",
    "learning": "study", "language_learning": "study", "exam_preparation": "study",
    "programming": "study",
    "cooking": "cook", "meal_prep": "cook",
}


def _json(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        import json
        try:
            loaded = json.loads(value)
            return loaded if isinstance(loaded, dict) else {}
        except (ValueError, TypeError):
            return {}
    return {}


def _record(attempts: int = 0, successes: int = 0) -> dict[str, int]:
    return {"attempts": int(attempts or 0), "successes": int(successes or 0)}


def build_history(cursor, user_id: str, category: str, subcategory: str | None, goal_type: str, goal_unit: str | None) -> dict:
    """Aggregate real completed app challenges and imported Fitbit/ATUS rows."""
    cursor.execute(
        "SELECT COUNT(*) AS attempts, COALESCE(SUM(success), 0) AS successes "
        "FROM ml_observations WHERE source = 'app' AND user_id = %s", (user_id,),
    )
    overall = cursor.fetchone() or {}
    cursor.execute(
        "SELECT COUNT(*) AS attempts, COALESCE(SUM(success), 0) AS successes "
        "FROM ml_observations WHERE source = 'app' AND user_id = %s AND category = %s",
        (user_id, category),
    )
    user_category = cursor.fetchone() or {}
    cursor.execute(
        "SELECT COUNT(*) AS attempts, COALESCE(SUM(success), 0) AS successes, "
        "AVG(CASE WHEN goal IS NOT NULL AND (%s IS NULL OR goal_unit = %s) THEN goal END) AS usual_value "
        "FROM ml_observations WHERE source = 'app' AND user_id = %s AND category = %s "
        "AND (%s IS NULL OR subcategory = %s) AND (goal_type = %s OR goal_type IS NULL)",
        (goal_unit, goal_unit, user_id, category, subcategory, subcategory, goal_type),
    )
    user_subgoal = cursor.fetchone() or {}
    cursor.execute(
        "SELECT COUNT(*) AS attempts, COALESCE(SUM(success), 0) AS successes "
        "FROM ml_observations WHERE source IN ('fitbit', 'atus') AND category = %s",
        (category,),
    )
    community_category = cursor.fetchone() or {}
    cursor.execute(
        "SELECT COUNT(*) AS attempts, COALESCE(SUM(success), 0) AS successes "
        "FROM ml_observations WHERE source IN ('fitbit', 'atus') AND category = %s "
        "AND (goal_type = %s OR goal_type IS NULL)", (category, goal_type),
    )
    community_subgoal = cursor.fetchone() or {}
    cursor.execute(
        "SELECT success FROM ml_observations WHERE source = 'app' AND user_id = %s "
        "AND category = %s ORDER BY occurred_at DESC LIMIT 100", (user_id, category),
    )
    streak = 0
    for row in cursor.fetchall():
        if not int(row["success"]):
            break
        streak += 1
    usual = user_subgoal.get("usual_value")
    return {
        "user_overall": _record(overall.get("attempts"), overall.get("successes")),
        "user_category": _record(user_category.get("attempts"), user_category.get("successes")),
        "user_subgoal": _record(user_subgoal.get("attempts"), user_subgoal.get("successes")),
        "community_category": _record(community_category.get("attempts"), community_category.get("successes")),
        "community_subgoal": _record(community_subgoal.get("attempts"), community_subgoal.get("successes")),
        "current_streak": streak,
        "usual_value": float(usual) if usual is not None else None,
    }


def _clock_hour(value: str | None) -> float | None:
    if not value:
        return None
    try:
        hour, minute = value.split(":")[:2]
        return int(hour) + int(minute) / 60
    except (ValueError, TypeError):
        return None


def _day_of_week(time_data: dict, context: dict, target_hour: float | None,
                 deadline_at: datetime | None = None) -> int | None:
    weekday = str(time_data.get("weekday") or "").lower()
    weekday_names = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    if weekday:
        for day, name in enumerate(weekday_names):
            if weekday.startswith(name[:3]):
                return day
    resolved = time_data.get("resolved_at") or time_data.get("date")
    if resolved:
        try:
            return datetime.fromisoformat(str(resolved).replace("Z", "+00:00")).weekday()
        except ValueError:
            pass
    if deadline_at is not None:
        zone = context.get("timezone")
        value = deadline_at if deadline_at.tzinfo else deadline_at.replace(tzinfo=timezone.utc)
        if zone:
            try:
                value = value.astimezone(ZoneInfo(zone))
            except (ValueError, KeyError):
                pass
        return value.weekday()
    submitted = context.get("submitted_at")
    if not submitted:
        return None
    try:
        now = datetime.fromisoformat(str(submitted).replace("Z", "+00:00"))
        zone = context.get("timezone")
        if zone:
            now = now.astimezone(ZoneInfo(zone))
        offset = time_data.get("day_offset")
        if offset is not None:
            return (now + timedelta(days=int(offset))).weekday()
        if target_hour is not None and target_hour <= now.hour + now.minute / 60:
            return (now + timedelta(days=1)).weekday()
        return now.weekday()
    except (ValueError, KeyError, TypeError):
        return None


def build_prediction_features(title: str, ui_category: str, difficulty: int, confidence: int,
                              deadline_at: datetime, analysis: dict | None, user_input: dict | None) -> dict:
    """Prefer specific NLP action/measurement; title and app category are safe fallbacks."""
    root = _json(analysis)
    data = _json(root.get("data")) or root
    context = _json(data.get("context"))
    actions = data.get("actions") or []
    action = actions[0] if actions and isinstance(actions[0], dict) else {}
    raw_subcategory = str(action.get("subcategory") or "").strip().lower().replace(" ", "_")
    raw_parent_category = str(action.get("category") or "").strip().lower().replace(" ", "_")
    raw_cat = raw_subcategory or raw_parent_category
    category = (
        CATEGORY_MAP.get(raw_subcategory)
        or CATEGORY_MAP.get(raw_parent_category)
        or raw_cat
    )
    if not category:
        text = title.lower()
        if re.search(r"\bsteps?\b|\bwalk(?:ing)?\b", text):
            category = "steps"
        elif re.search(r"\b(?:run|running|gym|workout|exercise)\b", text):
            category = "exercise"
        elif re.search(r"\b(?:wake|wakeup|get up)\b", text):
            category = "wake_up"
        elif re.search(r"\b(?:sleep|bedtime|go to bed)\b", text):
            category = "sleep"
        elif re.search(r"\b(?:study|studying|learn|homework)\b", text):
            category = "study"
        elif re.search(r"\bcook(?:ing)?\b", text):
            category = "cook"
        else:
            category = {
                "study": "study",
                "fitness": "exercise",
                "lifestyle": "other",
            }.get(ui_category.strip().lower(), "other")
    measurements = action.get("measurements") or []
    measurement = next((m for m in measurements if isinstance(m, dict) and m.get("value") is not None), {})
    metric = measurement.get("metric")
    unit = (measurement.get("unit") or "").strip().lower() or None
    value = float(measurement["value"]) if measurement.get("value") is not None else None
    activity = {"walking": "walk", "running": "run"}.get(
        raw_subcategory, str(action.get("subcategory") or action.get("action") or "").strip().lower() or None
    )
    if metric == "count" and (unit in {"step", "steps"} or "step" in raw_cat):
        category = "steps"
        unit = "steps"
    elif category == "exercise" and raw_cat in {"walking", "walk"} and unit == "steps":
        category = "steps"
    category = category or "other"
    is_new = category not in MODEL_CATEGORIES
    times = action.get("times") or []
    time_data = next((t for t in times if isinstance(t, dict) and t.get("clock_time")), {})
    hour = _clock_hour(time_data.get("clock_time"))
    explicit_hour = hour is not None
    if hour is None:
        local_deadline = deadline_at
        zone = context.get("timezone")
        if local_deadline.tzinfo is None:
            local_deadline = local_deadline.replace(tzinfo=timezone.utc)
        if zone:
            try:
                local_deadline = local_deadline.astimezone(ZoneInfo(zone))
            except (ValueError, KeyError):
                pass
        hour = local_deadline.hour + local_deadline.minute / 60
    explicit_goal_type = (user_input or {}).get("goal_type")
    time_kind = time_data.get("kind")
    if explicit_goal_type in {"amount", "deadline", "start_time", "task"}:
        goal_type = explicit_goal_type
    elif category == "wake_up" or (category == "sleep" and value is None and explicit_hour):
        goal_type = "deadline"
    elif value is not None:
        goal_type = "deadline" if time_kind == "deadline" and category == "steps" else "amount"
    elif time_kind == "event":
        goal_type = "start_time"
    elif time_kind:
        goal_type = "deadline"
    else:
        goal_type = "task"
    # The app's confidence slider is explicit and should override any natural
    # language guess in `user_reported`.
    confidence_value = max(0, min(100, int(confidence))) / 100
    if isinstance(user_input, dict) and user_input.get("activity"):
        activity = str(user_input["activity"])
    result = {
        "category": category, "is_new_category": is_new, "goal_type": goal_type,
        "goal_value": value, "goal_unit": unit, "activity": activity,
        "target_hour": hour, "day_of_week": _day_of_week(time_data, context, hour, deadline_at),
        "difficulty": max(1, min(5, int(difficulty))), "user_confidence": confidence_value,
    }
    return result


def request_prediction(features: dict, history: dict) -> dict:
    """Call the one rich ML serving API; return an explicit neutral fallback on failure."""
    url = os.getenv("ML_API_URL") or os.getenv("ODDS_API_URL") or ""
    if url and not url.rstrip("/").endswith("/predict"):
        url = url.rstrip("/") + "/predict"
    if not url:
        logger.warning("ML prediction fallback: ML_API_URL is not configured")
        return {**fallback_prediction("not_configured", features.get("difficulty", 3)),
                "request": {**features, "history": history}}
    try:
        response = httpx.post(url, json={**features, "history": history}, timeout=2.5)
        response.raise_for_status()
        data = response.json()
        probability = float(data["success_probability"])
        if not (0 < probability < 1):
            raise ValueError("ML API returned an invalid success probability")
        # Legacy odds are accepted for compatibility with the current ML
        # service, but the sportsbook pricing engine never uses them.
        yes_odds = float(data.get("yes_odds", 1 / probability))
        no_odds = float(data.get("no_odds", 1 / (1 - probability)))
        if yes_odds <= 0 or no_odds <= 0:
            raise ValueError("ML API returned invalid legacy odds")
        return {"success_probability": probability, "yes_odds": yes_odds, "no_odds": no_odds,
                "prediction_source": data.get("prediction_source", "trained"),
                "model_version": data.get("model_version", "unknown"),
                "difficulty_used": data.get("difficulty_used", features["difficulty"]),
                "breakdown": data.get("breakdown", {}), "category": data.get("category", features["category"]),
                "goal_type": data.get("goal_type", features["goal_type"]),
                "request": {**features, "history": history}}
    except Exception as error:
        logger.warning("ML prediction fallback after %s: %s", type(error).__name__, error)
        return {**fallback_prediction(type(error).__name__, features.get("difficulty", 3)),
                "request": {**features, "history": history}}


def fallback_prediction(reason: str, difficulty: int = 3) -> dict:
    return {"success_probability": 0.5, "yes_odds": 2.0, "no_odds": 2.0,
            "prediction_source": "fallback", "model_version": "fallback-v1",
            "difficulty_used": difficulty, "breakdown": {"starting_rate": 0.5,
            "starting_from": "neutral fallback", "adjustment_today": 0.0,
            "adjustment_confidence": 0.0, "fallback_reason": reason}}
