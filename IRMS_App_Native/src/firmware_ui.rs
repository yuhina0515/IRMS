//! Firmware check in Settings / Software and firmware.
//!
//! The check fetches the channel's signed manifest (verified with the compiled-in Ed25519 key, see
//! `irms_core::firmware_update`) and compares it with the version the connected device reports.
//! There is deliberately no install button: the OTA transfer through the Windows BLE backend has not
//! been validated on a physical device, so the native app only tells the wearer what is available.

use std::sync::{Arc, Mutex};

use irms_core::firmware_update::{check_latest, is_newer, FirmwareRelease};
use slint::ComponentHandle;

use crate::{App, MainWindow};

#[derive(Clone, Default)]
pub struct FirmwareCheck {
    status: Arc<Mutex<String>>,
}

impl FirmwareCheck {
    pub fn text(&self) -> String {
        self.status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }
    fn set(&self, text: String) {
        *self.status.lock().unwrap_or_else(|e| e.into_inner()) = text;
    }
}

/// The beta app follows the beta firmware channel, like the Tauri app's own update channel.
pub fn beta_channel(app_version: &str) -> bool {
    app_version.contains('-')
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
    text.push_str("\n原生版尚未驗證實機 OTA,不提供更新按鈕;請用 Tauri 版更新韌體。");
    text
}

pub fn wire(
    ui: &MainWindow,
    check: FirmwareCheck,
    runtime: tokio::runtime::Handle,
    ble: Option<Arc<irms_core::ble::BleState>>,
) {
    let app = ui.global::<App>();
    app.on_firmware_check(move || {
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
            check.set(match check_latest(version, beta_channel(version)).await {
                Ok(release) => summary(device.as_deref(), connected, &release),
                Err(e) => format!("檢查失敗:{e}"),
            });
        });
    });
}

pub fn sync(app: &App, check: &FirmwareCheck) {
    let text = check.text();
    if !text.is_empty() {
        app.set_firmware_status(text.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(s.contains("1465 KB") && s.contains("說明:fix") && s.contains("不提供更新按鈕"));
    }

    #[test]
    fn an_app_older_than_the_firmware_requires_is_told_to_update() {
        let mut r = release("1.2.0", "");
        r.app_compatible = false;
        assert!(summary(Some("1.1.0"), true, &r).contains("請先更新程式"));
    }
}
