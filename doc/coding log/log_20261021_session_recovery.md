---
tags: [irms, squad, session, persistence, recovery, tests]
date: 2026-10-21
summary: "Retain stopped sessions after append/end failures, offer explicit retry in normal/error views, protect pending data from destructive/update operations; 531 frontend and 100 Rust tests pass."
---

# Session persistence recovery

Plan: `plans/2026-10-21-session-recovery-plan.md`. Extends existing draft PR #4; no merge or release.

## Baseline and team

Verified public repository `yuhina0515/IRMS`, clean task worktree `E:/Monitoring-and-IoT/IRMS-wt/squad-20261020`, baseline `f2e25ef2c3c478ce939e9330b2ba1ee590bd63a9`. PR #4 remote tauri-app CI passed at that revision; parent PR #3 remains open at cd4fd66. The archive checkout and unified-calibration branch were untouched. Snapshot location is recorded in the plan.

Three independent read-only workers inherited the session model with no overrides. Only the lead edited, verified and committed.

| Worker | Scope | Evidence |
|---|---|---|
| session_voice | controller and failure/retry contract | snapshot execution with rejected persistence, subsequent diff reviews |
| mobility_ui | store/UI/update consumers | source scenarios, repeated review of recovery, crash text and Dashboard consistency |
| mobility_engine | Rust repository/IPC semantics | exact SQL SQLite reproductions, transaction/idempotence review and rollback-test review |

## Accepted and fixed

- Final append failure no longer clears ID/reps or reports saved. It retains the stopped session and buffered readings, skips finalization and permits explicit retry. End-record failure similarly retains the session but does not replay acknowledged readings. Persistent failure does not loop automatically or allow a new session to replace the pending one.
- `sessionSaveState` distinguishes idle/saving/failed and resets only with the session. It is runtime-only. Packet processing remains stopped through failure and retry.
- `SessionSaveControl` provides retry in the Dock, hardware overlay and crash fallback. Success toast/speech is emitted only after persistence succeeds. Error-boundary running text now subscribes to state; Dashboard shows pending-save status rather than Ready. Calibration entry chips stay disabled while data is retained.
- Pending IDs keep demo/calibration and relevant action/firmware controls locked. App updater installation rechecks the session immediately before install. Automatic firmware work waits for ownership to clear before rescheduling.
- Demo purge checks session ownership before and after confirmation, and backend purge skips unfinished records. Current-session history deletion is disabled and rechecked after confirmation.
- Backend end rejects missing/deleted IDs and preserves the first successful end time on retry. No schema or IPC-signature change.
- Added a SQLite trigger regression that aborts the second batch insert, confirms complete rollback, then confirms a retry writes exactly two readings.

## Review corrections, uncertainty and deferrals

- Lead and controller reviewer independently caught native string rejections bypassing an Error.message-based failure check. Normalize unknown errors; regressions cover Error, string and null and verify successful retry without duplicate append or false completion speech.
- UI reviewer caught stale running text in the class crash fallback; a subscribed child and regression fix it. A lead consistency check also caught Dashboard Ready/calibration controls, independently reviewed after correction.
- No reported source bug was rejected as a false positive. Same-millisecond readings remain distinct; timestamp deduplication would be incorrect.
- Recovery is within the current process, not a durable crash journal. The prior failed-write cap of 2,000 readings remains. Closing/killing the process can lose renderer-only data. Ambiguous IPC acknowledgement after an already committed append is not deduplicated; a future batch-token contract is needed for that case.
- Backend end retries preserve first successful finalization time, not a separately persisted acquisition-stop timestamp. Unified calibration and hardware-dependent formula changes remain gated on bench evidence.

## Validation and execution failures

- Three new recovery tests failed against the original controller, then passed after implementation.
- Final frontend checks: `npm.cmd run typecheck`, `npm.cmd test -- --maxWorkers=1 --no-file-parallelism` (**55 files / 531 tests**) and `npm.cmd run build` all passed, exit 0.
- Final Rust check: `CARGO_BUILD_JOBS=1 npm.cmd run ci:rust` passed rustfmt, **100 tests / 3 ignored**, and all-target/all-feature Clippy with `-D warnings`, exit 0.
- Default-parallel frontend execution failed with VirtualAlloc/V8 allocation errors. An earlier npm.ps1 invocation reported an internal PowerShell error despite exit 0 and was treated as incomplete, never as a pass. Two-job Rust compilation also failed under memory pressure; the single-job retry passed. No repository/CI configuration was changed to mask these local resource limits.
- A test first used the wrong Settings category; corrected it. A later confirmation-race test exposed a missing purgeDemo method in the test stub; added its normal empty-success default and reran the full suite. Injected crash-test stderr is expected; assertions pass. One combined patch failed context verification and made no changes before being reapplied precisely.
- The initial artifact wrapper had no registered handler; the MCP fallback successfully attached existing PR #4. No model failures occurred. Existing ToolsView import and Leg3D size warnings remain non-blocking. `git diff --check` passed.

## Native acceptance still outstanding

Real disk-full/locked-database behavior through Tauri, operator retry in WebView2, speech audibility, BLE disconnect/error recovery and physical measurement repeatability. No installation, release, OTA, deployment or device test is claimed.
