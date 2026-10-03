---
tags: [calibration, architecture, squad]
date: 2026-10-03
summary: Started calibration strategy C (relative range of motion): plan, squad inventory, P1 math module, calibrationDrift value-compare fix.
---

## Why
User dropped the goal of recovering absolute posture. C measures relative mobility from a user-held neutral: wear, calibrate, hold the
largest safe angle per movement, sum the held peaks, track long term. A/B stay as material to merge.

## What was done
- Plan: `doc/plans/2026-10-03-calibration-c-plan.md` (direction, design, phases P0-P6, triage, P1 result).
- Squad (read-only, scratchpad snapshot): W1 sonnet features, W2 sonnet calibration reuse, W3 haiku docs. All three finished.
- P1: `IRMS_App_Tauri/src/services/mobilityC.ts` and `mobilityC.test.ts` (9 tests).
- Fix: `calibrationDrift` now compares vector fields by value (it used `!==`, so every vector-protocol session likely showed drift).

## Decisions
- Peak = median of the stillest 10-sample window, not the instantaneous max. Sum only over a complete movement set; trends compare the same set only.
- Phase 1 movement set is knee flexion only (mover shin, reference thigh must stay within 10 deg).
- Runtime wiring, DB migration, wizard UI and feature hiding are deliberately not done yet (P2-P5).

## Mistakes and notes
- My first overshoot test put the spike mid-hold, leaving no clean window; the test was wrong, not the code. Moved the spike.
- W3 (haiku) summary count disagreed with its list and its line numbers are unchecked; use as a checklist only.
- Authorization-needed MCP servers (engineering plugins) were unavailable; not needed for this work.

## Verification
`npm run ci` green; full vitest 473 passed (51 files); Rust 84 passed. Everything is synthetic, nothing run on a device.

## Handoff
Open for the user: whether the sum should include more movements (hip, abduction) and which; whether comfort/limit merges into the mobility
record; how strict the pain-free prompt should be. Next: P2 (store, migration, `calibrationMethod`, telemetry).
