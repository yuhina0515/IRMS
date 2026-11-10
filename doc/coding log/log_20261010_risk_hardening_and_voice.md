---
tags: [irms, hardening, voice, squad, tests]
date: 2026-10-10
summary: "Fixed the RISK items deferred on 2026-10-09 (settings sanitize, NaN inputs, BLE listener leaks, export/telemetry limits, splash ordering, module activate timeout, firmware version trim) and added spoken session cues with a Settings toggle. Automated checks only; no hardware testing."
---

# Risk hardening + voice cues (2026-10-10)

Plan: `plans/2026-10-10-irms-risk-hardening-and-voice-plan.md`. Follow-up to `log_20261009_proactive_audit.md`. Not pushed; committed locally only.

## Request
Fix and annotate previously unfixed known issues, skip real-device testing, add voice prompts.

## Status per item
- V1 voice: FIXED/ADDED. `services/voice.ts` (speechSynthesis, no dependency), cues for start, rep n, hold, over-limit (safety priority, repeats every 8 s), end, connection lost. Setting `voiceEnabled` (default on, persist v18), toggle in Settings -> Display. Assumption: "voice prompts" = spoken cues during a session; confirm with the user.
- R1 persisted settings NaN: FIXED. `sanitizeSettings` + persist `merge` (a same-version corrupt value bypasses `migrate`).
- R2 NaN from cleared number inputs (ActionsView, SessionDock): FIXED (finite guards, clamped display).
- R3 `ble.rs` leaks: FIXED. Generation counter retires stale notification listeners; failed connect now disconnects; connect retires an existing peripheral first.
- R4 `export_write_text`: FIXED. Requires absolute `.csv` path, existing parent dir, not a directory, size cap 256 MB.
- R5 `telemetry_log`: FIXED. Event `data` over 64 KiB is dropped and counted in `dropped`.
- R6 `splash.ts`: FIXED. Listeners are awaited before `splash_ready` is invoked. `modules.ts`: FIXED. `activate()` has a 30 s timeout so a hung module no longer blocks the serial load queue.
- D1 firmware version trailing NUL: FIXED (`clean_firmware_version`). OTA START 10 s wait: NOT CHANGED (hardware-dependent, needs a real device to tune).
- S1 index version/expiry, TOCTOU, IPC gating, endpoint pinning: DEFERRED. These change the signing/update contract and need the owner's decision.

## Squad
No fan-out this round: findings were already verified last round and workers are read-only, so they would not have produced fixes. Lead did all work.

## Verification
- `npm run ci` ran through to cargo clippy/check with no error shown at the tail. Separate `npx vitest run`: 50 files / 465 tests pass. `cargo test --lib`: 95 pass, 3 ignored.
- Mutation checks: removed the safety-window check and the `voiceEnabled` guard -> 2 voice tests failed; changed `!is_csv` to `false` -> Rust export test failed; restored all -> pass. The modules timeout test did NOT fail when the constant was changed, because the test imports the same constant (it only proves the timeout path works, not the 30 s value).
- Not verified: the exact tail of the `npm run ci` build/fmt stage was not read in full; I relied on the vitest and cargo runs.

## Mistakes this round
- TS2741 from missing `voiceEnabled` in two test fixtures (fixed).
- Rust name clash `Manager` (fixed with `Manager as _`).
- Voice test leaked module-level `lastSafetyAt` between tests (added reset hook).

## Unverified on hardware / in the real client (user to test)
BLE connect/disconnect/reconnect race and listener generation, failed-connect cleanup, voice audibility and language on the real WebView2, over-limit repeat cadence, CSV export from the save dialog, splash handoff, OTA behavior.
