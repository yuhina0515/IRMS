# IRMS proactive audit plan (2026-10-09)

Goal: proactively find bugs/risks in the IRMS Tauri app (BLE leg-motion monitor), telemetry server, and CI; produce one consolidated, triaged list; fix real BUGs and cheap RISKs.

Constraints / facts
- Owner's own project. Workers are read-only; they read a snapshot, never the live repo.
- Snapshot root: `<scratchpad>/audit/` (app/src = React/TS frontend, app/src-tauri/src = Rust backend, telemetry/ = Node server, tools/, ci.yml).
- Baseline: `tsc --noEmit` passes. Cargo.toml has only a CRLF working-copy diff (ignore).
- IRMS_Sensor dir is empty (firmware lives in separate IRMS-Firmware repo) - out of scope.
- Protocol: BLE packets, OTA firmware update, signed modules, live share, SQLite migrations.

Tasks
| ID | model | scope | focus |
|----|-------|-------|-------|
| T1 | opus | src-tauri/src/{ble,protocol,firmware_update,firmware}.rs + src/shared/protocol.ts, src/services/{bluetooth,firmwareAutoUpdate*}.ts | packet parsing bounds, OTA flow/abort/timeouts, rust<->ts protocol mismatch, panics |
| T2 | opus | src-tauri/src/{db,migrations,migrate_electron,downsample,types,commands,lib}.rs | SQL correctness, migration idempotency/data loss, unwrap panics, mutex/async misuse |
| T3 | sonnet | src-tauri/src/{modules,update,telemetry,live_share,dpi_guard,splash}.rs + tauri.conf.json + capabilities/*.json | signature verification, path traversal, CSP/capability over-permission, network trust |
| T4 | opus | src/services/{calibration,angleMath,angleRange,movementMetric,sessionAnalysis,triggerEngine,guidance,actionQuery}.ts | math/edge cases (empty, size 1/2, NaN, wraparound), off-by-one |
| T5 | sonnet | src/store/*, src/services/{sessionController,modules,liveShareHost,reconnect...}.ts, src/hooks, src/platform, src/App.tsx | state races, leaks (listeners/timers), reconnect logic, stale closures |
| T6 | sonnet | src/views/*, src/components/*, src/i18n/{en,zh-Hant}.ts | UI bugs, missing i18n keys / key parity, a11y, effect deps |
| T7 | haiku | telemetry/*.mjs, docker-compose.yml, tools/, ci.yml, package.json | auth, input validation, rate limiting, CI gaps |

Report format: `file:line | BUG/RISK/NIT | what is wrong | concrete failing scenario | one-line fix`; verified findings only; under 400 words.

Done criteria: every BUG verified by me against code/test; real BUGs and cheap RISKs fixed with tests passing (`npm run ci:frontend`, cargo test if available); rest listed with reason; work-log written.
