"""
test_nlp_pipeline.py
End-to-end check: text -> NLP service -> /predict-from-nlp -> prediction.

For each test sentence it checks:
  1. CONVERSION  - did the NLP output become the right request?
                   (category, goal_type, target_hour, goal amount/unit, activity, day)
  2. CALCULATION - is the prediction internally consistent?
                   (probability in 5-95%, odds = 1/probability within the caps,
                    breakdown adds up to the probability)

Usage (both servers running):
    python test_nlp_pipeline.py --nlp-url http://172.16.194.231:8000/challenge-analyze
    python test_nlp_pipeline.py --nlp-url ... --save nlp_fixtures.json   # also save NLP outputs
    python test_nlp_pipeline.py --offline nlp_fixtures.json              # replay saved outputs, no NLP calls

If the NLP service runs on a teammate's machine, they can collect its outputs
without the ML API (the only file they need is this one, standard Python):
    python test_nlp_pipeline.py --nlp-url http://localhost:8000/challenge-analyze --collect-only nlp_fixtures.json
Then send you nlp_fixtures.json and you run it with --offline.

Options:
    --ml-url   ML API base URL (default http://localhost:8000)
    --only     run only tests whose text contains this word, e.g. --only gym
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

# Fixed "now": Saturday 2026-10-03, 9:00 PM in Vancouver (= 04:00 UTC on Oct 4).
# Fixing it makes the expected day of week predictable.
SUBMITTED_AT = "2026-10-04T04:00:00.000Z"
TIMEZONE = "America/Vancouver"
MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

# Each test: the text, and the expected request for each action (only the listed fields are checked).
# "new": True means "any new category is fine" (the label itself isn't checked).
TESTS = [
    ("I will wake up by 8am",            [{"category": "wake_up", "goal_type": "deadline", "target_hour": 8, "day": SUN}]),
    ("I will go to bed by 11pm",         [{"category": "sleep", "goal_type": "deadline", "target_hour": 23, "day": SAT}]),
    ("I'll be asleep by 12:30am",        [{"category": "sleep", "goal_type": "deadline", "target_hour": 0.5, "day": SAT}]),
    ("Sleep 8 hours tonight",            [{"category": "sleep", "goal_type": "amount", "goal_value": 8, "goal_unit": "hours"}]),
    ("Walk 10,000 steps today",          [{"category": "steps", "goal_type": "amount", "goal_value": 10000, "day": SAT}]),
    ("Walk 5000 steps by 3pm tomorrow",  [{"category": "steps", "goal_type": "deadline", "goal_value": 5000, "target_hour": 15, "day": SUN}]),
    ("Run 5 km tomorrow",                [{"category": "exercise", "goal_type": "amount", "goal_value": 5, "goal_unit": "km", "activity": "run", "day": SUN}]),
    ("Go to the gym before noon on Monday", [{"category": "exercise", "goal_type": "deadline", "target_hour": 12, "day": MON}]),
    ("Start my workout at 7am tomorrow", [{"category": "exercise", "goal_type": "start_time", "target_hour": 7, "day": SUN}]),
    ("Study 2 hours by 11pm",            [{"category": "study", "goal_type": "amount", "goal_value": 2, "goal_unit": "hours", "target_hour": 23, "day": SAT}]),
    ("Finish my homework by 10pm",       [{"category": "study", "goal_type": "deadline", "target_hour": 22, "day": SAT}]),
    ("Start studying at 4pm tomorrow",   [{"category": "study", "goal_type": "start_time", "target_hour": 16, "day": SUN}]),
    ("Finish my essay",                  [{"category": "study", "goal_type": "task"}]),
    ("Cook dinner by 7pm tomorrow",      [{"category": "cook", "goal_type": "deadline", "target_hour": 19, "day": SUN}]),
    ("Cook for 30 minutes tomorrow",     [{"category": "cook", "goal_type": "amount", "goal_value": 30, "goal_unit": "minutes"}]),
    ("Read 30 pages",                    [{"new": True, "goal_type": "amount", "goal_value": 30, "goal_unit": "pages"}]),
    ("Meditate for 10 minutes",          [{"new": True, "goal_type": "amount", "goal_value": 10, "goal_unit": "minutes"}]),
    ("Wake up at 7 and go to the gym tomorrow", [
        {"category": "wake_up", "goal_type": "deadline", "target_hour": 7, "day": SUN},
        {"category": "exercise", "day": SUN},
    ]),
]

UNIT_ALIASES = {"hours": {"h", "hr", "hrs", "hour", "hours"},
                "minutes": {"min", "mins", "minute", "minutes"},
                "km": {"km", "kms", "kilometer", "kilometers", "kilometre", "kilometres"},
                "pages": {"page", "pages"}, "steps": {"step", "steps"}}
KNOWN = {"steps", "exercise", "sleep", "wake_up", "study", "cook"}
CAPS = {"known": (1.1, 5.0), "unknown": (1.2, 3.0)}


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} from {url}: {e.read().decode()[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Can't reach {url}: {e.reason}")


def same_unit(got, want):
    g = (got or "").strip().lower()
    return g in UNIT_ALIASES.get(want, {want})


def check_conversion(req, exp):
    """Compare the converted request with what we expect. Returns a list of problems."""
    problems = []
    if exp.get("new"):
        if not req.get("is_new_category") and req.get("category") in KNOWN:
            problems.append(f"category: expected a NEW category, got '{req.get('category')}'")
    elif "category" in exp and req.get("category") != exp["category"]:
        problems.append(f"category: expected '{exp['category']}', got '{req.get('category')}'")
    for field in ("goal_type", "activity"):
        if field in exp and req.get(field) != exp[field]:
            problems.append(f"{field}: expected '{exp[field]}', got '{req.get(field)}'")
    if "target_hour" in exp and (req.get("target_hour") is None
                                 or abs(req["target_hour"] - exp["target_hour"]) > 0.01):
        problems.append(f"target_hour: expected {exp['target_hour']}, got {req.get('target_hour')}")
    if "goal_value" in exp and (req.get("goal_value") is None
                                or abs(req["goal_value"] - exp["goal_value"]) > 0.01):
        problems.append(f"goal_value: expected {exp['goal_value']}, got {req.get('goal_value')}")
    if "goal_unit" in exp and not same_unit(req.get("goal_unit"), exp["goal_unit"]):
        problems.append(f"goal_unit: expected '{exp['goal_unit']}', got '{req.get('goal_unit')}'")
    if "day" in exp and req.get("day_of_week") != exp["day"]:
        got = req.get("day_of_week")
        problems.append(f"day: expected {DAYS[exp['day']]}, got {DAYS[got] if got is not None else None}")
    return problems


def check_calculation(pred):
    """Is the prediction internally consistent? Returns a list of problems."""
    problems = []
    p = pred["success_probability"]
    if not 0.05 <= p <= 0.95:
        problems.append(f"probability {p} outside 5-95%")
    known = pred["prediction_source"] in ("trained", "trained_category")
    lo, hi = CAPS["known"] if known else CAPS["unknown"]
    if not known:   # new categories with lots of community data get the normal caps
        lo, hi = min(lo, CAPS["known"][0]), max(hi, CAPS["known"][1])
    for name, prob in (("yes_odds", p), ("no_odds", 1 - p)):
        expected = min(max(1 / prob, lo), hi)
        if not (lo - 0.01 <= pred[name] <= hi + 0.01):
            problems.append(f"{name} {pred[name]} outside caps {lo}-{hi}")
        elif abs(pred[name] - expected) > 0.06:      # allow for rounding
            problems.append(f"{name} {pred[name]} != 1/{prob:.2f} = {expected:.2f}")
    b = pred["breakdown"]
    total = b["starting_rate"] + b["adjustment_today"] + b["adjustment_confidence"]
    if abs(total - p) > 0.02 and 0.05 < p < 0.95:    # clipping can break the sum at the edges
        problems.append(f"breakdown adds to {total:.3f}, probability is {p}")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nlp-url", help="NLP endpoint, e.g. http://172.16.194.231:8000/challenge-analyze")
    ap.add_argument("--ml-url", default="http://localhost:8000")
    ap.add_argument("--save", help="save NLP outputs to this JSON file")
    ap.add_argument("--offline", help="replay NLP outputs from this JSON file instead of calling the NLP service")
    ap.add_argument("--only", help="only run tests whose text contains this")
    ap.add_argument("--collect-only", metavar="FILE",
                    help="only call the NLP service and save its outputs to FILE (no ML API needed)")
    args = ap.parse_args()
    if not args.nlp_url and not args.offline:
        ap.error("give --nlp-url (live) or --offline FILE")

    if args.collect_only:
        if not args.nlp_url:
            ap.error("--collect-only needs --nlp-url")
        outputs = {}
        for text, _ in TESTS:
            try:
                outputs[text] = post(args.nlp_url, {"text": text, "submitted_at": SUBMITTED_AT,
                                                    "timezone": TIMEZONE})
                print(f"ok    {text}")
            except RuntimeError as e:
                print(f"ERROR {text}: {e}")
        with open(args.collect_only, "w", encoding="utf-8") as f:
            json.dump(outputs, f, indent=2, ensure_ascii=False)
        print(f"\nSaved {len(outputs)} NLP outputs -> {args.collect_only}")
        return

    saved = json.load(open(args.offline, encoding="utf-8")) if args.offline else {}
    to_save = {}
    tests = [t for t in TESTS if not args.only or args.only.lower() in t[0].lower()]
    passed = failed = 0

    print(f"'Now' for all tests: Saturday 9:00 PM ({TIMEZONE})\n")
    for text, expected in tests:
        print(f"── \"{text}\"")
        try:
            if args.offline:
                if text not in saved:
                    print("   SKIP: not in the offline file\n")
                    continue
                nlp = saved[text]
            else:
                nlp = post(args.nlp_url, {"text": text, "submitted_at": SUBMITTED_AT, "timezone": TIMEZONE})
                to_save[text] = nlp
            results = post(f"{args.ml_url}/predict-from-nlp", {"nlp": nlp, "user_confidence": 0.6})
        except RuntimeError as e:
            print(f"   ERROR: {e}\n")
            failed += 1
            continue

        problems = []
        if len(results) != len(expected):
            problems.append(f"expected {len(expected)} action(s), NLP gave {len(results)}")
        for i, (res, exp) in enumerate(zip(results, expected)):
            req, pred = res["request"], res["prediction"]
            conv = check_conversion(req, exp)
            calc = check_calculation(pred)
            day = DAYS[req["day_of_week"]] if req.get("day_of_week") is not None else "-"
            amount = f"{req.get('goal_value'):g} {req.get('goal_unit') or ''}".strip() if req.get("goal_value") is not None else "-"
            print(f"   action {i + 1}: {req['category']}/{req['goal_type']}  hour={req.get('target_hour', '-')}  "
                  f"amount={amount}  day={day}")
            print(f"             -> {pred['success_probability']:.0%}  odds {pred['yes_odds']}/{pred['no_odds']}  "
                  f"[{pred['prediction_source']}, difficulty {pred['difficulty_used']} {pred['difficulty_source']}]"
                  + (f"  ({pred['goal_used']})" if pred.get("goal_used") else ""))
            problems += [f"action {i + 1} conversion: {p}" for p in conv]
            problems += [f"action {i + 1} calculation: {p}" for p in calc]

        if problems:
            failed += 1
            print("   ✗ FAIL")
            for p in problems:
                print(f"     - {p}")
            raw = nlp.get("data", nlp).get("actions", [])
            print("     NLP said: " + json.dumps(
                [{k: a.get(k) for k in ("category", "subcategory", "measurements", "times")} for a in raw],
                ensure_ascii=False)[:600])
        else:
            passed += 1
            print("   ✓ PASS")
        print()

    if args.save and to_save:
        with open(args.save, "w", encoding="utf-8") as f:
            json.dump(to_save, f, indent=2, ensure_ascii=False)
        print(f"Saved {len(to_save)} NLP outputs -> {args.save}")
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
