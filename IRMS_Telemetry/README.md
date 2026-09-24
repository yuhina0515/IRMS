# IRMS Telemetry collector

Receives opt-in telemetry uploaded by the Tauri app during real-device testing.
Public URL: `https://hina-tw.ddns.net/irms-api/` (Caddy `handle_path` → hina-server `:8120`).

Deployed at `/srv/docker/irms-telemetry` on hina-server. Tokens are in that folder's
`.env` (`INGEST_TOKEN`, `READ_TOKEN`) and must never be committed — this repo is public.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/health` | none | liveness |
| POST | `/v1/ingest` | `Bearer INGEST_TOKEN` | `{ runId, appVersion, host, dropped, events: [{ seq, t, kind, data }] }` |
| GET | `/v1/runs?limit=` | `Bearer READ_TOKEN` | runs, newest first, with per-kind counts |
| GET | `/v1/runs/:runId/events?kind=a,b&afterSeq=&limit=` | `Bearer READ_TOKEN` | events ordered by `seq` |

`runId` is generated per app launch; `seq` is monotonic per run, so retried batches are
de-duplicated by `(runId, seq)`.

Event kinds sent by the app: `packet` (raw angle notification text), `connection`,
`ble_error`, `ble_command`, `ota_status`, `ota_progress`, `session_start`, `session_end`,
`app_start`, `telemetry_dropped`.

## Deploy

```sh
scp server.mjs Dockerfile docker-compose.yml mc:/srv/docker/irms-telemetry/
ssh mc 'cd /srv/docker/irms-telemetry && docker compose up -d --build'
```
