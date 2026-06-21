# DartsCounter — Migration to PWA + FastAPI

## Project context

Migration from an Android app + GitHub Pages to two modern PWAs with a Python backend.

**Existing assets to preserve:**
- `docs/data/games.json` — full game history, shape: `{id, date, mode, variant, players[], scores[], winner, duration}`
- `shared/achievements-core.js` — trophies/achievements logic (to be ported to Python on the backend)
- `docs/index.html` — existing dashboard (visual and functional reference)

**GitHub repo:** `mokakejr/DartsCounter`

---

## What needs to be built

### Target repo structure

```
dartscounter/
  docker-compose.yml           # prod (master branch)
  docker-compose.dev.yml       # dev override (dev branch)
  docker-compose.local.yml     # local override (no Caddy, direct ports)
  .env.example
  .env.main                    # gitignored
  .env.dev                     # gitignored
  caddy/
    Caddyfile.main             # mydomain.com + api.mydomain.com
    Caddyfile.dev              # dev.mydomain.com + api.dev.mydomain.com
  backend/
    pyproject.toml             # uv, Python 3.12+
    uv.lock
    Dockerfile
    app/
      main.py
      core/
        config.py              # Pydantic Settings
        db.py                  # SQLAlchemy async (asyncpg)
        redis.py
      models/
        __init__.py
        game.py
        player.py
        elo.py
        season.py
      schemas/
        __init__.py
        game.py
        player.py
        stats.py
      routers/
        __init__.py
        games.py               # POST /games, GET /games
        players.py             # GET /players
        stats.py               # GET /stats/leaderboard, /stats/achievements
        webhooks.py            # POST /webhooks (config), test
      services/
        __init__.py
        modes/
          __init__.py          # auto-discovery registry
          base.py              # ABC GameMode
          cricket.py
          super_cricket.py
          shanghai.py
          fifty_one.py
        stats.py               # port of computePlayerStats
        elo.py
        achievements.py        # port of achievements-core.js
        notifications.py       # multi-target abstraction
        targets/
          base.py              # Protocol NotificationTarget
          google_chat.py
          discord.py
      workers/
        scheduler.py           # APScheduler: weekly recap, ELO recompute
      migrations/              # Alembic
        env.py
        versions/
      scripts/
        migrate_json.py        # one-shot import games.json → PostgreSQL
    tests/
      conftest.py
      test_games.py
      test_stats.py
      test_modes.py
  pwa-counter/
    Dockerfile
    package.json               # Vite + React + TypeScript
    vite.config.ts
    public/
      manifest.json
      icons/
    src/
      sw.ts                    # Service Worker: IndexedDB offline queue
      main.tsx
      App.tsx
      api/
        client.ts              # fetch wrapper with retry
        games.ts
        players.ts
      modes/
        registry.ts            # front-end mode registry
        types.ts               # GameMode interface
        cricket/
        super-cricket/
        shanghai/
        fifty-one/
      components/
        PlayerSelector.tsx
        ScoreInput.tsx
        GameSummary.tsx
      hooks/
        useOfflineQueue.ts
        useGameState.ts
  pwa-dashboard/
    Dockerfile
    package.json               # Vite + React + TypeScript
    vite.config.ts
    public/
      manifest.json
      icons/
    src/
      main.tsx
      App.tsx
      api/
        client.ts
        stats.ts
        games.ts
      pages/
        Leaderboard.tsx
        History.tsx
        Trophies.tsx
        PlayerProfile.tsx
      components/
        PlayerCard.tsx
        GameCard.tsx
        Charts/
      hooks/
        useStats.ts
  .github/
    workflows/
      deploy-main.yml          # push master → SSH → docker compose pull + up (prod)
      deploy-dev.yml           # push dev → SSH → docker compose -f ... up (dev)
```

---

## Hard technical constraints

