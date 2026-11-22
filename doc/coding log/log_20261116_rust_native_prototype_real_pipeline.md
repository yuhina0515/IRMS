---
tags: [irms, rust, slint, prototype, calibration]
date: 2026-11-16
summary: "The native prototype now runs the real pipeline end to end on a simulated two-sensor rig: wire packet, parser, calibration wizard on gravity vectors, calibrated knee angle, rep judging, slip monitor, session analysis."
---

# Native prototype on the real pipeline (2026-11-16)

Follows [[log_20261116_rust_native_phase4_judge]].

## What changed

Until now the simulated device handed the prototype ready-made joint angles and the calibration wizard was
a progress bar. Now (`IRMS_App_Native/src/pipeline.rs`):

- The simulated device is two sensors strapped on at arbitrary angles the app does not know. It sends the
  firmware's wire text including the `V:` field (gravity direction seen by each sensor).
- The wizard captures those vectors and calls the core: `capture_reference` for the standing pose,
  `estimate_limb_frame` after the thigh raise for immediate feedback, `solve_profile` after the knee curl.
  The last page shows the solved profile's quality and what each sweep gave. In simulated mode the
  simulated wearer performs the movement each step asks for; with `--real-ble` the same code would take the
  vectors a device sends (not tried, no device).
- After calibration the knee angle is `knee_signed` on the profile and the live vectors, and the thigh
  angle is the thigh frame's pitch. Without a profile only the device's own Euler angles are shown and a
  session cannot start, as before.
- During a session the vectors feed `SlipMonitor`; when it reports, the coaching band shows
  "感測器可能移位,這場結束後請重新校準".
- `--calibrated` and `--run` no longer fake a profile: they run the same wizard logic on scripted movements
  before the window opens.

So one simulated sample now goes through: wire text -> `protocol::parse_angle_packet` ->
`calibration` (profile) -> `judge` (metric, engine, guidance) -> `slip_monitor` -> `session_analysis`.

## Checked

- Wizard by real mouse clicks from an uncalibrated start: reference captured (still RMS 0.4 deg, 109
  frames), thigh sweep, shin sweep, result page (quality medium, spans 60 and 80 deg), then "start session"
  became available and the angle display followed the simulated leg.
- `--run`: session judged on calibrated vectors; values view showed thigh 1, shin -19, knee 20, consistent.
- `--run --inject-slip 5` (shin sensor turns 25 deg on the leg five seconds in): the slip warning was on
  screen at 39 s. The same 40 s session without the injection showed no warning.
- Release build without warnings.

## Limits

- The simulated rig is ideal: no noise, bias or soft-tissue movement, so every sweep is perfectly planar
  (planarity 0.0 deg). It shows the pipeline is connected, not how calibration behaves on a leg. The
  project's noisy IMU simulator lives in TypeScript (`simulation/imuModel.ts`) and is not ported.
- No gyro in the simulated packets, so the profile quality never exceeds medium.
- The wizard's failure messages (shaking, sweep too small, reference off plane) are written but none was
  made to appear in a run.
- The profile lives in memory; nothing is stored or reloaded.
- Left leg assumed. Reference posture fixed to standing straight; the app's choices (neutral, sitting,
  lying) are not offered.
- Time to detect the slip (about 34 s after it happened) follows the monitor's provisional thresholds.

New flag: `--inject-slip S`.
