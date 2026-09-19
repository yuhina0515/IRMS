# Live calibration singularity guard

## Evidence

- Device: right leg, supervised standing / forward raise / knee flex / return-to-standing sequence.
- Standing repeatedly placed thigh Pitch near 75° and shin Pitch near 88–90°.
- In the same standing posture, shin Roll crossed large ranges and even changed branch while Pitch stayed near 90°.
- Knee flex and return were broadly reversible in Pitch, but Roll did not return to a stable baseline.

## Root cause

Firmware publishes two independently filtered Euler projections, `atan2(ay, az)` and
`atan2(ax, az)`. With the current vertical mounting, `az` approaches zero. Small noise or a
sign crossing therefore creates a large angle branch change before data reaches the app.
Offsets, inversion, one-degree-of-freedom axis rotation, and a learned 2D projection cannot
recover information already lost by the firmware filters.

## App-side change

- Added an opt-in `IRMS_CALIBRATION_TRACE` wire-packet trace for supervised diagnostics.
- Added baseline observability validation using reconstructed `|az| >= 0.1` for both sensors.
- The calibration wizard now refuses to save a misleading calibration in the singular region
  and explains that firmware with raw gravity-vector support, or corrected mounting, is needed.
- Added a regression case from representative real-device measurements.

## Verification

- `npm test -- --run`: 27 files, 290 tests passed.
- `npm run typecheck`: passed.

## Follow-up

Implemented immediately after the guard:

- Firmware now preserves normalized accelerometer vectors before `atan2` and appends both IMUs
  in a final compact `V:x/y/z/x/y/z` field.
- Keeping `V:` as the final field is deliberate compatibility behavior: released apps treat the
  unknown final extension as truncation but continue consuming the original angle fields.
- Both Rust and TypeScript parsers expose the vectors when present and discard partial vectors.
- Calibration capture uses 3D angular stability for new firmware instead of the singular legacy
  Euler fields. `applyCalibration` also prefers the vector path while retaining the old path.
- A vector round-trip test covers standing exactly at `z=0`, forward thigh raise, and knee flex.

Remaining hardware step: compile/flash the updated sketch and repeat the supervised movement
sequence. Arduino CLI is not installed in the current environment, so firmware compilation and
on-device validation remain pending.
# Follow-up: full vector-relative live angles

- Real-device verification showed the new 3D knee angle tracked a held flexion at about 60-70 degrees, while the legacy segment pitch values still could not return to zero.
- Added persisted rotated standing vectors for the proximal and distal sensors.
- THIGH/SHIN and their roll channels now use signed vector angles relative to the standing capture when vector telemetry is available; legacy firmware retains the Euler path.
- The smoother now preserves the independently computed 3D knee angle instead of overwriting it with the pitch difference.
- A live packet now repairs renderer connection state after Tauri HMR misses the one-shot connection event.

# Follow-up: physical IMU channel identification

- Isolated motion testing kept the external IMU flat while shaking the ESP32-mounted IMU.
- Only the firmware `S`/`0x69` vector moved; `T`/`0x68` stayed fixed. This proves the assembled device is `0x69 = thigh` and `0x68 = shin`, opposite the previous configuration comments and documentation.
- Swapped `ADDR_THIGH` and `ADDR_SHIN` so all emitted T/S and TR/SR fields match the physical limb segments, then synchronized the hardware documentation.

# Follow-up: hinge-axis calibration for arbitrary 3D mounting

## Root cause

