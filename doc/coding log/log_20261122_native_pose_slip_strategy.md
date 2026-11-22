---
tags: [irms, native, calibration, slip, 3d-pose, mounting]
date: 2026-11-22
summary: Owner's list items 3-5 on the native app. Slip correction (calibrated vectors carried to the current hinge, 25 deg strap turn - knee error 2.57 to 0.07 deg), orientation-free wearing checked in simulation on six mounts, 3D pose view now uses pitch + roll of both segments; Mount v2 priorities updated. Simulator only, not released.
---

# Native: slip correction, free wearing orientation, 3D pose (owner's list items 2-5)

Owner's handwritten IRMS list (2026-11-22): (2) device and strategy adjustment, (3) 3D pose (now 2D),
(4) vector definition so the wearing position is not restricted, (5) correct strap slip by vector
displacement: compare the calibrated vector definition with the current vector state and let the
software correct. Item 1 (modules) is in [[log_20261122_native_builtin_modules_complete]].

## Item 5: slip correction

Before: `SlipMonitor` detected a shin sensor turn (hinge axis drift > 12 deg, held 18 s) and the app
said "這場結束後請重新校準".

Now:

- `IRMS_Core::slip_monitor::sweep_axis` returns the fitted hinge (signed to agree with the calibrated
  one) besides the reading; `axis_drift` is unchanged (TS fixture contract still passes);
  `SlipMonitor::observed_axis()` exposes the latest fitted hinge.
- `IRMS_Core::calibration::realign_limb(frame, observed)`: smallest rotation taking the calibrated
  hinge onto the observed one, applied to hinge and zero (Rodrigues), refused above
  `REALIGN_MAX_DEG` = 60 deg or for invalid input. Exact for a turn about the segment's long axis
  (perpendicular to the hinge). A tilt about the hinge itself is unobservable from a sweep and stays a
  constant knee offset, which `rezero_limb` removes (test proves both).
- Native `correct_slip`: on a slip report, realign the shin, restart the monitor on the new hinge,
  rebuild the wizard on the corrected profile (so a quick re-zero keeps the corrected hinge and stores
  it). Banner (warn tone): 「小腿感測器移位約 N°,已自動修正轉軸;起點若不準,結束後請快速重設零位」,
  voice cue `MountShiftCorrected`. Applied in memory during the session and stored as a new
  calibration (new id) when the session ends (`store_slip_correction`, added after the squad audit), so
  later session rows never carry a changed profile under the old id. Refused (old recalibrate warning)
  when the sweep span is below `REALIGN_MIN_SPAN_DEG` = 60 deg or the change exceeds 60 deg.
- Measured on the noise-free simulated rig (25 deg turn about the shin applied from t = 0, knee
  repetitions): reported after 20 s, drift 25.0 deg, worst knee error over five sampled poses about
  2.6 deg (up to about 2.8 deg between them) to 0.07 deg, shin roll 25 to 0 deg. A turn mid-session needs
  the 8 s window to refill plus the 18 s confirmation, so about half a minute. Shown in the running app with
  `--simulate --run --inject-slip 3` (snapshot at 40 s shows the banner).

Finding: a 25 deg turn about the shin costs only about 2.5 deg of knee (pitch error -2.4 at 30 deg, 0
at 90 deg, +1.9 at 110 deg) but 12 to 25 deg of roll. So the slip mostly corrupted the out-of-plane
part, which matters for the 3D pose (item 3).

## Item 4: wearing orientation is free

Already true by construction (unified calibration defines each sensor by its own hinge axis and
reference gravity); checked in simulation (noise-free): `calibration_works_for_any_sensor_orientation`
runs the real wizard logic for six mounts (identity, upside down, sideways, three arbitrary) and reads the
knee within 1 deg at hip 0/30 deg and knee 0 to 120 deg. Test-only `Rig::mounted` added.

## Item 3: 3D pose

The old 「立體投影」 drew the sagittal 2D leg on a projected grid (only knee + thigh pitch). Now the
button is 「3D 姿態」 and the leg is built from both segments' pitch and roll in their calibrated frames
(`segment_dir`, `leg3d_points`): hip abduction moves the knee sideways, a plain knee bend stays in
the plane (test). Label shows knee and both sideways angles. Gravity sensing gives no heading, so the
leg always faces forward; still a projection, consistent with D3 (no 3D engine).

## Item 2: device and strategy

Hardware stays out of the code (project rule: hardware work goes to issues). Strategy consequences
written into `doc/plans/2026-11-10-december-report-plan.md` §2: orientation does not matter, rotation
about the shin is now tolerated, so Mount v2 must above all stop the shin board rocking about the knee
hinge and the thigh unit creeping; acceptance step 5 now also checks the automatic correction.

## Verification

- Core: clippy clean, 199 tests (was 195): 4 `realign_tests`.
- Native: clippy clean, 54 tests passed, 1 ignored (was 51): slip detected and corrected during
  repetitions, any-orientation calibration, 3D pose sideways movement.
- Tauri crate (depends on IRMS_Core): clippy clean, 43 tests passed.
- Snapshots: slip banner in a running simulated session; 3D view during a session.
- Not done: any real device (thresholds and the correction are simulator-derived), not released.

## Squad audit and fixes (same day)

Plan `plans/2026-11-22-native-modules-slip-audit-plan.md`; workers W1-W3 eng-qa (sonnet), W4
audit-director (sonnet), W5 general-purpose (haiku). Fixed after verification:

- W2: the first realign test could not detect a missing or sign-flipped Rodrigues step (zero lay on the
  slip axis); added `a_tilted_reference_is_rotated_with_the_hinge` and confirmed it fails with the
  rotation removed. Near the 30 deg minimum span the axis fit is ill-conditioned, so automatic
  correction now needs a 60 deg sweep (`REALIGN_MIN_SPAN_DEG`); non-finite stored frames refused; voice
  cue now also asks for a re-zero after the session (a hinge-axis component of a mixed turn stays).
- W3: the 3D leg ignored the worn side; rolls are now signed outward with `profile.roll_sign`
  (`outward_rolls`), tested for both signs; "-0°" guard; thigh shows "—" without a thigh frame; Settings
  button renamed 「3D 姿態」.
- W4: the in-memory correction carried into later sessions under the old calibration id; now stored
  at session end with a new id. Doc wording corrected (simulation, latency, counts).
- Not fixed: a realigned frame keeps its original `source`/`warnings` (would need a new enum variant
  shared with stored profiles); a re-strapped leg after a correction still starts on the corrected
  hinge until the monitor re-corrects (the wearing check cannot see a hinge change); a test through
  `accept_sample` for the over-60 deg fallback.
- Counts after fixes: core 200 passed / 6 ignored, native 54 / 1 ignored, Tauri 43 / 3 ignored.
