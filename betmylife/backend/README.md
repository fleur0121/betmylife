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

`/db/init` creates the user, follow, and per-user app-state tables but does not create a demo account. This keeps real account creation separate from schema setup.

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
