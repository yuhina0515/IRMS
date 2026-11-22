// ble.rs — Tauri side of the BLE transport. The transport itself (scan, connect, notification
// listener, commands, OTA) lives in `irms_core::ble` so a native interface can use it too; this
// file only adapts it to Tauri: the `AppHandle` as the host, and the `#[tauri::command]` surface.
// Command names, arguments, event names and payloads are unchanged.

use crate::telemetry;
use irms_core::ble::{self as core, BleHost};
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use tauri::{AppHandle, Emitter, Manager as _, State};

pub use irms_core::ble::BleState;

#[derive(Clone)]
struct TauriHost(AppHandle);

impl BleHost for TauriHost {
    fn emit_json(&self, event: &str, payload: Value) {
        let _ = self.0.emit(event, payload);
    }
    fn record(&self, kind: &str, payload: Value) {
        telemetry::record(&self.0, kind, payload);
    }
    fn ble(&self) -> &BleState {
        self.0.state::<BleState>().inner()
    }
    fn spawn(&self, task: Pin<Box<dyn Future<Output = ()> + Send>>) {
        tauri::async_runtime::spawn(task);
    }
}

#[tauri::command]
pub async fn ble_connect(app: AppHandle, state: State<'_, BleState>) -> Result<String, String> {
    core::ble_connect(&TauriHost(app), &state).await
}

#[tauri::command]
pub async fn ble_disconnect(app: AppHandle, state: State<'_, BleState>) -> Result<(), String> {
    core::ble_disconnect(&TauriHost(app), &state).await
}

/// Writes a control command string to the profile-RX characteristic; no-op when not connected.
#[tauri::command]
pub async fn ble_send_command(
    app: AppHandle,
    state: State<'_, BleState>,
    command: String,
) -> Result<(), String> {
    core::ble_send_command(&TauriHost(app), &state, command).await
}

#[tauri::command]
pub async fn ble_get_firmware_version(
    state: State<'_, BleState>,
) -> Result<Option<String>, String> {
    core::ble_get_firmware_version(&state).await
}

#[tauri::command]
pub async fn ble_perform_ota_update(
    app: AppHandle,
    state: State<'_, BleState>,
    data: Vec<u8>,
    md5: String,
) -> Result<String, String> {
    core::ble_perform_ota_update(&TauriHost(app), &state, data, md5).await
}

#[tauri::command]
pub async fn ble_abort_ota(state: State<'_, BleState>) -> Result<(), String> {
    core::ble_abort_ota(&state).await
}
