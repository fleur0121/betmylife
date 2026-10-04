# Betmylife

## Start the full development stack with Docker

Docker Compose starts the local MySQL-compatible database, FastAPI backend, and
Expo web app together. Docker Desktop (or another Docker Compose installation)
is the only prerequisite.

```sh
cp .env.example .env
docker compose up --build
```

Open:

- App: http://localhost:8081
- API docs: http://localhost:8000/docs
- API health check: http://localhost:8000/health

The API waits for the database and creates the required tables automatically.
Source directories are mounted into the containers, so FastAPI and Expo reload
while you edit files.

To open a database shell:

```sh
docker compose exec db mysql -ubetmylife -p predict_my_life
```

Stop the stack without deleting local database data:

```sh
docker compose down
```

Reset the local database completely:

```sh
docker compose down --volumes
```

### Run with Expo Go on a physical phone

`localhost` on a phone means the phone itself. Set both values below in the
root `.env` to the development computer's LAN IP, then restart Compose.

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.10
```

The phone and computer must be on the same network, and the firewall must allow
ports 8000 and 8081. The browser-based app needs no changes from the defaults.

### Use TiDB Cloud instead of the local database

The Docker setup intentionally uses a local MySQL-compatible database so every
developer can start immediately. For TiDB Cloud, run the API with the variables
documented in `betmylife/backend/.env.example`; the application code uses the
same MySQL protocol for both databases.
