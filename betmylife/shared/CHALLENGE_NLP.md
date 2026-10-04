# Challenge extraction contract

## Smallest connection to the existing app

The original frontend used regular expressions in `src/services/challenge-nlp.ts`.
The FastAPI backend already uses Gemini for proof planning and translation, has
`google-genai` installed, and reads a backend-only `GEMINI_API_KEY`. Reusing that
provider avoids adding another account or training a model.

The implementation adds an independent Analyze button to the challenge form,
replaces frontend keyword extraction with a request to `POST /challenge-analyze`,
and adds `backend/challenge_nlp.py`. Confirming a post also requests analysis.
It keeps extraction results separate from the existing mock feed and logs the
complete response as `[challenge-nlp] analyzed` in the backend terminal and frontend
console. Cache hits are logged too. Failures produce a backend `[challenge-nlp] failed`
log; the post still completes and displays an analysis error.
Clarification questions and explicit errors appear beneath the input. Proof
planning still has its own workflow; clicking Analyze makes only an extraction call.

The backend sends the dictionary, prompt and Pydantic JSON Schema to Gemini's
Interactions API. It uses schema-constrained JSON, then validates and normalizes
the result with Python. The small HTTP transport uses the existing provider key
and explicitly disables automatic retries. `httpx` was already installed as a
dependency; it is now listed explicitly. Docker's backend build context includes
the shared dictionary so the existing container can still import the new module.

No odds or success probability are calculated by this module.

## Shared artifacts

- `challenge-dictionary.json`: all 29 fixed category/subcategory entries, with
  definitions, English expressions, inclusion and exclusion rules.
- `challenge-extraction.schema.json`: the schema sent to the LLM.
- `challenge-analysis.schema.json`: the complete API response schema.
- `challenge-examples.json`: 26 hand-authored examples. `fixture` is the expected
  raw extraction, not an observed model response. `expected` contains independently
  specified required output fields. Other valid model phrasings can differ.
- `GET /challenge-analyze/schema`: current complete response schema.

Python's Pydantic models are authoritative. The offline test checks that the
checked-in extraction schema matches those models. TypeScript declares the same
response shape for the frontend; changing the contract requires updating both.

## Request and result

```json
{
  "text": "Sleep for at least 7 hours",
  "submitted_at": "2026-10-03T12:00:00-07:00",
  "timezone": "America/Vancouver"
}
```

An example expected result (usage is omitted here because it must be measured):

```json
{
  "schema_version": "1.0",
  "source_text": "Sleep for at least 7 hours",
  "context": {
    "submitted_at": "2026-10-03T12:00:00-07:00",
    "timezone": "America/Vancouver"
  },
  "actions": [{
    "original": "Sleep for at least 7 hours",
    "action": "sleep",
    "object": null,
    "category": "sleep",
    "subcategory": "duration",
    "measurements": [{
      "original": "at least 7 hours",
      "metric": "sleep_duration",
      "operator": "gte",
      "value": 25200,
      "unit": "s"
    }],
    "completion_condition": null,
    "times": [],
    "frequency": null,
    "challenge_period": null,
    "conditions": { "indoor_outdoor": null, "weather_requirement": null },
    "clarification_questions": []
  }],
  "user_reported": {
    "difficulty": null,
    "confidence_percent": null,
    "confidence_original": null
  },
  "clarification_questions": []
}
```

The API wraps this object in `data`, alongside `usage` (raw provider-reported token
usage), `model`, and `cached`. `actions` preserves each action and its constraints.
No target, object, date, difficulty or confidence is supplied just because the
form has a default value.

`measurements` distinguishes distance, activity duration, actual sleep duration,
time in bed, counts, and regularity tolerance. Distance becomes meters; elapsed
time becomes seconds. Raw text always stays alongside normalized values. Periods
use calendar day/week/month units rather than converting months into seconds.
Clock times remain HH:MM; they never become elapsed-time measurements.

`times` distinguishes events, deadlines, interval endpoints, and explicit challenge
period endpoints. It retains `date_text`, `clock_time`, timezone, resolved date and
weekday. `resolved_at` is an offset-aware timestamp only when date/time are known
and unambiguous. `day_offset` preserves an overnight interval relationship even
when its calendar dates are unknown.

## Extraction instructions

The prompt in `backend/challenge_nlp.py` applies the shared dictionary to the main
action rather than topic words. Reading a book about cooking stays reading/book.
Reading without a stated medium stays reading/null with a question. Clear
unsupported activities use other/other; unclear actions use null/null.

Getting into bed, falling asleep, waking and leaving bed remain distinct. Ambiguous
“sleep by 11 pm” uses sleep/null and asks whether the user means entering bed or
falling asleep. Daily bedtime uses bedtime plus frequency, not regularity. Reading
before bedtime stays reading unless explicit sleep preparation is the goal.

At least, at most/by, under/before and over/after become gte, lte, lt and gt. Bare
quantities and exact clock times use eq. Multiple constraints are retained on the
same action. A duration following “for” is interpreted by meaning: “for a week”
can describe the challenge period rather than a week-long activity.

