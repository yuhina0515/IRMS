---
tags: [irms, plan, squad, audit]
date: 2026-11-26
summary: "Squad run: survey IRMS architecture and completion, then plan and execute tasks that do not need the device."
---

# Device-free audit and execution plan (2026-11-26)

## Goal
1. Survey the current architecture and completion of IRMS on `main` (`5fdff10`).
2. From that survey, pick tasks that can be finished without the ESP32 device.
3. Execute them, verify, commit on a feature branch.

Owner's staffing rule for this run: data gathering goes to Haiku, coding goes to Sonnet.

## Constraints and known facts
- `main` = `5fdff10` (PR #17 merged). No open issues. Open PR: #5 only (needs-split, kept by owner).
- Releases: native `v1.3.0-beta.13` latest (no module system); beta.14 not released (needs owner go). Tauri `v1.2.0-beta.25` still the published Tauri line.
- Project rules: code wins over docs (D2); fix defects, do not widen the agenda; hardware work goes to GitHub issues. Deferred by ruling: ESLint pass, code signing, multi-joint, iOS/Android.
- No releases, no merges to main, no `beta-latest` changes without the owner. Feature-branch pushes are OK.
- Work logs go to `doc/coding log/`, index bullet in `doc/HOME.md`.
- Doc status source of truth: `doc/PROJECT_STATUS.md` top table (dated 2026-11-18, now stale: merges #9 to #17, beta.13, module packages).

## Snapshot
`%TEMP%\squad-irms-20261126\snapshot` (git archive of `5fdff10`; no node_modules, no target).

## Phase A: survey (read-only, Haiku)

| ID | agent | model | scope | focus |
|---|---|---|---|---|
| A1 | research-analyst | haiku | `IRMS_Core/`, `IRMS_App_Native/` | module map, public API, TODO/FIXME/unimplemented!/expect/unwrap in non-test code, features stubbed or simulator-only, test counts per file |
| A2 | research-analyst | haiku | `IRMS_App_Tauri/` (src, src-tauri, fixtures) | architecture, dependency on IRMS_Core, TODO/FIXME, dead code from the core move, contract fixtures |
| A3 | research-analyst | haiku | `IRMS_Sensor/`, `IRMS_Telemetry/`, `tools/`, `.github/workflows/`, `I2C_Scanner/`, root README/SECURITY | firmware tasks and protocol, telemetry collector, CI coverage (which crates CI builds/tests) |
| A4 | research-analyst | haiku | `doc/PROJECT_STATUS.md`, `doc/HOME.md` (top), `doc/OPTIMIZATION.md` (last sections), `doc/plans/2026-11-17-*`, `doc/plans/2026-11-22-*`, `doc/coding log/log_2026112*` | every open (unchecked) item, classified device-needed vs device-free; doc claims contradicted by later logs |
| A5 | research-analyst | haiku | GitHub (`gh`): releases, branches, PR #5, closed issues | release/asset consistency, stale branches, items referenced as "issue" that do not exist |

Report format: `file:line | BUG/RISK/NIT/OPEN | what | evidence | device-free? (yes/no) | one-line next step`; under 400 words; verified only.

## Phase B: triage (lead)
Verify claims against code, pick device-free tasks, discard device-bound ones (list them as issues if missing).

## Phase C: execute (Sonnet, eng-developer, in a worktree off `main`)
Worktree `E:\Monitoring-and-IoT\IRMS-wt\device-free-20261126`, branch `chore/device-free-20261126`. Workers do not commit; the lead commits per task.
Baseline on `5fdff10`: IRMS_Core 232 passed / 6 ignored; IRMS_App_Native 67 passed / 1 ignored.

| ID | agent | model | scope (files) | focus |
|---|---|---|---|---|
| C1 | eng-developer | sonnet | `.github/workflows/ci.yml` (+ fmt/clippy fixes in `IRMS_App_Native/src` only if needed) | add a Windows job for IRMS_App_Native (fmt, test, clippy -D warnings) and a Node job for `IRMS_Telemetry` `node --test` |
| C2 | eng-developer | sonnet | `IRMS_Telemetry/server.mjs`, `share.mjs`, tests, `tools/telemetry/watch.js` | malformed `%` escape -> 400 not 500; non-numeric `after` guard; reject oversize body by Content-Length before reading; watch.js missing `raw` guard; tests for each |
| C3 | eng-developer | sonnet | `IRMS_App_Tauri/src-tauri/src/firmware_update.rs`, `modules.rs` (tests only) | test that the Tauri copies of the Ed25519 public keys equal IRMS_Core's (key rotation drift guard) |
| C4 | eng-developer | sonnet | `doc/PROJECT_STATUS.md` (top table), `doc/HOME.md` (stale lines), `README.md`, `doc/plans/2026-11-16-rust-native-ui-plan.md` (status lines), `IRMS_App_Native/ui/*.slint` stale header comments, `doc/README.md` §4.1 OTA table | refresh docs to verified facts |

Triage rejections: roll-sign `unwrap_or(1)` (unreachable: thigh sign is `None` only when the thigh frame is `None`, and `thigh?` returns first; TS identical). Tauri/core module duplication: real, but deduplicating the shipping Tauri line is a refactor, not a defect fix; only the key-drift guard (C3) is taken. Not taken (product choices or device-bound): parity gaps, slip flag in DB (migration number tied to PR #5), threshold tuning, native startup `expect`.

## Done criteria
- Survey summary in the work log.
- Each executed task: tests run (`cargo test` for touched crates, `npm run ci` if Tauri touched), committed on a feature branch, pushed, draft PR.
- PROJECT_STATUS top table refreshed to current facts.
- Log in `doc/coding log/`, HOME.md bullet.
