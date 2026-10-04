"""
nlp_adapter.py
Converts the challenge-NLP service output (the LLM, schema_version 1.0) into
/predict requests.

NLP output (per action):
    category / subcategory   e.g. "sleep" / "wake_up"
    measurements             e.g. [{"value": 5, "unit": "km"}]
    times                    e.g. [{"kind": "deadline", "clock_time": "08:00", "weekday": ...}]
    user_reported            difficulty, confidence_percent

Mapping rules live in the tables below, so they're easy to adjust when the
NLP service adds new labels.
"""

from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

KNOWN = {"steps", "exercise", "sleep", "wake_up", "study", "cook"}

# NLP labels (category or subcategory) -> our category.
# Subcategory is checked first, then category.
LABEL_TO_CATEGORY = {
    # wake-up
    "wake_up": "wake_up", "wakeup": "wake_up", "wake": "wake_up", "get_up": "wake_up",
    # sleep / bedtime
    "sleep": "sleep", "bedtime": "sleep", "go_to_bed": "sleep", "bed": "sleep",
    "sleep_time": "sleep", "nap": "sleep",
    # steps / walking
    "steps": "steps", "walk": "steps", "walking": "steps",
    # exercise
    "exercise": "exercise", "fitness": "exercise", "workout": "exercise", "gym": "exercise",
    "run": "exercise", "running": "exercise", "jog": "exercise", "jogging": "exercise",
    "cycling": "exercise", "bike": "exercise", "biking": "exercise", "swim": "exercise",
    "swimming": "exercise", "sports": "exercise", "sport": "exercise", "yoga": "exercise",
    # study
    "study": "study", "studying": "study", "homework": "study", "education": "study",
    "school": "study", "learning": "study", "assignment": "study", "academic": "study",
    # cook
    "cook": "cook", "cooking": "cook", "meal": "cook", "meal_prep": "cook", "food": "cook",
}
# Labels that mean "bedtime" (sleep + deadline, not sleep + amount)
BEDTIME_LABELS = {"bedtime", "go_to_bed", "bed", "sleep_time"}
# Labels that give the exercise activity for distance goals
ACTIVITY_LABELS = {"run": "run", "running": "run", "jog": "run", "jogging": "run",
                   "walk": "walk", "walking": "walk", "cycling": "bike", "bike": "bike",
                   "biking": "bike", "swim": "swim", "swimming": "swim"}

# NLP time kinds -> our goal types
TIME_KIND_TO_GOAL = {"deadline": "deadline", "by": "deadline", "before": "deadline", "end": "deadline",
                     "start": "start_time", "start_time": "start_time", "begin": "start_time",
                     "at": "start_time"}

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def _norm(label: Optional[str]) -> Optional[str]:
    if not label:
        return None
    return str(label).strip().lower().replace(" ", "_").replace("-", "_")


def _first(d: dict, *keys):
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return None


def map_category(category, subcategory, action_text):
    """Returns (category, is_new_category, is_bedtime, activity)."""
    sub, cat = _norm(subcategory), _norm(category)
    act = _norm(action_text)
    words = set((act or "").split("_"))
    activity = next((ACTIVITY_LABELS[w] for w in [sub, cat, *words] if w in ACTIVITY_LABELS), None)
    is_bedtime = sub in BEDTIME_LABELS or ("bed" in words and cat == "sleep")

    for label in (sub, cat):
        if label in LABEL_TO_CATEGORY:
            return LABEL_TO_CATEGORY[label], False, is_bedtime, activity
    # Unknown: keep the most specific label as a new category
    new = sub or cat or "other"
    return new, new not in KNOWN, is_bedtime, activity


def parse_clock(clock: Optional[str]) -> Optional[float]:
    """'08:00' -> 8.0, '23:30' -> 23.5."""
    if not clock:
        return None
    try:
        h, m = str(clock).split(":")[:2]
        return int(h) + int(m) / 60
    except ValueError:
        return None


