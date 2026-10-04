# ML API

`preview_odds.py` uses the trained General model and reads a user's Personal
history from the application database. The General `.pkl` model and DB
observations are sufficient; the CLI does not read CSV files.

```sh
cd ml-api
.venv/bin/python preview_odds.py \
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

General retraining reads `fitbit`/`atus` observations from the DB; Personal
retraining reads `fitbit`/`atus`/`app` observations. CSV files are only needed by
the ingestion/preparation tools when importing new source data; after import,
the source CSVs can be removed without blocking odds previews or model retraining.

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

## Demo personas

`seed_personas.py` creates three demo accounts and writes their history through
the same tables the app uses: `users`, resolved `challenges` (with
`user_input_json`/`analysis_json` in the NLP shape) and one linked
`source='app'` row per challenge in `ml_observations`.

| Persona | skill | weak/strong | weekend_penalty | overconf |
| --- | --- | --- | --- | --- |
| Maya, the early bird | 0.78 | wake-ups +0.14 | 0.03 | -0.15 |
| Leo, the overconfident one | 0.55 | gym -0.22 | 0.08 | +0.42 (says ~90%) |
| Sora, the weekday grinder | 0.80 | studying +0.13 | 0.74 | +0.05 |

Each persona also gets an open "Wake up by 7am on Saturday" challenge, priced
by the same blend as `odds_service.py` (about Maya 90%, Leo 49%, Sora 36%).

```sh
cd ml-api
.venv/bin/python seed_personas.py --dry-run   # print histories and odds only
.venv/bin/python seed_personas.py             # replace the personas' DB rows
```

Re-running deletes and regenerates only the persona rows. Log in as
`maya_earlybird`, `leo_allin` or `sora_grinder` with password `demo1234`
(`--password` changes it). `--days`, `--as-of`, `--timezone` and `--seed`
control the generated history.

Personal history is split by weekday/weekend in the user's timezone: the
other day type's history is blended with the General prior first, and that
result is the prior for the same day type's history. This is why Sora gets
about 76% for a Tuesday wake-up but 36% for a Saturday one.
