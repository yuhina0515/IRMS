---
tags: [irms, squad, audit, ci, telemetry, docs]
date: 2026-11-26
summary: "Squad survey of IRMS architecture and completion on main 5fdff10, then four device-free tasks: CI jobs for the native app and telemetry, telemetry request hardening, single-sourced signing keys, status docs refresh. Branch chore/device-free-20261126."
---

# Device-free survey and fixes (2026-11-26)

Plan: `plans/2026-11-26-device-free-audit-plan.md`. Owner's staffing rule: data gathering on Haiku, coding on Sonnet.

## Who ran what

| Phase | Worker | Model | Scope |
|---|---|---|---|
| Survey A1 | research-analyst | Haiku | IRMS_Core, IRMS_App_Native |
| Survey A2 | research-analyst | Haiku | IRMS_App_Tauri |
| Survey A3 | research-analyst | Haiku | telemetry, tools, CI, firmware contract |
| Survey A4 | research-analyst | Haiku | docs open items and stale claims |
| Survey A5 | research-analyst | Haiku | GitHub releases, branches, PR #5, issues |
| Fix C1-C4 | eng-developer | Sonnet | see below |

Snapshot: `git archive` of `5fdff10` in the session temp folder. Workers did not commit; the lead verified and committed each task.

## Architecture and completion (as of 5fdff10)

- **IRMS_Core** (~14.5k lines, 24 files): calibration, judge, BLE stack and lifecycle, protocol, modules, sharing, telemetry, SQLite (user_version 10), firmware/app update with Ed25519 checks, session control, slip monitor. 232 tests pass, 6 ignored (network/real-DB tests).
- **IRMS_App_Native** (~9.1k Rust + ~1.3k Slint): released line, `v1.3.0-beta.13` latest; beta.14 (module packages) unreleased. 67 tests pass.
- **IRMS_App_Tauri**: `1.2.0-beta.25` in all three version files; 47 IPC commands, TS and Rust command sets match. Its `modules`, `telemetry`, `live_share`, `firmware_update` Rust modules are separate copies of the IRMS_Core ones, not wrappers.
- **Contract fixtures**: all six recorded by TS and replayed in Rust.
- **GitHub**: no issues at all; the device-acceptance items are not tracked as issues, contrary to the project rule. IRMS-Modules `v2026.11.22` session-tips needs app beta.14, so it is inert today.

## Done (branch `chore/device-free-20261126`)

| Commit | Task | Verification |
|---|---|---|
| `00272bf` | C2: telemetry returns 400 for malformed `%` escapes (run id, share code), treats a non-numeric `after` as -1 instead of a 20 s wait, rejects a declared oversize body with 413 before reading; `watch.js` no longer throws on a packet without `raw` | `node --test` 9/9 (new `server.test.mjs` spawns the real server on a temp dir) |
| `836cf77` | C4: 2026-11-26 status table in PROJECT_STATUS, stale lines in HOME/README/native plan, OTA + FW-version UUID table in doc/README §4.1, Slint header comments | `cargo build` native OK; diff read by lead |
| `8e07468` | C1: CI jobs `native-app` (fmt, test, clippy -D warnings, Windows) and `telemetry` (node --test, Node 24) | same commands pass locally; first GitHub run is the real check |
| `ec618c7` | C3: Tauri crate imports the firmware and module public keys from IRMS_Core (values were identical) | Core 232, Tauri Rust 43 tests, fmt and clippy clean; native builds |

Merged as PR #18 (`e53363f`); all three CI jobs passed on GitHub (native-app 7 min, tauri-app 8.5 min, telemetry 7 s).

## Owner decisions and follow-up (same day)

Owner chose: merge #18, open the device issues, deploy telemetry with a loopback bind, hold beta.14.

- Telemetry deployed to hina-server: backups `*.bak-20261126` of server.mjs, share.mjs, docker-compose.yml; the deployed files had matched the repo apart from line endings. Port now `127.0.0.1:8120`. Checks: `/v1/health` 200 and authed `/v1/runs` 200 via Caddy; on the host, malformed share code returns 400 `bad share code` and a declared 5 MB ingest returns 413; port 8120 refused from the public name and the LAN IP; Caddy upstream connections still arrive from `172.23.0.1`, so the trusted-proxy client IP logic is unchanged; no errors in the container log.
- Issues #19 to #23 opened with label `needs-device`.

## Rejected or not taken

- Roll-sign `unwrap_or(1)` (A1, RISK): unreachable. `roll_sign.thigh` is `None` only when the thigh frame is `None`, and `thigh?` returns first; the TS code is identical.
- Deduplicating the Tauri copies of core modules: real, but a refactor of the shipping Tauri line, not a defect fix (project rule). Only the key-drift part was taken.
- Parity gaps (shortcuts, follow-system theme, demo mode, toasts), slip flag in the DB (migration number tied to PR #5), threshold tuning: product choices or device-bound.
- Telemetry port `8120` published on all interfaces and `X-Forwarded-For` trust from the bridge gateway: live-server changes, need the owner.

## Problems during the run

- I first told the owner that IRMS_Core tests were not in CI. Wrong: `npm run ci:core` runs fmt/test/clippy on IRMS_Core. Only IRMS_App_Native and telemetry were missing. Corrected in chat.
- Local `main` was 106 commits behind origin at the start; fast-forwarded before the survey.
- A2's export scan is textual (no knip/tsc); not used for any change.

## Still open

- beta.14 held by the owner until device testing. Stable `v1.2.0` target of 2026-12-01 not reconfirmed.
- Frontend `npm run ci` not rerun (no TS touched).
