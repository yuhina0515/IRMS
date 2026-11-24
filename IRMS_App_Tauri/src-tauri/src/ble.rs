// ble.rs — the entire BLE transport layer, replacing renderer/src/services/bluetooth.ts's use of
// the Web Bluetooth API (which does not exist in WebView2/Tauri — see doc/coding log/
// log_20260907_meeting_tauri_v2_evaluation.md). This is the single highest-risk piece of the
// Tauri migration: it compiles and passes `cargo check`, but none of it has been run against the
// real ESP32 hardware yet. That validation — sustained 25Hz notification reliability over a full
// session length, and GATT re-discovery after an OTA-triggered firmware version bump — is
// deliberately NOT claimed as done here. It needs the physical sensor plugged in and a real
// pairing/streaming/OTA run, the same way the existing OTA hardware tasks (B3/B4/D1/D2) already
// tracked for the firmware side are blocked on real-hardware access.

use crate::ble_lifecycle::{self, Connector, Coordinator};
use crate::protocol::{
    self, ParsedPacket, CHAR_ANGLE_TX, CHAR_FW_VERSION, CHAR_OTA_CONTROL, CHAR_OTA_DATA,
    CHAR_OTA_STATUS, CHAR_PROFILE_RX, OTA_CHUNK_DELAY_MS, OTA_CHUNK_SIZE, OTA_SERVICE_UUID,
    SERVICE_UUID,
};
use crate::telemetry;
use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};
use futures::StreamExt;
use serde::Serialize;
use serde_json::json;
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager as _, State};
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
    ota_update_lock: Mutex<()>,
    /// Identifies the live connection. A notification listener that outlives its connection
    /// (manual disconnect, or a newer connect) sees a different value and must stay silent;
    /// otherwise its late "stream ended" would clear or report the newer connection as down.
    coordinator: Coordinator,
}

impl BleState {
    /// Starts a new connection epoch and returns its id.
    #[cfg(test)]
    fn begin_connection(&self) -> u64 {
        self.coordinator.begin()
    }

    /// Invalidates the current epoch (no listener is current afterwards).
    #[cfg(test)]
    fn invalidate_connection(&self) {
        self.coordinator.begin();
    }

    #[cfg(test)]
    fn is_current(&self, generation: u64) -> bool {
        self.with_current(generation, || ()).is_some()
    }

    // 世代檢查與同步副作用不可分開，否則失效操作可能插在檢查與 emit 之間。
    // callback 不得 await、重入世代鎖或取得 peripheral；雙鎖時固定 peripheral -> epoch。
    // callback panic 不會修改計數器，因此 poison 時仍可安全取回世代值以退休舊連線。
    fn with_current<R>(&self, generation: u64, callback: impl FnOnce() -> R) -> Option<R> {
        self.coordinator.with_current(generation, callback)
    }

    // 等待裝置鎖之後才核對世代；所有拆除副作用都在 peripheral -> epoch 的鎖序內執行。
    async fn with_current_peripheral<R>(
        &self,
        generation: u64,
        callback: impl FnOnce(&mut Option<Peripheral>) -> R,
    ) -> Option<R> {
        self.coordinator
            .with_peripheral(&self.peripheral, generation, callback)
            .await
    }
}

