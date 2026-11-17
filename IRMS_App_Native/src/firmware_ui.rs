//! Firmware check and update (OTA) in Settings / Software and firmware.
//!
//! The check fetches the channel's signed manifest (verified with the compiled-in Ed25519 key, see
//! `irms_core::firmware_update`) and compares it with the version the connected device reports. When the
//! connected device runs an older version, "更新韌體" downloads the image (size, SHA-256 and MD5 checked
//! against the signed manifest) and sends it over BLE with `irms_core::ble::ble_perform_ota_update`.
//!
//! The transfer through the Windows BLE backend has not been validated on a physical device (an OTA
//! attempted from the Tauri app on 2026-09-26 never reported completion), so the window says so. The
//! firmware only switches its boot target after a complete, checked image, so a failed or aborted
//! transfer leaves the device on its current firmware.

use std::sync::{Arc, Mutex};

use irms_core::ble::{ble_abort_ota, ble_perform_ota_update, BleHost, BleState};
use irms_core::firmware_update::{check_latest, download_latest, is_newer, FirmwareRelease};
use serde_json::Value;
use slint::ComponentHandle;

use crate::{App, MainWindow, NativeHost};

/// What the OTA transfer is doing. The numbers are what the window binds to (`ota-phase`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum OtaPhase {
    #[default]
    Idle = 0,
    Downloading = 1,
    Starting = 2,
    Transferring = 3,
    Finalizing = 4,
    Done = 5,
    Error = 6,
}

impl OtaPhase {
    pub fn is_active(self) -> bool {
        matches!(
            self,
            OtaPhase::Downloading
                | OtaPhase::Starting
                | OtaPhase::Transferring
                | OtaPhase::Finalizing
        )
    }
}

#[derive(Default)]
struct Inner {
    status: String,
    /// A newer firmware the connected device could take (version), from the last check.
    offer: Option<String>,
    phase: OtaPhase,
    sent: usize,
    total: usize,
    message: String,
}

#[derive(Clone, Default)]
pub struct FirmwareCheck {
    inner: Arc<Mutex<Inner>>,
}

impl FirmwareCheck {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn text(&self) -> String {
        let inner = self.lock();
        match (inner.status.is_empty(), inner.message.is_empty()) {
            (_, true) => inner.status.clone(),
            (true, false) => inner.message.clone(),
            (false, false) => format!("{}\n{}", inner.status, inner.message),
        }
    }
    fn set(&self, text: String) {
        self.lock().status = text;
    }
    pub fn phase(&self) -> OtaPhase {
        self.lock().phase
    }
    /// A transfer is in progress: nothing else may touch the device or restart the app.
    pub fn active(&self) -> bool {
        self.lock().phase.is_active()
    }
    pub fn offer_available(&self) -> bool {
        let inner = self.lock();
        inner.offer.is_some() && !inner.phase.is_active()
    }
    pub fn progress(&self) -> f32 {
        let inner = self.lock();
        match inner.phase {
            OtaPhase::Done => 1.0,
            _ if inner.total == 0 => 0.0,
            _ => (inner.sent as f32 / inner.total as f32).clamp(0.0, 1.0),
        }
    }

    /// Progress events from the BLE layer (`ble:ota-progress`).
    pub fn on_progress(&self, payload: &Value) {
        let mut inner = self.lock();
        let phase = match payload["phase"].as_str() {
            Some("starting") => OtaPhase::Starting,
            Some("transferring") => OtaPhase::Transferring,
            Some("finalizing") => OtaPhase::Finalizing,
            // Done and Error are set from the transfer's own result below.
            _ => return,
        };
        // Late events must not pull a finished or failed transfer back to "running".
        if !inner.phase.is_active() {
            return;
        }
        inner.phase = phase;
        inner.sent = payload["bytesSent"].as_u64().unwrap_or(0) as usize;
        inner.total = payload["totalBytes"].as_u64().unwrap_or(0) as usize;
        inner.message = match phase {
            OtaPhase::Starting => "已連到裝置,開始傳送…".into(),
            OtaPhase::Transferring => format!(
                "傳送韌體中 {} / {} KB,請保持裝置通電並靠近電腦",
                inner.sent / 1024,
                inner.total.div_ceil(1024)
            ),
            OtaPhase::Finalizing => "傳送完成,等待裝置驗證並寫入…".into(),
            _ => String::new(),
        };
    }

