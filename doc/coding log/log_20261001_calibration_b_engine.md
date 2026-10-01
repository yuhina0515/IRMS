---
tags: [irms, calibration, imu, squad, i18n]
date: 2026-10-01
summary: "Calibration B phase 1: gravity-only mounting solver (Horn + sagittal plane fit) and floor-stage accelerometer bias, reviewed by an opus/sonnet squad, 14 synthetic tests; no UI, no persistence, no real-device validation. Also the i18n two-stage review process."
---

# Calibration B engine + i18n review process (2026-10-01)

Branch `feat/calibration-b` in the new public repo (`_repo-migration/new-IRMS`). Plans: `doc/plans/2026-10-01-calibration-b-plan.md`, `doc/plans/2026-10-01-i18n-review-process.md`.

## Request (three parts)
1. Push everything unpushed: only the mobile-port log was missing. Done (see below).
2. i18n preliminary review by ChatGPT, then professional review: process doc written (prompt template, review sheet, clinician sign-off as a hard gate). The ChatGPT pass itself is not run.
3. Calibration B: engine only.

## What B is
`services/calibrationB.ts` outputs the same Settings fields as flow A (`*HingeAxis`, `*ZeroAccel`, flags, `kneeZeroRaw`), so `applyCalibration` is unchanged.
- Floor stage: accelerometer zero-g bias from up to six resting faces (first order, scale not observable from unit vectors).
- Worn stage: poses (standing, seated, supine, side-lying) with expected gravity vectors plus sagittal sweeps. Horn quaternion Wahba solve, hinge from plane fit (weight 2), outlier rejection above 15 deg, confidence tiers, left/right leg support.
- Hard limit: BLE carries only unit gravity vectors plus fused Euler angles. Yaw about gravity is unobservable, and real 6-axis gyro use needs a firmware `G:` packet (phase 3).

## Squad run
Lead snapshotted to the scratchpad and ran two read-only workers in parallel: R1 opus (math), R2 sonnet (poses/protocols).
- R1: core math correct (200 random rotations). Fixed: NaN crash, plane fit not refreshed after outlier rejection, floor-face tilt threshold 0.9 -> 0.995. Rejected: `kneeZeroRaw` "uses uncorrected vectors" (the code reads the bias-corrected set).
- R2: verified two real BUGs: right-leg frame was left-handed (hinge sign and side-lying wrong), and the shin sweep sign was hard-coded for standing (seated knee extension is opposite). Fixed with a `side` parameter, per-sweep `zSign` and a `signAmbiguous` warning. Also lowered lying/seated pose weights, plane fit from sweeps when >= 10 samples, `kneeZeroRaw` fallback 0.
- Not fixed, listed in the plan: long-axis rotation only constrained by sweeps and lying poses, `prone` in no protocol, hinge residual not an outlier candidate, `inconsistencyDeg` mixes noise and tilt.

## Verification
`tsc --noEmit` clean; full `vitest run` 49 files / 457 tests pass, including 14 new synthetic tests (25 random mountings within 5 deg under 1 deg noise + 3 deg wobble, outlier rejection, under-determined and contradictory failures, right leg, NaN, seated sweep sign, runtime `projectOntoHingeFrame` pitch, bias from six faces, tilted-face rejection). All synthetic; no real device, no wearer data.

## Problems during the run (mine)
- I first did the work inline and claimed to be in /squad without snapshot, workers, tests or log; the user called it out. This run follows the procedure.
- First engine draft did not compile (readonly literal typing in `jacobiEigen`, unused constant); found by typecheck, fixed.
- `node_modules` was missing in the new clone; `npm ci` fixed it.
- Earlier in the session I pushed `docs/mobile-port-plan-log` to the private archive repo by mistake; deleted that remote branch, recovered the log from reflog and pushed it to the new repo (commit 992036f).

## Still open
Wizard UI + zh-Hant/en strings for B, persisting bias in Settings and applying it at ingestion, R-based knee (CAL-03), gyro firmware, real-device validation, and the i18n ChatGPT + clinician review itself. Nothing here is verified on a patient.