impl Default for BleState {
    fn default() -> Self {
        let (ota_status_tx, _rx) = broadcast::channel(32);
        Self {
            peripheral: Mutex::new(None),
            ota_status_tx,
            ota_update_lock: Mutex::new(()),
            coordinator: Coordinator::default(),
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

fn error_chain(e: &dyn std::error::Error) -> String {
    let mut out = format!("{e} [{e:?}]");
    let mut src = e.source();
    while let Some(s) = src {
        out.push_str(&format!(": {s}"));
        src = s.source();
    }
    out
}

// 原生 await 邊界的所有權檢查，不會任意丟棄仍可能在 OS 層完成的連線 future。
fn ensure_current(current: &impl Fn() -> bool) -> Result<(), String> {
    if current() {
        Ok(())
    } else {
        Err(ble_lifecycle::CANCELLED.into())
    }
}

async fn find_adapter(current: impl Fn() -> bool + Send + Sync) -> Result<Adapter, String> {
    ensure_current(&current)?;
    let manager = Manager::new().await.map_err(|e| error_chain(&e))?;
    ensure_current(&current)?;
    let adapters = manager.adapters().await.map_err(|e| error_chain(&e))?;
    ensure_current(&current)?;
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
async fn scan_for_device(
    adapter: &Adapter,
    current: impl Fn() -> bool + Send + Sync,
) -> Result<Peripheral, String> {
    ensure_current(&current)?;
    let started = adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|e| error_chain(&e));

    let deadline = tokio::time::Instant::now() + SCAN_TIMEOUT;
    let found = async {
        started?;
        loop {
            ensure_current(&current)?;
            let peripherals = adapter.peripherals().await.map_err(|e| error_chain(&e))?;
            ensure_current(&current)?;
            let mut hit = None;
            for p in peripherals {
                let props = p.properties().await;
                ensure_current(&current)?;
                if let Ok(Some(props)) = props {
                    if let Some(name) = &props.local_name {
                        if name.contains(protocol::DEVICE_NAME_PREFIX) {
                            hit = Some(p);
                            break;
                        }
                    }
                }
            }
            if let Some(p) = hit {
                return Ok(p);
            }
            if tokio::time::Instant::now() >= deadline {
                return Err("Device not found within scan window".to_string());
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
    }
    .await;
    // 所有出口（命中、逾時、查詢失敗與取消）共用收尾，且如實保留 stop_scan 失敗。
    match (found, adapter.stop_scan().await) {
        (Ok(peripheral), Ok(())) => Ok(peripheral),
        (Ok(_), Err(error)) => Err(format!("stop_scan failed: {error}")),
        (Err(error), Ok(())) => Err(error),
        (Err(error), Err(stop)) => Err(format!("{error}; stop_scan failed: {stop}")),
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum NotificationKind {
    Angle,
    OtaStatus,
}

// 通知的同步派送接縫，讓原生路徑與不需實體 BLE 的回歸測試走相同邏輯。
fn dispatch_notification(
    state: &BleState,
    generation: u64,
    kind: NotificationKind,
    value: &[u8],
    dispatch: impl FnOnce(NotificationKind, &str),
) -> bool {
    let text = String::from_utf8_lossy(value);
    state
        .with_current(generation, || dispatch(kind, &text))
        .is_some()
}

/// Spawns the single background task that reads btleplug's shared notification stream and
/// dispatches by characteristic UUID — angle packets get parsed and emitted to the frontend as
/// events; OTA status notifications get published to ota_status_tx for perform_ota_update to
/// consume. One stream serves both, same as the ESP32 side notifies both characteristics
/// independently but the Electron/Web-Bluetooth side already demuxes by characteristic today.
fn spawn_notification_listener(
    app: AppHandle,
    peripheral: Peripheral,
    ota_status_tx: broadcast::Sender<String>,
    generation: u64,
) {
    tauri::async_runtime::spawn(async move {
        let mut stream = match peripheral.notifications().await {
            Ok(s) => s,
            Err(e) => {
                let message = format!("notification stream failed: {e}");
                let state = app.state::<BleState>();
                let _ = state.with_current(generation, || {
                    telemetry::record(&app, "ble_error", json!({ "message": message }));
                    let _ = app.emit("ble:error", message);
                });
                return;
            }
        };
        let angle_uuid = uuid(CHAR_ANGLE_TX);
        let ota_status_uuid = uuid(CHAR_OTA_STATUS);

        while let Some(notification) = stream.next().await {
            let kind = if notification.uuid == angle_uuid {
                NotificationKind::Angle
            } else if notification.uuid == ota_status_uuid {
                NotificationKind::OtaStatus
            } else {
                continue;
            };
            let state = app.state::<BleState>();
            let accepted = dispatch_notification(
                &state,
                generation,
                kind,
                &notification.value,
                |kind, text| {
                    if kind == NotificationKind::Angle {
                        // Raw wire text, not the parsed form: offline replay/re-parsing (calibration,
                        // protocol changes) needs exactly what the device sent.
                        telemetry::record(&app, "packet", json!({ "raw": text.trim() }));
                        // Opt-in raw motion packet (firmware CMD:RAW_ON): forwarded as text and parsed in
                        // the frontend; it must never reach the angle parser, which would call it malformed.
                        if text.trim_start().starts_with("G:") {
                            let _ = app.emit("ble:raw", text.trim());
                        } else {
                            let parsed: ParsedPacket = protocol::parse_angle_packet(text);
                            let _ = app.emit("ble:packet", &parsed);
                        }
                    } else {
                        telemetry::record(&app, "ota_status", json!({ "status": text }));
                        let _ = ota_status_tx.send(text.to_string());
                    }
                },
            );
            if !accepted {
                return;
            }
            // 除錯 stderr 可能阻塞，因此只對已接受樣本輸出，且不放進世代派送鎖。
            // Opt-in calibration trace for supervised real-device tuning. Keep production
            // silent; developers can launch with IRMS_CALIBRATION_TRACE=1 and capture the
            // exact wire packets without changing their timing or the frontend transform.
            if kind == NotificationKind::Angle
                && std::env::var_os("IRMS_CALIBRATION_TRACE").is_some()
            {
                eprintln!(
                    "[calibration-trace] {}",
                    String::from_utf8_lossy(&notification.value).trim()
                );
            }
        }
        // A manual disconnect or a newer connect already owns the UI state; stay silent.
        let state = app.state::<BleState>();
        // 先等待 peripheral，再於同一個短鎖內重新核對世代及發布斷線，避免等待跨越新連線。
        let _ = state
            .with_current_peripheral(generation, |peripheral| {
                // Stream ended — device disconnected. Drop the dead handle so later commands report
                // "not connected" instead of writing to a stale peripheral.
                *peripheral = None;
                // Web Bluetooth's gattserverdisconnected has a
                // direct btleplug analog (CentralEvent::DeviceDisconnected on the adapter, not on this
                // stream) that a full reconnect-loop port should listen to separately; this skeleton
                // only reports the notification stream closing, not full reconnect orchestration.
                telemetry::record(
                    &app,
                    "connection",
                    json!({ "connected": false, "reason": "notification_stream_ended" }),
                );
                let _ = app.emit(
                    "ble:connection",
                    ConnectionEvent {
                        connected: false,
                        device_name: None,
                    },
                );
            })
            .await;
    });
}

#[tauri::command]
pub async fn ble_connect(app: AppHandle, state: State<'_, BleState>) -> Result<String, String> {
    let result = connect(&app, &state).await;
    if let Err(message) = &result {
        telemetry::record(
            &app,
            "ble_error",
            json!({ "op": "connect", "message": message }),
        );
    }
    result
}

async fn connect(app: &AppHandle, state: &BleState) -> Result<String, String> {
    // A second connect while one is live would leave two listeners on two handles; retire the
    // old connection first so exactly one listener and one peripheral exist.
    // Everything after the OS-level connect must release it on failure; otherwise the device
    // stays connected at the OS level while we report failure, and the next scan cannot see it.
    ble_lifecycle::establish(
        &state.coordinator,
        &state.peripheral,
        &NativeConnector,
        |generation, peripheral, name| {
            telemetry::record(
                app,
                "connection",
                json!({ "connected": true, "deviceName": name }),
            );
            let _ = app.emit(
                "ble:connection",
                ConnectionEvent {
                    connected: true,
                    device_name: Some(name.to_string()),
                },
            );
            // 已安裝 handle 並發布 connected 後才排程，立即結束的 stream 不會被稍後安裝覆寫。
            spawn_notification_listener(
                app.clone(),
                peripheral.clone(),
                state.ota_status_tx.clone(),
                generation,
            );
        },
    )
    .await
}

// 真實傳輸只提供 OS 操作；所有權、清理與發布順序統一由可回歸測試的流程控制。
struct NativeConnector;
impl Connector for NativeConnector {
    type Adapter = Adapter;
    type Peripheral = Peripheral;
    async fn adapter(&self, current: impl Fn() -> bool + Send + Sync) -> Result<Adapter, String> {
        find_adapter(current).await
    }
    async fn scan(
        &self,
        adapter: &Adapter,
        current: impl Fn() -> bool + Send + Sync,
    ) -> Result<Peripheral, String> {
        scan_for_device(adapter, current).await
    }
    async fn connect(&self, peripheral: &Peripheral) -> Result<(), String> {
        peripheral.connect().await.map_err(|e| error_chain(&e))
    }
    async fn setup(
        &self,
        peripheral: &Peripheral,
        current: impl Fn() -> bool + Send + Sync,
    ) -> Result<String, String> {
        setup_connection(peripheral, current).await
    }
    async fn disconnect(&self, peripheral: &Peripheral) -> Result<(), String> {
        peripheral.disconnect().await.map_err(|e| error_chain(&e))
    }
}

async fn setup_connection(
    peripheral: &Peripheral,
    current: impl Fn() -> bool + Send + Sync,
) -> Result<String, String> {
    ensure_current(&current)?;
    peripheral
        .discover_services()
        .await
        .map_err(|e| error_chain(&e))?;
    ensure_current(&current)?;

    let angle_char = peripheral
        .characteristics()
        .into_iter()
        .find(|c| c.uuid == uuid(CHAR_ANGLE_TX) && c.service_uuid == uuid(SERVICE_UUID))
        .ok_or("Angle characteristic not found")?;
    peripheral
        .subscribe(&angle_char)
        .await
        .map_err(|e| error_chain(&e))?;
    ensure_current(&current)?;

    let name = peripheral
        .properties()
        .await
        .ok()
        .flatten()
        .and_then(|p| p.local_name)
        .unwrap_or_else(|| "IRMS Device".to_string());
    ensure_current(&current)?;
    Ok(name)
}

#[tauri::command]
pub async fn ble_disconnect(app: AppHandle, state: State<'_, BleState>) -> Result<(), String> {
    // Retire the listener first so its late stream-end cannot report a second "disconnected".
    ble_lifecycle::disconnect(
        &state.coordinator,
        &state.peripheral,
        &NativeConnector,
        |result| {
            telemetry::record(
                &app,
                "connection",
                json!({ "connected": false, "reason": "manual", "error": result.as_ref().err() }),
            );
            // `guard` 為空也必須送事件：renderer 可能因 HMR 或 notification stream 提前結束
            // 而持有假的 connected=true。手動斷線是明確的狀態重設邊界，不能依賴底層剛好
            // 還保有 Peripheral handle 才更新 UI。
            let _ = app.emit(
                "ble:connection",
                ConnectionEvent {
                    connected: false,
                    device_name: None,
                },
            );
        },
    )
    .await
}

/// Writes a control command string (see shared BleCommand constants) to the profile-RX
/// characteristic. Silently no-ops if not connected, matching bluetooth.ts's send() behavior.
#[tauri::command]
pub async fn ble_send_command(
    app: AppHandle,
    state: State<'_, BleState>,
    command: String,
) -> Result<(), String> {
    let guard = state.peripheral.lock().await;
    telemetry::record(
        &app,
        "ble_command",
        json!({ "command": command, "connected": guard.is_some() }),
    );
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
pub async fn ble_get_firmware_version(
    state: State<'_, BleState>,
) -> Result<Option<String>, String> {
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
        Ok(bytes) => Ok(clean_firmware_version(&bytes)),
        Err(_) => Ok(None),
    }
}

/// The firmware version characteristic is a fixed-size buffer on the device; trailing NULs or
/// whitespace would break the exact string comparison against the release manifest.
fn clean_firmware_version(bytes: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(bytes);
    let trimmed = text.trim_matches(|c: char| c == ' ' || c.is_whitespace());
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Subscribe before polling the BLE write: a notification can arrive before its ACK.
async fn send_and_wait_for_ota_status(
    tx: &broadcast::Sender<String>,
    write: impl std::future::Future<Output = Result<(), String>>,
    predicate: impl Fn(&str) -> bool,
    timeout: Duration,
) -> Result<String, String> {
    let mut rx = tx.subscribe();
    tokio::time::timeout(timeout, async {
        write.await?;
        loop {
            let text = rx
                .recv()
                .await
                .map_err(|err| format!("OTA status channel: {err}"))?;
            if text.starts_with("OTA:ERROR:") {
                return Err(describe_ota_error(&text));
            }
            if text == "OTA:ABORTED" {
                return Err("OTA update aborted".to_string());
            }
            if predicate(&text) {
                return Ok(text);
            }
        }
    })
    .await
    .map_err(|_| "OTA status timeout".to_string())?
}

/// Unconfirmed-byte ceiling for the OTA transfer. Firmware acks every 4 KB with OTA:PROGRESS, so
/// this keeps at most four acks of data in flight.
const OTA_WINDOW_BYTES: usize = 16 * 1024;
/// How long the sender waits for the device to confirm anything before declaring the link stalled.
const OTA_STALL_TIMEOUT: Duration = Duration::from_secs(5);

fn parse_ota_progress(text: &str) -> Option<usize> {
    text.strip_prefix("OTA:PROGRESS:")?.parse().ok()
}

fn absorb_ota_status(text: &str, confirmed: &mut usize) -> Result<(), String> {
    if let Some(n) = parse_ota_progress(text) {
        *confirmed = (*confirmed).max(n);
    } else if text.starts_with("OTA:ERROR:") {
        return Err(describe_ota_error(text));
    } else if text == "OTA:ABORTED" {
        return Err("OTA update aborted".to_string());
    }
    Ok(())
}

/// Write-Without-Response has no ack, so a link that silently drops bytes (e.g. MTU stuck at 23,
/// where a 125-byte chunk arrives as 20 bytes) would otherwise "succeed" until the device gives
/// up. Block while too much is unconfirmed and fail fast when the device stops confirming.
async fn wait_for_ota_window(
    rx: &mut broadcast::Receiver<String>,
    sent: usize,
    confirmed: &mut usize,
    window: usize,
    stall: Duration,
) -> Result<(), String> {
    use broadcast::error::{RecvError, TryRecvError};
    loop {
        loop {
            match rx.try_recv() {
                Ok(text) => absorb_ota_status(&text, confirmed)?,
                Err(TryRecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
        if sent.saturating_sub(*confirmed) < window {
            return Ok(());
        }
        match tokio::time::timeout(stall, rx.recv()).await {
            Ok(Ok(text)) => absorb_ota_status(&text, confirmed)?,
            Ok(Err(RecvError::Lagged(_))) => {}
            Ok(Err(RecvError::Closed)) => return Err("OTA status channel closed".to_string()),
            Err(_) => {
                return Err(format!(
                    "裝置沒有確認收到資料(已送出 {sent} bytes,僅確認 {confirmed} bytes),                     疑似藍牙連線 MTU 過小或傳輸過載,更新已中止"
                ))
            }
        }
    }
}

fn describe_ota_error(status_text: &str) -> String {
    let code = status_text
        .strip_prefix("OTA:ERROR:")
        .unwrap_or(status_text);
    match code {
        "MTU_TOO_SMALL" => "藍牙連線 MTU 過小(裝置要求 128),韌體分塊會被截斷;請斷線後重新連線,仍無法改善時請改用其他藍牙配接器".to_string(),
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
    let _update_guard = state
        .ota_update_lock
        .try_lock()
        .map_err(|_| "OTA update already in progress".to_string())?;
    let total = data.len();
    let emit_progress = |p: OtaProgress| {
        // Per-chunk Transferring updates are noise for diagnosis; phase changes are what matter.
        if !matches!(p, OtaProgress::Transferring { .. }) {
            telemetry::record(&app, "ota_progress", json!(p));
        }
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

    let mut offset = 0;
    let mut confirmed = 0usize;
    let mut progress_rx = state.ota_status_tx.subscribe();
    let result: Result<String, String> = async {
        let start_cmd = format!("OTA:START:{total}:{md5}");
        send_and_wait_for_ota_status(
            &state.ota_status_tx,
            async {
                let guard = state.peripheral.lock().await;
                let peripheral = guard.as_ref().ok_or("裝置未連線")?;
                peripheral
                    .write(&control_char, start_cmd.as_bytes(), WriteType::WithResponse)
                    .await
                    .map_err(|e| e.to_string())
            },
            |s| s == "OTA:READY",
            Duration::from_secs(10),
        )
        .await?;

        while offset < total {
            let end = (offset + OTA_CHUNK_SIZE).min(total);
            let chunk = &data[offset..end];
            wait_for_ota_window(
                &mut progress_rx,
                offset,
                &mut confirmed,
                OTA_WINDOW_BYTES,
                OTA_STALL_TIMEOUT,
            )
            .await?;
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
        send_and_wait_for_ota_status(
            &state.ota_status_tx,
            async {
                let guard = state.peripheral.lock().await;
                let peripheral = guard.as_ref().ok_or("裝置未連線")?;
                peripheral
                    .write(&control_char, b"OTA:END", WriteType::WithResponse)
                    .await
                    .map_err(|e| e.to_string())
            },
            |s| s == "OTA:DONE",
            Duration::from_secs(20),
        )
        .await?;

        let message = "更新完成,裝置正在重新開機並自動重新連線".to_string();
        emit_progress(OtaProgress::Done {
            bytes_sent: total,
            total_bytes: total,
            message: message.clone(),
        });
        Ok(message)
    }
    .await;
    if let Err(message) = &result {
        // Release the device's OTA session even when START was accepted but its reply was lost.
        // Bound cleanup so an unresponsive device cannot hold the UI indefinitely.
        let _ = tokio::time::timeout(Duration::from_secs(3), ble_abort_ota(state.clone())).await;
        emit_progress(OtaProgress::Error {
            bytes_sent: offset,
            total_bytes: total,
            message: message.clone(),
        });
    }
    result
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

#[cfg(test)]
mod ota_tests {
    use super::*;

    #[test]
    fn firmware_version_drops_trailing_nul_and_whitespace() {
        assert_eq!(
            clean_firmware_version(b"1.4.2   "),
            Some("1.4.2".to_string())
        );
        assert_eq!(
            clean_firmware_version(
                b" 1.4.2
"
            ),
            Some("1.4.2".to_string())
        );
        assert_eq!(clean_firmware_version(b"  "), None);
        assert_eq!(clean_firmware_version(b""), None);
    }

    #[test]
    fn stale_listener_is_not_current_after_disconnect_or_reconnect() {
        let state = BleState::default();
        let first = state.begin_connection();
        assert!(state.is_current(first));

        state.invalidate_connection();
        assert!(!state.is_current(first));

        let second = state.begin_connection();
        assert!(state.is_current(second));
        assert!(!state.is_current(first));
    }

    #[test]
    fn retired_notifications_never_reach_angle_raw_or_ota_dispatch() {
        let state = BleState::default();
        let first = state.begin_connection();
        state.invalidate_connection();
        let second = state.begin_connection();
        for (kind, bytes) in [
            (NotificationKind::Angle, b"T:1,S:2,K:3".as_slice()),
            (NotificationKind::Angle, b"G:1/2/3/4/5/6".as_slice()),
            (NotificationKind::OtaStatus, b"OTA:READY".as_slice()),
        ] {
            let mut emitted = Vec::new();
            assert!(!dispatch_notification(
                &state,
                first,
                kind,
                bytes,
                |kind, text| {
                    emitted.push((kind, text.to_string()));
                }
            ));
            assert!(emitted.is_empty());
            assert!(dispatch_notification(
                &state,
                second,
                kind,
                bytes,
                |kind, text| {
                    emitted.push((kind, text.to_string()));
                }
            ));
            assert_eq!(
                emitted,
                vec![(kind, String::from_utf8_lossy(bytes).to_string())]
            );
        }
    }

    #[test]
    fn invalidation_waits_for_current_dispatch_and_rejects_every_later_old_callback() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Barrier,
        };
        let state = Arc::new(BleState::default());
        let generation = state.begin_connection();
        let started = Arc::new(Barrier::new(2));
        let release = Arc::new(Barrier::new(2));
        let attempting = Arc::new(Barrier::new(2));
        let completed = Arc::new(AtomicBool::new(false));
        let dispatch_thread = {
            let (state, started, release, completed) = (
                state.clone(),
                started.clone(),
                release.clone(),
                completed.clone(),
            );
            std::thread::spawn(move || {
                dispatch_notification(
                    &state,
                    generation,
                    NotificationKind::Angle,
                    b"K:90",
                    |_, _| {
                        started.wait();
                        release.wait();
                        completed.store(true, Ordering::SeqCst);
                    },
                )
            })
        };
        started.wait();
        let held_during_callback = state.coordinator.locked_during_callback();
        let invalidate_thread = {
            let (state, attempting, completed) =
                (state.clone(), attempting.clone(), completed.clone());
            std::thread::spawn(move || {
                attempting.wait();
                state.invalidate_connection();
                assert!(completed.load(Ordering::SeqCst));
            })
        };
        attempting.wait();
        release.wait();
        assert!(dispatch_thread.join().unwrap());
        invalidate_thread.join().unwrap();
        assert!(held_during_callback);
        assert!(!dispatch_notification(
            &state,
            generation,
            NotificationKind::Angle,
            b"K:90",
            |_, _| panic!("stale dispatch")
        ));
    }

    #[tokio::test]
    async fn stale_teardown_rechecks_generation_after_waiting_for_peripheral() {
        use std::sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        };
        let state = Arc::new(BleState::default());
        let first = state.begin_connection();
        let peripheral = state.peripheral.lock().await;
        let touched = Arc::new(AtomicBool::new(false));
        let (waiting_tx, waiting_rx) = tokio::sync::oneshot::channel();
        let teardown = {
            let (state, touched) = (state.clone(), touched.clone());
            tokio::spawn(async move {
                waiting_tx.send(()).unwrap();
                state
                    .with_current_peripheral(first, |_| touched.store(true, Ordering::SeqCst))
                    .await
            })
        };
        waiting_rx.await.unwrap();
        let second = state.begin_connection();
        drop(peripheral);
        assert!(teardown.await.unwrap().is_none());
        assert!(!touched.load(Ordering::SeqCst));
        assert!(state.is_current(second));
        assert!(state
            .with_current_peripheral(second, |_| touched.store(true, Ordering::SeqCst))
            .await
            .is_some());
        assert!(touched.load(Ordering::SeqCst));
    }

    #[test]
    fn callback_panic_does_not_prevent_connection_retirement() {
        let state = BleState::default();
        let first = state.begin_connection();
        let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            state.with_current(first, || panic!("failed callback"));
        }));
        assert!(failure.is_err());
        state.invalidate_connection();
        assert!(!state.is_current(first));
        let second = state.begin_connection();
        assert!(dispatch_notification(
            &state,
            second,
            NotificationKind::OtaStatus,
            b"OTA:DONE",
            |_, _| {}
        ));
    }

    #[test]
    fn parses_only_progress_statuses() {
        assert_eq!(parse_ota_progress("OTA:PROGRESS:4100"), Some(4100));
        assert_eq!(parse_ota_progress("OTA:READY"), None);
        assert_eq!(parse_ota_progress("OTA:PROGRESS:x"), None);
    }

    #[tokio::test]
    async fn window_opens_without_waiting_when_little_is_in_flight() {
        let (tx, mut rx) = broadcast::channel(32);
        let mut confirmed = 0;
        wait_for_ota_window(
            &mut rx,
            1000,
            &mut confirmed,
            8192,
            Duration::from_millis(20),
        )
        .await
        .unwrap();
        drop(tx);
    }

    #[tokio::test]
    async fn full_window_reopens_when_device_confirms_progress() {
        let (tx, mut rx) = broadcast::channel(32);
        let mut confirmed = 0;
        tx.send("OTA:PROGRESS:4100".into()).unwrap();
        wait_for_ota_window(
            &mut rx,
            8200,
            &mut confirmed,
            8192,
            Duration::from_millis(50),
        )
        .await
        .unwrap();
        assert_eq!(confirmed, 4100);
    }

    #[tokio::test]
    async fn stalled_device_fails_fast_instead_of_streaming_into_the_void() {
        let (_tx, mut rx) = broadcast::channel::<String>(32);
        let mut confirmed = 0;
        let err = wait_for_ota_window(
            &mut rx,
            9000,
            &mut confirmed,
            8192,
            Duration::from_millis(20),
        )
        .await
        .unwrap_err();
        assert!(err.contains("MTU"), "{err}");
    }

    #[tokio::test]
    async fn device_error_during_transfer_is_surfaced() {
        let (tx, mut rx) = broadcast::channel(32);
        let mut confirmed = 0;
        tx.send("OTA:ERROR:WRITE_FAIL".into()).unwrap();
        let err = wait_for_ota_window(
            &mut rx,
            100,
            &mut confirmed,
            8192,
            Duration::from_millis(20),
        )
        .await
        .unwrap_err();
        assert_eq!(err, describe_ota_error("OTA:ERROR:WRITE_FAIL"));
    }

    #[tokio::test]
    async fn captures_reply_before_write_ack() {
        for reply in ["OTA:READY", "OTA:DONE"] {
            let (tx, _) = broadcast::channel(32);
            let result = send_and_wait_for_ota_status(
                &tx,
                async {
                    tx.send(reply.to_string()).unwrap();
                    tokio::task::yield_now().await;
                    Ok(())
                },
                |s| s == reply,
                Duration::from_millis(100),
            )
            .await;
            assert_eq!(result.unwrap(), reply);
        }
    }

    #[tokio::test]
    async fn immediate_device_error_is_not_a_timeout_or_success() {
        let (tx, _) = broadcast::channel(32);
        let result = send_and_wait_for_ota_status(
            &tx,
            async {
                tx.send("OTA:ERROR:ALREADY_RUNNING".into()).unwrap();
                Ok(())
            },
            |s| s == "OTA:READY",
            Duration::from_millis(100),
        )
        .await;
        assert_eq!(
            result.unwrap_err(),
            describe_ota_error("OTA:ERROR:ALREADY_RUNNING")
        );
    }

    #[test]
    fn mtu_too_small_has_actionable_hint() {
        let msg = describe_ota_error("OTA:ERROR:MTU_TOO_SMALL");
        assert!(msg.contains("MTU"));
        assert!(!msg.contains("裝置回報錯誤"));
    }

    #[tokio::test]
    async fn ignores_stale_reply_and_times_out() {
        let (tx, mut old_rx) = broadcast::channel(32);
        tx.send("OTA:READY".into()).unwrap();
        let result = send_and_wait_for_ota_status(
            &tx,
            async { Ok(()) },
            |s| s == "OTA:READY",
            Duration::from_millis(10),
        )
        .await;
        assert_eq!(result.unwrap_err(), "OTA status timeout");
        assert_eq!(old_rx.try_recv().unwrap(), "OTA:READY");
    }

    #[tokio::test]
    async fn propagates_write_failure() {
        let (tx, _) = broadcast::channel(32);
        let result = send_and_wait_for_ota_status(
            &tx,
            async { Err("write failed".into()) },
            |_| true,
            Duration::from_millis(100),
        )
        .await;
        assert_eq!(result.unwrap_err(), "write failed");
    }

    #[tokio::test]
    async fn aborted_and_lagged_channels_cannot_report_success() {
        for lag in [false, true] {
            let (tx, _) = broadcast::channel(1);
            let result = send_and_wait_for_ota_status(
                &tx,
                async {
                    tx.send("OTA:ABORTED".into()).unwrap();
                    if lag {
                        tx.send("OTA:DONE".into()).unwrap();
                    }
                    Ok(())
                },
                |s| s == "OTA:DONE",
                Duration::from_millis(100),
            )
            .await;
            assert!(result.is_err());
        }
    }
}
