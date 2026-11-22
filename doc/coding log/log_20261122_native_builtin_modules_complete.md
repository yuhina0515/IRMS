---
tags: [irms, native, modules, angle-range, session-tips]
date: 2026-11-22
summary: All three IRMS-Modules are now built into the native app (D2). angle-range gets the module's full flow (comfort, limit or skip, review with note, one record per measurement), dated history with trend and per-record delete; session-tips listed in Settings → 模組. Not released.
---

# Native: every module built in (angle-range full flow, session-tips)

Owner's handwritten IRMS list (2026-11-22) asked for the Rust port to speed up and "使模組全數上線".
Plan D2 (2026-11-17) already decided modules are compiled into the native app. Checked the three
modules in `IRMS-Modules/modules` against the native app:

| Module | Before | After |
|---|---|---|
| live-share | built in since beta.4 | unchanged |
| angle-range | simplified: comfort/limit buttons, only the newest values shown | module's full flow, see below |
| session-tips | missing | three tips under 設定 → 模組 → 使用提示 |

## angle-range: what changed

Defects found in the old native version:

- Recording the limit saved a **second** record (comfort-only, then comfort+limit), so each
  measurement left two history rows.
- 「清除」 deleted the **whole** history, while the module deletes one record at a time.
- No history list, note, trend, peak, or review step.

New `IRMS_App_Native/src/range_ui.rs` (state in the `App` global, rules as plain functions):

1. Step 1 record comfort (needs a connected, valid live knee angle).
2. Step 2 record limit (refused below comfort) or skip.
3. Step 3 review: comfort / limit / note editable (0 to 180, limit ≥ comfort, note trimmed and capped
   at 200 characters), then one saved record. 本次最大 shows the peak while measuring.
4. History: newest six with local time, `(+5°)` / `(−3°)` / `(持平)` trend against the older record,
   note, 「目前生效」 on the newest, count line when more exist. Delete goes through the shared
   confirmation dialog (`action_ui::Pending::Range`); deleting the record in force falls back to the
   older one. Session start still reads `store.latest_range()`.
5. Store: `ranges()`, `save_range(&AngleRangeInput)`, `delete_range(id)`, both mutations refused
   while a session is active (`allow_mutation`). `clear_range` removed.

Layout: the review step plus six rows plus an error line overflowed the 1280×800 window (no page
scrolling rule); fixed by putting save/restart beside the fields and tightening row spacing. Checked
by snapshot with the review step forced (temporary default, reverted).

Tip text was checked against the native wizard: step names changed to the native ones (膝蓋彎曲,
髖屈曲); the 20° / 40–60° advice matches `wizard.rs`.

Also corrected two stale strings in Settings: firmware row said "no install button" (OTA install
exists since beta.10, now 「實驗性」), telemetry said the choice resets each launch (it is remembered
since 2026-11-17).

## Verification

- `cargo clippy --all-targets -D warnings` clean; `cargo test` 51 passed, 1 ignored (was 47): unit
  tests for trend, rows, review validation, store one-record/delete; `range_ui::exercise_flow` drives
  the real window (no live angle, comfort, peak, refused low limit, skip, edit, save, second
  measurement, confirmed delete with fallback).
- Snapshots (software renderer, scratch `--db`): history list with seven seeded records, review step,
  Settings → 模組.
- Not done: real device, not released (beta.12 is still the latest). IRMS_Core untouched.
