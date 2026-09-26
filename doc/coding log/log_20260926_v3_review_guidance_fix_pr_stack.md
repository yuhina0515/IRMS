---
tags: [irms, ui, review, guidance, pr, ota, modules]
date: 2026-09-26
summary: "Reviewed the GPT v3 UI (PR #12), ported the v2 guidance 'negative lower-by' fix into it (fcb9018), closed the superseded v2 rebuild (PR #10), inspected Codex's out-of-tokens branch and opened it as draft PR #14 stacked on #13."
---

# v3 review, guidance fix port, PR stack cleanup

## Context

The user adopted the GPT-designed v3 "Rehabilitation Workbook" UI (PR #12, `claude/irms-ui-v3`,
stacked on #9 `feat/telemetry-upload`). The Claude v2 rebuild (PR #10,
`claude/irms-ui-redesign-38fvnr`) was **closed unmerged**; its branch is kept because the i18n
layer (`src/i18n/{zh-TW,en}.ts`), `dashboardState.ts` and the v2 design docs may be reused.

## Guidance fix ported into v3 (user choice A)

- Bug: in `idle` with a `joint_angle` action, a sample already inside the target band fell through
  to the "lower by N°" branch and showed a **negative** amount.
- Fix (`IRMS_App_Tauri/src/services/guidance.ts`, commit `fcb9018`): after the
  `!Number.isFinite(zone.max)` branch, `sample.value <= zone.max` returns
  `{ kind: 'hold', heldSec: 0, totalSec }`. Display-only; the judgment engine is untouched.
- Test `idle + joint_angle 已在目標帶內 → hold,不得算出負的回降量` (`sample(88)`) was verified red
  without the fix and green with it; 363 frontend tests pass.
- Push was first rejected (remote 5 commits ahead, none touching guidance); rebased the single
  local commit, re-ran CI, fast-forward pushed.

## Known v3 gaps reported (not fixed)

- No i18n (all text hard-coded; D-4 asked for zh-TW/en locale files).
- The v15 settings migration resets everyone's theme to `system`.
- Windows DPI (100/125/175%) and 2 m legibility not yet checked on hardware.

## Codex branch → PR #14

Codex ran out of tokens mid-goal on `codex/modules-and-update-ui-20260926`:

| Commit | Content |
|---|---|
| `c0823ec` | OTA status race fix — identical to PR #13 |
| `ee280ab` | runtime feature providers (`firmware-updater`, `session-analysis` via ModuleContext API v2), shared updater check promise (no duplicate download), GlassDropdown viewport flip/clamp, version bump to beta.15 (not released) |

- Frontend CI in a worktree: 39 files / 371 tests pass; merges into v3 without conflict; does not
  contain `fcb9018` (arrives through the stack).
- The OTA-modularization architecture decision was confirmed as the user's own.
- Opened **draft PR #14** with base `codex/fix-ota-status-race-20260926` (#13) so the diff is only
  `ee280ab`. GitHub CI `tauri-app` passed.

## PR landscape at session end

| PR | Branch → base | State |
|---|---|---|
| #9 | `feat/telemetry-upload` → main | draft |
| #12 | `claude/irms-ui-v3` → #9 | draft, contains `fcb9018` |
| #13 | `codex/fix-ota-status-race-20260926` → v3 | open |
| #14 | `codex/modules-and-update-ui-20260926` → #13 | draft, CI green |
| #11 | window clamp → main | draft, green; needs Windows 100/125/175% |
| #10 | v2 rebuild | closed, branch kept |
| #8 | old Codex UI refresh | draft, likely obsolete |

Merge order: **#9 → #12 → #13 → #14**; #11 independent.

## Remaining (user / hardware)

- Issue #3 hardware script, CAL-02/03 follow-ups, OTA real transfer/reboot/version acceptance.
- Windows DPI checks for #11 and v3.
- Decide whether to port i18n into v3 and whether the theme reset in migration v15 is intended.
