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

`cargo test` in `IRMS_Core`: 114 passed (76 before + 37 ported + 1 contract test, below). `cargo fmt --check`
and `cargo clippy --all-targets -- -D warnings` clean.

## Equivalence check against the TypeScript engine

The 37 ported tests passed on the first run, which says little by itself: the tests were ported by the same
hand as the code. So the two engines are now compared on shared data.

- `IRMS_App_Tauri/src/services/triggerEngine.contract.test.ts` builds seven sample sequences (420 samples
  each, deterministic generator): squat with and without a personal range, a gentle low-target movement,
  straight leg raise, backward extension, hyperextension around the tolerance, zero hold time. They contain
  tremor, spikes out of the zone, overshoot, 200 to 2800 ms gaps, repeated and backwards timestamps,
  non-finite clock readings and mid-sequence resets.
- Run with `IRMS_WRITE_FIXTURES=1` it writes `fixtures/engine-sequences.json`: every sample plus the events
  the TypeScript engine emitted for it and the phase afterwards. Run normally it checks the engine still
  reproduces the file, and that the file contains every event kind.
- `judge.rs` (`contract_tests`) replays the same file through the Rust engine and requires the same events
  in the same order, the same hold-progress values (within 1e-9) and the same phase after every sample.

Result: identical on all 2,940 samples. The check was shown to be sensitive: with `EXIT_GRACE_MS` changed
250 -> 200, and separately `HYSTERESIS_DEG` 4 -> 3, the Rust test failed at a named sequence and step; both
changes were reverted. Regenerating the fixture gives a byte-identical file.

From now on a behaviour change in either engine fails one of the two tests, which is what keeps the two
copies in step while the Tauri app still ships.

Covered by this check: `triggerEngine`, and `computeMetricSample` / `computeMetricZone` through it.
Not covered: `computeGuidance` (only its 11 ported unit tests).

## Full CI on this layout

`node_modules` was installed in this worktree (`npm ci`), so the project CI could run for the first time
since the core crate was split out:

| Step | Result |
|---|---|
| `npm run ci:frontend` (typecheck, vitest, vite build) | pass: 72 files, 714 tests |
| `npm run ci:rust` (core: fmt, test, clippy; src-tauri: fmt, test, clippy) | pass: 114 + 43 tests, 3 ignored |

Still not run: `npx tauri build`, the app itself on the new layout, the GitHub workflow, Android.

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

## Second port: session analysis

`IRMS_Core/src/session_analysis.rs` ports `sessionAnalysis.ts`: measured time without disconnect gaps,
peak, time-weighted mean, share of time in the target zone, and time and crossings past the personal comfort
angle and limit. The six vitest cases are ported and pass (core total 120). The optional analyser supplied by
a runtime module is not ported, because the module system has no design without a WebView (decision D2).

The prototype records the readings of a running session and shows these statistics in the History review
panel. Checked by clicking: a 15 s simulated squat session ended with 2 reps and the review line
"有效量測 15.4 秒 · 峰值 90° · 平均 60° · 目標區內 54% · 未量測舒適角度". The readings live in memory only.

## The Tauri app runs on the new layout

With `node_modules` and a real `dist`, the app was built from this branch
(`cargo build --release --features tauri/custom-protocol` in `src-tauri`, 9.5 MB) and started. Checked by
clicking: the window and all strings load, the prescriptions come from the database through the core crate,
"connect" goes through `irms_core::ble` and reports the adapter failure as "連線失敗", demo mode plays, a
session starts, counts a rep, ends, and appears in History (written through `irms_core::db`).

This run also used the real database on this desktop by mistake; see the correction in
[[log_20261116_rust_native_phase1_prototype]]. Its one demo session was removed with the other.

Not done: `npx tauri build` (installer, signing), a run against the ESP32, Android.
