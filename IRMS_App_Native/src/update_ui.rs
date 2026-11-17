//! Automatic update check and install (Settings / Software).
//!
//! The beta channel's signed installer is fetched by `irms_core::app_update` (manifest, official URL
//! only, minisign signature). With "自動更新" on, a check runs shortly after launch and then every six
//! hours. A verified installer is started only while nothing important is going on (no session, wizard,
//! wearing check or editor); the installer then closes this app politely, installs silently and starts
//! the new version.

use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use irms_core::app_update::{self, VerifiedInstaller};
use slint::ComponentHandle;

use crate::{App, MainWindow};

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const RETRY_AFTER_FAILURE: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, PartialEq)]
enum Phase {
    Idle,
    Busy,
    Ready(VerifiedInstaller),
    Launched,
}

struct Inner {
    phase: Phase,
    status: String,
    next_check: Instant,
}

#[derive(Clone)]
pub struct Updater {
    inner: Arc<Mutex<Inner>>,
    enabled: bool,
}

/// An update only starts when nothing the wearer is doing would be cut off.
pub fn should_install(auto: bool, idle: bool, ready: bool) -> bool {
    auto && idle && ready
}

impl Updater {
    /// `enabled` is false for developer runs (custom database, simulator): they must never replace the
    /// installed app.
    pub fn new(enabled: bool) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                phase: Phase::Idle,
                status: if enabled {
                    String::new()
                } else {
                    "開發模式(自訂資料庫或模擬器)下不檢查更新".into()
                },
                next_check: Instant::now() + FIRST_CHECK_AFTER,
            })),
            enabled,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn status(&self) -> String {
        self.lock().status.clone()
    }

    pub fn ready(&self) -> bool {
        matches!(self.lock().phase, Phase::Ready(_))
    }

    /// Starts a background check + download unless one is already running or an installer is waiting.
    pub fn start_check(&self, runtime: &tokio::runtime::Handle) {
        if !self.enabled {
            return;
        }
        {
            let mut inner = self.lock();
            if inner.phase != Phase::Idle {
                return;
            }
            inner.phase = Phase::Busy;
            inner.status = "檢查更新中…".into();
            inner.next_check = Instant::now() + CHECK_EVERY;
        }
        let this = self.clone();
        runtime.spawn(async move {
            let current = env!("CARGO_PKG_VERSION");
            let outcome = match app_update::check(current).await {
                Ok(None) => (Phase::Idle, format!("已是最新版本(v{current})")),
                Ok(Some(info)) => {
                    this.lock().status = format!("發現 v{},下載並驗證簽章中…", info.version);
                    match app_update::download(&info).await {
                        Ok(installer) => {
                            let text = format!("v{} 已下載並驗證簽章,可以安裝", installer.version);
                            (Phase::Ready(installer), text)
                        }
                        Err(e) => (Phase::Idle, format!("更新失敗:{e}")),
                    }
                }
                Err(e) => (Phase::Idle, format!("檢查更新失敗:{e}")),
            };
            let mut inner = this.lock();
            inner.phase = outcome.0;
            inner.status = outcome.1;
        });
    }

    /// Starts the verified installer (silent self-update mode: restarts the app and leaves a Tauri install alone).
    pub fn install(&self) {
        let installer: VerifiedInstaller = {
            let inner = self.lock();
            match &inner.phase {
                Phase::Ready(installer) => installer.clone(),
                _ => return,
            }
        };
        let result = Command::new(&installer.path).args(["/SELFUPDATE"]).spawn();
        let mut inner = self.lock();
        match result {
            Ok(_) => {
                inner.phase = Phase::Launched;
                inner.status = format!("正在安裝 v{}:程式會自動關閉並重新開啟", installer.version);
            }
            Err(e) => {
                // Back to idle with a pause: staying "ready" made the timer retry every tick.
                inner.phase = Phase::Idle;
                inner.next_check = Instant::now() + RETRY_AFTER_FAILURE;
                inner.status = format!("無法啟動安裝程式:{e}");
            }
        }
    }

    fn check_due(&self) -> bool {
        let inner = self.lock();
        inner.phase == Phase::Idle && Instant::now() >= inner.next_check
    }

    /// Called from the UI timer.
    pub fn tick(&self, runtime: &tokio::runtime::Handle, auto: bool, idle: bool) {
        if !self.enabled {
            return;
        }
        if auto && self.check_due() {
            self.start_check(runtime);
        }
        if should_install(auto, idle, self.ready()) {
            self.install();
        }
    }
}

pub fn wire(ui: &MainWindow, updater: Updater, runtime: tokio::runtime::Handle) {
    let app = ui.global::<App>();
    app.on_update_check(move || updater.start_check(&runtime));
}

pub fn sync(app: &App, updater: &Updater) {
    let text = updater.status();
    if !text.is_empty() {
        app.set_update_status(text.into());
    }
    app.set_update_ready(updater.ready());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_update_installs_only_when_enabled_idle_and_ready() {
        assert!(should_install(true, true, true));
        assert!(!should_install(false, true, true));
        assert!(!should_install(true, false, true));
        assert!(!should_install(true, true, false));
    }

    #[test]
    fn a_developer_run_never_checks_or_installs() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let u = Updater::new(false);
        u.start_check(rt.handle());
        u.tick(rt.handle(), true, true);
        u.install();
        assert!(!u.ready());
        assert!(u.status().contains("開發模式"));
    }

    #[test]
    fn nothing_happens_before_the_first_check_is_due() {
        let u = Updater::new(true);
        assert!(!u.check_due());
        assert_eq!(u.status(), "");
    }

    #[test]
    fn a_failed_installer_start_goes_back_to_idle_and_is_not_retried_every_tick() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let u = Updater::new(true);
        u.lock().phase = Phase::Ready(VerifiedInstaller {
            version: "9.9.9".into(),
            path: std::env::temp_dir().join("irms-no-such-installer-for-test.exe"),
        });
        assert!(u.ready());
        u.tick(rt.handle(), true, true);
        assert!(!u.ready(), "the unusable installer is dropped");
        assert!(u.status().contains("無法啟動安裝程式"));
        assert_eq!(u.lock().phase, Phase::Idle);
        assert!(!u.check_due(), "the next check waits instead of looping");
    }
}
