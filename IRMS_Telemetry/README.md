# IRMS Telemetry collector

Receives live telemetry that IRMS app users opt in to sending (Settings → Telemetry, default
OFF). Public URL: `https://hina-tw.ddns.net/irms-api/` (Caddy `handle_path` → hina-server `:8120`).

Deployed at `/srv/docker/irms-telemetry` on hina-server. `READ_TOKEN` is in that folder's
`.env` and must never be committed — this repo is public.

## Access model

- **New runs may ingest publicly; owned runs require their per-run proof.** There is no global
  embedded ingest secret. Updated native apps derive a collector-specific proof from a random
  per-launch master and send it only in `X-IRMS-Run-Owner`. The first successful ingest transaction
  binds its SHA-256 digest in `run_owners`; later missing/wrong proof cannot change that run's events,
  liveness or metadata. Legacy runs without proof can continue ingesting but cannot share or later
  acquire ownership; restart an upgraded app for a fresh run. Abuse remains bounded server-side:
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
| POST | `/v1/ingest` | per-run header for owned runs; legacy new runs allowed (rate limited) | `{ runId, appVersion, dropped, events: [{ seq, t, kind, data }] }` |
| GET | `/v1/runs?limit=` | `Bearer READ_TOKEN` | runs, newest first, with per-kind counts |
| GET | `/v1/runs/:runId/events?kind=a,b&afterSeq=&limit=` | `Bearer READ_TOKEN` | events ordered by `seq` |

`runId` is a random UUID per app launch (no host or user identifier is sent); `seq` is
monotonic per run, so retried batches are de-duplicated by `(runId, seq)`.

Event kinds sent by the app: `packet` (raw angle notification text), `connection`,
`ble_error`, `ble_command`, `ota_status`, `ota_progress`, `session_start`, `session_end`,
`app_start`, `app_log`.

## Live share (`share.mjs`)

Pending state polls are revoked immediately on host removal, viewer leave or idle expiry. They
return 401 without state and recheck membership at completion; share closure returns 410.
Per-viewer waiters are cleaned without waking other viewers. This source behavior requires collector
deployment to take effect. Local regression command: `node --test IRMS_Telemetry/share.test.mjs`
from the repository root.

Lets other clients follow one device in real time by share code (used by the `live-share`
module in IRMS-Modules). In memory only; nothing is written to the telemetry database, and a
restart ends every share. Own per-IP budget: `SHARE_RATE_MAX_REQUESTS` (default 900/min).

- Only a **live telemetry run** can share: `POST /v1/share` needs a `runId` that ingested in the
  last 60 s and its native owner proof. Verify proof before closing/replacing any existing share.
  READ_TOKEN, knowledge of runId, and an unrelated host token do not establish run ownership.
  The share closes once that run stops ingesting or the host stops pushing for 30 s.
- Viewers are **read-only by default**. The host grants or revokes "may change settings" per
  viewer, or removes a viewer. Commands are only queued here; the host app decides whether to
  apply them (it refuses while a session is running).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/v1/share/capabilities` | none | `{ ownershipVersion: 1 }`; protocol support only, not collector trust |
| POST | `/v1/share` | `X-IRMS-Run-Owner` | `{ runId }` → `{ code, hostToken, ownershipVersion: 1 }`; 409 not live, 403 no owner proof |
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
Tests from repository root: `node --test IRMS_Telemetry/share.test.mjs IRMS_Telemetry/ownership.test.mjs`.

## Ownership-v1 compatibility and rollout

| App / collector | Behavior |
| --- | --- |
| Updated / updated | Native ingest binds a fresh run. Existing runtime-module request shape is retained; native adds proof, preflights capabilities and verifies creation marker. Wait/retry after first successful upload. |
| Legacy / updated | Legacy telemetry remains readable; sharing returns 403 with upgrade/first-upload guidance. Never let a later proof claim legacy history. |
| Updated / legacy | Native preflight rejects before creating a share; no insecure fallback. A missing marker after a successful create also suppresses code/token if server versions change mid-call. |
| Endpoint/enable change during request | Native generation rechecks prevent stale code/token publication. An already-issued create can leave an unpublished share until TTL; it cannot be recalled. |

Proof is absent from status/events/JSON/read endpoints, never a shared user token. Store only the
digest in the separate SQLite table; retention deletes events/ownership/run in one transaction.
New native launch means a new run/master; it intentionally cannot reclaim the previous run.
Use the canonical configured URL (including port/base path); userinfo/query/fragment are rejected.
Alias changes pointing to the same backing database can require restarting the app for a fresh run.
Proof-bearing HTTP does not follow redirects; configure the final collector URL. Redact the ownership
header in operator/proxy diagnostics. This is first-writer run ownership, not device attestation:
an attacker who somehow preclaims a not-yet-ingested ID can deny its later owner, and arbitrary
new runs still do not prove sensor data provenance.

## Deploy

This ownership change has not been deployed by the readiness batch. Coordinate native app and
collector versions using the matrix above; retain existing signed-module API shape. Before changes,
make a consistent SQLite/WAL backup through an online backup or a stopped-service copy, preserve
protected configuration separately, and record recovery/version instructions. Do not expose proof
headers or READ_TOKEN in shared artifacts. Verify first upload/create/recreate, legacy refusal,
restarts, proxy header forwarding, redirects and rollback on the intended client before acceptance.

```sh
scp server.mjs share.mjs runOwnership.mjs Dockerfile docker-compose.yml mc:/srv/docker/irms-telemetry/
ssh mc 'cd /srv/docker/irms-telemetry && docker compose up -d --build'
```
