---
tags: [irms, release, angle-range, modules]
date: 2026-09-29
summary: "beta.17 + beta.18 shipped: personal comfort/limit angle records replace the over-limit threshold; history paging + CSV export fixes; modules released independently (v2026.09.29)."
---

# beta.17 release — angle-range redesign

## Shipped
- App `v1.2.0-beta.17` (PR #17 merged, signed installer, `beta-latest/latest.json` updated).
- IRMS-Modules `v2026.09.29` (PR #3): `angle-range` 1.0.0, `live-share` 1.0.1.
- Replaces derived "超限" with personal 舒適角度/極限範圍 records (migration 8, session snapshots,
  no defaults). Supersedes `HANDOFF_20260927_angle_range_wip.md` (removed).

## Decisions
- **Modules are versioned independently of the app** (user ruling): `angle-range` has no
  `minAppVersion`; it feature-detects `ctx.angleRange` and shows a notice on older apps.
  `live-share` handles both `zone.overLimit` (old hosts) and `limits` (new hosts).
- CSV export uses native save dialog + Rust `export_write_text` (WebView ignores `<a download>`;
  cause inferred from code, old behaviour not reproduced).
- 2D pose knee arc is now the interior thigh-shin angle (180° − flexion).
- Paging bug: `usePageSize` observed a detached list body (height 0) after review → re-check the
  element every render.

## Verification
`npm run ci` green (cargo test 77). Module tests 5 pass. NOT manually verified on device/app —
user verifies. Note: `tauri build` flips `Cargo.toml` to CRLF; reverted.

## Open
- `codex/ota-and-analysis-modules` in IRMS-Modules still uses `zone.overLimit`.
- Firmware OTA: no hardware test since beta.14 failure (issue #3).

## beta.18 (same day)
- `v1.2.0-beta.18` (PR #18): new **工具** tab hosts module UIs (`views/ToolsView.tsx`, shown only when an
  active module registered a panel); Settings → 模組 is management only — enable/disable plus
  **檢查模組更新** (`checkModuleUpdates`: sync + version diff, new versions apply on next launch since
  activated module code cannot be hot-swapped). Module contract unchanged (`registerPanel`).
- IRMS-Modules PR #4: README now says panels render on the Tools page.
- Not manually verified (user verifies). Release procedure unchanged: signed `tauri build`, hand-built
  `latest.json`, asset renamed dotted, `beta-latest` clobbered; `Cargo.toml` CRLF reverted.
- Untracked `log_20260929_mobile_port_plan.md` belongs to another session; left alone.
