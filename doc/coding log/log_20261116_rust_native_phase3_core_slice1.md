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

## Native prototype now uses the core crate

`IRMS_App_Native` depends on `IRMS_Core`. The simulated device emits the real wire text
(`T:..,S:..,K:..,TR:..,SR:..,KR:..`, or `ERR:1` with `--inject-fault`) and the prototype reads it through
`irms_core::protocol::parse_angle_packet`, the same parser the shipping app uses. Knee angle is shin minus
thigh from the parsed packet; the values view shows the parsed thigh, shin and roll difference.

Checked by snapshot: values view (`p3-live-values-from-core-parser.png`) and the sensor-fault state
(`p3-live-sensor-fault.png`, red band "感測器異常 · 裝置回報 ERR:1"). Executable is 10.2 MB with the core
crate linked (SQLite and tokio included, not used yet).

Differences from the shipping app left as they are for now: during a fault the big number keeps the last
value (v3 shows a dash), and the prototype does no calibration maths (zero offset, flexion axes), which
lives in the TypeScript services and belongs to phase 4.

## Slice 2: BLE transport moved into the core crate

`src-tauri/src/ble.rs` (1,169 lines: scan, connect, notification listener, commands, OTA) is now
`IRMS_Core/src/ble.rs`. The transport no longer names Tauri. It talks to its host through a new trait:

```rust
pub trait BleHost: Clone + Send + Sync + 'static {
    fn emit_json(&self, event: &str, payload: serde_json::Value); // ble:packet, ble:connection, ...
    fn record(&self, kind: &str, payload: serde_json::Value);     // telemetry
    fn ble(&self) -> &BleState;
    fn spawn(&self, task: Pin<Box<dyn Future<Output = ()> + Send>>);
}
```

`src-tauri/src/ble.rs` is now 75 lines: `TauriHost(AppHandle)` implements the trait (emit to the WebView,
`telemetry::record`, the managed `BleState`, `tauri::async_runtime::spawn`) and the six `#[tauri::command]`
functions forward to the core. Command names, arguments, event names and payload JSON are unchanged; the
listener still runs on Tauri's runtime because the host does the spawning.

Mechanical edits only (done by script, then `cargo fmt`): `telemetry::record(&app, ..)` became
`app.record(..)` (9 places), `let _ = app.emit(..)` became `app.emit(..)` (7), `app.state::<BleState>()`
became `app.ble()` (3), command signatures take `&H` and `&BleState`. No timing constant, lock order or
OTA step was touched.

| Check | Result |
|---|---|
| `cargo test` | IRMS_Core 76 passed + src-tauri 43 passed, 3 ignored (total still 119 / 3) |
| `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` | both crates clean |
| `IRMS_App_Native` release build against the new core | builds |

**Not verified, and it matters here:** nothing was run against the ESP32. A real connect, a streaming
session and an OTA update through the Tauri app on this layout are required before this can merge; the
unit tests cover the lifecycle and OTA window logic, not the radio. Also still not run: frontend CI,
`tauri build`, the Android build (the Android JNI init stays in `src-tauri/src/lib.rs`).

Left in `src-tauri`: `commands` (database IPC), `telemetry`, `firmware`, `firmware_update`, `modules`,
`live_share`, `update`, `splash`, `dpi_guard`, `migrate_electron`.
