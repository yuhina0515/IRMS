// ble.rs — the entire BLE transport layer, replacing renderer/src/services/bluetooth.ts's use of
// the Web Bluetooth API (which does not exist in WebView2/Tauri — see doc/coding log/
// log_20260907_meeting_tauri_v2_evaluation.md). This is the single highest-risk piece of the
// Tauri migration: it compiles and passes `cargo check`, but none of it has been run against the
// real ESP32 hardware yet. That validation — sustained 25Hz notification reliability over a full
// session length, and GATT re-discovery after an OTA-triggered firmware version bump — is
// deliberately NOT claimed as done here. It needs the physical sensor plugged in and a real
// pairing/streaming/OTA run, the same way the existing OTA hardware tasks (B3/B4/D1/D2) already
// tracked for the firmware side are blocked on real-hardware access.

use crate::protocol::{
    self, ParsedPacket, CHAR_ANGLE_TX, CHAR_FW_VERSION, CHAR_OTA_CONTROL, CHAR_OTA_DATA,
    CHAR_OTA_STATUS, CHAR_PROFILE_RX, OTA_CHUNK_DELAY_MS, OTA_CHUNK_SIZE, OTA_SERVICE_UUID,
    SERVICE_UUID,
};
use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde::Serialize;
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::{broadcast, Mutex};
use uuid::Uuid;

/// How long ble_connect scans before giving up — matches the Electron main process's
/// setupBluetoothAutoPairing 15s scan timeout (main/index.ts, SCAN_TIMEOUT_MS).
const SCAN_TIMEOUT: Duration = Duration::from_secs(15);

pub struct BleState {
    peripheral: Mutex<Option<Peripheral>>,
    /// Publishes every decoded OTA-status-characteristic notification so perform_ota_update can
    /// wait for a specific reply (READY / DONE / ERROR:...) without racing the background
    /// notification listener — mirrors bluetooth.ts's waitForOtaStatus().
    ota_status_tx: broadcast::Sender<String>,
}

