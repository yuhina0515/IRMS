# IRMS unified calibration plan (replaces strategies A, B, C; adopted 2026-10-15)

Date: 2026-10-15. Status: adopted by the owner on 2026-10-15 (section 8 decisions override section 7 proposals). Implementation lives on branch `feat/unified-calibration`; see `doc/coding log/log_20261015_unified_calibration.md` for what is done and what is unverified on device. No hardware was used.
Repo: `E:\Monitoring-and-IoT\_repo-migration\new-IRMS` (origin `yuhina0515/IRMS`), branch `fix/ota-truncated-link-flow-control` (contains `feat/calibration-b` and calibration C, beta.24 line).
Firmware: `E:\Monitoring-and-IoT\_repo-migration\new-IRMS-Firmware\IRMS_Sensor`.
Paths below are relative to `IRMS_App_Tauri/src` unless noted. Line numbers were read on 2026-10-15.

## 0. Core decision (one paragraph)

A, B and C all end up producing the same thing for each limb: a **hinge axis** `h` and a **reference gravity vector** `g0` (perpendicular to `h`) in that sensor's frame, plus a sign. They differ only in **where the evidence comes from** (A: two static points; B: four absolute body poses plus sweeps; C: one sweep per movement) and **which posture counts as zero** (A and B: standing straight; C: any relaxed pose). The unified scheme has one wizard and one solver:

1. **Mounting is solved from motion only**: slow sweeps (plane fit, plus gyro when `G:` exists), falling back to A's two-point cross product. No absolute body poses are needed, so B's standing/seated/supine/side-lying steps go away.
2. **Zero is an explicit, stored choice** (`referenceKind`): `straight` (knee straight, in any posture where the knee hinge is horizontal: standing, supine, long-sitting) or `neutral` (any relaxed pose, C-style). Every record and session snapshot stores which one was used, and trends never mix them.
3. **Knee = shin rotation minus thigh rotation**, both measured about their own hinge from the same simultaneous reference, **signed** (negative = hyperextension).
4. **The same sweeps that calibrate also measure mobility**: if the wearer holds the end position about 2 s, the held peak becomes a mobility record. Calibration and mobility are one flow with two outputs.
5. **Provenance first**: the method, reference kind, quality and firmware protocol go into the session snapshot before any math changes, so old and new data can always be told apart. Old numbers are never reinterpreted.

---

## 1. What A, B and C do today (evidence)

### A: standing-referenced wizard (default runtime path)
- Wizard `components/CalibrationWizard.tsx`: side choice (step 0), standing baseline (1), thigh raise (2), standing knee curl (3), optional one-leg abduction (4), preview/apply (5). Hands-free auto capture: `CalibrationWizard.tsx:230-296`. Capture is about 30 samples with an RMS stillness gate (`:152-191`, `CAPTURE_STD_LIMIT = 3` in `services/calibration.ts:26`).
- Math `services/calibration.ts`:
  - Vector path `buildCalibrationPatchFromVectors` (`:354-421`): hinge = `cross(baseline, moved)` (`deriveHingeAxis`, `angleMath.ts:221-226`), zero = the standing vector itself, invert from the direction of the reference movement, roll sign from abduction. Writes `*HingeAxis`, `*ZeroAccel`, `kneeZeroRaw`.
  - Euler path `buildCalibrationPatchFromEuler` (`:270-345`) for firmware without `V:`: one-DOF `axisRotationDeg` solve (`recalibrateAxis`, `:166-194`), invert, `*ZeroRaw`.
  - Quick re-zero `buildQuickZeroPatch` (`:431-449`): keeps the hinge axis, replaces the zero vector with the current one.
- Runtime `store/useStore.ts:746-808` `applyCalibration`: hinge-frame projection when the vectors and the hinge settings exist (`:749-752`, `:766-769`), otherwise the Euler path. Knee = `jointAngleDeg(thigh, shin)` = **absolute** difference (`angleMath.ts:81-83`). The fallback knee is the vector angle minus `kneeZeroRaw` (`useStore.ts:791-794`).
- Entry points: Dashboard (`views/DashboardView.tsx:283`), Settings (`views/SettingsView.tsx:217,264`). SessionDock reads `lastCalibratedAt` (`components/SessionDock.tsx:57`).
- Evidence: the only real-device result is the 2026-09-25 telemetry run `51e7fcbe` (knee 82-85° by projection vs 30° by the vector path; comment at `useStore.ts:782-786`).

