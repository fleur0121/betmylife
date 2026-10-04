# Backend

Challenge NLP uses the backend-only Gemini key. See
[the shared extraction contract](../shared/CHALLENGE_NLP.md) for the Analyze API,
schemas, fixed dictionary, examples, local setup and offline/live evaluation.

Docker is configured to use TiDB Cloud as the only database. No local MySQL
container is started.

## Docker + TiDB Cloud

Run this from the repository root. The command reads the existing
`betmylife/backend/.env` file without copying its password into Git-managed
files:

```sh
docker compose up --build api
```

For iOS physical-device testing, set the Mac LAN address before starting:

```sh
EXPO_PUBLIC_API_URL=http://172.16.194.231:8000 \
docker compose up --build api
```

The iPhone and Mac must be on the same Wi-Fi network. The CA path in
`backend/.env` must also be mounted into the container; on macOS the default
`/etc/ssl/cert.pem` path is used.

## TiDB setup

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in the TiDB Cloud connection values in .env.
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Initialize the first schema once:

```sh
curl -X POST http://127.0.0.1:8000/db/init
```

The profile endpoints are:

```text
GET   /users/{user_id}/profile
PATCH /users/{user_id}/profile
```

`/db/init` creates the user, follow, per-user app-state, achievement, and point-ledger tables but does not create a demo account. This keeps real account creation separate from schema setup.

After login, the mobile app loads and saves its challenges, predictions, balance, point activity, owned cosmetics, equipped cosmetics, and friend IDs through:

```text
GET /users/{user_id}/app-state
PUT /users/{user_id}/app-state
```

Follow relationships are stored separately and can be managed from a user's profile:

```text
GET    /users/{user_id}/following
PUT    /users/{user_id}/following/{followed_id}
DELETE /users/{user_id}/following/{followed_id}
```

Achievement unlocks are stored once per `(user_id, badge_id)` and badge reward
transactions once per `(user_id, reason)`. The API returns earned badges and
claims their one-time point rewards:

```text
GET  /users/{user_id}/badges
POST /users/{user_id}/badges/{badge_id}/claim
```

## Challenge and ML data

Challenge data has three separate layers:

- `challenges.user_input_json` stores the versioned user-submitted form snapshot,
	including the untrimmed title and timezone. Display/search fields such as
	`title` remain separate columns.
- `challenges.analysis_json` stores the NLP response, including `source_text`
	and extracted actions. Keep this payload intact so extraction can be reviewed
	or rerun when the parser changes.
- `ml_observations` stores one result label linked by `challenge_id`. `app_category`
	is the app's broad Study/Fitness/Lifestyle choice; `category` and
	`subcategory` are the extracted behavior labels. Numeric goal, unit, target
	hour, weather, and outcome are separate nullable features.

The app-state JSON is a UI snapshot, not the canonical ML training source.
Observations should be joined back to their challenge when the original input
or full NLP analysis is needed. Existing challenges are backfilled from their
columns with `capture_status=backfilled_from_challenge_columns`; those snapshots
are reconstructed records, not the original raw submission.

Challenge creation asks the internal ML odds service for the extracted action
category and its local event weekday/hour. The returned probability and fair
odds are persisted on the challenge and returned to the app. If the service is
unavailable, creation safely uses a neutral 50/50 estimate. The app's broad
Study/Fitness/Lifestyle category is not substituted for the extracted behavior.

After deploying this schema change, run `POST /db/init` once against the TiDB
database before opening the updated app.
