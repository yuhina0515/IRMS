# Calibration module B — plan (2026-10-01)

## Goal
A second calibration flow ("B") that stays accurate when the two IMUs are worn imperfectly
(rotated on the thigh, tilted by clothing, soft-tissue slip) and when the wearer cannot do the
standard standing sequence (balance-limited, seated, bed-bound). B outputs the **same Settings
fields** the runtime already consumes (`*HingeAxis`, `*ZeroAccel`, invert/verified flags), so
`applyCalibration` needs no change for the first phase.

## Known facts (verified in code, 2026-10-01)
- Packet = fused Euler angles + `V:` = two **unit-length** gravity vectors (firmware `imu.h`
  normalises `ax,ay,az`). Raw gyro rates are NOT transmitted; `gz` is discarded in firmware.
  Consequence: gravity direction is the only observable; rotation about gravity (yaw) is not.
- Existing flow A = 4 captures (stand / raise thigh / flex shin / optional abduction), hinge axis
  from one cross product of two averaged vectors. No redundancy, no way to detect a bad capture.
- Accelerometer zero-g bias is typically a few tens of mg (~2-3 deg on a unit vector) and is
  never corrected today.

## Design
### Stage F — floor plane + accelerometer bias (per IMU, device NOT worn)
Place the device on a flat floor, any face down. The floor normal is true vertical. Capture
unit vectors while the device rests on up to six faces (+/-x, +/-y, +/-z up; the wizard detects
which sensor axis is up from the reading, so the user does not need to know the axes).
For face e_i the measured unit vector is u_i = (e_i + b) / |e_i + b|, hence the components of
b perpendicular to e_i are observable directly (first order). One face gives 2 components of b,
two opposite faces ~4 observations, six faces give every component 4x redundantly.
Scale error is not observable from unit vectors (needs firmware magnitude) and is NOT claimed.
Output: bias b per IMU, residual after correction, confidence. Corrected vector = normalize(m - b).
Also acts as a sensor health check (stillness, antipodal consistency).

### Stage W — worn poses (per limb, gravity-only Wahba + plane fit)
Segment frame G: x = lateral (out), y = proximal along the long axis, z = anterior. Each pose
has an expected specific-force (world-up) vector in G:

| Pose | thigh | shin | Who can do it |
|---|---|---|---|
| standing straight | (0,1,0) | (0,1,0) | stands |
| seated, thigh horizontal, shin hanging | (0,0,1) | (0,1,0) | sits |
| supine, legs flat | (0,0,1) | (0,0,1) | lies |
| prone, legs flat | (0,0,-1) | (0,0,-1) | lies, tolerates prone |
| side-lying, worn leg on top | (1,0,0) | (1,0,0) | lies on side |
| sweeps (planar only) | x = 0 | x = 0 | any posture |

Sweeps are slow hip flexion (thigh) and knee flexion (shin) in any posture; every sample must lie
in the sagittal plane, so the plane normal (least eigenvector of the 3x3 covariance) is the
hinge axis, robust because it uses many samples instead of one cross product. Exact poses with
x = 0 also contribute planar samples. Solve R (sensor -> segment) with Horn's quaternion method
over: exact poses (weight 0.8-1) + hinge axis <-> e_x (weight 2). Both signs of the plane normal are
tried; the lower residual wins. Outliers (> 15 deg residual) are dropped while the problem stays
observable (max 2). Confidence: high (rms < 4 deg, >= 4 constraints), medium (< 8), else low.
Output: `hingeAxis = R^T e_x`, `zeroAccel = R^T e_y`. Pitch then equals the segment angle in the
runtime's own `projectOntoHingeFrame` with invert = false (hip flexion +, knee flexion = thigh - shin).

### Protocols (what the wizard asks, depending on ability)
- Standing (default): stand, hip sweep, knee sweep, supine, side-lying, seated.
- Seated: seated, hip sweep (seated knee lift), knee sweep (seated knee extension), supine.
- Bed: supine, side-lying, hip sweep (heel slide), knee sweep.
More captures than A on purpose: every extra pose is another constraint, so error averages out.

## Out of scope for phase 1 (listed, not hidden)
- Wizard UI + i18n strings for B (needs zh-Hant/en dictionary parity).
- Persisting `*AccelBias` in Settings and applying it at ingestion (touches CALIBRATION_KEYS
  and `CalibrationSnapshot`).
- Replacing runtime knee reconcile with R-based frames (CAL-03) — B gives R, so this becomes possible.
- Real gyro (6-axis) use: needs firmware to emit `G:` rates. Hinge-axis from angular-velocity PCA is
  stronger than gravity-plane fit; propose as phase 3.
- No real-device validation. Everything below is synthetic.

## Tasks
| ID | model | scope | focus |
|---|---|---|---|
| R1 | opus | `services/calibrationB.ts` math | sign conventions, Horn/Jacobi correctness, degenerate cases |
| R2 | sonnet | pose table + protocols | anatomical plausibility, clothing/soft-tissue, patient ability gaps |

## Review outcome (squad run, 2026-10-01)
R1 (opus, math) and R2 (sonnet, poses/protocols) reviewed a scratchpad snapshot.
Fixed after verification: NaN input crash (`invalidInput`), plane fit now re-run after outlier rejection and
uses sweeps alone when >= 10 samples, floor-face tilt threshold 0.9 -> 0.995, right-leg handedness
(`side` param, x medial, hinge target -x, roll invert), per-sweep `zSign` plus `signAmbiguous` warning,
lower pose weights for lying/seated, `kneeZeroRaw` fallback 0.
Rejected: R1 claim that `kneeZeroRaw` used uncorrected vectors (it reads the bias-corrected set).
Not fixed (known limits): rotation about each segment's long axis is only constrained by the sweep plane and
lying poses (supine external rotation of 15-30 deg is damped by weights, not removed); `prone` is in no
protocol; hinge residual is not an outlier candidate; `inconsistencyDeg` mixes noise and tilt.

## Done criteria
`npm run typecheck` + `vitest` green for the new test file; synthetic tests recover mounting for random
rotations under 1 deg noise + 3 deg per-pose soft-tissue wobble within 5 deg; outlier and
under-determined cases fail loudly, not silently.
