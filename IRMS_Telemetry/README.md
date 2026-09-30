# IRMS Telemetry collector

Receives live telemetry that IRMS app users opt in to sending (Settings → Telemetry, default
OFF). Public URL: `https://hina-tw.ddns.net/irms-api/` (Caddy `handle_path` → hina-server `:8120`).

Deployed at `/srv/docker/irms-telemetry` on hina-server. `READ_TOKEN` is in that folder's
`.env` and must never be committed — this repo is public.

## Access model

- **Ingest is open.** The app binary and this repo are public, so an ingest secret could not
  stay secret. Abuse is bounded server-side instead:
  - per client IP: 120 requests and 30,000 events per minute (`RATE_MAX_REQUESTS`,
    `RATE_MAX_EVENTS`); client IP comes from `X-Forwarded-For` only when the request arrives
    from `TRUSTED_PROXY` (the Caddy desktop), and Caddy overwrites client-supplied values;
  - total database size cap (`MAX_DB_GB`, default 20) → `507`;
  - runs not seen for `RETENTION_DAYS` (default 90) are deleted hourly.
- **Reading requires** `Authorization: Bearer $READ_TOKEN`.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/health` | none | liveness |
| POST | `/v1/ingest` | none (rate limited) | `{ runId, appVersion, dropped, events: [{ seq, t, kind, data }] }` |
| GET | `/v1/runs?limit=` | `Bearer READ_TOKEN` | runs, newest first, with per-kind counts |
| GET | `/v1/runs/:runId/events?kind=a,b&afterSeq=&limit=` | `Bearer READ_TOKEN` | events ordered by `seq` |

`runId` is a random UUID per app launch (no host or user identifier is sent); `seq` is
monotonic per run, so retried batches are de-duplicated by `(runId, seq)`.

Event kinds sent by the app: `packet` (raw angle notification text), `connection`,
`ble_error`, `ble_command`, `ota_status`, `ota_progress`, `session_start`, `session_end`,
`app_start`, `app_log`.

## Live share (`share.mjs`)

Lets other clients follow one device in real time by share code (used by the `live-share`
module in IRMS-Modules). In memory only; nothing is written to the telemetry database, and a
restart ends every share. Own per-IP budget: `SHARE_RATE_MAX_REQUESTS` (default 900/min).

- Only a **live telemetry run** can share: `POST /v1/share` needs a `runId` that ingested in the
  last 60 s, and the share closes once that run stops ingesting or the host stops pushing for 30 s.
- Viewers are **read-only by default**. The host grants or revokes "may change settings" per
  viewer, or removes a viewer. Commands are only queued here; the host app decides whether to
  apply them (it refuses while a session is running).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/v1/share` | none | `{ runId }` → `{ code, hostToken }` (409 if the run is not live) |
| GET | `/v1/share/:code` | none | probe: `{ code, viewers, live }`, no live data |
| DELETE | `/v1/share/:code` | host | end the share |
| POST | `/v1/share/:code/state` | host | `{ state }` (≤ 16 KB) → `{ version, viewers, commands }` (drains the queue) |
| POST | `/v1/share/:code/viewers/:id` | host | `{ canEdit: boolean }` |
| DELETE | `/v1/share/:code/viewers/:id` | host | remove a viewer |
| POST | `/v1/share/:code/join` | none | `{ name }` → `{ viewerId, viewerToken, canEdit: false }` (max 20 viewers) |
| GET | `/v1/share/:code/state?after=N` | viewer | long poll (≤ 20 s) → `{ version, state, updatedAt, canEdit }`; 410 when the share ends |
| POST | `/v1/share/:code/commands` | viewer with edit | `{ type: "setParams", params: { targetAngle?, tolerance?, holdTimeMs? } }` → 202 |
| POST | `/v1/share/:code/leave` | viewer | leave |

Codes are 8 characters from `0-9A-Z` without I, L, O, U; input is case-insensitive and may
contain a dash (`AB12-CD34`). Auth is `Authorization: Bearer <hostToken|viewerToken>`.
Tests: `node --test share.test.mjs`.

## Deploy

```sh
scp server.mjs share.mjs Dockerfile docker-compose.yml mc:/srv/docker/irms-telemetry/
ssh mc 'cd /srv/docker/irms-telemetry && docker compose up -d --build'
```
