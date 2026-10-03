---
tags: [calibration, mobility, strategy-c, hip]
date: 2026-10-03
summary: Strategy C mobility measurement shipped on feat/calibration-b - knee plus hip flexion/extension/abduction, auto-recorded peaks, DB table, Settings trend. Runtime wiring and feature hiding still pending.
---

# Calibration C: mobility record

Plan: `doc/plans/2026-10-03-calibration-c-plan.md`. Commits: ec7348b (migration 9 + commands), 26b3f52 (wizard, trend, hips, i18n, tests).

## Decisions
- Hip movements (flexion, extension, abduction) use the thigh sensor alone; value is thigh tilt from a relaxed neutral, not a joint angle. Trunk motion unseen; coronal (abduction) least reliable. Basis: codex knowledge base (PMID-39622186, 34167019, 41088368).
- Peaks auto-record on save: no confirmation, no pain prompt (user instruction). Jump-confirm logic removed.
- Trends compare only records with the same movement-set key. The mobility record never feeds alarm limits or Settings.

## Verification
`npm run ci` green (tsc, 477 vitest, rustfmt, cargo test, check). Stub gained `irms.mobility`.

## Not done
- Runtime signed knee angle / calibrationMethod marker; A/B entry points remain.
- History-page trend; hiding segment_elevation/extension triggers; merging angle-range comfort/limit.
- Docs sync (PROJECT_STATUS, README, ROADMAP). Beta release.
- No real-device validation of any of C. Capture timing (2 s neutral, 10 s sweep) untested on hardware.

## Mistakes
- First CI run failed rustfmt on my own earlier db.rs commit; fixed in 26b3f52.
- Settings test broke because the shared stub lacked `mobility`; fixed.