Difficulty and confidence come only from explicit user statements. Numeric
confidence keeps its original phrase as evidence. “Definitely” supplies no
numerical confidence. Weather is a requirement string; no actual weather is fetched.

## Deterministic validation

Requests need nonblank text (maximum 1,000 characters), an offset-aware timestamp,
and a valid IANA timezone. Output must have all required fields and no unknown
fields, at most eight actions, known category/subcategory pairs, and finite
nonnegative measurements. Invalid structure or pairings are rejected, not replaced
with fabricated data. Contradictory numeric bounds and reversed dated intervals
are rejected. Unknown units become null with a clarification question.

Measurement and time evidence must be substrings of the input. Numerical confidence
must be in 0–100 with numeric evidence. Difficulty retains explicit original text.
This catches structural mistakes and some unsupported values; it cannot prove
that the LLM interpreted every sentence correctly. Model evaluation remains necessary.

The backend, not the LLM, resolves today/tonight, tomorrow, the day after tomorrow,
“in N days”, and an explicitly linked next morning, using the submission timestamp
in the applicable timezone. ISO dates and month-name dates with an explicit year
are accepted. Unsupported or ambiguous date phrases, including unclear weekday
references, remain null with a question. Bare clock times do not acquire a date.
Weekdays are derived only from confirmed calendar dates.

An undated end clock earlier than the start clock belongs to the next day of an
interval. Thus tonight 23:00 to 07:00 resolves to two consecutive local dates.
Undated 23:00 to 07:00 retains day_offset=1 and null calendar dates. Neither case
creates actual sleep duration. Nonexistent or repeated daylight-saving local times
produce a question and null resolved_at.

## Local operation and budget

Keep `GEMINI_API_KEY`, `NLP_MODEL`, and `NLP_MAX_CALLS` in `backend/.env`, which is
excluded from Git. Never use an EXPO_PUBLIC variable for a provider key. Keep the
existing database settings. Start from the app root:

```sh
cd backend
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

Analyze uses the detected device IANA timezone and the timestamp of its first
submission for the unchanged input/local day. Repeated clicks submit that same
context; changes to text, local day or timezone create a new context. The backend
cache includes the entire request, model, prompt, dictionary, schema and unit
configuration. Configuration changes therefore invalidate reuse.

The local process accepts at most 50 real analysis attempts by default (failures
count). Set `NLP_MAX_CALLS` to change the cap. It stores at most 64 successful cache
entries, serializes upstream calls to prevent duplicate concurrent spending, limits
output to 4,096 tokens and provider responses to 256 KiB, and uses a 30-second
HTTP timeout. Frontend timeout is 40 seconds. There are no automatic retries.
The Analyze button and post confirmation explicitly trigger extraction. Unchanged
context uses the backend cache. Existing translation/proof-planning calls
have their own behavior and are outside this extraction call cap.

Malformed requests return 422. Missing configuration returns 503. The process call
limit returns 429. Provider errors, busy/quota errors, blocked/incomplete responses,
and output validation failures return 502 with distinct `detail.code` values.
Failed outputs are never cached and never silently replaced by the old regex.

Each provider response logs `challenge_nlp_usage` with its actual usage, including
responses subsequently rejected by validation. Successful responses return usage
to the frontend. Cache hits make no new provider call; their usage describes the
original call. Measure real input/output/thinking/cached tokens first, then apply
the selected model's current pricing. No budget estimate is based on fixture tokens.
The process cap and cache reset on restart and are intended for a single local
hackathon process, not a distributed deployment.

## Verification

From the app root:

```sh
backend/.venv/bin/python -m unittest backend.test_challenge_nlp -v
backend/.venv/bin/python -m backend.eval_challenge_nlp --live --limit 5
```

The first command is offline and validates all 26 fixture cases, error handling,
cache/call limits, invalid context, unit conversion, relative and overnight dates,
and daylight-saving ambiguity. It does not measure model accuracy.
The second command makes up to five real provider calls, compares independent
expected fields, reports token usage and stops on provider failure. Increase the
limit to 26 to evaluate every case once the first small batch passes.

Live validation initially found an invalid key, followed by model high demand on
gemini-3.8-flash. With gemini-3.5-flash-lite, a response-reading bug was discovered:
the REST response now provides `steps[].content`, but the reader looked only at
legacy `outputs`. The reader now extracts trailing model text from steps and
retains legacy support. Validation failures include field/type diagnostics in
`detail.issues` without returning the entire model response.

After this fix, the first five live sleep cases passed (sleep duration, bedtime,
sleep onset, ambiguous sleep intent, and an overnight time-in-bed interval).
Their provider-reported totals were 11,481 input and 1,504 output tokens; the full
raw usage, including additional invocation counters, is retained in logs. This is
a five-case observation, not an accuracy guarantee for every input. The user's
"I will wake up by 8am" input also passed against the real model and the running
HTTP endpoint. Sixteen offline tests cover normalization, response parsing,
logging, schema alignment, cache and error handling.

Provider schema reference: https://ai.google.dev/gemini-api/docs/structured-output
