---
tags: [irms, calibration, mobility, safety]
date: 2026-10-15
summary: "Unified calibration implemented on feat/unified-calibration (S0-S8): signed knee with a hyperextension alarm, one wizard (Calibrate / Calibrate + mobility / Quick re-zero), profile storage (migration 10), method-keyed mobility trends, upright-zero gating. S9 (hardware gate) skipped. Nothing verified on a device; hyperextension tolerance 5 deg and wording need owner review."
---

# Unified calibration (2026-10-15)

Branch `feat/unified-calibration`, cut from `fix/ota-truncated-link-flow-control`. Spec: `doc/plans/2026-10-15-calibration-unified-plan.md`. Not pushed, merged or released; no version bump.

## Stages and commits
| Stage | Commit | Content |
|---|---|---|
| S0 | `cbfeba1` | Adopt the plan, mark the A/B/C plans superseded |
| S1 | `7a268c1` | Record calibration method and reference in settings and the session snapshot (store persist v19) |
| S2 | `c3e655b` | Vector IMU simulator and characterisation tests for strategies A, B, C |
| S3 | `ab3152b` | Unified calibration core (`calibrationCore.ts`) with simulator property tests |
| fix | `403c5eb` | Quick re-zero reference orthogonalised against the stored hinge axis |
| S4 | `e1508f2` | Signed knee runtime and the hyperextension safety path |
| S5 | `4c3921e` | `calibration_profiles` table and mobility method identity (migration 10, user_version 10) |
| S7 | `a4ec748` | Mobility trends keyed by method, explicit method break in the history |
| S8 | `67cb8bb` | Segment triggers and 3D/2D pose withheld unless the zero is upright |
| S6 | `dca007e` | Unified flow wizard, presets, quick re-zero, wearing check, entry points |
| S9 | skipped | Hardware gate, see below |

## Owner decisions applied
- Default zero is knee straight; a "cannot fully straighten" toggle records the reference as `neutral`.
- Hyperextension is a safety condition: the sign is kept, shown and alarmed, never clamped.
- Two-second wearing check before a session; a failing check asks, it never corrects silently.
- Segment triggers and 3D/2D pose are hidden unless the zero is upright (`zeroIsUpright`).
- One device is one patient. B's floor-bias correction was removed. Mobility peaks only suggest comfort angles: no code writes a comfort angle from a peak, so this holds by construction.

## For owner review: hyperextension
- Tolerance `HYPEREXTENSION_TOLERANCE_DEG = 5` in `services/movementMetric.ts` (proposed value, not clinically validated). Below -5 deg signed knee the alarm fires.
- zh-Hant banner: `⚠ 膝蓋過度伸直 {deg}°,請放鬆,不要向後頂`; voice: `膝蓋過度伸直,請放鬆`.
- en banner: `⚠ Knee hyperextended {deg}°. Relax it, do not push backward`; voice: `Knee hyperextended, relax it`.
- Question: is 5 deg right, and is "do not push backward" acceptable wording for patients with a naturally hyperextended knee?

## The flow (S6)
- `services/calibrationFlow.ts` is the pure state machine (presets, skip rules, re-capture clears movements, solve and evaluate, quick re-zero, mobility record). `services/calibrationRuntime.ts` holds the IO (stored profile lookup, still sampling, wearing check). `components/CalibrationFlow.tsx` is the UI.
- Presets: Calibrate only (reference, knee, hip flexion), Calibrate + mobility (adds hip extension and abduction, optional mobility record with schema 2 identity), Quick re-zero (needs the stored profile of the applied calibration).
- Knee flexion is mandatory; skipping hip flexion gives a shin-only profile (thigh not compensated, flagged in the review).
- Reference step auto-captures after 1.5 s of stillness (one automatic try per step, then the manual button). Voice cues use `speak`. Movement steps use a manual button; hands-free for movements was not built.
- A disconnect or a session start closes the flow and writes nothing; settings and the DB are written only on Apply.
- Euler firmware or a truncated link drops into the old wizard A.
- Settings: method / reference / quality summary, Calibrate and Quick re-zero buttons, and a developer toggle that reveals the legacy A and B wizards and the legacy mobility wizard.
- Pre-session check (SessionDock): 2 s still sample vs the stored reference via `checkReference`; `rezero` or `recalibrate` verdicts ask "start anyway?". Skipped for demo mode, legacy calibrations, and an inconclusive (moving) window.