    fn finish(&self, phase: OtaPhase, message: String) {
        let mut inner = self.lock();
        inner.phase = phase;
        inner.message = message;
        if phase == OtaPhase::Done {
            inner.offer = None;
        }
    }

    /// Downloads, verifies and sends the offered firmware. The caller has checked that the app is idle and
    /// the device is connected.
    pub fn start_install(&self, host: NativeHost, runtime: &tokio::runtime::Handle) {
        let version = {
            let mut inner = self.lock();
            let Some(version) = inner.offer.clone() else {
                return;
            };
            if inner.phase.is_active() {
                return;
            }
            inner.phase = OtaPhase::Downloading;
            inner.sent = 0;
            inner.total = 0;
            inner.message = format!("下載並驗證韌體 v{version}…");
            version
        };
        let this = self.clone();
        runtime.spawn(async move {
            let app_version = env!("CARGO_PKG_VERSION");
            let image = match download_latest(&version, beta_channel(app_version)).await {
                Ok(image) => image,
                Err(e) => {
                    this.finish(OtaPhase::Error, format!("下載失敗:{e}"));
                    return;
                }
            };
            this.lock().phase = OtaPhase::Starting;
            match ble_perform_ota_update(&host, host.ble(), image.data, image.md5).await {
                Ok(message) => this.finish(
                    OtaPhase::Done,
                    format!("{message}。裝置重開機後程式會自動重新連線,連上後再按「檢查韌體」確認新版本"),
                ),
                Err(e) => this.finish(
                    OtaPhase::Error,
                    format!("韌體更新失敗:{e}。裝置仍使用原本的韌體,可以重試"),
                ),
            }
        });
    }

    /// Asks the device to drop the running transfer; the transfer then ends with an error.
    pub fn abort(&self, ble: Arc<BleState>, runtime: &tokio::runtime::Handle) {
        if !self.active() {
            return;
        }
        self.lock().message = "正在中止更新…".into();
        runtime.spawn(async move {
            let _ = ble_abort_ota(&ble).await;
        });
    }
}

/// The beta app follows the beta firmware channel, like the Tauri app's own update channel.
pub fn beta_channel(app_version: &str) -> bool {
    app_version.contains('-')
}

/// True when the connected device runs an older firmware than `release` and this app may install it.
pub fn offered(device: Option<&str>, connected: bool, release: &FirmwareRelease) -> bool {
    connected
        && release.app_compatible
        && device.is_some_and(|v| is_newer(Some(v), &release.version))
}

pub fn summary(device: Option<&str>, connected: bool, release: &FirmwareRelease) -> String {
    let mut text = format!(
        "最新韌體 v{}({} KB,簽章已驗證)",
        release.version,
        release.size.div_ceil(1024)
    );
    match (connected, device) {
        (false, _) => text.push_str(" · 連線裝置後可比對裝置版本"),
        (true, None) => text.push_str(" · 裝置沒有回報版本(可能是早於 OTA 支援的韌體)"),
        (true, Some(v)) if is_newer(Some(v), &release.version) => {
            text.push_str(&format!(" · 裝置 v{v},有新版"))
        }
        (true, Some(v)) => text.push_str(&format!(" · 裝置 v{v},已是最新")),
    }
    if !release.app_compatible {
        text.push_str(" · 這個版本的程式比該韌體要求的舊,請先更新程式");
    }
    if !release.notes.trim().is_empty() {
        text.push_str(&format!("\n說明:{}", release.notes.trim()));
    }
    if offered(device, connected, release) {
        text.push_str(
            "\n更新約需數分鐘:期間請保持裝置通電、靠近電腦,不要中斷連線。原生版的 OTA 尚未在實機完成驗證;\
             失敗或中止時裝置會保留原本的韌體。",
        );
    }
    text
}

