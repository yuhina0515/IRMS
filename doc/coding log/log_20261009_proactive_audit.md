---
tags: [irms, audit, squad, bugfix, tests]
date: 2026-10-09
summary: "Squad audit of the IRMS app with 7 read-only workers. Verified BUGs fixed with tests (migration cleanup, downsample duplicates, telemetry poison batch, trigger grace, session reentry, BLE reconnect, UI edge cases). CI green; cheap RISKs and design-level security items deferred."
---

# Proactive IRMS audit (2026-10-09)

Plan: `plans/2026-10-09-irms-proactive-audit-plan.md`. Not pushed; committed locally only.

## Request
`/squad` audit mode: proactively find problems in the IRMS project, list and consolidate them, fix the verified ones.

## Actions
- Snapshot of app/telemetry/tools/CI in scratchpad; 7 read-only workers (T1/T2/T4 opus, T3/T5/T6 sonnet, T7 haiku), split by disjoint scope.
- I verified every BUG-level claim against code before fixing.

## Fixed (each with a test unless noted)
- `migrate_electron.rs`: a failed/corrupt DB copy is now removed from the destination (previously left a bad DB that blocked retry); source dir removal failure is only logged.
- `db.rs`: downsample-to-row mapping uses a forward cursor so the same row is never returned twice.
- `telemetry.rs`: HTTP 400/413/422 batches are dropped (counted in `dropped`) instead of retried forever and blocking the queue.
- `calibration.ts`: `calibrationDrift` compares vector fields by value (JSON round-trip no longer counts as drift).
- `movementMetric.ts`: joint_angle lower bound clamped to `2 * REST_MARGIN` so rest is never 0.
- `triggerEngine.ts`: holding with an overdue exit grace now exits even if the next packet is back in zone after a gap.
- `sessionController.ts`: `starting`/`ending` reentry guards (double click created two sessions); `startTimers` clears old timers first.
- `bluetooth.ts`: a late `connected` event after a manual disconnect now re-issues `ble_disconnect`.
- `useGlobalShortcut.ts`: ignore key auto-repeat. `HistoryView` duration formatting guards NaN/negative. `CalibrationWizard` Recalibrate resets auto-try and error. `useUiStore.requestConfirm` resolves the previous pending confirm as false. `ConfirmDialog` focus effect split. `SettingsView` NumField keeps a draft string and only commits finite numbers (no UI test; checked by reading).

## Rejected
- T7 claim that GitHub Actions v7 is deprecated: false positive, verified with `gh api`.
- My own first triggerEngine change (subtract grace time from hold) broke an existing spec (grace counts as hold by design); reverted, kept only the overdue-grace exit.

## Not fixed (reason)
- Cheap RISKs left: persisted-store `merge` defaults (NaN `flushIntervalSec`), NaN from `parseFloat('')` in ActionsView/SessionDock, `ble.rs` leaks (duplicate connect listener, failed connect not disconnected, stale peripheral), `export_write_text` path scope, `telemetry_log` size cap, `splash.ts` listener ordering, `modules.ts` activate timeout. Not touched to keep scope tight.
- Unverified: firmware version trailing NUL, 10 s OTA START timeout.
- Design-level security (T3): index version/expiry, TOCTOU, IPC gating, endpoint pinning. Deferred, need a decision.

## Verification
- `npm run ci`: tsc clean; vitest 49 files / 451 tests pass; vite build OK; cargo fmt/clippy `-D warnings` OK; cargo test 91 pass, 3 ignored.
- Mutation checks: Rust downsample test broken once -> failed -> restored -> passed. TS: broke the grace-expiry check in `triggerEngine.ts`, the reentry guard in `sessionController.ts` and `sameValue` use in `calibration.ts` -> 5 tests failed (calibration 1, sessionController 1, triggerEngine 3) -> restored -> 451/451 pass.
- Mistakes during the run: snapshot first mixed Rust and TS (redone); TS2345 on `session.id` (fixed by passing id as parameter); `cargo fmt` complaint on telemetry (ran fmt).

## Needs user testing in the real client
- BLE manual disconnect/reconnect race, rapid double-click on start/end session, shortcut key hold, Settings number fields, calibration Recalibrate flow, migration retry after a corrupt Electron DB.
