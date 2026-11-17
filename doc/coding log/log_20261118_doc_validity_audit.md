---
tags: [irms, docs, audit, versions]
summary: Verified every doc's version and status claims against releases, PRs, manifests and a real test run; corrected stale rows and added a current-state table.
date: 2026-11-18
---

# Doc validity audit (2026-11-18)

Owner request: documents had version drift. Checked against `gh release`, `gh pr`, `Cargo.toml` / `package.json`, and a fresh test run at `044839d` (head of PR #12, which contains `main`).

## Facts established

- Shipping line: Tauri `v1.2.0-beta.25` (published 2026-10-17). Native line: `v1.3.0-beta.11` (published 2026-11-17).
- PR #3, #4, #6 are merged into `main`. Drafts: #5, #7, #8, #9 to #12 (native stack, #12 on top). Open: #1.
- Tests: 722 frontend / 75 files; `IRMS_Core` 195 (6 ignored); `IRMS_App_Native` 47 (1 ignored). Tauri Rust tests, Clippy and rustfmt were not rerun. DB `user_version` is 10 (migrations now in `IRMS_Core/src/migrations.rs`).
- Real-device evidence exists on the native line since 2026-11-17 (telemetry run `d27aa7b0`), contradicting the "no device verification since beta.22" statements that were only true for the Tauri line.
- Uncommitted version bumps by someone else, left untouched: native `1.3.0-beta.12` (this worktree) and Tauri `1.2.0-rc.1` (`integrate-beta26` worktree).

## Corrected

- `doc/PROJECT_STATUS.md`: new top section (current-state table + per-document validity map); in-place corrections of the 11-10 rows for candidate version, `main`, and device verification.
- `doc/HOME.md`: new 11-18 entry; the 11-10 "merge #3, #4, #6" next step and the integrate-branch entry now say they were merged.
- `doc/OPTIMIZATION.md`: last section retitled as merged; the stale native-parity paragraph replaced by the current parity status; documentation item closed.
- `doc/ROADMAP.md`: 11-18 status note (native line, Android pause, merged PRs).
- `README.md`, `SECURITY.md`, `IRMS_App_Tauri/README.md`: native line added; supported versions cover both lines; Tauri README now states that the schema lives in `IRMS_Core`.

## Checked and found fine

- Superseded markers on the calibration A/B/C plans are present. `AI_CODING_RULES` schema section matches `user_version = 10`.
- No real broken wikilinks. The ones a naive scan reports are escaped pipes in HOME tables, or point at assistant memory notes in old logs.

## Not changed on purpose

- `doc/PROJECT_STATUS.md` 2026-09 body and the 2026-09 era sections of `ROADMAP`: historical, covered by the layered "this section wins" convention.
- `doc/README.md` (system spec): protocol and hardware parts still valid; its app-architecture parts describe the Tauri line.
- `plans/` and `doc/plans/` stay separate (moving breaks links).

## Open

- PR #7 (`feat/thigh-slip-check`) holds its own doc sync for the merge; expect small conflicts in `PROJECT_STATUS` / `HOME` when it and PR #12 both land.
- The native `1.3.0-beta.12` and Tauri `1.2.0-rc.1` bumps will need these tables refreshed when published.