## Design notes
- `calibration_profiles` in migration 10 is simpler than the plan: `id, createdAt, side, profile (JSON), active`. The JSON carries everything else.
- Old mobility rows are tagged schema 1 with their side copied from the detail JSON (see QA fixes), so the trend never mixes methods or sides.
- The gyro-fusion benefit cannot be demonstrated in the simulator (it models no out-of-plane disturbance), so only that it does not hurt is tested.

## Tests
- Full CI at the end: `npm run ci:frontend` (typecheck, vitest 61 files / 599 tests, vite build) and `npm run ci:rust` (fmt, cargo test 101 passed / 3 ignored, clippy -D warnings) all exit 0.
- Flow tests: 18 pure tests in `calibrationFlow.test.ts` (simulator-driven solve, skip rules, re-capture, re-zero) and 6 component tests in `CalibrationFlow.test.tsx` (presets, side gating, no stored profile, legacy branch, disconnect and session-start write nothing, reference capture to knee step).

## Not verified on a device (no hardware this session)
Goniometer accuracy of the signed knee; the parallel-hinge assumption with real straps; real `V:` / `G:` bandwidth and the gyro path; hip vs pelvis compensation; strap slip behaviour; replay of recorded real data; Android behaviour (iOS paused); roll sign on a device (`rollVerified` stays honest); gyro fusion benefit under real disturbance; the wearing-check thresholds (5 deg in-plane, 10 deg out-of-plane) on real wear.

## Gaps against the spec
- Staleness banners for side change, protocol change and firmware version change are not built: the store has no live firmware version and no separate side setting to compare. Only the pre-session wearing check is implemented.
- A separate `ERR` sensor state is not detected; bad vectors make the capture fail and nothing is written.
- Hands-free capture applies to the reference step only.

## S9 (skipped)
The hardware gate: bench check against a goniometer and real-strap tests. It needs the device and a human; skipped by instruction. Until it is done, the unified method should be treated as unverified on hardware.

## QA fixes
Each bug was reproduced by a failing test first, then fixed.
- BUG1 (safety): editing the advanced fold set `calibrationMethod` to `manual`, which dropped the signed knee and the hyperextension alarm. The fold's fields and the legacy quick zero are now locked on a unified profile, with a note pointing to Calibrate / Quick re-zero. Also covers RISK5 (the old quick zero skipped the off-plane check and left the stored profile stale).
- BUG2 (safety): a truncated BLE link drops `V:`, so the knee came from unset Euler zeros and was always positive. `applyCalibration` now returns a NaN knee for a unified profile without the needed vectors, the BLE handler drops that sample, Start is blocked (`unifiedNeedsVectors`) and `startSession` refuses.
- RISK4: Apply writes the profile first and changes the live settings only on success; a failed write keeps the flow open with an error. A failed mobility-record write after a good profile write is reported separately.
- RISK6: `zeroIsUpright` is false for a shin-only unified profile (no thigh frame).
- RISK3: the wearing check names the reference posture before sampling (declining cancels the start), and an inconclusive reading asks "start anyway?" instead of starting silently.
- NIT: migration 10 now tags existing mobility rows schema 1 and copies `side` from the detail JSON. Migration 10 was never in a release (no tag contains it, branch unpushed), so it was amended in place. A dev database already at version 10 will not re-run it.
- Tests after the fixes: vitest 64 files / 611 tests, cargo 101 passed / 3 ignored (migration test rewritten), tsc, fmt, clippy and build clean.

### Still open (need hardware)
- RISK7 and RISK8 were not addressed; both need a device to reproduce or confirm.
