# DartsCounter

Score darts games at the board, see stats and trophies on a dashboard.

The project is mid-migration from an Android app + GitHub Pages dashboard to
a FastAPI backend with two PWAs. The Android app (`app/`, Gradle) is kept
as-is during the transition but is no longer the target — `pwa-counter` is
the active scoring app.

## Architecture

```
                                ┌──────────────────────┐
                                │   Caddy (host VPS)    │   ← reverse proxy, not in compose
                                └──────────┬─────────────┘
                  ┌──────────────────┬─────┴──────────────┬──────────────┐
                  ▼                  ▼                    ▼              ▼
   darts.counter.mydomain.com  darts.mydomain.com  darts.api.mydomain.com  (Postgres/Redis:
   pwa-counter (Caddy,         pwa-dashboard       FastAPI backend          internal only)
   serves static build)        (same)              ──┬───────┬──
                                                       ▼       ▼
                                                  Postgres   Redis
```

- **`backend/`** — FastAPI + async SQLAlchemy (asyncpg), Alembic migrations, `uv`-managed (Python 3.12+). PostgreSQL 16 (JSONB, native UUID) + Redis 7.
- **`pwa-counter/`** — Vite + React PWA used at the board to score a game. Offline-first: a failed `POST /games` is queued in IndexedDB and retried via Background Sync (with a focus/visibility/online fallback for browsers without it).
- **`pwa-dashboard/`** — Vite + React PWA: leaderboard, player profiles, trophies, leagues. Reads from the API; no stats computed client-side except achievements (see [Trophies](#trophies--achievements)).
- **`caddy/`** — sample Caddyfiles for the **host's existing** Caddy instance (not run inside compose). Every container — including `pwa-counter`/`pwa-dashboard` themselves — serves its own static build via its own internal Caddy too; see each `Dockerfile`.
- **`shared/`** — `achievements-core.js`/`.mjs`, the trophy engine, imported by `pwa-dashboard` (and by `scripts/trophy-announce.js`).
- **`scripts/`** — `gen-sample.py` (demo data), `trophy-announce.js` (legacy GitHub Action, see [Trophies](#trophies--achievements)).

## Local development

```bash
cp .env.example .env            # edit if you want, defaults work locally
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build

# First time only (and after pulling new migrations) — the backend doesn't
# run migrations on container startup:
cd backend && POSTGRES_HOST=localhost uv run alembic upgrade head
```

| Service          | URL                          |
|------------------|-------------------------------|
| Backend API      | http://localhost:8000 (docs at `/docs`) |
| Dashboard PWA    | http://localhost:5174        |
| Counter PWA      | http://localhost:5175        |
| PostgreSQL       | localhost:5432                |
| Redis            | localhost:6379                |

`docker-compose.local.yml` mounts source for both PWAs (live reload) and
exposes ports directly — no Caddy, no TLS.

Backend tests (need Postgres reachable on `localhost:5432`, isolated in a
separate `dartscounter_test` database):

```bash
cd backend
uv run pytest
uv run ruff check .
```

## Using the app

### Counter (`pwa-counter`)

1. Open the counter app → pick a mode (Shanghai, Cricket, Super Cricket, 51).
2. **Adding a new player**: there's no separate admin/signup step — on the
   setup screen, type a name and tap **+**. It's remembered locally
   (`localStorage`) and created server-side automatically the first time
   that name appears in a finished game (`get_or_create_player`, called from
   `POST /games`). Existing players from the backend are merged into the
   local list on load (`GET /players`).
3. Reorder players, tap **JOUER**, score the game.
4. On finish, the result is `POST`ed to the backend. If the network is down
   it's queued in IndexedDB and flushed automatically once connectivity
   returns (Background Sync, or on focus/visibility/online as a fallback for
   browsers without it).

### Dashboard (`pwa-dashboard`)

- **Home** — current champion, leaderboard, recent games, trends.
- **Joueurs** (`/profils`) / player profile (`/joueur/:name`) — per-player stats.
- **Trophées** (`/trophees`) — unlocked achievements (see below).
- **Ligues** (`/ligues`) — filter the whole dashboard down to a named subset of players.
- **🔔 callout button** — manual "come play" ping to a Google Chat webhook (cooldown: 15 min). This is independent from the automatic notifications below — it's a separate, user-triggered webhook URL stored in the browser's `localStorage`, configured the first time you tap 🔔.

## Trophies / achievements

The trophy list lives in `shared/achievements-core.mjs` as a plain array
(`ACHIEVEMENTS`) — each entry is `{ id, cat, ico, name, desc, cond, prog? }`,
where `cond(stats, allPlayersStats)` is a predicate over computed player
stats (win streaks, modes played, head-to-head record, etc.). **Adding a new
trophy = adding one entry to that array** — no other code changes needed;
the dashboard's Trophées page and `scripts/trophy-announce.js` both read
from the same array.

This logic currently runs **client-side** in the dashboard (CLAUDE.md
explicitly defers porting it to `backend/app/services/achievements.py` — not
done yet). `scripts/trophy-announce.js` + `.github/workflows/trophy-announce.yml`
are pre-migration leftovers: they trigger on a push to `docs/data/games.json`,
which nothing writes to anymore, so they're currently dormant. They'll be
replaced once achievements move server-side.

## Notifications

Two events: `game_finished` (every `POST /games`) and `weekly_recap` (every
Friday 17:00 Europe/Paris, via APScheduler in `backend/app/workers/scheduler.py`).
Both dispatch to every *enabled* configured target — Google Chat and/or
Discord, same event, different message format
(`backend/app/services/targets/{google_chat,discord}.py`).

Configure a target:

```bash
curl -X POST http://localhost:8000/webhooks \
  -H "Content-Type: application/json" \
  -d '{"target": "google_chat", "url": "https://chat.googleapis.com/v1/spaces/..."}'
# target: "google_chat" | "discord"

curl http://localhost:8000/webhooks               # list configured targets
curl -X POST http://localhost:8000/webhooks/test \
  -H "Content-Type: application/json" -d '{"target": "google_chat"}'   # send a sample message
```

No DB config yet? `GOOGLE_CHAT_WEBHOOK` / `DISCORD_WEBHOOK_URL` env vars
are used as a fallback so a freshly migrated deployment keeps notifying
without an extra setup step.

A `game_finished` notification is **not** sent for an idempotent retry (the
offline queue re-POSTing a game that already succeeded) — only for an
actually-new game, whether created immediately or synced later from the
offline queue.

## Migrating historical data

`docs/data/games.json` (the old GitHub Pages dataset) imports into Postgres via:

```bash
cd backend
uv run python -m app.scripts.migrate_json --dry-run   # preview only, writes nothing
uv run python -m app.scripts.migrate_json --path ../docs/data/games.json
```

Idempotent (skips games whose id already exists), creates unknown players on
the fly, recomputes Elo for every player in chronological order at the end.

## Deployment

This repo assumes a VPS that already has Docker and a Caddy instance running
for other things too — neither is provisioned by this stack. Two
environments, same compose base file with overrides, each in its own
directory on the VPS so dev and prod never share a Postgres/Redis volume.

### First deployment (one-time setup)

1. **DNS** — point each hostname at the VPS's public IP (A/AAAA record, or a
   wildcard if your provider supports it and that's acceptable):
   - prod: `darts.mydomain.com`, `darts.counter.mydomain.com`, `darts.api.mydomain.com`
   - dev (if deploying it too): `darts.dev.mydomain.com`, `darts.counter.dev.mydomain.com`, `darts.api.dev.mydomain.com`

   Caddy provisions Let's Encrypt certs per site block on first request —
   that only succeeds once the hostname actually resolves to this VPS.

2. **External Docker network** — Caddy and this stack must share one so
   Caddy can reach containers by name. Check what your existing Caddy is
   actually attached to (`docker network ls`) — it's often *not* literally
   named `caddy`:
   ```bash
   docker network create <name>   # only if it doesn't already exist
   ```
   Use that real name as `CADDY_NETWORK` below. Your existing Caddy
   container/compose needs to be attached to it too.

3. **Clone + configure**:
   ```bash
   git clone <repo-url> /opt/dartscounter        # prod
   git clone <repo-url> /opt/dartscounter-dev     # dev, if deploying it
   cd /opt/dartscounter
   cp .env.example .env.main      # (.env.dev in the dev checkout)
   # edit: DOMAIN, POSTGRES_PASSWORD, CADDY_NETWORK (the real name from step 2), CORS_ORIGINS
   ```
   **`DOMAIN` is the bare root domain — the same value in both `.env.main`
   and `.env.dev`.** Don't put `dev.mydomain.com` in `.env.dev`'s `DOMAIN`:
   `docker-compose.dev.yml` and `caddy/Caddyfile.dev` already add the `dev.`
   prefix themselves wherever it's needed. Setting `DOMAIN=dev.mydomain.com`
   produces `darts.api.dev.dev.mydomain.com` — a doubled "dev" that's wrong
   but won't error loudly; it just makes the counter's `POST /games` fail
   CORS preflight against a hostname nothing serves. `CORS_ORIGINS` and
   `DASHBOARD_URL`, by contrast, *are* literal full URLs you type out
   yourself, prefix and all — only `DOMAIN` is templated.

   If the code you want to deploy hasn't been merged to `dev`/`master` yet,
   `git checkout <your-branch>` here before continuing — `git clone` just
   needs *some* branch with the compose files on it, it doesn't have to be
   `dev`/`master`. Switch back with `git checkout dev && git pull` once
   you've merged, so the directory matches what the CI/CD workflow expects.

4. **Caddy config** — copy the relevant block from `caddy/Caddyfile.main` /
   `caddy/Caddyfile.dev` into your real host Caddy config (this repo never
   starts Caddy itself, so where that config lives is VPS-specific), then
   reload Caddy.

5. **First build + migration** — prod:
   ```bash
   docker compose --env-file .env.main up -d --build
   docker compose --env-file .env.main exec backend uv run alembic upgrade head
   ```
   dev:
   ```bash
   docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
   docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml exec backend uv run alembic upgrade head
   ```
   Two gotchas, both easy to hit on a first deploy:
   - **Pass `--env-file` (and `-f`, for dev) to every `docker compose`
     subcommand, including `exec`/`logs`/`down` — not just `up`.** It's easy
     to assume Compose "remembers" the project context after `up`, but a
     bare `docker compose exec backend ...` afterward can resolve a
     *different* env file/compose file set than the one you used for `up`
     (one observed case: it picked up `.env.main` out of nowhere on a dev
     box that was only ever brought up with `--env-file .env.dev`). Always
     spell out the full flags.
   - **`--env-file` itself is required in the first place** and easy to
     miss. `env_file:` inside the compose YAML only sets variables *inside
     the container* — it does **not** feed `${DOMAIN}`, `${POSTGRES_USER}`,
     `${CADDY_NETWORK}`, etc. used for *substitution in the compose file
     itself* (build args, the external network name). That substitution
     only ever reads the real shell environment or a file named `.env` in
     the working directory — never `.env.dev`/`.env.main` unless you pass
     `--env-file` explicitly. Without it, every `${...}` silently resolves
     to blank (you'll see `WARN: variable is not set` for each one) and
     `CADDY_NETWORK` quietly falls back to the compose file's hardcoded
     default `caddy`, which fails with `network caddy declared as
     external, but could not be found` if your real network has a
     different name.
   - Run migrations *inside* the backend container, not on the host —
     Postgres isn't published to the host port in prod/dev (unlike
     `docker-compose.local.yml`), so the host-side `POSTGRES_HOST=localhost`
     command used for local dev (see [Local development](#local-development))
     won't reach it here.

6. **GitHub Actions secrets** (repo Settings → Secrets → Actions), so future
   pushes auto-deploy — see [CI/CD](#cicd) below.

### Ongoing deploys

Once the above is done once, deploys are just:

```bash
# dev  → darts.dev.mydomain.com / darts.counter.dev.mydomain.com / darts.api.dev.mydomain.com
docker compose --env-file .env.dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# prod → darts.mydomain.com / darts.counter.mydomain.com / darts.api.mydomain.com
docker compose --env-file .env.main up -d --build
```

Run step 5's `alembic upgrade head` again any time a new migration lands.

### CI/CD

`.github/workflows/deploy-main.yml` and `deploy-dev.yml` SSH into the VPS on
push to `master`/`dev` respectively, `git pull`, then `docker compose pull && up -d --build`
in `/opt/dartscounter` / `/opt/dartscounter-dev`. They don't run migrations —
do that manually (step 5 above) after a deploy that includes one.

Required repo secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.

## Repo structure

```
backend/            FastAPI app (uv, Python 3.12+)
  app/
    core/            settings, DB, redis
    models/          SQLAlchemy models
    schemas/         Pydantic schemas
    routers/         games, players, stats, webhooks
    services/        business logic (games, stats, elo, notifications, recap)
      targets/        NotificationTarget implementations (google_chat, discord)
    workers/         APScheduler (weekly recap)
    scripts/         migrate_json.py
    migrations/      Alembic
  tests/
pwa-counter/         scoring PWA (Vite + React, offline queue + service worker)
pwa-dashboard/       stats/trophies PWA (Vite + React)
shared/              achievements-core.js/.mjs — trophy engine
caddy/               sample host-Caddy reverse-proxy configs
scripts/             gen-sample.py, trophy-announce.js (legacy)
docs/                old GitHub Pages dashboard + games.json (historical data source)
app/                 legacy Android app (frozen, not actively developed)
workers/games-proxy/ legacy Cloudflare Worker — pre-migration proxy in front of games.json,
                     superseded by POST /games. Nothing in the repo references it anymore;
                     not yet decommissioned in case it's still deployed somewhere.
```
