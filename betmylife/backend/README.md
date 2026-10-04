# Backend

For normal local development, use `docker compose up --build` from the
repository root. It starts a local database, initializes the schema, and starts
this API automatically. The manual setup below is mainly for TiDB Cloud.

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

`/db/init` creates the `users` table but does not create a demo account. This keeps real account creation separate from the schema setup.
