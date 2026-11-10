---
tags: [irms, calibration, session, mounting]
date: 2026-11-10
summary: "In-session thigh sensor shift check: leg swings with a held knee are compared with the calibrated thigh-raise axis. 708 frontend tests pass; simulator only, no device."
---

# Thigh slip check

Continues [[log_20261110_beta26_software_round]] (shin check, plan section 4.3).

The shin check cannot judge the thigh because the hip is not a hinge. The thigh-raise axis (`proximalHingeAxis`) is
still meaningful when the knee is held and the whole leg swings in the sagittal plane (straight-leg raise).
`SlipMonitor(shinHinge, thighHinge?)` now also compares the thigh's sweep axis with that axis, only while the knee
angle spread stays within 8 deg over the window. Same thresholds, confirmation delay and one-report latch as the shin.
The knee angle comes from the session controller (`shin - thigh`). The warning text is now generic ("a sensor").

- Silent without a thigh axis, without a knee angle, or while the knee bends (tests).
- Tests: unchanged mounting silent over 4 seeds; a turned thigh sensor reported once.
- `tsc` pass, Vitest 708 pass.

Not verified: no device. The 8 deg knee-still limit and the reuse of the shin thresholds are provisional.
A turn about the hinge axis itself stays invisible, as for the shin.
