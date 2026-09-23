---
tags: [irms, review, status, tauri]
date: 2026-09-24
summary: Current baseline passes CI; review identifies BLE disconnect, OTA lifecycle, and Session persistence/concurrency defects.
---

# IRMS status and code review — 2026-09-24

## Scope and baseline

- Requested work: summarize project status and inspect existing code. No production-code fixes, firmware flashing, release, commit, or remote issue changes were performed.
- Local branch: `main`, HEAD `6352a41` (2026-09-21); working tree was clean before this review.
- Active desktop implementation: `IRMS_App_Tauri`, package/Cargo version `1.2.0-beta.10`. Electron `IRMS_App` is retained historical code.
- Inspected project rules, recent history, status/roadmap, Tauri Session/BLE/OTA flows, their UI callers and tests, matching firmware handlers, and the installed btleplug 0.11.8 Windows backend.
- This is a targeted review, not an exhaustive audit of every source file or a hardware acceptance run. Remote issue/release/CI state was not queried. Device availability and teammate responses are not confirmed by this review.

## Validation performed

`npm run ci` completed with exit code 0:

- TypeScript typecheck; 337 frontend tests in 31 files; production build.
- Rust formatting check; 50 Rust tests; Clippy with all targets/features and `-D warnings`.
- Non-blocking build warning: lazy-loaded Leg3D bundle is 548.09 kB minified (137.03 kB gzip).
- Evidence: [full CI output](../review-evidence/20260924/ci.log).

Three additional temporary fault/concurrency tests were executed against the unchanged implementation. All three failed their desired-behavior assertions, confirming findings R2 and R5. These are review reproductions, separate from the passing baseline suite. The temporary file was removed from `src` after execution; its exact contents and output are retained:

- [reproduction source](../review-evidence/20260924/review20260924.test.ts.txt)
- [reproduction output](../review-evidence/20260924/session-repro.log)

To repeat, copy the source to `IRMS_App_Tauri/src/services/review20260924.test.ts`, run `npx vitest run src/services/review20260924.test.ts` from the Tauri directory, then remove that temporary copy. Expected current result: 3 failed assertions. The mocks simulate IPC failure/delay; this is not a disk-full or hardware test. The localStorage warnings come from the minimal Node test environment and are not the assertion failures.

## Findings, ordered by priority

### R1 — P1: Windows unexpected BLE disconnect does not drive the reconnect lifecycle

Location: `IRMS_App_Tauri/src-tauri/src/ble.rs:182-194`, connection setup at 197-236.

The only automatic disconnected event is emitted after the notification stream ends. The installed btleplug 0.11.8 Windows backend instead emits `CentralEvent::DeviceDisconnected` from its connection-status callback (`src/winrtble/peripheral.rs:368-385`). Its `notifications()` returns a subscription to `shared.notifications_channel` (552-554); disconnect does not drop that sender. The application retains the Peripheral in `BleState`, so physical disconnect does not imply stream closure. There is no adapter-event listener in the application.

Consequently power loss/out-of-range can leave the frontend connected and the Session running, without entering `attemptReconnect()` or its eventual Session cleanup. Stale-value UI cannot replace connection lifecycle handling. This is supported by application and installed dependency source inspection; it was not exercised on hardware today.

Fix direction: retain and monitor adapter events for the active peripheral, clear the matching handle, emit one disconnected transition, and cancel obsolete notification listeners. Test physical-link loss separately from manual disconnect and protect subsequent connections from stale events.

### R2 — P1: Session write failure is reported as successfully saved

Location: `IRMS_App_Tauri/src/services/sessionController.ts:314-334,353-367`; UI consumer `src/components/SessionControlPanel.ts:59-62`.

`endSession()` swallows `sessions.end` failure, clears the Session, and returns true. `flush()` also swallows `appendBatch` failure and restores readings to the buffer, but the caller then resets the Session and stops its timers. The next `startSession()` clears that restored buffer at line 287. The UI interprets true as “Session ended and saved.” Thus failed persistence can lose the last readings and still display success.