After the vector round-trip and channel-swap fixes above, the user reported every
calibrated angle was still wrong on-device. Root cause: the vector fixes only replaced
*how* pitch/roll are computed (avoiding the Euler `atan2` singularity), not the
underlying mounting model. `rotateAccelerationVector`/`rotateRawAxes` still assume the
IMU's mounting face is known and only twisted around its own normal — a single degree
of freedom (`axisRotationDeg`). A dev-board zip-tied to a limb has no such guarantee;
the actual mount can tilt on any of the three axes. Earlier discussion with the user
had already concluded the fix needed to be orientation-agnostic ("build something like
a 3D space so any wearing method works"), but that conclusion was never implemented —
the code still carried the 1-DOF assumption forward into the vector path.

## Fix

- Added `deriveHingeAxis`/`projectOntoHingeFrame` (`angleMath.ts`): the joint's flexion
  axis in sensor-frame coordinates is solved directly as
  `normalize(cross(baselineVector, referenceMotionVector))` — no assumption about which
  sensor axis lines up with which anatomical plane. This axis is, by construction,
  perpendicular to the baseline vector, so `{hingeAxis, hingeAxis×baseline, baseline}`
  is already an orthonormal frame; projecting the live vector into it and reading
  `atan2(y,z)`/`atan2(x,z)` reproduces the existing pitch/roll convention for *any* 3D
  mount.
- `calibration.ts`: `buildCalibrationPatch` now branches — full accel vectors on all
  four captures go through the new `buildCalibrationPatchFromVectors` (hinge-axis path);
  anything else falls back to the untouched legacy `buildCalibrationPatchFromEuler`
  (still the 1-DOF `recalibrateAxis` path, for devices that haven't sent vector data).
  Settings gained `proximal/distalHingeAxis`; `proximal/distalZeroAccel` now store the
  raw (unrotated) baseline vector instead of a rotation-corrected one.
- `useStore.ts` `applyCalibration`: uses the hinge-frame projection whenever both
  `*ZeroAccel` and `*HingeAxis` are present, otherwise falls back to the Euler path
  (old calibration data without a hinge axis — self-heals on next wizard run). Knee
  angle no longer rotates the vectors first; `vectorAngleDeg` is rotation-invariant so
  the rotation step was always a no-op there.
- Removed `signedVectorAngleAroundXDeg/YDeg` (today's earlier singularity-guard
  functions) — superseded by the hinge-frame projection, no remaining callers.
- Wizard steps, capture flow, and invert/roll-invert sign detection are unchanged —
  only the "how do we know which physical axis is pitch/roll" derivation changed.

## Verification

- Added a synthetic round-trip test in `calibration.test.ts` that mounts the thigh and
  shin sensors at independent, compound X+Y+Z rotations (not reducible to a single-axis
  twist) and confirms standing still zeroes out and a 40°/-35° anatomical reference
  motion round-trips correctly — this is the scenario the old 1-DOF model could not
  handle, and the one the real device was hitting.
- `npm test -- --run`: 27 files, 303 tests passed. `npm run typecheck` and `npm run
  build` both pass.

## Follow-up

Not yet verified on the real device — needs another supervised session repeating the
standing / thigh-raise / knee-flex sequence with the updated app build.

# Follow-up: real-device verification — pitch fixed, roll still structurally fragile

## What was verified

Supervised session with lateral (外側, documented-correct) mounting, calibration wizard
run to completion, `IRMS_CALIBRATION_TRACE=1` capturing the full wire-packet stream for
offline replay against the exact settings object read from `localStorage`.

- **THIGH / SHIN / KNEE (pitch-derived values) are correct** with this mounting. Standing
  converges to ~0° on both limbs; front-raise and knee-flex track plausible magnitudes
  through the full range including deep flexion (~150°). This is the user's own
  assessment after visual verification on-device, not just the offline replay.
- **Roll values (thighRoll/shinRoll/kneeRoll) are not** — confirmed independently by
  replaying the trace: `shinRoll` swings to ±175–180° during deep knee flexion, while
  `thighRoll` stays small throughout the same session.

## Root cause of the roll instability

`projectOntoHingeFrame`'s `roll = atan2(x, z)` shares the same `z` (component along the
baseline/rest vector) that `pitch = atan2(y, z)` uses. As pitch approaches ±90° — routine
for knee flexion, not an edge case — `z` shrinks toward 0, and any residual `x` (the
motion's real, non-zero component off the assumed single hinge axis, from imperfect
axis estimation or genuine soft-tissue/strap coupling) gets divided against a
near-vanishing denominator and swings wildly. This is the same *shape* of bug as this
morning's original singularity (two angles sharing a denominator that some other angle's
motion drives toward zero) — moved from the sensor's raw Z axis into the new hinge
frame's baseline axis instead of eliminated. It is a structural property of any 2-angle
(pitch+roll) decomposition of a single 3D direction once one angle dominates (a
gimbal-lock-shaped degeneracy), not a typo-level bug — reducing the true off-axis
coupling (better hinge-axis estimation) pushes the onset later but cannot remove the
degeneracy at the limit.

