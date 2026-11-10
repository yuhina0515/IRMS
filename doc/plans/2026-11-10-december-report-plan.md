---
tags: [irms, plan, mounting, release]
date: 2026-11-10
summary: "Work order up to the December project-course report: merge order, device sessions, mounting improvement (self-locating knee sleeve) and its acceptance test."
---

# Plan up to the December report (2026-11-10)

Goal: by the end of November the system can be demonstrated reliably on the device, with measured
evidence to show in the report. A stable `v1.2.0` is welcome but not required; a device-verified
`beta.26` is enough.

## 1. Order of work

1. Device back with the owner. Every item below that says "device" waits for this.
2. Merge in order: PR #3 (beta.25) -> PR #4 (session save recovery) -> PR #6 (`integrate/beta26`).
3. Baseline measurement of the current hook-and-loop straps with the acceptance test in section 3.
4. Build Mount v2 (section 2) and repeat the acceptance test.
5. Device session A (about 1.5 h): connect, goal, over-limit, disconnect and reconnect, firmware OTA, raw stream.
6. Device session B (about 1.5 h): unified calibration against a goniometer or phone inclinometer
   (including a slightly hyperextended knee), wearing check and one-step re-zero, in-session mounting check.
7. Fix what the sessions show, set the provisional thresholds from the measurements, release `beta.26`.
8. Evidence for the report: session records, mounting before/after numbers, decision notes in the owner's words.

Out of scope until after the report: iOS, ESLint, code signing, multi-joint support, the rest of PR #5.

## 2. Mounting

Observed with the current mounting (thigh: ESP32 + IMU on a strap; shin: IMU on a strap): the position
differs at every donning, and the sensors move during exercise. The angles come from gravity tilt, so
sliding along the limb matters little; turning around the limb and tilting of the board are what
corrupt the pose.

Likely causes, to confirm on the device: the thigh is a soft cone and straps creep and turn; the thigh
unit is heavy and tall; the cable across the knee pulls the shin sensor at every bend; a flat board
rocks on a curved limb; fabric slides under a strap worn over clothing.

Mount v2: one elastic knee sleeve with a kneecap opening and silicone grip bands.

- The kneecap opening locates the sleeve, so both sensors return to nearly the same place at every donning.
- Thigh seat: outer side, lower third of the thigh. Shin seat: front-inner flat face of the tibia, a
  hand-width below the knee (bone under the skin, almost no soft tissue).
- Loop patches sewn at those two marked spots; the sensors keep their existing hook side. A curved
  cradle under each board stops rocking.
- Cable along the outer side with a slack loop at the knee, anchored at both ends.
- Worn on skin or thin tights, not over loose trousers.

Alternatives: a hinged knee brace with the sensors fixed to its two uprights (most rigid, bulkier,
could reduce calibration to a zero pose) if the sleeve is not enough; wider elastic straps with
silicone backing as a same-day stopgap; skin tape as a bench reference only.

Software that goes with it (all on `integrate/beta26`, simulator-verified only): wearing check before
a session, one-step re-zero for the donning difference, in-session check for a shifted shin sensor.
Software reports and re-zeroes; it does not replace a mounting that holds.

## 3. Acceptance test for a mounting

1. Reference posture, calibrate, note the zero.
2. 20 knee bends, 2 minutes of walking, 5 sit-to-stand.
3. Back to the reference posture: read the wearing-check residual (in-plane and out-of-plane, both sensors).
4. Take everything off, put it on again, repeat step 3 without recalibrating.
5. During step 2, note whether the in-session mounting check reported, and whether a deliberate turn of
   the shin sensor (about 20 deg) is reported within about half a minute of exercise.

Targets (provisional): residual within 3 deg after the exercise block, within 5 deg after re-donning,
no false report in a normal set. Run it first with the current straps: those numbers are the baseline
and show which failure dominates.

## 4. Risks

| Risk | Response |
|---|---|
| Device not back in time | Everything stays unverified; show the demo mode and say so plainly in the report |
| Mount v2 parts late | Strap upgrade first, same acceptance test |
| Unified calibration fails the bench check | Keep the legacy wizard for the demo, present unified as work in progress |
| Native BLE changes misbehave on the device | Revert the two BLE lifecycle picks on this branch, retest |
