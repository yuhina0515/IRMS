# Squad audit: native modules, slip correction, 3D pose (2026-11-22)

## Goal

Independent review of commits `c0aa785` (built-in angle-range flow + session tips) and `b83bfff` (slip
auto-correction, any-orientation calibration test, 3D pose) on branch `feat/native-mobility-wearing`
(draft PR #12) before the owner decides on a beta.13 release.

## Constraints and known facts

- Snapshot (read-only git worktree at `b83bfff`): `E:\Monitoring-and-IoT\IRMS-wt\audit-20261122`.
  Full diff: `E:\Monitoring-and-IoT\IRMS-wt\audit-20261122.diff` (`git diff 1af065d b83bfff`).
- Owner's own project (IRMS, a knee rehabilitation monitor: ESP32 + two IMUs, Rust core + Slint native app).
- Workers are read-only: no edits in the snapshot or the live worktree, no git writes, no pushes.
- Lead already ran: core 199 tests, native 54 (1 ignored), Tauri crate 43, clippy `-D warnings` clean.
  Workers may run `cargo test` in the snapshot only with their own `--target-dir` under `%TEMP%`
  (a cold Slint build takes several minutes).
- Everything is simulator-verified only; slip thresholds come from the simulator.
- Project rules: no page scrolling in the UI (1280x800 window); code wins over docs (D2); modules are
  compiled in (D2); 3D leg is a projection, no 3D engine (D3).

## Tasks

| ID | agent | model/effort | scope | focus |
|---|---|---|---|---|
| W1 | eng-qa | sonnet / xhigh | `IRMS_App_Native/src/range_ui.rs`, `store.rs` (ranges/save/delete), `action_ui.rs` (Pending::Range), `ui/pages.slint` ToolsView + modules tab, `ui/theme.slint` new App properties | angle-range flow correctness vs `E:\Monitoring-and-IoT\IRMS-Modules\modules\angle-range\index.js`; state reset, session lock, validation, delete fallback, Slint bindings |
| W2 | eng-qa | sonnet / xhigh | `IRMS_Core/src/calibration.rs` (`realign_limb`, `realign_tests`), `slip_monitor.rs` (`sweep_axis`, `observed_axis`), `session_controller.rs` (MountShiftCorrected) | math: rotation direction, sign of fitted axis, zero re-orthogonalisation, degenerate cases, whether the tests can pass for the wrong reason; TS fixture contract unchanged |
| W3 | eng-qa | sonnet / high | `IRMS_App_Native/src/main.rs` diff only (correct_slip, slip_corrected lifecycle, banner tone, wizard rebuild, last_*_roll, segment_dir/leg3d_points/limb3d_path, three new tests), `pipeline.rs` Rig::mounted, `ui/live.slint` | integration bugs: state not reset between sessions, correction during non-knee prescriptions or without thigh frame, repeated corrections, 3D geometry/sign, test validity |
| W4 | audit-director | sonnet / xhigh | the two new coding logs, `doc/HOME.md` lines, `doc/plans/2026-11-10-december-report-plan.md` §2 update, parity checklist edit | every claim (numbers, "exact", "proven", "in memory only", tolerances) checked against code/tests; approve or reject the docs |
| W5 | general-purpose (haiku) | haiku / low | doc frontmatter and wikilinks in the four doc files; zh-Hant UI strings added in `pages.slint`/`theme.slint`/`main.rs` | mechanical: frontmatter keys tags/date/summary present, every `[[link]]` resolves to a file in `doc/`, mixed full/half-width punctuation inside new strings |

## Report format

`file:line | BUG/RISK/NIT | what is wrong | concrete failing scenario | one-line fix`; verified findings
only; under 400 words. W4 ends with APPROVE or REJECT.

## Done criteria

All five reports in; every BUG verified by the lead (code read or test); real BUGs fixed with tests,
cheap RISKs fixed, the rest listed; work log updated; snapshot worktree removed.
