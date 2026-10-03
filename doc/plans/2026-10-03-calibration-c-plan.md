# Calibration strategy C: relative range of motion (plan, 2026-10-03)

Status: draft architecture. Direction decided by the user on 2026-10-03; everything below the "Direction" section is a
proposal that stays open for revision (the user asked to keep room to change and to merge A/B ideas).

## Direction (user decisions)
1. Stop trying to recover the wearer's true absolute posture. Strategy C is built without that goal.
2. C must work for everyone. Standing straight can be distorted by disease, accident or long-term posture, so angles are
   shown **relative** to a reference the wearer provides, and the product centres on **mobility (range of motion)**.
3. C touches almost every feature. Features may be merged; unused ones are disabled for now. The product will later move
   toward exercise.
4. C flow: (1) wear the device, enter calibration; (2) the user tests the largest opening angle they can *hold* (avoid
   injury); (3) the maximum opening angles are summed and that record becomes a long-term tracked item.
5. A and B stay available as source material to merge or improve.

## Known facts (code, 2026-10-03)
- Firmware sends fused Euler angles plus `V:` unit gravity vectors for two IMUs (optionally `G:` gyro/raw g). Gravity is the
  only absolute observable; yaw is not observable. A relative angle about a hinge is observable.
- Runtime already computes knee angle by projecting each limb's gravity vector onto its hinge frame
  (`projectOntoHingeFrame`, `Settings.*HingeAxis`, `*ZeroAccel`, `kneeZeroRaw`). A needed the standing pose for the zero;
  B needed several absolute poses (standing, seated, supine, side-lying) for the mounting rotation.
- B already provides reusable pieces that need no absolute pose: sweep plane fit (`fitPlaneNormal`), gyro principal axis
  (`estimateHingeFromGyro`, `fuseHingeAxes`), sweep span / planarity gates, accel bias from resting faces.
- `angle-range` module (IRMS-Modules) already records a personal comfort angle and limit angle in `angleRanges`
  (migration 8); the trigger engine and alarms read it. This is the closest existing concept to C's output.
- Protocol support is knee only (`SUPPORTED_PROTOCOLS`). Trigger types `segment_elevation` / `segment_extension` assume an
  absolute thigh angle.

## Proposed design (open)
### Reference ("neutral") instead of standing
The wearer holds any relaxed position they choose still for ~2 s; both IMUs' gravity vectors become the zero. The
neutral is stored with the record, so a distorted stance only moves the zero, never breaks the measurement.

### Movement test
For each movement in a movement set (phase 1: knee flexion only; later hip flexion/extension, abduction, other joints):
- guided slow sweep away from neutral, then a held peak (about 2 s) at the largest comfortable angle;
- hinge axis comes from the sweep itself (plane fit, plus gyro when `G:` exists), so mounting rotation does not matter;
- angle(t) = signed rotation of each limb's gravity vector about its hinge, measured from the neutral vector; knee angle is
  the relative difference of the two limbs;
- peak = median of the stillest window of the hold, not the instantaneous maximum (noise and overshoot rejected);
- gates reuse B's: sweep span >= 25 deg, planarity <= 10 deg, hold stillness, otherwise the test fails loudly.

### Sum and long-term tracking
- `TotalMobility` = sum of the held peaks of the movements in the set. Each record stores the movement set id, per-movement
  peaks, neutral vectors, hinge axes, confidence and timestamp. Only records with the same movement set are compared in
  trends, so a sum is never mixed across different sets.
- Stored in a new DB table (migration), shown as a trend in History.

### Safety constraints
- User-driven only; no target angle is imposed in calibration. Show "stop if it hurts" before each movement.
- Prompt for a pain-free flag per peak; sanity ceilings per movement; a result far above the previous best (jump
  threshold) asks for confirmation instead of saving silently.
- Never feed the held-peak mobility into the alarm limit automatically.

### Merging A and B
- Drop from the required path: A's standing capture, B's standing / seated / supine / side-lying poses.
- Keep and reuse: B's sweep fit, gyro fusion, bias-from-faces (optional "accuracy boost" stage), A's `projectOntoHingeFrame`
  runtime, the `angle-range` comfort/limit concept (candidate to be folded into the C record).
- A and B wizards stay in the code behind a legacy switch until C is proven on hardware.

