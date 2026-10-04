# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
# Unified ML prediction (integration branch)

The challenge API owns prediction requests, TiDB history aggregation, and result observations. The separate `ml-api` service only serves the trained model (`GET /health`, `POST /predict`). No frontend odds are accepted. When the ML service is unreachable, the backend logs the failure and stores an explicit 50% probability with 2.00 / 2.00 odds.

## Run with the existing repository-root Docker Compose

From the `BetMyLife` repository root (the directory containing `docker-compose.yml`):

```bash
docker compose -f docker-compose.yml -f betmylife/docker-compose.ml.yml up --build
```

Set `ML_API_URL=http://ml-api:8000/predict` for the API service. The overlay sets this automatically and starts the ML API on host port 8001. The existing external TiDB settings remain in `betmylife/backend/.env` (`TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`, and optional `TIDB_CA_PATH`). Keep `GEMINI_API_KEY` and the existing app API URL configured as before.

## Run each service locally

Start the ML API in terminal 1:

```bash
cd betmylife/ml-api
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Start the backend in terminal 2. Its `backend/.env` must contain the existing TiDB and Gemini settings:

```bash
cd betmylife/backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
ML_API_URL=http://127.0.0.1:8001/predict uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Start Expo in terminal 3 (for a physical phone, use the computer's LAN IP as the backend address in `.env.local`):

```bash
cd betmylife
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 npx expo start
```

The database migration runs through the existing `/db/init` startup command in Compose, or can be run once locally with `POST /db/init`. Fitbit/ATUS source datasets are not redistributed; [ml-api/README.md](ml-api/README.md) documents preparation and the idempotent import command.