- **Python 3.12+**, managed with **uv** (not pip, not poetry)
- **FastAPI** with async SQLAlchemy (asyncpg) + Alembic for migrations
- **PostgreSQL 16** + **Redis 7** in Docker Compose
- **Caddy**: existing instance on the VPS — containers expose internal ports, Caddy handles reverse proxy. Do NOT run Caddy inside the compose (except locally for testing)
- **Two PWAs**: Vite + React + TypeScript. Responsive, clean, no heavy UI framework (no MUI/Chakra). Tailwind CSS is fine
- **Service Worker** on the counter PWA: offline queue via IndexedDB, automatic sync on network reconnection (Background Sync API with polling fallback)
- **No `gradlew`, no Kotlin** — the Android app is kept as-is during the transition but is no longer the target

---

## Environments

### Local (development without VPS)
```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up
```
- FastAPI on `localhost:8000`
- Counter PWA on `localhost:5173`
- Dashboard PWA on `localhost:5174`
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- No Caddy, no TLS

### Dev (branch `dev` → `dev.mydomain.com`)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```
- Caddy (existing VPS instance) routes `dev.mydomain.com` → dashboard container internal port
- Caddy routes `counter.dev.mydomain.com` → counter container internal port
- Caddy routes `api.dev.mydomain.com` → FastAPI container internal port

### Main (branch `master` → `mydomain.com`)
```bash
docker compose up -d
```
- Same pattern on `mydomain.com`, `counter.mydomain.com`, `api.mydomain.com`

Real domain values go in `.env.main` and `.env.dev` (not committed). Use `DOMAIN=mydomain.com` as placeholder in examples.

---

## CI/CD — GitHub Actions

### `deploy-dev.yml` (trigger: push to `dev`)
```yaml
- checkout
- SSH into VPS
- cd /opt/dartscounter-dev
- git pull origin dev
- docker compose -f docker-compose.yml -f docker-compose.dev.yml pull
- docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

### `deploy-main.yml` (trigger: push to `master`)
```yaml
- checkout
- SSH into VPS
- cd /opt/dartscounter
- git pull origin master
- docker compose pull
- docker compose up -d --build
```

GitHub secrets to document: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.

---

## Migration script `migrate_json.py`

This script is **the first priority** — it must work before anything else.

```
Input  : docs/data/games.json (path configurable via CLI arg or env var)
Output : inserts all games into PostgreSQL

Expected behaviour:
- Idempotent: if a game with the same `id` already exists, skip it (no duplicates)
- Creates unknown players on the fly
- Logs: X games imported, Y skipped, Z errors
- Dry-run mode: --dry-run prints what would be imported without writing anything
- Recomputes ELO for all players at the end (in chronological order)
```

---

## Data model

```sql
-- players
id          UUID PK
name        TEXT UNIQUE NOT NULL
created_at  TIMESTAMPTZ

-- seasons
id          UUID PK
name        TEXT
start_date  DATE
end_date    DATE
is_active   BOOLEAN DEFAULT false

-- games
id          UUID PK  -- preserve existing id from JSON where possible
date        TIMESTAMPTZ
mode        TEXT          -- 'Cricket', 'SuperCricket', 'Shanghai', 'FiftyOne'
variant     TEXT NULLABLE -- 'CutThroat', 'Normal', etc.
duration    INTEGER       -- seconds
winner_id   UUID FK → players
season_id   UUID FK → seasons NULLABLE
raw_data    JSONB         -- preserve original JSON to avoid data loss

-- game_players (participation + scores)
game_id     UUID FK → games
player_id   UUID FK → players
score       INTEGER
position    INTEGER       -- finishing order (1 = winner)

-- elo_history
id          UUID PK
player_id   UUID FK → players
game_id     UUID FK → games
elo_before  INTEGER
elo_after   INTEGER
delta       INTEGER
computed_at TIMESTAMPTZ
```

---

## Game mode modularity

Each game mode is a self-contained module. Adding a mode = creating one file, no changes to existing code.

```python
# backend/app/services/modes/base.py
from abc import ABC, abstractmethod
from typing import Any

