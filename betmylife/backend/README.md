# Backend

For local Docker development with MySQL, use `docker compose up --build` from
the repository root. To use TiDB Cloud from the API container, use the
`docker-compose.tidb.yml` override described below.

## Docker + TiDB Cloud

Run this from the repository root. The command reads the existing
`betmylife/backend/.env` file without copying its password into Git-managed
files:

```sh
docker compose \
  --env-file betmylife/backend/.env \
  -f docker-compose.yml \
  -f docker-compose.tidb.yml \
  up --build
```

For iOS physical-device testing, set the Mac LAN address before starting:

```sh
EXPO_PUBLIC_API_URL=http://172.16.194.231:8000 \
docker compose --env-file betmylife/backend/.env \
  -f docker-compose.yml -f docker-compose.tidb.yml up --build
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

`/db/init` creates the `users` table but does not create a demo account. This keeps real account creation separate from the schema setup.