pub fn wire(
    ui: &MainWindow,
    check: FirmwareCheck,
    runtime: tokio::runtime::Handle,
    ble: Option<Arc<BleState>>,
) {
    let app = ui.global::<App>();
    {
        let check = check.clone();
        let runtime = runtime.clone();
        let ble = ble.clone();
        app.on_firmware_check(move || {
            if check.active() {
                return;
            }
            check.set("檢查中…".into());
            let check = check.clone();
            let ble = ble.clone();
            runtime.spawn(async move {
                let version = env!("CARGO_PKG_VERSION");
                let (connected, device) = match &ble {
                    Some(state) => match irms_core::ble::ble_get_firmware_version(state).await {
                        Ok(v) => (true, v),
                        Err(_) => (false, None),
                    },
                    None => (false, None),
                };
                match check_latest(version, beta_channel(version)).await {
                    Ok(release) => {
                        let offer = offered(device.as_deref(), connected, &release)
                            .then(|| release.version.clone());
                        {
                            let mut inner = check.lock();
                            inner.offer = offer;
                            if inner.phase != OtaPhase::Done {
                                inner.message.clear();
                                inner.phase = OtaPhase::Idle;
                            }
                        }
                        check.set(summary(device.as_deref(), connected, &release));
                    }
                    Err(e) => check.set(format!("檢查失敗:{e}")),
                }
            });
        });
    }
    {
        let check = check.clone();
        let runtime = runtime.clone();
        let ble = ble.clone();
        app.on_firmware_abort(move || {
            if let Some(ble) = ble.clone() {
                check.abort(ble, &runtime);
            }
        });
    }
}

pub fn sync(app: &App, check: &FirmwareCheck) {
    let text = check.text();
    if !text.is_empty() {
        app.set_firmware_status(text.into());
    }
    app.set_ota_phase(check.phase() as i32);
    app.set_ota_progress(check.progress());
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn release(version: &str, notes: &str) -> FirmwareRelease {
        FirmwareRelease {
            version: version.into(),
            size: 1_500_000,
            notes: notes.into(),
            app_compatible: true,
        }
    }

    #[test]
    fn the_beta_app_uses_the_beta_channel() {
        assert!(beta_channel("1.3.0-beta.4"));
        assert!(!beta_channel("1.3.0"));
    }

    #[test]
    fn the_summary_compares_the_device_with_the_signed_release() {
        let r = release("1.2.0", "fix");
        assert!(summary(Some("1.1.0"), true, &r).contains("有新版"));
        assert!(summary(Some("1.2.0"), true, &r).contains("已是最新"));
        assert!(summary(None, true, &r).contains("沒有回報版本"));
        assert!(summary(None, false, &r).contains("連線裝置後"));
        let s = summary(Some("1.1.0"), true, &r);
        assert!(
            s.contains("1465 KB") && s.contains("說明:fix") && s.contains("尚未在實機完成驗證")
        );
        assert!(!summary(Some("1.2.0"), true, &r).contains("尚未在實機完成驗證"));
    }

    #[test]
    fn an_app_older_than_the_firmware_requires_is_told_to_update() {
        let mut r = release("1.2.0", "");
        r.app_compatible = false;
        assert!(summary(Some("1.1.0"), true, &r).contains("請先更新程式"));
        assert!(!offered(Some("1.1.0"), true, &r));
    }

    #[test]
    fn an_update_is_offered_only_to_a_connected_older_device() {
        let r = release("1.2.0", "");
        assert!(offered(Some("1.1.0"), true, &r));
        assert!(!offered(Some("1.2.0"), true, &r), "already current");
        assert!(!offered(Some("1.3.0"), true, &r), "never downgrade");
        assert!(!offered(Some("1.1.0"), false, &r), "not connected");
        assert!(!offered(None, true, &r), "unknown device version");
    }

    #[test]
    fn progress_events_drive_the_phase_but_cannot_revive_a_finished_transfer() {
        let fw = FirmwareCheck::default();
        fw.lock().phase = OtaPhase::Starting;
        fw.on_progress(
            &json!({"phase": "transferring", "bytesSent": 512 * 1024, "totalBytes": 1024 * 1024}),
        );
        assert_eq!(fw.phase(), OtaPhase::Transferring);
        assert!((fw.progress() - 0.5).abs() < 0.001);
        assert!(fw.text().contains("512 / 1024 KB"));
        fw.finish(OtaPhase::Error, "boom".into());
        fw.on_progress(&json!({"phase": "transferring", "bytesSent": 1, "totalBytes": 2}));
        assert_eq!(
            fw.phase(),
            OtaPhase::Error,
            "a late event does not restart it"
        );
        assert!(!fw.active());
    }

    #[test]
    fn a_finished_update_clears_the_offer_and_reports_complete() {
        let fw = FirmwareCheck::default();
        fw.lock().offer = Some("1.2.0".into());
        assert!(fw.offer_available());
        fw.lock().phase = OtaPhase::Finalizing;
        assert!(!fw.offer_available(), "not while a transfer runs");
        fw.finish(OtaPhase::Done, "更新完成".into());
        assert!(!fw.offer_available());
        assert_eq!(fw.progress(), 1.0);
    }
}
