# ML API

`preview_odds.py` uses the trained General model and reads a user's Personal
history from the application database by default. General training data remains
the Fitbit CSV; app observations are used only for the requested user's history.

```sh
cd ml-api
.venv/bin/python preview_odds.py \
  --history-source db \
  --user-id <app-user-id> \
  --category exercise \
  --day-of-week 6 \
  --target-hour 22
```

The database connection uses `betmylife/backend/.env`. Do not copy credentials
into this directory. If the General model has no data for a category, the CLI
uses a 50/50 prior; no Personal observations also means the General probability
is used without Personal adjustment.

Use the extracted behavior category as-is, not the app's broad
`Study`/`Fitness`/`Lifestyle` category. General currently supports exact
`exercise`, `sleep`, and `steps` labels. Unsupported labels such as `learning`
use a neutral General prior; do not guess that `walking` means Fitbit `steps`.
Matching Personal observations can still personalize an unsupported category
around that neutral prior.

For an explicit Fitbit-user CSV comparison, pass `--history-source csv` and a
Fitbit `--user-id`.

## App odds service

Docker Compose also runs `odds_service.py` as an internal service. The backend
sends the extracted action category, local event weekday/hour, and app user ID
when a challenge is posted. The service predicts the General probability, reads
that user's matching `source='app'` observations, applies the shared prior
strength of five, and returns fair YES/NO odds. The client stores and displays
the returned values; it does not submit fixed odds.

Only exact General labels (`exercise`, `sleep`, `steps`) use the General model.
Other labels start from a neutral 50/50 prior and are still personalized by
matching history. If the model service is unavailable, the backend also stores
neutral 50/50 odds.