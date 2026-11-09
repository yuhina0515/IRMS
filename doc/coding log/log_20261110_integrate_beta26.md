---
tags: [irms, integration, calibration, mobility, session, merge]
date: 2026-11-10
summary: "Local branch integrate/beta26 merges PR #4 (mobility holds, session save recovery) with feat/unified-calibration; 12 conflicts and 3 semantic clashes resolved; not pushed, not released, no device verification."
---

# Integrate PR #4 and unified calibration (beta.26 candidate)

Plan: `~/ClaudeConfigSync/planning/irms-2026-11-10.md` (December report deadline). Branch
`integrate/beta26`, started from `origin/codex/irms-progress-20261020` (6c62417), merging
`origin/feat/unified-calibration` (c3f18ee). Local only: no push, PR, release or deployment.

## Why

The owner has to report the project in December. `main` holds no released code and the two
lines of work that the demo needs (PR #4 save recovery, unified calibration with the wearing
check) had never been combined. PR #5 is not part of this branch.

## Conflicts (12 files, 14 hunks)

Mechanical, both sides kept: `SessionDock.tsx` (the `finishing` blocker plus the unified
blockers), `sessionController.ts` (connection generation plus the truncated-link refusal),
`SettingsView.tsx`, `MobilityWizard.test.tsx`, `mobilityC.test.ts`, both i18n files,
`AI_CODING_RULES.md`, `HOME.md`.

Decisions that change behaviour:

1. **Leg separation in mobility trends.** PR #4 keeps left, right and unknown-leg records apart;
   unified calibration groups by method identity and showed every same-set record with a
   separator. Result: `methodKey` separates schema-less rows by leg, `MobilityTrend` reads the leg
   from the migration-10 column first and from `detail.side` for older wizard rows, and
   `trendWithBreaks` lists only the current leg (unknown leg is its own group). Method separators
   remain within one leg. The unified separator test now builds its pre-unified rows the way
   migration 10 tags them (schema 1 with a leg).
2. **Dashboard coach order:** sensor fault, then hyperextension, then the unsaved-session notice,
   then over-limit. The safety alert stays above the save notice.
3. **Calibration lock.** PR #4 keeps the calibration frozen while a stopped session is still
   unsaved (`session.id != null`). The unified flow only watched `session.running`, so it could
   write a profile and then have the store drop the settings. `CalibrationFlow` now closes on a
   retained session as well, and the mobility entry is disabled in that state unless the legacy
   wizard is selected (it does not write calibration). Regression test added.
4. **Characterisation test W4-5.** PR #4 requires timestamped holds, which removes the known
   weakness "a 0.5 s hold is accepted". The test now asserts the rejection and passes sample times.
5. The PR #4 wizard tests render `MobilityTrend` with the `legacy` toggle, because the default
   entry now opens the unified flow.

No schema clash on this branch: PR #4 adds no migration, so unified calibration keeps migration
10. PR #5 also claims 10 to 12 and must be renumbered if any of it is taken later.

## Validation

- `tsc --noEmit`: pass.
- Vitest: 65 files, 644 tests pass (`--maxWorkers=2`).
- `vite build`: pass (existing chunk-size warning).
- Rust: `cargo fmt --check` pass; `cargo test` 103 passed, 3 ignored; Clippy all targets and features with `-D warnings` pass.
- `npm run` could not be used in this shell (child `cmd` did not find `node`); the same tools
  were invoked through `node` directly.

## Not verified

Nothing here ran on the device. The device is with the tester and unused; every hardware gate
of the unified calibration (S9) and the Tauri end-to-end run remain open. The trend rules were
exercised with synthetic records only.

## Next

Owner review of decisions 1 to 3, then a PR for this branch after PR #3 and PR #4 land. Planned
on top: in-session mounting-slip detection (plan section 4.3).
