---
tags: [irms, telemetry, tauri, infra, testing]
date: 2026-09-24
summary: Opt-in test telemetry upload from the Tauri app to a collector at hina-tw.ddns.net/irms-api, so real-device runs by teammates are queryable remotely.
---

# Test telemetry upload

## Why

Real-device acceptance (issue #3, CAL-02/03, OTA) is run by whoever holds the ESP32. Evidence
so far travelled as hand-copied logs/traces, and the 09-24 review noted the historical trace
lacked the settings needed for replay. The user asked for an API under `hina-tw.ddns.net`
that the app uploads telemetry to, so the developer (Claude) can query runs directly.

## Design decisions

- **Collector** `IRMS_Telemetry/` — Node 24, zero deps (`node:http` + `node:sqlite`), Docker
  on hina-server `/srv/docker/irms-telemetry`, port 8120. Caddy `handle_path /irms-api/*`
  on the desktop, 4MB body cap. Follows the existing hina-server migration convention.
- **Two tokens**: `INGEST_TOKEN` (given to testers, typed into Settings) and `READ_TOKEN`
  (query only). Both only in the server `.env`; the repo is public and the binary cannot carry
  secrets. A leaked ingest token can write junk but cannot read anything.
- **Idempotent ingest**: per-launch `runId` + monotonic `seq`, `UNIQUE(run_id, seq)` with
  `INSERT OR IGNORE`, so client retries never duplicate rows.
- **Client in Rust** (`src-tauri/src/telemetry.rs`), not the webview: no CSP change, and raw
  packets are captured where they arrive. Reuses the reqwest/rustls already pulled in by
  tauri-plugin-updater — Cargo.lock gained no new packages.
- **Never interfere with measurement**: record is an in-memory push; uploads run on their own
  task with 2s cadence and exponential backoff to 60s; queue bounded at 200k events (drop
  oldest, counted). Turning upload off clears the unsent queue.
- **Raw packet text**, not parsed values, so calibration/protocol replays can re-parse later.
- **Frontend** adds Settings v14 fields (enabled/endpoint/token), `TelemetryPanel` (validates
  via Rust before persisting "on"), `session_start` with the calibration snapshot,
  `session_end` with `endError` and unsaved buffer size (directly observes review finding R2),
  and every `useStore.log()` line via a listener set (avoids a store↔service import cycle).

Event kinds: `app_start`, `packet`, `connection`, `ble_error`, `ble_command`, `ota_status`,
`ota_progress` (phase changes only), `session_start`, `session_end`, `app_log`.

Note: R1 (Windows adapter-level disconnect) is **not** fixed here; telemetry records only what
the app currently observes, so a silent link loss will appear as packets stopping without a
`connection` event — which is itself useful evidence for R1.

## Verification

- `npm run ci`: 338 frontend tests, typecheck, build, rustfmt, 54 Rust tests, Clippy `-D warnings`.
- Collector via the public URL: health 200; unauthenticated read 401; wrong ingest token 401;
  ingest token cannot read; malformed events 400; resend of the same batch inserted 0 rows.
- Rust client live round trip (`live_upload_round_trip`, `#[ignore]`, run manually with
  env vars) against the public URL: 2 events delivered and read back; wrong token → 401,
  event stays queued. Offline endpoint test keeps the batch queued.
- Test runs were deleted from the server DB afterwards.
- **Not verified**: the Settings panel inside a running Tauri app, and a real-device session
  producing packets. Both happen on the first teammate test run.

## Update (same day): opt-in for every user, no ingest token

The user asked that **any app user** can choose to connect and stream live telemetry. A
per-tester ingest token contradicts that (and could never be secret in a public binary), so:

- Ingest token removed from collector, Rust client, Settings (v14 was unreleased, changed in
  place) and the server `.env`. `READ_TOKEN` unchanged.
- Server-side abuse bounds instead: per-IP 120 req / 30k events per minute (IP from
  `X-Forwarded-For` only when the request comes from the Caddy host `TRUSTED_PROXY`), 20 GB
  DB cap (507), 90-day retention pruned hourly, strict `runId` charset.
- Privacy: the client no longer sends `COMPUTERNAME` (often contains the owner's real name).
  Panel copy now states exactly what is and is not uploaded, the 90-day retention, and that
  turning it off discards unsent data. Endpoint moved under a collapsed 進階 section.
- Verified via the public URL: tokenless ingest 200; unauthenticated read 401; invalid runId
  400; burst of 125 requests → 429 after the 120th; spoofed `X-Forwarded-For` through Caddy
  still hits the caller's own bucket, while the trusted Caddy host's header is honoured.
  `npm run ci` green (338 / 54 tests); live Rust round trip passes and a rejected request
  (404) keeps the event queued. Test rows deleted afterwards.
- Still not verified: the panel inside a running app and a real-device session.

## Handoff

- User setup: Settings → Telemetry 即時遙測上傳 → toggle on. The status line shows
  sent/pending/dropped and the run ID users can quote when reporting a problem.
- Query: `GET /irms-api/v1/runs`, `GET /irms-api/v1/runs/<runId>/events?kind=packet,connection`
  with `Authorization: Bearer <READ_TOKEN>`.
- Reaching users requires a new beta build (release is a separate, explicit step).