### B: gravity-only mounting solve from many poses (beta)
- Wizard `components/CalibrationWizardB.tsx`: optional six-face floor stage (needs `G:`), then 4 **mandatory** poses (`POSES`, `:24`; `next()` `:137-139`), then thigh and shin sweeps (6 s each), then solve and apply.
- Math `services/calibrationB.ts`: Horn/Wahba rotation from pose priors (`POSE_EXPECTED`, `:22-28`) plus the sweep hinge (`fitPlaneNormal` `:160-176`, gyro `estimateHingeFromGyro` `:390-408`, `fuseHingeAxes` `:411-420`), outlier rejection, a confidence level. The patch (`:552-589`) writes the same Settings fields as A's vector path, with invert hard-coded false and roll invert from the side.
- The floor stage estimates accelerometer bias/scale (`estimateAccelBiasScale`, `:497-527`) and applies it **only to the captured samples** (`CalibrationWizardB.tsx:123-128`). `buildCalibrationPatchB` is called with `bias = undefined` (`:152`).
- Entry point: Settings beta button only (`SettingsView.tsx:221-228`).

### C: relative mobility record (separate from runtime)
- Wizard `components/MobilityWizard.tsx`: choose side and movements, a 2 s neutral capture (`:112-116`), then a 10 s sweep-and-hold per movement (`MOVE_SECONDS`, `:25`). Results are saved to `mobility_records` (`:151-167`). It never writes Settings.
- Math `services/mobilityC.ts`: per-movement plane-fit hinge (`:137-157`), neutral projected onto the sweep plane and rejected if more than 15° off it (`:159-166`), sign set by "largest excursion is positive" (`:168-174`), held peak = best median over a window of `HOLD_MIN_SAMPLES = 10` samples (`:38`, `:109-119`), gates for span, planarity, reference limb moved more than 10° (`:129-135`), plausibility. The knee uses the **shin only** (`MOVEMENTS.kneeFlexion`, `:25`). Hips use the thigh only (the value is a thigh tilt, not a joint angle).
- Storage: migration 9 `mobility_records(id, measuredAt, movementSet, totalDeg, detail JSON)` (`src-tauri/src/migrations.rs:167-183`). Trend: `components/MobilityTrend.tsx` uses `comparableTrend`, which filters on the movement set only (`mobilityC.ts:225-228`, `MobilityTrend.tsx:38`).
- Entry point: Settings → MobilityTrend (`SettingsView.tsx:229`).

### Shared plumbing all three depend on
- Firmware (`IRMS_Sensor/IRMS_Sensor.ino:369-373`): `T,S,K,TR,SR,KR,V:` at 25 Hz (`config.h:81`). `V:` is the **per-sample normalised raw accelerometer** (`imu.h:58-62`), with no filtering and no gyro fusion. Euler `T/S` are complementary-filtered (`imu.h:129-130`). `G:` (gyro in deg/s with the boot-time bias removed, plus raw g) is only sent after `CMD:RAW_ON` (`.ino:357-367`). The gyro bias is estimated once at boot (`imu.h:79-99`). The firmware stores no calibration (decision D1: all judgment happens in the app).
- Parser `shared/protocol.ts:168-253`: `V:` is the last field, so MTU truncation drops it first (sets `truncated`).
- Settings persistence: zustand `persist` to localStorage `irms-settings` (`useStore.ts:384,532-561`), so storage is per app install. There is no patient/user or sensor identity anywhere in `shared/types.ts`.
- The session snapshot = `CALIBRATION_KEYS` (`useStore.ts:220-256`), written to `sessions.calibration` (migration 6), exported verbatim in CSV (`views/HistoryView.tsx:78`). The snapshot is frozen during a session (`useStore.ts:472-484`).
- `sensor_data` stores **only calibrated angles** (`shared/types.ts:219-228`), so historic sessions cannot be recomputed.
- `angle_range_records` (migration 8) hold comfort/limit knee angles measured by the IRMS-Modules `angle-range` module on the live calibrated knee (`services/angleRange.ts`). Alarms and triggers read them.

---

## 2. Scenarios and inputs the unified scheme must handle