## Phases
| Phase | Content | Done when |
|---|---|---|
| P0 | This plan + feature impact inventory (squad run below) | Inventory triaged, plan updated |
| P1 | Pure math `services/mobilityC.ts` + tests (neutral, relative sweep, held peak, sum, gates) | `npm run ci` green, synthetic tests recover known angles under mounting rotation + noise |
| P2 | Store + DB migration + shared types + telemetry fields | Round-trip test, migration test |
| P3 | Wizard UI (zh-Hant + en parity) | Emulator walk-through, i18n parity test |
| P4 | History trend UI | Renders with 0, 1, many records |
| P5 | Feature merge / disable (per inventory) | Hidden features have no dead entry points |
| P6 | Docs sync (all non-log docs) + beta | Release checklist |

## Squad run (P0)
Snapshot: `scratchpad/audit/` (`src/` = app source copy, `doc/` = non-log docs + plans). Read-only workers.

| ID | model | scope | focus |
|---|---|---|---|
| W1 | sonnet | `src/views`, `src/store`, `src/services/{triggerEngine,movementMetric,sessionAnalysis,guidance,sessionController,actionQuery,angleRange}.ts` | which features depend on absolute or standing-referenced angles; merge / disable / keep per feature, with reason |
| W2 | sonnet | `src/components/CalibrationWizard*.tsx`, `src/services/{calibration,calibrationB,angleMath}.ts`, `src/views/SettingsView.tsx` calibration parts, `src/shared`, `src/i18n` calibration keys | what C can reuse, what becomes dead, risks of keeping A/B behind a legacy switch, `Settings` / `CALIBRATION_KEYS` / snapshot impact |
| W3 | haiku | `doc/*.md` (non-log) | per document: which statements about calibration, posture, features or roadmap go stale under C; list exact headings/lines |

Report format: `file:line | KEEP/MERGE/DISABLE/STALE/RISK | what | why | suggested action`; only verified; under 400 words.

## Done criteria for this turn
Plan written, inventory triaged, P1 math implemented with tests, work log written, nothing pushed or released.

## Triage of the P0 inventory (lead, 2026-10-03)
Verified against code unless noted.
- Confirmed, folded into design: `projectOntoHingeFrame` needs the neutral perpendicular to the hinge axis (angleMath.ts docstring), so C
  projects the neutral onto the sweep plane and rejects a neutral more than 15 deg off it. The plane-fit normal has an arbitrary sign, so C
  orients it so the largest excursion reads positive. Runtime `jointAngleDeg` takes an absolute value, so C's signed angle lives in
  `mobilityC.ts` and the runtime wiring is a P2 decision.
- Confirmed and fixed now: `calibrationDrift` compared vector fields with `!==`, so a JSON-parsed snapshot never matched the live object
  (History would flag drift for every vector-protocol session). Now compares x/y/z by value, with a round-trip test.
- Confirmed, deferred to P2/P5: A and B write the same Settings fields as C, so a later A/B run silently overwrites C's neutral.
  Needs a `calibrationMethod` marker in the snapshot. Per-movement peaks and totals are records, not transform keys.
- Feature triage (W1): DISABLE (hide entry points, keep code) `segment_elevation` / `segment_extension` triggers, 3D/2D pose views;
  MERGE `angle-range` comfort/limit into the mobility record later; KEEP `joint_angle`, alarms, history curves; route all calibration
  entry points (Dashboard chips, SessionDock, Settings) to the C wizard, A/B behind a legacy switch.
- Docs (W3, haiku, line numbers not re-verified): PROJECT_STATUS (six-step wizard, B section), README (flow A/B line, section 2.1 zero
  definition), OPTIMIZATION (wizard feature list), ROADMAP (Phase 5 multi-joint note) need C edits in P6.
- Rejected: none. W3's count line ("1 STALE, 4 CONFLICT, 2 ADD") does not match its own list; treat its items as a checklist, not a tally.

## P1 result
`services/mobilityC.ts` + `mobilityC.test.ts` (9 tests): neutral-relative signed angle about a sweep-derived hinge axis, held-peak window,
gates (span, planarity, neutral off plane, moving reference, no hold, implausible), sum record, same-set trend, jump confirmation.
Synthetic only; no hardware validation.