Reproduced twice with independently rejected end-write and final-batch IPC calls: expected false, received true in both cases. Preserve unsaved data with its original session ID, propagate save status, and permit retry before reporting success. Hardware feedback should be stopped promptly even if persistence stalls.

### R3 — P1: OTA subscribes to responses after sending their commands

Location: `IRMS_App_Tauri/src-tauri/src/ble.rs:303-318,387-402,436-450`.

`wait_for_ota_status()` creates a fresh broadcast receiver only when invoked. START and END are written and awaited before this helper is called. Firmware sends READY/DONE inside its write callback (`IRMS_Sensor/IRMS_Sensor.ino:181,195`), so the notification can be dispatched before the new receiver exists. Broadcast does not replay messages to future subscribers: a valid reply is then missed and the operation times out after 10/20 seconds. The START timeout also leaves the firmware in receiving state until abort/disconnect.

This is a source-confirmed race, not a measured frequency. Create the transaction receiver before sending START, consume status throughout transfer, and retain it through END. Include deterministic tests where the reply arrives before write completion, plus error cleanup.

### R4 — P2: OTA abort does not cancel the active transfer task

Location: `IRMS_App_Tauri/src-tauri/src/ble.rs:413-450,470-486`; `src/views/SettingsView.tsx:419-423`.

Abort only writes `OTA:ABORT`; the transfer loop has no cancellation token or operation identity and continues writing all remaining chunks and END. Firmware ignores chunks after abort and responds to END with NOT_STARTED. Meanwhile Settings clears busy/progress, but the old task can publish further progress and the UI permits another update. An old transfer can interfere with a new transaction through the same peripheral and status channel.

Fix direction: one active transaction, explicit cancellation acknowledged by the worker, stop further writes, consume ABORTED, and release the UI only after the old worker terminates. Verify abort during start, transfer, and finalization with a fake transport before hardware acceptance.

### R5 — P2: Concurrent Start calls create multiple Sessions and orphan timers

Location: `IRMS_App_Tauri/src/services/sessionController.ts:251-306`; `src/components/SessionControlPanel.ts:48-56`.

There is no starting guard in the controller or UI. `session.running` only becomes true after the start IPC resolves; double-click/shortcut overlap during that interval creates two DB sessions. Each completion starts timers, but the second overwrites the first timer handles and active session ID. One Session is orphaned and the first timers cannot be stopped through the stored handles.

Reproduced with a deferred start IPC and two concurrent calls: expected one call, observed two. Add a controller-level single-flight lifecycle and corresponding UI pending state, including revalidation if the device disconnects while start is pending. Ending also needs serialization because automatic disconnect and manual End can overlap.

## Existing acceptance gates, separate from new findings

- Local records still have no completed Tauri full-device E2E acceptance: connect, goal feedback, over-limit alarm, silence/re-arm, ERR recovery, unexpected disconnect/reconnect, persisted history.
- CAL-02 Roll changes require real-device deep-flexion regression. CAL-03 knee coordinate-frame reconciliation remains intentionally gated on hardware A/B evidence; this review does not authorize enabling the candidate formula.
- Capture complete `*HingeAxis`/`*ZeroAccel` settings with timestamped/labeled traces; the historical trace alone was insufficient for reliable replay.
- BLE OTA success/reboot and interruption recovery need real-device validation after R3/R4 are addressed.
- The 09-20 handoff says the device was coming back. Older “device unavailable” and “teammate has not responded” statements are historical, not newly verified current facts.

## Recommended work order

1. Correct R1 and R2 with transport/persistence failure tests.
2. Correct OTA response ownership and cancellation together (R3/R4); guard Session lifecycle (R5).
3. Re-run CI, then the existing hardware acceptance script with evidence capture; do not equate mock journeys with native BLE verification.
4. Run CAL-02/CAL-03 hardware regression/A-B gates before declaring calibration accepted.

## Documentation handoff

Added this report and preserved reproduction/CI evidence. Updated HOME and PROJECT_STATUS with this dated audit, and added a current Tauri entry point to the root README so its legacy Electron walkthrough is not mistaken for the active implementation. Production source remains unchanged; findings are open.