| Axis | Cases | Consequence for the design |
|---|---|---|
| Firmware stream | (a) `V:` vectors (current); (b) Euler-only legacy firmware; (c) `V:` + `G:` raw stream; (d) MTU-truncated link (Euler only, `truncated=true`) | (a) is the main path. (b)/(d) → "legacy firmware mode": only A's Euler solver, no mobility, banner suggesting OTA or reconnect. (c) adds gyro hinge fusion and a linear-acceleration gate (`abs(norm(raw g) - 1) > 0.1 g` → drop the sample). |
| Sensor/mounting | any 3D mounting, over clothing, thigh and shin mounted independently, straps slipping, re-donning | Hinge axes come from motion, so they are mounting-agnostic. Re-donning invalidates the calibration, so a pre-session reference check is needed (section 3.6). |
| Body/condition | can stand straight / cannot (contracture, pain, wheelchair, bed-bound, poor balance); knee can hyperextend | Zero kind `straight` vs `neutral`; posture choice (standing / long-sitting / supine / seated); no one-leg step required; signed knee. |
| Sides | left/right; side changed between runs | Side stored per profile and record. Roll/abduction sign derived from the side plus the flexion axis sign. A side change marks the calibration stale. |
| Movements | knee flexion (runtime-critical); hip flexion/extension/abduction (thigh tilt only); future joints | The movement registry carries the limb, the axis group and the expected sign. Hip extension shares the hip-flexion axis, so its direction is checkable. Abduction uses its own axis. |
| Observability | knee hinge vertical in the reference posture (side-lying), sweep too small or not planar, reference limb moved | Off-plane gate on the reference, span/planarity gates, reference-limb compensation plus a warning. |
| Signal quality | 25 Hz nominal; mobile BLE may deliver lower or bursty rates; packet loss; hardware `ERR:1` | All windows are **time-based** (`performance.now()` timestamps), with a minimum sample count. A hardware error mid-capture aborts that step. |
| App platform | Windows desktop (Tauri), Android APK (untested on device), iOS unsigned IPA; demo/simulator mode | The same TS code everywhere. Mobile needs hands-free (auto-capture plus voice cues) and keep-awake during the wizard. The simulator must emit `V:`/`G:` (today it emits Euler only, `services/simulation/encode.ts:32-39`). |
| Session state | wizard during a running session; disconnect mid-capture | The wizard is locked while a session runs (existing `calibrationLocked`). A disconnect cancels the step and keeps earlier steps. |
| Offline / OTA | no network; firmware updated via OTA; module updates independent of the app | Calibration is fully local, with no module dependency. The profile stores the firmware version and protocol. A protocol change marks it stale; a version-only change gives a soft "verify" prompt. |
| Identity | per app install today; one patient per install implied; no sensor ID | The profile is keyed to the install and the side. Multi-patient support is out of scope (open question Q4). The sensor identity is the BLE name plus the firmware version as best effort. |
| Legacy data | Settings from A-vector, A-Euler, B, manual edits, migrated Electron booleans; session snapshots without a method; C mobility rows (shin-only, unknown neutral); angle-range rows | Migration infers a method where possible, otherwise `legacyUnknown`. Old rows are tagged, never recomputed. Trends show a method break. |
| Consumers | live knee for triggers/alarms (`joint_angle`), `segment_elevation`/`segment_extension` (absolute thigh angle), 3D/2D pose, kneeRoll display, live share and the angle-range module, telemetry, CSV | A signed knee needs a compatibility field for modules. Segment triggers and absolute pose are valid only with `referenceKind = straight` and posture `standing`. |

---

## 3. Unified model

### 3.1 Data model

```ts
// shared/types.ts (new)
type CalibrationMethod = 'unified' | 'legacyAVector' | 'legacyAEuler' | 'legacyB' | 'legacyUnknownVector' | 'manual' | 'none'
type ReferenceKind = 'straight' | 'neutral'
type ReferencePosture = 'standing' | 'longSitting' | 'supine' | 'seated' | 'other'

interface LimbFrame {
  hinge: V3            // unit, sensor frame; sign fixed so that the defining movement reads positive
  zero: V3             // reference gravity, made exactly perpendicular to hinge
  source: 'sweep' | 'sweepGyro' | 'twoPoint' | 'poses' | 'legacy'
  spanDeg: number | null
  planarityDeg: number | null
  gyroAgreeDeg: number | null
  abductionAxis?: V3   // thigh only, when an abduction sweep was done
}

interface CalibrationProfile {
  schema: 1
  id: string                         // uuid
  method: CalibrationMethod
  createdAt: string
  side: 'left' | 'right'
  protocol: 'vector' | 'euler'
  firmware: { version: string | null; rawStream: boolean }
  reference: { kind: ReferenceKind; posture: ReferencePosture; thigh: V3; shin: V3; stillRmsDeg: number }
  limbs: { thigh: LimbFrame | null; shin: LimbFrame }   // thigh null = shin-only (knee then falls back, see 3.2)
  rollSign: { thigh: 1 | -1 | null; shin: 1 | -1 | null } // null = not verified
  quality: { level: 'high' | 'medium' | 'low'; warnings: string[] }
}
```

- **Settings stay the compiled runtime form.** The existing flat fields (`*HingeAxis`, `*ZeroAccel`, `*Invert`, `*RollInvert`, Euler fields) remain so `applyCalibration` and old snapshots keep working. Five fields are added to `CALIBRATION_KEYS` (so they go into the snapshot, the CSV and telemetry automatically): `calibrationMethod`, `calibrationId`, `referenceKind`, `referencePosture`, `calibrationQuality`. `firmwareProtocol` also goes into the snapshot.
- **The full profile is stored in the DB** (new table, migration 10) for audit and so the History view can show "calibrated how" for each session. Settings keep only the compiled active profile.
- **Mobility record** (C) becomes `MobilityRecord v2`: `{ schema: 2, side, referenceKind, posture, calibrationId, movements: [{ id, peakDeg, holdSec, spreadDeg, reps: number[], quality }], totalDeg }`. The trend key is `(movementSet, side, referenceKind, posture, schema)`.