def resolve_day(t: dict, submitted_at: Optional[str], tz: Optional[str],
                hour: Optional[float] = None, is_bedtime: bool = False) -> Optional[int]:
    """
    Day of week (0 = Monday) the challenge happens on.
    With no date given, a time that has already passed today means tomorrow
    ("wake up by 8 AM" said at 11 PM -> tomorrow). Bedtimes after midnight count
    as the same evening ("asleep by 12:30 AM" said at 11 PM -> tonight).
    """
    if t.get("weekday"):
        w = str(t["weekday"]).strip().lower()
        for i, name in enumerate(WEEKDAYS):
            if w.startswith(name[:3]):
                return i
    for key in ("resolved_at", "date"):
        if t.get(key):
            try:
                return datetime.fromisoformat(str(t[key]).replace("Z", "+00:00")).weekday()
            except ValueError:
                pass
    if submitted_at:
        try:
            now = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
            if tz:
                now = now.astimezone(ZoneInfo(tz))
            if t.get("day_offset") is not None:
                return (now + timedelta(days=int(t["day_offset"]))).weekday()
            if hour is not None:
                goal_hour = hour + 24 if (is_bedtime and hour < 12) else hour
                now_hour = now.hour + now.minute / 60
                if goal_hour <= now_hour:          # already passed today -> tomorrow
                    return (now + timedelta(days=1)).weekday()
            return now.weekday()
        except (ValueError, KeyError):
            pass
    return None


def action_to_request(action: dict, context: dict, user_reported: dict) -> dict:
    """One NLP action -> one /predict request body (without user_confidence/history)."""
    category, is_new, is_bedtime, activity = map_category(
        action.get("category"), action.get("subcategory"), action.get("action"))

    req: dict[str, Any] = {"category": category, "is_new_category": is_new}

    # Amount
    measurements = action.get("measurements") or []
    if measurements:
        m = measurements[0]
        value = _first(m, "value", "amount", "quantity", "number")
        unit = _first(m, "unit", "units")
        if value is not None:
            req["goal_value"] = float(value)
            req["goal_unit"] = unit
    if activity:
        req["activity"] = activity

    # Time
    times = action.get("times") or []
    time_kind = None
    if times:
        t = times[0]
        hour = parse_clock(t.get("clock_time"))
        if hour is not None:
            # Bedtimes after midnight stay as early hours (the API converts them);
            # other goals can't go past 23:59
            req["target_hour"] = hour
        # A time "kind" only counts if there is an actual clock time ("tomorrow" alone isn't a deadline)
        time_kind = TIME_KIND_TO_GOAL.get(_norm(t.get("kind"))) if hour is not None else None
        bedtime_like = is_bedtime or (category == "sleep" and "goal_value" not in req)
        day = resolve_day(t, context.get("submitted_at"), context.get("timezone"), hour, bedtime_like)
        if day is not None:
            req["day_of_week"] = day
    elif context.get("submitted_at"):
        day = resolve_day({}, context.get("submitted_at"), context.get("timezone"))
        if day is not None:
            req["day_of_week"] = day

    # Goal type
    if category == "wake_up":
        req["goal_type"] = "deadline"
    elif category == "sleep" and (is_bedtime or (time_kind and "goal_value" not in req)):
        req["goal_type"] = "deadline"
    elif category == "steps" and "goal_value" in req and time_kind == "deadline":
        req["goal_type"] = "deadline"            # "5,000 steps by 3 PM" (trained as steps/deadline)
    elif "goal_value" in req:
        req["goal_type"] = "amount"
    elif time_kind:
        req["goal_type"] = time_kind
    elif "target_hour" in req:
        req["goal_type"] = "deadline"
    else:
        req["goal_type"] = "task"

    # User-reported values (the app can override these)
    if user_reported.get("difficulty") is not None:
        try:
            req["difficulty"] = max(1, min(5, int(user_reported["difficulty"])))
        except (TypeError, ValueError):
            pass
    if user_reported.get("confidence_percent") is not None:
        try:
            req["user_confidence"] = max(0.0, min(1.0, float(user_reported["confidence_percent"]) / 100))
        except (TypeError, ValueError):
            pass
    return req


def nlp_to_requests(nlp: dict) -> list[dict]:
    """Full NLP output (the `data` object, or the whole response) -> list of request bodies."""
    data = nlp.get("data", nlp)
    context = data.get("context") or {}
    user_reported = data.get("user_reported") or {}
    return [action_to_request(a, context, user_reported) for a in data.get("actions") or []]