class GameMode(ABC):
    id: str           # 'cricket', 'super_cricket', etc.
    label: str        # 'Cricket', 'Super Cricket', etc.
    variants: list[str] = []

    @abstractmethod
    def initial_state(self, players: list[str]) -> dict[str, Any]:
        """Return the initial game state."""

    @abstractmethod
    def apply_throw(self, state: dict, player: str, throw: dict) -> dict:
        """Return the new state after a throw."""

    @abstractmethod
    def is_finished(self, state: dict) -> bool:
        ...

    @abstractmethod
    def get_winner(self, state: dict) -> str | None:
        ...

# Auto-discovery via __init_subclass__
_REGISTRY: dict[str, type[GameMode]] = {}

class RegisteredMode(GameMode):
    def __init_subclass__(cls, **kw):
        super().__init_subclass__(**kw)
        if hasattr(cls, 'id'):
            _REGISTRY[cls.id] = cls

def get_mode(mode_id: str) -> GameMode:
    cls = _REGISTRY.get(mode_id)
    if not cls:
        raise ValueError(f"Unknown mode: {mode_id}")
    return cls()
```

---

## Notification system

```python
# backend/app/services/notifications.py
from typing import Protocol
from dataclasses import dataclass

@dataclass
class GameEvent:
    type: str   # 'game_finished' | 'weekly_recap'
    data: dict

class NotificationTarget(Protocol):
    async def send(self, event: GameEvent) -> None: ...

# Each target is configurable via DB or env vars
# Active targets are loaded at startup
# Every event is dispatched to all configured targets
```

Targets to implement: `GoogleChatTarget` (port of the existing Node webhook) and `DiscordTarget`. Same interface, different message formats.

---

## Counter PWA — key points

1. **Offline queue**: when `POST /games` fails (no network), store the game in IndexedDB. Retry automatically via Background Sync API (with fallback: check on focus/visibilitychange).

2. **Touch UX**: tap targets must be large (min 48px). The scoring screen is used standing up, one-handed, potentially in a basement.

3. **Front-end mode registry**:
```typescript
// pwa-counter/src/modes/registry.ts
export interface GameModeDefinition {
  id: string
  label: string
  variants?: string[]
  Screen: React.FC<GameScreenProps>
}
const registry = new Map<string, GameModeDefinition>()
export const registerMode = (def: GameModeDefinition) => registry.set(def.id, def)
export const getMode = (id: string) => registry.get(id)
export const allModes = () => [...registry.values()]
```

---

## Dashboard PWA — key points

1. Port the visual design from `docs/index.html` (dark theme, red/black palette, Chart.js). Do not reinvent the UI — migrate it.

2. Aggregated stats are computed **on the backend**. The front makes API calls; no `computePlayerStats` in JS.

3. Achievements/trophies can stay client-side initially (the logic is already well-isolated in `achievements-core.js`), but plan for a Python port in `backend/app/services/achievements.py`.

---

## Recommended work order

1. **Base structure**: `docker-compose.yml`, `docker-compose.local.yml`, `docker-compose.dev.yml`, `.env.example`, sample Caddyfiles
2. **Backend foundation**: `pyproject.toml` (uv), FastAPI app factory, Pydantic Settings config, SQLAlchemy models, Alembic init
3. **Migration script**: `migrate_json.py` — must run locally before anything else
4. **Core endpoints**: `POST /games`, `GET /games`, `GET /players`, `GET /stats/leaderboard`
5. **Tests**: at minimum the main routes and the migration script
6. **Dashboard PWA**: Vite scaffold, port the design, wire up the API
7. **Counter PWA**: Vite scaffold, game modes, offline Service Worker
8. **GitHub Actions**: deploy-dev and deploy-main workflows
9. **Notifications**: GoogleChat (port from existing) then Discord

---

## What NOT to do

- Do not run Caddy inside the main docker-compose (existing VPS instance handles it)
- Do not use `pip install` — only `uv add` / `uv sync`
- Do not hardcode domain names — everything goes through environment variables
- Do not compute stats on the frontend (except achievements initially)
- Do not create a `requirements.txt` — uv manages the lockfile
- Do not put secrets in the repo — `.env.main` and `.env.dev` are gitignored
- Do not over-engineer the PWAs — clean and functional first