### 3.2 Algorithm

All math lives in one pure module, `services/calibrationCore.ts`. It reuses `fitPlaneNormal`, `angularSpanDeg`, `estimateHingeFromGyro`, `fuseHingeAxes` (moved from `calibrationB.ts`) and `projectOntoHingeFrame`.

1. **Conditioning.** Each frame has `{ t, thigh V3, shin V3, gyro?, rawG? }`, timestamped on arrival. With `rawG`, drop frames where `abs(norm(rawG) - 1) > 0.1` (linear acceleration). Without it, keep the frames but cap the sweep speed via instructions. Bias correction is **not** applied (see W4-1 resolution). If it is ever re-added, it goes in this single function so capture and runtime see the same vectors.
2. **Reference capture.** Both limbs are still for at least 1.5 s (time-based, at least 15 frames), with RMS angular spread ≤ 3° (A's limit). Store the mean vectors, `kind` and `posture`.
3. **Hinge per limb** (from the sweeps):
   - plane fit of the sweep samples plus the reference vector. Span must be ≥ 25° and planarity ≤ 10° (C/B gates).
   - with gyro: fuse when dominance ≥ 0.75 and agreement ≤ 15° (B's constants).
   - fallback: if the span is 20-25° or the planarity fails but the two endpoints are clean, use `cross(reference, endpoint)` (A's two-point method), marked `twoPoint`, quality ≤ medium.
   - Thigh hinge from the hip-flexion sweep (or A's thigh-raise). Shin hinge from the knee-flexion sweep.
4. **Reference orthogonalisation.** `zero = normalize(ref - (ref·h)h)`. Reject if the reference is more than 15° off the plane (the hinge is near-vertical in that posture, so the angle is unobservable). Tell the user to pick another posture. This also fixes quick re-zero (finding X1).
5. **Sign model (direction).** Each axis group has one *defining movement*: shin → knee flexion, thigh → hip flexion. Orient `h` so the defining movement's largest excursion is positive (C's rule, which is safe for knee flexion because the range is one-sided apart from hyperextension). Every other movement on the same axis has an expected sign: hip extension must peak **negative**, otherwise `wrongDirection`. Abduction axis: the expected lateral direction is `side`-dependent, `lateral = (side === 'left' ? +1 : -1) * (hThigh × zeroThigh)` style. The exact formula must be pinned by simulator tests before use. This replaces A's abduction roll-invert step and B's side-based roll invert.
6. **Runtime angles.** `thighFlex = pitch(projectOntoHingeFrame(v, hThigh, zThigh))`, the same for the shin. **Knee = shinFlex - thighFlex** (sign oriented so flexion is positive), *signed*. Roll as today (`asin` out-of-plane). This equals the current hinge-framed knee when the axes are parallel, but keeps the sign and removes `abs` (finding X3).
   - Shin-only profile (thigh hinge missing): knee = shinFlex, and the dashboard shows "thigh not compensated".
   - The parallel-hinge assumption (thigh and shin hinges point the same way in the world) still holds. The 09-15 stationary-segment check was inconclusive (`doc/calibration-evidence/20260915/README.md:35-71`). `reconcileToReferenceFrame` stays unwired until the device check in section 5.
7. **Held peak (mobility).** Time window `HOLD_SEC = 1.5` (UI says "about 2 s"), min(rate×1.5, 10) samples, spread ≤ 4°. Peak = the best median. For the knee, the peak is computed on `shinFlex - thighFlex` (finding W4-7). Optional repeats: 2 reps; if they differ by more than 5°, ask for a third; record the median rep.
8. **Quality.** `high` = sweep + gyro, span ≥ 40°, planarity ≤ 5°, reference RMS ≤ 2°. `medium` = sweep only, or two-point with clean endpoints. `low` = anything that passed the gates with warnings. A `low` profile can be applied, but it shows a persistent chip, and mobility records saved under it carry the flag.

### 3.3 Wizard state machine (single flow)

```
Prepare ──(connected, no session, protocol detected)──▶ Reference
  │ legacy firmware/truncated ─▶ LegacyEuler (A's Euler steps only) ─▶ Review
Reference ──still ok──▶ Movement[i]          (i over the chosen plan; knee flexion is always first and mandatory)
  ▲   │ fail: shaking/offPlane ─▶ Reference (retry)
  │   ▼
Movement[i] ──ok──▶ Movement[i+1] | Solve
  │  fail (span/planar/noHold/wrongDirection/refMoved) ─▶ Movement[i] (retry, reason shown)
  │  skip (only optional movements) ─▶ Movement[i+1]
  └─ "Re-capture reference" ─▶ confirm (clears all movement results) ─▶ Reference
Solve ──ok──▶ Review (live preview with signed knee, per-limb quality, warnings)
      └─fail─▶ Movement[k] that caused it
Review ──Apply──▶ Applied (Settings compiled + profile row; optional mobility record)
       └─Discard─▶ closed, nothing written
Any state ──disconnect/ERR/session start/cancel──▶ closed; nothing written unless Applied
```

- **Plan presets:** "Calibrate only" = reference + knee flexion + hip flexion. "Calibrate + measure mobility" = the same plus the user's chosen hip extension/abduction, with holds. "Quick re-zero" = reference only, keeping the axes and re-orthogonalising; allowed only if the profile is `unified` and the side is unchanged.
- **Hands-free:** auto-capture on stillness (A's mechanism, one auto try per step) plus voice cues ("hold... done") through the existing `speechSynthesis` cue service. This matters on a phone.

### 3.4 Storage and migration of existing records

| Existing data | Migration | Display |
|---|---|---|
| Settings with `*HingeAxis` and `proximalInvert=false && distalInvert=false && both RollVerified` and zero ⟂ hinge exactly | `legacyB` (heuristic; a matching A result is possible but unlikely; marked heuristic) | "Calibrated with older method B" chip + suggest recalibration |
| Settings with `*HingeAxis` otherwise | `legacyAVector` | chip "older method", runtime unchanged |
| Settings with Euler fields only and `lastCalibratedAt != null` | `legacyAEuler` | unchanged |
| Defaults with `lastCalibratedAt == null` | `none` | uncalibrated |
| Manual edits after a wizard | cannot be detected retroactively. From now on, the manual-edit path sets `manual` | — |
| `sessions.calibration` snapshots without `calibrationMethod` | **untouched**. The UI derives the "legacy, method unknown" label at read time | History shows the label; drift check unchanged |
| `sensor_data` | untouched (calibrated angles only, not recomputable) | — |
| `mobility_records` (C, v1) | migration 10 adds nullable columns `schema, side, referenceKind, posture, calibrationId`. Old rows get `schema=1`, `side` copied from `detail.side` if present, others NULL | trend groups v1 rows separately, with the note "older measurement (shin only, starting pose unknown)" |
| `angle_range_records` | untouched | — |

- Persist: bump `SETTINGS_PERSIST_VERSION`. `migratePersisted` infers `calibrationMethod` as in the table. The existing shallow-merge caveat (`useStore.ts:535-541`) applies, so add migration fixtures for every legacy shape.
- DB: migration 10 creates `calibration_profiles(id TEXT PK, createdAt, method, side, referenceKind, posture, quality, profile JSON)` and adds the mobility columns. It is forward-only, like the earlier ones.

### 3.5 What the UI exposes
- **One entry**: "校正" opens the unified flow from the Dashboard chip, SessionDock and Settings. The Settings card shows method, reference kind/posture, quality, date and side, plus "Quick re-zero".
- **Mobility**: a trend card (Settings now, History later) keyed as in 3.1, with a visible "method changed" separator.
- **Advanced fold**: manual Euler fields shown **only** when `protocol = euler` (today they silently do nothing on the hinge path, finding X2). Invert toggles stay. A/B/C wizards go behind a developer "legacy calibration" toggle for one beta, then are removed.
- **Feature gating**: `segment_elevation`/`segment_extension` and the 3D/2D absolute pose are enabled only when `referenceKind=straight && posture=standing`. Otherwise they are hidden with a reason.
- **Staleness banner**: side changed, protocol changed (vector → euler), firmware version changed (soft), and the pre-session reference check failing (3.6).

### 3.6 Pre-session reference check (re-don detection)
At session start, optionally (Q3), ask the wearer to hold the reference posture for 1.5 s. Compare each limb's gravity with `zero` *within the hinge plane* and *out of plane*. If the out-of-plane difference is more than 10° (the strap rotated) → recommend a full recalibration. If only the in-plane offset differs → offer a quick re-zero. This turns "did you re-attach the sensors?" from a guess into a measurement.

---

## 4. The 11 W4 issues (2026-10-14 audit), re-verified against code

Source: the W4 worker's full report in the 10-14 session transcript (the coding log at `doc/coding log/log_20261014_followup_audit.md:35` lists only a summary). I re-checked each one against the current tree.

| # | Claim | Verified? | Resolution in the unified scheme |
|---|---|---|---|
| 1 | B's floor bias/scale applies only at capture, not at runtime (~2-3° error) | **Confirmed**: correction used in `CalibrationWizardB.tsx:123-128`, `buildCalibrationPatchB(..., undefined, side)` at `:152`, no bias field in Settings (`useStore.ts:23-136`), runtime uses raw `V:` (`useStore.ts:749`). **The 2-3° magnitude is unverified** (no data) | The floor stage is dropped from the flow. If ever reinstated, the bias is a per-sensor property stored with the sensor identity and applied in the single conditioning step (3.2-1) for both capture and runtime. Needs device data first |
| 2 | B wizard has no skip for poses | **Confirmed**: `POSES` `:24`, linear `next()` `:137-139`, the only skip is `skipFloor` `:270` | Absolute poses are removed from the required path. Optional movements have Skip; knee flexion is mandatory |
| 3 | B sets `*AxisRotationVerified = true` without solving `axisRotationDeg` | **Confirmed** `calibrationB.ts:574-575` | The unified vector method does not touch the Euler fields or their verified flags. `calibrationMethod` replaces the "verified" semantics |
| 4 | Snapshot does not record the calibration method | **Confirmed** `useStore.ts:248-256` | Stage S1 adds `calibrationMethod`/`calibrationId`/`referenceKind`/`referencePosture`/`calibrationQuality` to `CALIBRATION_KEYS`. CSV and telemetry pick them up automatically (`HistoryView.tsx:78`) |
| 5 | C hold window is 10 samples (~0.4 s at 25 Hz) but the UI says ~2 s | **Confirmed** `mobilityC.ts:38`, `i18n/zh-Hant.ts:535-538,555` | Time-based window of 1.5 s with a 10-sample minimum. The UI keeps "about 2 s" as the instruction margin |
| 6 | C does not check direction | **Confirmed** `mobilityC.ts:168-174` (sign = largest excursion) | Axis groups with one defining movement and an expected sign per movement; `wrongDirection` error (3.2-5) |
| 7 | C knee uses the shin only; thigh motion up to 10° is not counted | **Confirmed** `mobilityC.ts:25` (mover shin), `:129-135` (thigh only gated) | Knee = shinFlex - thighFlex from the same reference. The thigh gate becomes a warning at 10° and a failure at 20° |
| 8 | C trend ignores the starting pose | **Confirmed** `mobilityC.ts:225-228`, `MobilityTrend.tsx:38`; neutral is "any comfortable pose" (`zh-Hant.ts:543`). **Also ignores side** (`side` only lives inside `detail`, `MobilityWizard.tsx:156`) | The trend key includes side, referenceKind, posture and schema (3.1). v1 rows are grouped separately |
| 9 | `neutralOffPlane` says "re-capture the starting pose" but there is no button to go back | **Confirmed** `zh-Hant.ts:553`; the move step only has retry/skip (`MobilityWizard.tsx:243-251`) | A "Re-capture reference" transition from any movement step, with a confirm that clears the movements (results computed against the old reference must not be mixed) |
| 10 | C gyro fusion is dead code | **Confirmed**: `MobilityWizard.tsx:123-127` passes no `moverGyro` and never calls `enableRawStream` (B does, `CalibrationWizardB.tsx:79`) | The unified flow enables `RAW_ON` when the firmware supports it and feeds gyro + raw g (hinge fusion and the linear-acceleration gate) |
| 11 | The C plan's triage line "A/B silently overwrite C's neutral" no longer holds, because C writes no Settings | **Confirmed**: `MobilityWizard.tsx` only calls `irms.mobility.add`. The plan text is still at `doc/plans/2026-10-03-calibration-c-plan.md:94-95` | Moot by construction (one calibration). Mark the plan section superseded when this design lands |

### Additional findings from this pass (verified by reading; effects not measured)
- **X1 Quick re-zero breaks orthogonality.** `buildQuickZeroPatch` replaces `*ZeroAccel` with the live vector but keeps the hinge (`calibration.ts:442-447`), while `projectOntoHingeFrame` assumes `hinge ⟂ baseline` (`angleMath.ts:231-234`). If the posture is off the hinge plane, the frame is skewed. Fix: re-orthogonalise (3.2-4). The size of the error needs a simulator test.
- **X2 Manual zero fields are dead on the hinge path.** The `*ZeroRaw` number fields in Settings → advanced (`SettingsView.tsx:245-255`) are ignored when hinge settings exist (`useStore.ts:749-752`), but the invert toggles still act. A user edit silently does nothing.
- **X3 The runtime knee is an absolute value** (`angleMath.ts:81-83`), so hyperextension reads as positive flexion.
- **X4 C trend ignores side** (see #8).
- **X5 The simulator cannot exercise vector calibration**: `encodeAnglePacket` emits no `V:` (`simulation/encode.ts:32-39`), and the simulated link uses `DEFAULT_SETTINGS` (`services/bluetooth.ts:295`).
- **X6 Linear acceleration is in `V:`**: `V:` is raw normalised accel per sample (`IRMS_Sensor/imu.h:58-62`), so fast sweeps bias the plane fit. It can only be gated when `G:` raw g is available.
- **X7 History cannot be recomputed**: `sensor_data` holds calibrated angles only. Any method change must be visible as a break, not hidden.

---

## 5. Verification plan

### 5.1 Without hardware
1. **Vector IMU simulator** (`services/simulation/imuModel.ts`, new). Two-segment leg kinematics (hip flex/ext/abd, knee flex incl. -10° hyperextension), random SO(3) mountings per sensor, optional strap slip between "re-dons", accel noise (σ 0.01 g), bias (±0.03 g), scale (±2 %), linear acceleration from the trajectory, gyro with bias, 25 Hz and jittered 12-20 Hz "mobile" rates, packet drops, MTU truncation. It emits the real wire format (`V:`, `G:`) so the parser is in the loop.
2. **Property tests** (vitest, seeded, about 500 mountings each):
   - static knee error ≤ 2° (no noise) and ≤ 4° (noise + bias) across 0-140°.
   - signed hyperextension reads negative.
   - thigh drift ≤ 10° during the knee test is compensated (error ≤ 2°).
   - `wrongDirection` fires for an extension done as flexion.
   - off-plane reference (side-lying) is rejected.
   - a 1.5 s hold is required at 12, 20 and 25 Hz.
   - left/right mirror gives the same magnitudes with the abduction sign correct.
   - quick re-zero keeps orthogonality.
   - two-point fallback gives medium quality.
   - gyro fusion improves the axis error under linear acceleration.
3. **Characterisation tests first.** Run the same scenarios through today's A, B and C code and pin their current outputs. The new core must match A's knee within 1° where A's assumptions hold, and must beat C where W4-7 applies.
4. **Recorded-data replay.**
   - `doc/calibration-evidence/20260915/packets.txt` (66,927 real packets, no labels, no matching settings): use it only for robustness (no throws, norms, stationary-segment detection, the conditioning gate rate), never for accuracy claims (README `:15-17`).
   - If the telemetry collector still holds run `51e7fcbe` with its calibration-snapshot event: replay the packets through A-runtime and the unified runtime using the **snapshot's** hinge settings. Both must reproduce the user-observed 82-85° seated knee. Availability unverified.
5. **Migration tests.**
   - persist fixtures for every legacy shape (Electron booleans, offset era, A-Euler, A-vector, B, defaults) → expected `calibrationMethod`. Runtime angles are bit-identical before and after for legacy methods.
   - Rust tests for migration 10 (columns nullable, v1 rows intact, profile round-trip).
   - snapshot/drift tests including the new keys.
6. **Wizard state-machine tests** (testing-library): skip rules, re-capture reference clears the movements, disconnect mid-capture, session lock, `ERR:1` mid-capture, legacy firmware branch, nothing written on discard, i18n zh-Hant/en parity test.
7. **End-to-end in demo mode.** Extend the simulator scenarios to feed `V:`/`G:` through `bluetoothService.ingest`, then run the wizard and a session in the isolated-profile Tauri smoke run.

### 5.2 Must still be checked on a device (to file as GitHub issues, per project convention)
- Goniometer protocol (W4 recommendation, kept): 2-3 subjects, static knee at 0/45/90/120° in standing and seated, legacy A vs unified; 3 re-dons each for repeatability. Pass: unified MAE ≤ 5°, re-don SD ≤ 5°, and not worse than A by more than 1°.
- The parallel-hinge assumption (thigh vs shin axis): compare the two derived axes in a labelled capture. If they diverge by more than 15° on a real leg, `reconcileToReferenceFrame` becomes the candidate.
- Real `V:`+`G:` bandwidth at 25 Hz with an actual MTU; the effect of linear acceleration at natural sweep speeds.
- Hip movements vs pelvis compensation (thigh tilt overstates hip ROM).
- Android/iOS: notify rate, background/keep-awake, voice cues in the WebView (zh-TW voice availability).
- Strap-over-clothing slip during a session (feeds the 3.6 thresholds).
- Floor-stage bias magnitude (only if Q5 = keep).

---

## 6. Staged implementation plan

Each stage is one reviewable commit/PR, `npm run ci` + `cargo test --lib` + clippy green, with no hardware claims.

| Stage | Content | Files (main) | Behaviour change | Risks |
|---|---|---|---|---|
| S0 | Adopt this design into the repo as `doc/plans/2026-10-xx-calibration-unified-plan.md`; mark the A/B/C plans superseded; file the device-check issues | `doc/plans/*`, GitHub issues | none | — |
| S1 | **Provenance**: new Settings keys + `CALIBRATION_KEYS`, persist version bump with inference, A/B wizards set the method; stop B setting `*AxisRotationVerified`; History label for legacy snapshots | `store/useStore.ts`, `shared/types.ts`, `services/calibration.ts` (snapshot assert), `components/CalibrationWizard*.tsx`, `views/HistoryView.tsx`, tests | metadata only | persist migration wiping calibration → fixture tests per shape |
| S2 | **Vector simulator + characterisation tests** of current A/B/C | `services/simulation/imuModel.ts`, `encode.ts` (add `V:`/`G:`), `*.test.ts` | none (test only) | a wrong simulator gives false confidence; cross-check against the 09-15 trace norms |
| S3 | **`calibrationCore.ts`**: conditioning, hinge estimation, orthogonalisation, sign model, time-based held peak, quality; move the shared helpers out of `calibrationB.ts`/`mobilityC.ts` (re-export for the legacy code) | `services/calibrationCore.ts`, `calibrationB.ts`, `mobilityC.ts`, tests | none (unwired) | the abduction sign formula must be pinned by S2 tests |
| S4 | **Runtime**: compiled profile → signed knee for `method='unified'` only; legacy methods keep the exact current path; fix quick re-zero orthogonality (separate commit); live share keeps `knee = max(0, signed)` plus a new `kneeSigned` field so the `angle-range` module (shipped independently) is not broken | `store/useStore.ts`, `services/angleMath.ts`, `movementMetric.ts`, `guidance.ts`, `liveShareHost.ts`, `triggerEngine` tests | yes, unified profiles only | alarms/targets assume knee ≥ 0; check every consumer of `angles.knee`; the module contract stays unchanged |
| S5 | **Storage**: migration 10 (`calibration_profiles`, mobility columns), Rust types/commands, `irmsApi`, stubs | `src-tauri/src/{migrations,db,commands,types,lib}.rs`, `platform/irmsApi.ts`, `test/irmsApiStub.ts` | additive | forward-only migration; the Electron-import path (`migrate_electron.rs`) must tolerate the new tables |
| S6 | **Unified wizard** (state machine 3.3, presets, auto-capture, voice cues, re-capture reference, legacy-firmware branch); route all entry points; A/B/Mobility wizards behind a developer toggle | `components/CalibrationFlow.tsx` (new), `DashboardView.tsx`, `SessionDock.tsx`, `SettingsView.tsx`, `i18n/{zh-Hant,en}.ts`, tests | yes | UX on small screens; follow the v3 "no page scrolling" rule |
| S7 | **Mobility v2**: records from the flow, trend keyed per 3.1 with a method break; optional "suggest comfort angle" (never automatic, Q6) | `MobilityTrend.tsx`, `services/mobility*.ts`, `angleRange.ts` | yes | mixed-version trends shown as continuous by mistake → explicit separator test |
| S8 | **Gating + staleness**: segment triggers / absolute pose gated by reference kind; banners; optional pre-session reference check (Q3) | `movementMetric.ts`, trigger UI, pose views, `DashboardView.tsx`, `sessionController.ts` | yes | hiding features users rely on → show the reason, do not silently remove |
| S9 | After the device checks pass: remove the legacy wizards and the B floor stage, keep the legacy runtime paths for old snapshots; docs sync (PROJECT_STATUS, OPTIMIZATION, README, ROADMAP, AI_CODING_RULES §4.3 incl. `mobility_records` and `calibration_profiles`); beta release | many | yes | must not run before the hardware gate |

Order rationale: S1 makes every later change auditable. S2 must exist before S3 so the new math is proven against the same scenarios as the old. S4 is the only stage that changes clinical numbers, and it is limited to new profiles.

---

## 7. Open questions for the owner
- **Q1 Default zero**: `straight` (clinically standard knee flexion angle, needs the knee straight in some posture) or `neutral` (works for everyone, but numbers are relative to the chosen pose)? Proposal: default `straight` with a "cannot straighten" switch to `neutral`.
- **Q2 Signed knee**: show hyperextension as a negative number on the dashboard/alarms, or clamp the display to 0 and keep the sign only in data?
- **Q3 Pre-session reference check**: prompt every session (about 2 s), only after reconnect, or never?
- **Q4 Multiple wearers**: is one install = one patient acceptable, or should profiles be per person?
- **Q5 B floor stage (bias)**: drop it (proposal), or keep it as a per-sensor one-time step and require device data on its magnitude first?
- **Q6 angle-range merge**: should a mobility hold peak only *suggest* the comfort angle (proposal), or replace the angle-range module's manual measurement?
- **Q7 Segment triggers / 3D-2D pose**: hide them when the zero is not standing-straight (proposal), or remove them altogether as the C plan's DISABLE triage suggested?

## 8. Owner decisions (2026-10-15)

1. Default zero reference: knee straight (`straight`), with a "cannot fully straighten" toggle that records `neutral`.
2. Hyperextension (negative knee angle): the owner's answer was "reset this mode; the goal is to avoid over-stretching joints and tendons". Interpreted as a SAFETY rule, not a display choice: negative angle beyond a small tolerance is treated as a hyperextension hazard (visible on screen, triggers the alarm/limit path, and is stored with its sign). It is never clamped to zero silently. The exact tolerance and alarm wording are to be proposed in the implementation and flagged for owner review.
3. Pre-session wearing check (about 2 s): yes.
4. Segment elevation/extension triggers and 3D/2D pose when zero is not upright: hide (keep code, show only when zero is upright).
5. Defaults taken because the owner did not object: one device serves one patient; B's floor-bias correction is removed; mobility peaks only suggest comfort angles and never change them automatically.