impl Default for BleState {
    fn default() -> Self {
        let (ota_status_tx, _rx) = broadcast::channel(32);
        Self {
            peripheral: Mutex::new(None),
            ota_status_tx,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionEvent {
    connected: bool,
    device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum OtaProgress {
    Starting {
        #[serde(rename = "bytesSent")]
        bytes_sent: usize,
        #[serde(rename = "totalBytes")]
        total_bytes: usize,
    },
    Transferring {
        #[serde(rename = "bytesSent")]
        bytes_sent: usize,
        #[serde(rename = "totalBytes")]
        total_bytes: usize,
    },
    Finalizing {
        #[serde(rename = "bytesSent")]
        bytes_sent: usize,
        #[serde(rename = "totalBytes")]
        total_bytes: usize,
    },
    Done {
        #[serde(rename = "bytesSent")]
        bytes_sent: usize,
        #[serde(rename = "totalBytes")]
        total_bytes: usize,
        message: String,
    },
    Error {
        #[serde(rename = "bytesSent")]
        bytes_sent: usize,
        #[serde(rename = "totalBytes")]
        total_bytes: usize,
        message: String,
    },
}

fn uuid(s: &str) -> Uuid {
    // These are all compile-time-known protocol constants, not user input — a parse failure here
    // is a programming error (a typo'd UUID), not a runtime condition to recover from.
    Uuid::from_str(s).unwrap_or_else(|e| panic!("invalid protocol UUID constant {s:?}: {e}"))
}

async fn find_adapter() -> Result<Adapter, String> {
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
    adapters
        .into_iter()
        .next()
        .ok_or_else(|| "No Bluetooth adapter found".to_string())
}

/// Scans until a peripheral advertising a name containing DEVICE_NAME_PREFIX is seen, or the
/// scan timeout elapses. Mirrors setupBluetoothAutoPairing's auto-select-by-name-prefix behavior
/// (main/index.ts) — there is no Tauri/btleplug equivalent of Chromium's
/// select-bluetooth-device event, so this polls the adapter's discovered-peripherals list
/// directly instead.
async fn scan_for_device(adapter: &Adapter) -> Result<Peripheral, String> {
    adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|e| e.to_string())?;

    let deadline = tokio::time::Instant::now() + SCAN_TIMEOUT;
    let found = loop {
        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        let mut hit = None;
        for p in peripherals {
            if let Ok(Some(props)) = p.properties().await {
                if let Some(name) = &props.local_name {
                    if name.contains(protocol::DEVICE_NAME_PREFIX) {
                        hit = Some(p);
                        break;
                    }
                }
            }
        }
        if let Some(p) = hit {
            break Some(p);
        }
        if tokio::time::Instant::now() >= deadline {
            break None;
        }
        tokio::time::sleep(Duration::from_millis(300)).await;
    };

    adapter.stop_scan().await.ok();
    found.ok_or_else(|| "Device not found within scan window".to_string())
}

/// Spawns the single background task that reads btleplug's shared notification stream and
/// dispatches by characteristic UUID — angle packets get parsed and emitted to the frontend as
/// events; OTA status notifications get published to ota_status_tx for perform_ota_update to
/// consume. One stream serves both, same as the ESP32 side notifies both characteristics
/// independently but the Electron/Web-Bluetooth side already demuxes by characteristic today.
fn spawn_notification_listener(app: AppHandle, peripheral: Peripheral, ota_status_tx: broadcast::Sender<String>) {
    tauri::async_runtime::spawn(async move {
        let mut stream = match peripheral.notifications().await {
            Ok(s) => s,
            Err(e) => {
                let _ = app.emit("ble:error", format!("notification stream failed: {e}"));
                return;
            }
        };
        let angle_uuid = uuid(CHAR_ANGLE_TX);
        let ota_status_uuid = uuid(CHAR_OTA_STATUS);

        while let Some(notification) = stream.next().await {
            if notification.uuid == angle_uuid {
                let text = String::from_utf8_lossy(&notification.value).to_string();
                let parsed: ParsedPacket = protocol::parse_angle_packet(&text);
                let _ = app.emit("ble:packet", &parsed);
            } else if notification.uuid == ota_status_uuid {
                let text = String::from_utf8_lossy(&notification.value).to_string();
                let _ = ota_status_tx.send(text);
            }
        }
        // Stream ended — device disconnected. Web Bluetooth's gattserverdisconnected has a
        // direct btleplug analog (CentralEvent::DeviceDisconnected on the adapter, not on this
        // stream) that a full reconnect-loop port should listen to separately; this skeleton
        // only reports the notification stream closing, not full reconnect orchestration.
        let _ = app.emit(
            "ble:connection",
            ConnectionEvent {
                connected: false,
                device_name: None,
            },
        );
    });
}

#[tauri::command]
pub async fn ble_connect(app: AppHandle, state: State<'_, BleState>) -> Result<String, String> {
    let adapter = find_adapter().await?;
    let peripheral = scan_for_device(&adapter).await?;

    peripheral.connect().await.map_err(|e| e.to_string())?;
    peripheral
        .discover_services()
        .await
        .map_err(|e| e.to_string())?;

    let angle_char = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid(CHAR_ANGLE_TX) && c.service_uuid == uuid(SERVICE_UUID))
        .ok_or("Angle characteristic not found")?;
    peripheral
        .subscribe(&angle_char)
        .await
        .map_err(|e| e.to_string())?;

    let name = peripheral
        .properties()
        .await
        .ok()
        .flatten()
        .and_then(|p| p.local_name)
        .unwrap_or_else(|| "IRMS Device".to_string());

    spawn_notification_listener(app.clone(), peripheral.clone(), state.ota_status_tx.clone());
    *state.peripheral.lock().await = Some(peripheral);

    let _ = app.emit(
        "ble:connection",
        ConnectionEvent {
            connected: true,
            device_name: Some(name.clone()),
        },
    );
    Ok(name)
}

#[tauri::command]
pub async fn ble_disconnect(state: State<'_, BleState>) -> Result<(), String> {
    let mut guard = state.peripheral.lock().await;
    if let Some(p) = guard.take() {
        p.disconnect().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Writes a control command string (see shared BleCommand constants) to the profile-RX
/// characteristic. Silently no-ops if not connected, matching bluetooth.ts's send() behavior.
#[tauri::command]
pub async fn ble_send_command(state: State<'_, BleState>, command: String) -> Result<(), String> {
    let guard = state.peripheral.lock().await;
    let Some(peripheral) = guard.as_ref() else {
        return Ok(());
    };
    let profile_char = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid(CHAR_PROFILE_RX))
        .ok_or("Profile RX characteristic not found")?;
    peripheral
        .write(&profile_char, command.as_bytes(), WriteType::WithResponse)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ble_get_firmware_version(state: State<'_, BleState>) -> Result<Option<String>, String> {
    let guard = state.peripheral.lock().await;
    let Some(peripheral) = guard.as_ref() else {
        return Ok(None);
    };
    let Some(fw_char) = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid(CHAR_FW_VERSION) && c.service_uuid == uuid(OTA_SERVICE_UUID))
    else {
        // Most commonly means the device firmware predates OTA support — expected, not an error.
        return Ok(None);
    };
    match peripheral.read(&fw_char).await {
        Ok(bytes) => Ok(Some(String::from_utf8_lossy(&bytes).to_string())),
        Err(_) => Ok(None),
    }
}

/// Waits for one OTA-status notification matching `predicate`, mirrors bluetooth.ts's
/// waitForOtaStatus — subscribes to the shared broadcast channel fresh so it only sees
/// notifications from this point forward, not anything queued before the call.
async fn wait_for_ota_status(
    tx: &broadcast::Sender<String>,
    predicate: impl Fn(&str) -> bool,
    timeout: Duration,
) -> Result<String, String> {
    let mut rx = tx.subscribe();
    tokio::time::timeout(timeout, async {
        loop {
            match rx.recv().await {
                Ok(text) if predicate(&text) => return text,
                Ok(_) => continue,
                Err(_) => return String::new(),
            }
        }
    })
    .await
    .map_err(|_| "OTA status timeout".to_string())
}

fn describe_ota_error(status_text: &str) -> String {
    let code = status_text.strip_prefix("OTA:ERROR:").unwrap_or(status_text);
    match code {
        "NO_SPACE" => "裝置回報空間不足,無法開始寫入新韌體".to_string(),
        "BAD_START" => "啟動參數格式錯誤(App 端 bug,不應該發生)".to_string(),
        "ALREADY_RUNNING" => "裝置已有進行中的更新,請先等待或中止".to_string(),
        "NOT_STARTED" => "尚未送出 OTA:START 就收到 END".to_string(),
        "SIZE_MISMATCH" => "實際收到的位元組數與宣告的大小不符,更新已中止".to_string(),
        "WRITE_FAIL" => "寫入 flash 失敗,更新已中止(裝置仍執行原本的韌體,不會變磚)".to_string(),
        other => format!("裝置回報錯誤:{other}"),
    }
}

/// Pushes a firmware .bin over BLE: START (size+MD5) -> chunked Write-Without-Response -> END.
/// Same protocol as bluetooth.ts's performOtaUpdate; see that function's doc comment for why no
/// failure path here can brick the device (otadata only flips boot target on firmware-side
/// end() success). The two things NOT yet validated against real hardware: whether
/// OTA_CHUNK_DELAY_MS still prevents send-queue overflow through btleplug's WinRT backend, and
/// whether reconnecting after the version bump this triggers correctly re-discovers the changed
/// GATT table (see this file's module doc comment).
#[tauri::command]
pub async fn ble_perform_ota_update(
    app: AppHandle,
    state: State<'_, BleState>,
    data: Vec<u8>,
    md5: String,
) -> Result<String, String> {
    let total = data.len();
    let emit_progress = |p: OtaProgress| {
        let _ = app.emit("ble:ota-progress", p);
    };

    let (control_char, data_char) = {
        let guard = state.peripheral.lock().await;
        let peripheral = guard.as_ref().ok_or("裝置未連線")?;
        let chars = peripheral.characteristics();
        let control = chars
            .iter()
            .find(|c| c.uuid == uuid(CHAR_OTA_CONTROL))
            .cloned()
            .ok_or("OTA control characteristic not found")?;
        let data_char = chars
            .iter()
            .find(|c| c.uuid == uuid(CHAR_OTA_DATA))
            .cloned()
            .ok_or("OTA data characteristic not found")?;
        let status_char = chars
            .iter()
            .find(|c| c.uuid == uuid(CHAR_OTA_STATUS))
            .cloned()
            .ok_or("OTA status characteristic not found")?;
        peripheral
            .subscribe(&status_char)
            .await
            .map_err(|e| e.to_string())?;
        (control, data_char)
    };

    emit_progress(OtaProgress::Starting {
        bytes_sent: 0,
        total_bytes: total,
    });

    let start_cmd = format!("OTA:START:{total}:{md5}");
    {
        let guard = state.peripheral.lock().await;
        let peripheral = guard.as_ref().ok_or("裝置未連線")?;
        peripheral
            .write(&control_char, start_cmd.as_bytes(), WriteType::WithResponse)
            .await
            .map_err(|e| e.to_string())?;
    }
    let ready = wait_for_ota_status(
        &state.ota_status_tx,
        |s| s == "OTA:READY" || s.starts_with("OTA:ERROR:"),
        Duration::from_secs(10),
    )
    .await?;
    if ready.starts_with("OTA:ERROR:") {
        let message = describe_ota_error(&ready);
        emit_progress(OtaProgress::Error {
            bytes_sent: 0,
            total_bytes: total,
            message: message.clone(),
        });
        return Ok(message);
    }

    let mut offset = 0;
    while offset < total {
        let end = (offset + OTA_CHUNK_SIZE).min(total);
        let chunk = &data[offset..end];
        {
            let guard = state.peripheral.lock().await;
            let peripheral = guard.as_ref().ok_or("裝置未連線")?;
            peripheral
                .write(&data_char, chunk, WriteType::WithoutResponse)
                .await
                .map_err(|e| e.to_string())?;
        }
        tokio::time::sleep(Duration::from_millis(OTA_CHUNK_DELAY_MS)).await;
        offset = end;
        emit_progress(OtaProgress::Transferring {
            bytes_sent: offset,
            total_bytes: total,
        });
    }

    emit_progress(OtaProgress::Finalizing {
        bytes_sent: total,
        total_bytes: total,
    });
    {
        let guard = state.peripheral.lock().await;
        let peripheral = guard.as_ref().ok_or("裝置未連線")?;
        peripheral
            .write(&control_char, b"OTA:END", WriteType::WithResponse)
            .await
            .map_err(|e| e.to_string())?;
    }
    let done = wait_for_ota_status(
        &state.ota_status_tx,
        |s| s == "OTA:DONE" || s.starts_with("OTA:ERROR:"),
        Duration::from_secs(20),
    )
    .await?;
    if done.starts_with("OTA:ERROR:") {
        let message = describe_ota_error(&done);
        emit_progress(OtaProgress::Error {
            bytes_sent: total,
            total_bytes: total,
            message: message.clone(),
        });
        return Ok(message);
    }

    let message = "更新完成,裝置正在重新開機並自動重新連線".to_string();
    emit_progress(OtaProgress::Done {
        bytes_sent: total,
        total_bytes: total,
        message: message.clone(),
    });
    Ok(message)
}

#[tauri::command]
pub async fn ble_abort_ota(state: State<'_, BleState>) -> Result<(), String> {
    let guard = state.peripheral.lock().await;
    let Some(peripheral) = guard.as_ref() else {
        return Ok(());
    };
    if let Some(control_char) = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid(CHAR_OTA_CONTROL))
    {
        // Best-effort — if this fails, the device is probably already disconnected, which
        // achieves the same abort effect on its own.
        let _ = peripheral
            .write(&control_char, b"OTA:ABORT", WriteType::WithResponse)
            .await;
    }
    Ok(())
}
