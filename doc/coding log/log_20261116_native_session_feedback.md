---
tags: [irms, rust, slint, squad, session, calibration]
date: 2026-11-16
summary: "Ported native session feedback and Windows speech, verified ordered generation-scoped cleanup, and fixed cross-language unified hold continuity."
---

# Native session feedback migration

The owner requested continued feature migration with `$squad`. The full migration
goal remains active. Plan: [[2026-11-16-native-feature-parity-plan]]. Baseline
`2629926`; clean snapshot at
`C:\Users\Yuhina\AppData\Local\Temp\irms-native-port-20261116-2629926`.

Three independent read-only workers (`controller`, `mobility`, `native_ui`) used
the inherited current Codex model, no overrides or fallback. Only the lead edited,
ran verification and prepared delivery. The controller worker also reviewed two
subsequent implementation revisions.

## Findings and disposition

| Finding | Result |
|---|---|
| Native counters had no LED/GOAL/alarm command path | Accepted: core `SessionFeedback` effects feed one ordered output worker. Idle LED feedback does not count reps or sound alarms. |
| Missing alarm mute/rearm and speech; incomplete stop/fault reset | Accepted: 30-second mute, safe-return rearming, immediate/eight-second safety cues, three-second safety priority, stop/fault OFF, Windows SAPI speech and a voice toggle. Saved speech follows DB success. |
| Native configuration bypassed TypeScript bounds | Accepted defense: normalize effective parameters and persist those same values. Invalid fallback and rounding are tested. |
| Manual disconnect raced queued OFF; stale close skipped failed cleanup | Accepted: queue disconnect after OFF, block samples during disconnect, and unconditionally clean the retained current handle on final close after the queue drains. |
| Failed disconnect discarded the retry handle | Accepted: preserve the handle under the peripheral lock for retry/replacement. Old feedback cleanup cannot retire a newer generation. |
| Idle mounting checks; stale hold display after RestCompleted | Accepted: monitor only running sessions using the feedback clock; returning to rest clears progress. |
| OS BLE operation could stall indefinitely | A 15-second watchdog reports the wait without dropping the live future/ownership lock or starting overlapping cleanup. Actual OS completion remains a hardware gate. |
| Unified held peaks bridged missing packets | Accepted in TS/Rust: reject invalid/nonincreasing clocks and split at gaps over 250 ms. Later continuous plateaus can succeed; shared fixtures check the inclusive boundary. |
| Prescription controls inert; preferences/review/export/mobility incomplete | Verified remaining migration work, queued for following slices; not claimed complete. |
| Real-device settings hard-coded simulator identity | Accepted: bind BLE device name and explicitly mark real firmware updating unported. |

The mobility worker corrected its four-sample gap example: it already failed the
sample count gate. The verified ten-sample times
`0,40,80,120,160,200,240,280,320,2000` previously passed a false two-second hold.
The active Tauri mobility flow uses unified calibration's 1.5-second hold, distinct
from the legacy developer wizard's two-second hold. They were not substituted.

## Verification

- Core: **135 passed**, including six feedback/normalization tests, generation
  retirement and failed-disconnect retry. Shared calibration fixtures replay in Rust.
- Native: **6 passed**, including full packet/calibration/judging/storage cycle,
  rest reset, effective snapshot values, write/end recovery, queued close after
  failed cleanup, and watchdog preservation of the running operation.
- Frontend: typecheck, **722 tests / 75 files**, production build passed. Expected
  error-boundary stderr and existing chunk/lazy-import warnings are not failures.
- Tauri Rust library: **43 passed, 3 ignored** (external live checks). Core/native/
  Tauri library Clippy passed with warnings denied. Native locked release built.
- Native release with default software rendering and isolated temporary DBs:
  normal close saved **1 demo rep and 398 readings**. Display settings loaded a
  Traditional Chinese system voice; playback was disabled for unattended smoke
  tests, so acoustic output is not claimed verified.
- A simulated limit crossing displayed the mute controls. The
  [alarm](../plans/assets/2026-11-16-native-feedback/feedback-alarm.png) and
  [voice settings](../plans/assets/2026-11-16-native-feedback/feedback-settings.png)
  snapshots were visually inspected. Real-mode idle (no BLE connection attempted)
  exercised asynchronous shutdown and exited successfully.
- `npm.cmd test` failed in its child shell despite a working Node executable;
  checks used explicit installed Node and local Vitest/TypeScript/Vite entrypoints.
  A new snapshot assertion initially picked an older same-time session; the test
  now identifies the newest inserted ID. No production ordering change was inferred.

## Handoff

Development source after beta.1; published beta.1 assets/updater manifests remain
unchanged. Physical BLE outputs, reconnect, acoustic speech and real movement
acceptance remain unverified. A live OS operation can still wait, with watchdog
status shown; it is not cancelled merely because observation timed out.

Next: prescription CRUD/confirmation and persistent preferences, then the unified
mobility flow with profile/record/trend identity. Continue remaining platform
services, translations, history export, module design and device acceptance. The
overall migration goal is not complete.
