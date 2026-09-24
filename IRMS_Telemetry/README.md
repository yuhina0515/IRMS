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

## Deploy

```sh
scp server.mjs Dockerfile docker-compose.yml mc:/srv/docker/irms-telemetry/
ssh mc 'cd /srv/docker/irms-telemetry && docker compose up -d --build'
```