The user separately found that mounting the sensor on the front face of the limb instead
of the side made "some values" read correctly where they hadn't before — consistent with
front mounting producing a cleaner (less off-axis-coupled) flexion capture, though this
was tested informally, not cross-verified against the trace.

## Decision (user, this session)

Do not keep patching this incrementally. The user wants a full redesign of the
calibration logic **and** the wizard's capture flow / movement instructions, not another
targeted fix — reasoning is that the model has been patched forward from the original
1-DOF `axisSwap` design through today's Euler-singularity guard, vector round-trip, and
hinge-axis rewrite, and still has an unresolved structural issue (this roll degeneracy).
Recorded here so the next redesign pass (GPT) has the full failure history instead of
re-discovering it:

1. Original bug: two independently-filtered firmware Euler angles (`atan2(ay,az)`,
   `atan2(ax,az)`) sharing `az`, branch-crossing near the singularity.
2. First fix (this morning): vector round-trip avoiding the Euler branch crossing,
   still carrying the old 1-DOF `axisRotationDeg` mounting-face assumption forward.
3. Second fix (this afternoon): `deriveHingeAxis`/`projectOntoHingeFrame` — orientation-
   agnostic hinge axis from baseline × reference-motion outer product. Fixed pitch
   (confirmed correct on-device with lateral mounting). Reintroduced the *same shape* of
   shared-denominator bug in the roll channel, because the 2-angle decomposition itself
   was carried forward unchanged.

What a redesign should probably not repeat: deriving orientation from exactly two mean
points (baseline, reference-motion endpoint) via a single cross product — this has no
redundancy to detect or reject real off-axis motion during the reference capture, and
any residual ends up amplified exactly where the app needs to work reliably (deep
flexion). A design that also needs to reconsider what "roll" should mean/how it should
be captured when the anatomical motion legitimately exceeds 90° pitch may be a better
starting point than trying to patch the current pitch/roll pair further.

Current code (`angleMath.ts`/`calibration.ts`/`useStore.ts` hinge-axis path) is left in
place — it is a net improvement (fixes pitch, the trigger-relevant value) and should not
be reverted, but should be treated as superseded once the redesign lands, not as the
final state.

## Additional note: manual Advanced Calibration tuning against the legacy Euler fields

User also hand-tuned Settings → Advanced Manual Calibration (the legacy
`proximal/distalZeroRaw` and `proximal/distalRollZeroRaw` fields, `rotateRawAxes`
path — not the new hinge-axis vector path) while watching the live 3D pose view, and
reports this reads correctly:

- Thigh Zero (raw°) `93.8217727758688`, Shin Zero (raw°) `90.116336448273`
- Invert Thigh: off, Invert Shin: on
- Thigh Roll Zero (raw°) `115.88702626632669`, Shin Roll Zero (raw°) `90.67009552222454`
- Invert Thigh Roll: off, Invert Shin Roll: on

Worth cross-checking during the redesign: whether these manually-found-good Euler zero
points are consistent with the lateral-mount hinge-axis vectors captured in the same
session (`proximalZeroAccel`/`distalZeroAccel`/`proximalHingeAxis`/`distalHingeAxis`
logged above), or whether the manual path is compensating for something the vector path
still gets wrong beyond the roll-degeneracy issue already identified.
