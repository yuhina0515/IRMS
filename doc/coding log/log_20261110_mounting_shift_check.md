---
tags: [irms, calibration, mounting, session, safety]
date: 2026-11-10
summary: "In-session mounting check: detects a turned or tilted shin sensor from the axis of the knee movement itself, warns once and marks the session. Simulator-verified only; thresholds provisional."
---

# In-session mounting check (shin sensor shift)

Plan: `~/ClaudeConfigSync/planning/irms-2026-11-10.md` section 4.3. Branch `integrate/beta26`, local only.

## Problem

The owner reports that the sensors (hook-and-loop straps) sit differently on every donning and also
move during exercise. Unified calibration already checks the mounting before a session, in the
reference posture. Nothing noticed a sensor that moved during the session, so wrong angles were
recorded without any sign.

## Approach

While the thigh rests and the knee bends, gravity sweeps a cone in the shin sensor frame whose axis
is the knee hinge. `services/slipMonitor.ts` fits that axis over the last 8 s (mean-centred, so a
hinge that is not level still fits) and compares it with the calibrated `distalHingeAxis`.

- A reading needs at least 30 deg of sweep, a fit within 6 deg RMS, and a thigh that stayed within 8 deg.
- More than 12 deg of difference, sustained for 18 s (window plus 10 s), is reported once per session.
- `sessionController` runs it only during a session with a unified calibration on a real link. On a
  report it sets `session.mountShift`, shows a warning toast, speaks one cue, logs, and sends
  `mount_shift` telemetry; `session_end` telemetry carries the worst drift. The dashboard coach line
  shows a standing note. Nothing is corrected automatically.

## Limits (by construction)

- A tilt about the hinge axis itself (pure zero offset) is invisible; the pre-session check covers it.
- Only the shin sensor is judged. The hip is not a hinge, so a different sweep axis at the thigh is
  normal movement, and exercises where the thigh moves (squats) give no reading.
- A wearer who really moves the shin about another axis with a resting thigh (strong tibial rotation)
  would be reported as a shift. The wording therefore says "may have shifted".
- The mark is not stored with the session row (no schema change); it is in the log and telemetry only.

## Validation

- `slipMonitor.test.ts` (10 cases, IMU simulator with noise, bias and scale error): near-zero drift
  on 12 random mountings; a 20 deg turn measured as about 20 deg on the two visible axes and about
  0 on the hinge axis; no reading for small or still movement; level-independent fit; silent for 10
  repetitions unshifted; one report after a 25 deg shift, not before the confirmation time; a
  one-repetition disturbance is not reported; squats and leg swings give no reading.
- `sessionController.mounting.test.ts` (4 cases) through the real packet path: report once and mark;
  quiet when unshifted; off outside a session, in demo mode and for non-unified calibrations; mark
  cleared on the next session.
- An earlier draft used the uncentred plane fit from calibration B. A probe showed 16.5 deg of false
  drift for a leg held 15 deg to the side, which led to the centred fit (0.6 deg in the same case).
- Full run: `tsc` pass, Vitest 67 files / 658 tests pass, `vite build` pass. No Rust change.

## Not verified

No device data. All thresholds (12 deg, 18 s, 8 deg thigh stillness) are simulator-derived and must be
checked against the plan's acceptance test (section 4.4) with the real straps and with Mount v2:
false-alarm rate during normal sets, and whether a deliberately turned sensor is caught.
