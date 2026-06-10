# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

DartsCounter is **two loosely-coupled halves that share one data file**:

1. **Android app** (`app/`) — Kotlin + Jetpack Compose + Room. Used at the dartboard to score live games.
2. **Web dashboard** (`docs/`) — a single static `index.html` (vanilla JS + Chart.js), served via GitHub Pages. Shows leaderboards, stats and trophies.

The bridge between them is **`docs/data/games.json`**. When a game ends, the app both saves the result to its local Room DB *and* pushes a new entry into `games.json` on GitHub. The dashboard then fetches that JSON at load time and computes everything client-side. There is no backend server.

## The data flow (the key thing to understand)

```
game ends → GameRepository.saveGame() → Room (local history)
                                       → GameSyncService.sync():
                                           ├─ GitHub Contents API → prepend entry to docs/data/games.json
                                           └─ Google Chat webhook → post result card
GitHub Pages serves docs/index.html → fetch games.json → computePlayerStats() → render
```

- `GameSyncService` ([app/src/main/java/com/darts/counter/data/GameSyncService.kt](app/src/main/java/com/darts/counter/data/GameSyncService.kt)) hand-builds JSON with string concatenation (no JSON lib) and talks to GitHub via `HttpURLConnection`. The `games.json` array is capped at the 200 most recent entries, newest first.
- A game entry has the shape `{id, date, mode, variant, players[], scores[], winner, duration}`. This shape is produced by `gameToJson()` and consumed by the dashboard — **keep both sides in sync when changing it.**

## Web dashboard conventions

- Everything (HTML, CSS, JS) lives in the single file [docs/index.html](docs/index.html). There is no build step for the dashboard.
- All stats and trophies are derived in one chronological pass over the games in `computePlayerStats(games)`. Per-player fields (wins, streaks, mode wins, XP, etc.) are accumulated there; add new derived stats in this function.
- Trophies are the `ACHIEVEMENTS` array — each entry is `{id, ico, name, desc, cond}` where `cond(stat, allStats)` returns whether a player has earned it. Global/comparative trophies use the second `allStats` arg.
- Append `?demo` to the URL to load `docs/data/games.sample.json` instead of real data (see `DEMO`/`DATA_URL`). Regenerate the sample with `python scripts/gen-sample.py`.
- To preview locally, open `docs/index.html` directly or serve `docs/` (e.g. `python -m http.server` from `docs/`).

## Android build & run

Use the Gradle wrapper (`gradlew.bat` on Windows, `./gradlew` elsewhere):

```
gradlew.bat assembleDebug        # build debug APK
gradlew.bat installDebug         # build + install on connected device/emulator
gradlew.bat assembleRelease      # signed release build
```

- Targets `compileSdk`/`targetSdk` 34, `minSdk` 26, Java/JVM 17.
- Secrets and signing config are read from `local.properties` (not committed) and injected as `BuildConfig` fields:
  `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GOOGLE_CHAT_WEBHOOK`, plus `KEYSTORE_PATH`/`KEYSTORE_PASS`/`KEY_ALIAS`/`KEY_PASS` for release signing. When any GitHub field is blank, sync is silently skipped.

## Android structure

- `ui/DartsApp.kt` — Compose `NavHost`; the route graph (`home` → `setup/{count}/{gameMode}` → per-mode screen) is the entry point for understanding navigation.
- `model/` — pure game logic per mode: `CricketModel`, `SuperCricketModel` (each Normal / Cut Throat), `ShanghaiModel` (incl. Shanghai Kill), `FiftyOneModel`.
- `ui/*Screen.kt` — one Compose screen per mode; each calls `GameRepository.saveGame(...)` on completion.
- `data/` — Room (`DartsDatabase`, `GameResultEntity`, `GameResultDao`), `GameRepository`, and `GameSyncService`.

## Weekly recap automation

`.github/workflows/weekly-recap.yml` runs `node scripts/weekly-recap.js` every Friday (cron) to post a weekly summary to Google Chat. It needs the `GOOGLE_CHAT_WEBHOOK` repo secret; trigger manually via `workflow_dispatch` to test.
