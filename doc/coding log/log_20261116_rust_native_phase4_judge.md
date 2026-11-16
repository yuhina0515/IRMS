---
tags: [irms, rust, port, judging]
date: 2026-11-16
summary: "Phase 4 first slice: the main metric, coaching guidance and rep state machine are ported from TypeScript into IRMS_Core (judge.rs) with their tests; the native prototype now judges with them."
---

# Rust-native plan: Phase 4, judging logic ported (2026-11-16)

Follows [[log_20261116_rust_native_phase3_core_slice1]].

## Ported

`IRMS_Core/src/judge.rs` is a port of three TypeScript services:

| TypeScript | What it is | In Rust |
|---|---|---|
| `movementMetric.ts` | normalises the three trigger types to one "larger is closer" metric; zone and rest threshold | `compute_metric_sample`, `compute_metric_zone`, constants |
| `guidance.ts` (`computeGuidance`) | what the user should do now | `compute_guidance` -> `Guidance` enum |
| `triggerEngine.ts` | rep state machine: strict entry, hysteresis, exit grace, continuity guard, rest gating, personal range and hyperextension alarms | `TriggerEngine` |

Constants, branch order and behaviour are kept. Two deliberate differences: the engine returns a list of
events from `handle` / `reset` instead of calling injected callbacks, and the receive time is a parameter
instead of an injected clock.

Not ported: `metricInfo` labels and `guidanceText` (they belong to the translation layer, which the core
does not have yet). The prototype carries its own zh-Hant wording for now, copied from `zh-Hant.ts`.

The TypeScript files remain the reference while the Tauri app ships. A change to either side must be made
on both; nothing enforces that yet (a shared fixture file, like the packet fixtures, would).

## Tests

37 tests in `judge.rs`, ported case by case from `movementMetric.test.ts`, `guidance.test.ts` and
`triggerEngine.test.ts` (several small TypeScript cases are grouped into one Rust test). Left out: the two
translation tests and the test that spies on `performance.now`. Added: one test for the hyperextension
dwell and clear margin, which those three files do not cover.

`cargo test` in `IRMS_Core`: 113 passed (76 before + 37). `cargo fmt --check` and
`cargo clippy --all-targets -- -D warnings` clean. All 37 passed on the first run, which is weak evidence of
equivalence on its own: the tests were ported by the same hand as the code. The stronger check, replaying
the same sample sequences through both engines and comparing event lists, has not been done.

## Native prototype judges with the core

`IRMS_App_Native` dropped its hand-written zone and hold logic. Per sample it now builds an `EngineInput`
from the parsed packet and the selected prescription, feeds `TriggerEngine`, and words the coaching band
from `compute_guidance`. All three built-in prescriptions work: knee flexion (Squat), thigh raise
(Straight Leg Raise), thigh extension (Backward Extension). The simulator moves the right segment for each,
the ruler and trend show the main metric with its zone, and the 2D and projected poses swing the thigh.
The personal comfort and limit angles recorded in Tools are passed to the engine as `AngleLimits`.

Checked by snapshot (`doc/plans/assets/2026-11-16-native-prototype/p4-*.png`): holding with countdown, rep
counted and "return to rest" with the remaining angle, extension and leg raise judged on the thigh metric.
Also fixed: session time and the simulator now advance by real elapsed time (the UI timer does not fire at
exactly 50 Hz, so the session clock ran slow).

Not checked: the personal-limit and hyperextension alarms on screen, a session with `--real-ble`, and any
comparison against the Tauri app running the same movement.

## Next in phase 4

`sessionController.ts` (606 lines, ties the engine to sessions, voice and storage), `calibrationCore.ts` /
`calibration.ts` (calibration maths, the prototype's wizard is still a stand-in), `angleMath.ts`,
`slipMonitor.ts`, `sessionAnalysis.ts`.
