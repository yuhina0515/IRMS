---
tags: [irms, rust, architecture, refactor]
date: 2026-11-16
summary: "Phase 3 first slice: seven toolkit-free Rust modules moved out of src-tauri into a shared IRMS_Core crate; the Tauri app builds on it with the same test results."
---

# Rust-native plan: Phase 3, core crate slice 1 (2026-11-16)

The owner asked to keep going after phase 2, so phase 3 started earlier than the plan's default (D1, "after
the December report"). The work is on the unpushed branch `plan/rust-native-ui` only and does not touch
`beta.26`.

## Change

New crate `IRMS_Core/` (repo root, path dependency of `IRMS_App_Tauri/src-tauri`). Moved with `git mv`, no
logic change: `types`, `protocol`, `defaults`, `downsample`, `migrations`, `ble_lifecycle`, `db`.

Edits needed by the move:
- `ble_lifecycle`: `pub(crate)` became `pub`; the test probe `locked_during_callback` lost its `#[cfg(test)]`
  because the Tauri app's BLE tests call it from another crate (now `#[doc(hidden)]`).
- `protocol` tests: fixture path now points at `IRMS_App_Tauri/fixtures/` (still the shared TS/Rust contract files).
- `src-tauri/src/lib.rs`: the seven `mod` lines are replaced by `use irms_core::{ble_lifecycle, db, protocol, types};`
  so `crate::db`, `crate::types` and so on still resolve in the modules that stay.
- `package.json`: new `ci:core` script (fmt, test, clippy for the core crate); `ci:rust` runs it first.

## Checked

| Check | Before | After |
|---|---|---|
| `cargo test` | src-tauri: 119 passed, 3 ignored | IRMS_Core 59 passed + src-tauri 60 passed, 3 ignored (total 119 / 3) |
| `cargo fmt --check` | n/a | both crates clean |
| `cargo clippy --all-targets -- -D warnings` | n/a | both crates clean |

Not run: `npm run ci:frontend`, `npx tauri build`, any run of the Tauri app on the new layout, the GitHub
workflow. This worktree has no `node_modules`; a placeholder `dist/index.html` (git-ignored) was created so
`cargo test` could build the Tauri context.

## Still in src-tauri (carry Tauri types)

`ble` (15 references), `commands` (45), `telemetry` (11), `migrate_electron` (13), `splash`, `update`,
`firmware`, `firmware_update`, `modules`, `live_share`, `dpi_guard`. Next slices: `ble` behind an event
callback instead of `AppHandle` emit, then telemetry, firmware delivery and module verification.
