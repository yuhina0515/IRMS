//! Settings -> modules: the registry of independently updatable content packs.
//!
//! The pure logic lives in `irms_core::modules`; this file wires it to the window. Network work
//! (check, download) runs on the tokio runtime; file-only actions (disable, roll back, restore) are
//! quick and run on the UI thread. A content pack applies the moment it is installed: tips are read
//! again right away, so no restart is needed. Any failure leaves the previous content in place.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use irms_core::modules::{self, Index, ModuleRow, Registry, Status};
use slint::{ComponentHandle, ModelRc, SharedString, VecModel};

use crate::{App, MainWindow, ModuleItem};

const FIRST_CHECK_AFTER: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);
const RETRY_AFTER_FAILURE: Duration = Duration::from_secs(60 * 60);

/// A silent index check starts only for a normal run with the preference on and nothing in flight.
pub fn should_start_check(enabled: bool, auto: bool, busy: bool, due: bool) -> bool {
    enabled && auto && !busy && due
}

/// Downloaded packs are installed only while nothing important is going on (the app updater's idle rule).
pub fn should_install(
    enabled: bool,
    auto: bool,
    idle: bool,
    busy: bool,
    has_pending: bool,
) -> bool {
    enabled && auto && idle && !busy && has_pending
}

struct Inner {
    index: Index,
    status: String,
    busy: bool,
    generation: u64,
    shown: u64,
    next_check: Instant,
    /// Ids found by the silent check that wait for an idle moment to be downloaded.
    pending: Vec<String>,
    /// Downloaded, verified packs waiting for an idle moment to be installed (committed on the UI
    /// thread at the instant the app is idle, so an install never lands mid-session).
    staged: Option<Staged>,
}

/// A pack's downloaded files: `(asset name, bytes)`.
type PackFiles = Vec<(String, Vec<u8>)>;

struct Staged {
    index: Index,
    packs: Vec<(String, PackFiles)>,
}

#[derive(Clone)]
pub struct Modules {
    registry: Registry,
    inner: Arc<Mutex<Inner>>,
    builtin_tips: Arc<Vec<String>>,
    /// False for developer runs (custom database, simulator, snapshots), like the app updater.
    auto_allowed: bool,
}

/// Where a database's content packs live: the default database (`irms.sqlite`) keeps the original
/// `modules` folder; any other database file gets its own `<stem>.modules` folder next to it, so two
/// `--db` files in one directory never share installed packs. `:memory:` keeps nothing.
pub fn modules_root(db_location: &str) -> Option<std::path::PathBuf> {
    if db_location == ":memory:" {
        return None;
    }
    let path = std::path::Path::new(db_location);
    let parent = path.parent()?;
    let stem = path.file_stem()?.to_string_lossy().to_string();
    Some(if stem == "irms" {
        parent.join("modules")
    } else {
        parent.join(format!("{stem}.modules"))
    })
}

/// The session tips to show: the active pack's, or the built-in list when no valid pack is active.
pub fn tips_for_display(registry: &Registry, builtin: &[String]) -> Vec<String> {
    registry.active_tips().unwrap_or_else(|| builtin.to_vec())
}

fn tone(status: Status) -> i32 {
    match status {
        Status::Builtin | Status::UpToDate => 0,
        Status::UpdateAvailable | Status::Pending => 1,
        Status::RolledBack | Status::NeedsNewerApp | Status::RolledBackFrom => 2,
        Status::Disabled => 3,
    }
}

fn note(row: &ModuleRow) -> String {
    match (&row.last_error, row.status) {
        (Some(e), _) => e.clone(),
        (None, Status::Builtin) => "目前使用內建內容".into(),
        (None, Status::Disabled) => "已停用,使用內建內容".into(),
        (None, Status::RolledBackFrom) if row.installed.is_none() => {
            "已還原為內建,不會自動安裝此版,等待下一版".into()
        }
        (None, Status::RolledBackFrom) => "不會自動安裝,等待下一版".into(),
        (None, Status::NeedsNewerApp) => "新版套件需要較新的程式才能使用".into(),
        _ => "協助穿戴與校準的使用提示".into(),
    }
}

pub fn items(rows: &[ModuleRow]) -> Vec<ModuleItem> {
    rows.iter()
        .map(|r| ModuleItem {
            id: r.id.as_str().into(),
            name: r.name.as_str().into(),
            note: note(r).into(),
            installed: r.installed.clone().unwrap_or_default().into(),
            available: r.available.clone().unwrap_or_default().into(),
            status: r.status.label().into(),
            tone: tone(r.status),
            can_update: r.can_update,
            can_toggle: r.can_toggle,
            disabled: r.disabled,
            can_rollback: r.can_rollback,
        })
        .collect()
}

impl Modules {
    pub fn new(registry: Registry, builtin_tips: Vec<String>, auto_allowed: bool) -> Self {
        let index = registry.cached_index();
        Self {
            registry,
            inner: Arc::new(Mutex::new(Inner {
                index,
                status: String::new(),
                busy: false,
                generation: 1,
                shown: 0,
                next_check: Instant::now() + FIRST_CHECK_AFTER,
                pending: Vec::new(),
                staged: None,
            })),
            builtin_tips: Arc::new(builtin_tips),
            auto_allowed,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn finish(&self, status: String) {
        let mut inner = self.lock();
        inner.busy = false;
        inner.status = status;
        inner.generation += 1;
    }

    fn note_change(&self, status: String) {
        let mut inner = self.lock();
        inner.status = status;
        inner.generation += 1;
    }

    /// Called from the UI timer: a silent check shortly after launch and then every six hours; found
    /// packs are downloaded when the app is idle and installed at an idle moment. Never while a
    /// manual action is running, and every step re-reads the registry state first.
    pub fn tick(&self, runtime: &tokio::runtime::Handle, auto: bool, idle: bool) {
        let (due, busy, has_pending, has_staged) = {
            let inner = self.lock();
            (
                Instant::now() >= inner.next_check,
                inner.busy,
                !inner.pending.is_empty(),
                inner.staged.is_some(),
            )
        };
        if should_start_check(self.auto_allowed, auto, busy, due) {
            self.auto_check(runtime);
        } else if should_install(self.auto_allowed, auto, idle, busy, has_staged) {
            self.commit_staged();
        } else if should_install(self.auto_allowed, auto, idle, busy, has_pending) {
            self.auto_download(runtime);
        }
    }

    fn auto_check(&self, runtime: &tokio::runtime::Handle) {
        {
            let mut inner = self.lock();
            inner.busy = true;
            inner.status = "正在自動檢查模組…".into();
            inner.generation += 1;
            inner.next_check = Instant::now() + CHECK_EVERY;
        }
        let this = self.clone();
        runtime.spawn(async move {
            let outcome = modules::fetch_index(&this.registry).await;
            // File reads happen before the lock the UI timer also takes.
            let pending = outcome
                .as_ref()
                .map(|index| this.registry.auto_candidates(index))
                .unwrap_or_default();
            let mut inner = this.lock();
            inner.busy = false;
            inner.status.clear();
            inner.generation += 1;
            match outcome {
                Ok(index) => {
                    inner.pending = pending;
                    inner.index = index;
                }
                Err(_) => inner.next_check = Instant::now() + RETRY_AFTER_FAILURE,
            }
        });
    }

    /// Downloads (without installing) what is still an automatic candidate right now.
    fn auto_download(&self, runtime: &tokio::runtime::Handle) {
        let (index, ids) = {
            let mut inner = self.lock();
            inner.busy = true;
            inner.status = "正在自動下載模組更新…".into();
            inner.generation += 1;
            (inner.index.clone(), std::mem::take(&mut inner.pending))
        };
        let this = self.clone();
        runtime.spawn(async move {
            // The list was made at check time; the owner may have rolled back, reset or disabled since.
            let fresh = this.registry.auto_candidates(&index);
            let mut packs = Vec::new();
            let mut failure = None;
            for id in ids.iter().filter(|id| fresh.contains(id)) {
                match modules::download_package(&this.registry, &index, id).await {
                    Ok(files) => packs.push((id.clone(), files)),
                    Err(e) => {
                        failure = Some(e);
                        break;
                    }
                }
            }
            let mut inner = this.lock();
            inner.busy = false;
            inner.generation += 1;
            inner.status = failure
                .as_ref()
                .map(|e| format!("自動更新失敗,仍使用原本的內容:{e}"))
                .unwrap_or_default();
            if failure.is_some() {
                inner.next_check = Instant::now() + RETRY_AFTER_FAILURE;
            }
            if !packs.is_empty() {
                inner.staged = Some(Staged { index, packs });
            }
        });
    }

    /// Installs the staged packs. Runs on the UI thread from `tick` only when the app is idle at that
    /// very moment; `install_auto` re-checks the state on disk, so a pack that stopped being a
    /// candidate (rollback, reset, disable, manual update) is skipped.
    fn commit_staged(&self) {
        let Some(staged) = self.lock().staged.take() else {
            return;
        };
        let mut done = 0;
        let mut failure = None;
        for (id, files) in &staged.packs {
            if !self.registry.auto_candidates(&staged.index).contains(id) {
                continue;
            }
            match self.registry.install_auto(&staged.index, id, files) {
                Ok(()) => done += 1,
                Err(e) => failure = Some(e),
            }
        }
        if let Some(e) = failure {
            let mut inner = self.lock();
            inner.next_check = Instant::now() + RETRY_AFTER_FAILURE;
            drop(inner);
            self.note_change(format!("自動更新失敗,仍使用原本的內容:{e}"));
        } else if done > 0 {
            self.note_change(format!("已自動更新 {done} 個內容套件"));
        }
    }

    /// A manual action changes what an automatic candidate list was based on: drop it.
    fn clear_auto_work(&self) {
        let mut inner = self.lock();
        inner.pending.clear();
        inner.staged = None;
    }

    pub fn check(&self, runtime: &tokio::runtime::Handle) {
        if self.blocked_by_busy() {
            return;
        }
        {
            let mut inner = self.lock();
            inner.busy = true;
            inner.status = "檢查更新中…".into();
            inner.generation += 1;
        }
        let this = self.clone();
        runtime.spawn(async move {
            match modules::fetch_index(&this.registry).await {
                Ok(index) => {
                    let n = index.entries.len();
                    let skipped = index.skipped.len();
                    this.lock().index = index;
                    let mut text = if n == 0 {
                        "已檢查:目前沒有可用的內容套件".to_string()
                    } else {
                        "已檢查,清單簽章驗證通過".to_string()
                    };
                    if skipped > 0 {
                        text.push_str(&format!(";略過 {skipped} 個不合法的項目"));
                    }
                    this.finish(text);
                }
                Err(e) => this.finish(format!("檢查更新失敗,沿用已安裝的內容:{e}")),
            }
        });
    }

    pub fn update(&self, runtime: &tokio::runtime::Handle, id: &str) {
        if self.blocked_by_busy() {
            return;
        }
        self.clear_auto_work();
        let (index, version) = {
            let mut inner = self.lock();
            let Some(version) = inner
                .index
                .entries
                .iter()
                .find(|e| e.id == id)
                .map(|e| e.version.clone())
            else {
                inner.status = "沒有可用的更新,請先檢查更新".into();
                inner.generation += 1;
                return;
            };
            inner.busy = true;
            inner.status = format!("下載並驗證 v{version} 中…");
            inner.generation += 1;
            (inner.index.clone(), version)
        };
        let id = id.to_string();
        let this = self.clone();
        runtime.spawn(async move {
            match modules::download_and_install(&this.registry, &index, &id).await {
                Ok(()) => this.finish(format!("已更新到 v{version},立即生效")),
                Err(e) => this.finish(format!("更新失敗,仍使用原本的內容:{e}")),
            }
        });
    }

    /// File actions must not interleave with an install in flight (the result could be lost).
    fn blocked_by_busy(&self) -> bool {
        let busy = self.lock().busy;
        if busy {
            self.note_change("正在檢查或更新,請稍後再操作".into());
        }
        busy
    }

    pub fn toggle(&self, id: &str) {
        if self.blocked_by_busy() {
            return;
        }
        self.clear_auto_work();
        let disabled = self.registry.state(id).disabled;
        match self.registry.set_disabled(id, !disabled) {
            Ok(()) => self.note_change(
                if disabled {
                    "已啟用"
                } else {
                    "已停用,改用內建內容"
                }
                .into(),
            ),
            Err(e) => self.note_change(e),
        }
    }

    pub fn rollback(&self, id: &str) {
        if self.blocked_by_busy() {
            return;
        }
        self.clear_auto_work();
        match self.registry.rollback(id) {
            Ok(v) => self.note_change(format!("已退回 v{v}")),
            Err(e) => self.note_change(e),
        }
    }

    pub fn reset(&self) {
        if self.blocked_by_busy() {
            return;
        }
        self.clear_auto_work();
        let offered = self.lock().index.entries.clone();
        match self.registry.reset_all(&offered) {
            Ok(()) => self.note_change("已全部還原為內建內容".into()),
            Err(e) => self.note_change(e),
        }
    }

    /// Pushes rows, status and tips into the window when something changed since the last push.
    pub fn sync(&self, app: &App) {
        let (generation, status, busy, available) = {
            let inner = self.lock();
            if inner.shown == inner.generation {
                return;
            }
            (
                inner.generation,
                inner.status.clone(),
                inner.busy,
                inner.index.entries.clone(),
            )
        };
        let rows = self.registry.rows(&available);
        app.set_module_rows(ModelRc::new(VecModel::from(items(&rows))));
        app.set_module_status(status.into());
        app.set_module_busy(busy);
        let tips: Vec<SharedString> = tips_for_display(&self.registry, &self.builtin_tips)
            .into_iter()
            .map(Into::into)
            .collect();
        app.set_tips(ModelRc::new(VecModel::from(tips)));
        self.lock().shown = generation;
    }
}

pub fn wire(ui: &MainWindow, modules: Modules, runtime: tokio::runtime::Handle) {
    let app = ui.global::<App>();
    {
        let m = modules.clone();
        let rt = runtime.clone();
        app.on_module_check(move || m.check(&rt));
    }
    {
        let m = modules.clone();
        app.on_module_update(move |id| m.update(&runtime, &id));
    }
    {
        let m = modules.clone();
        app.on_module_toggle(move |id| m.toggle(&id));
    }
    {
        let m = modules.clone();
        app.on_module_rollback(move |id| m.rollback(&id));
    }
    app.on_module_reset(move || modules.reset());
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use irms_core::modules::{build_content_entry, SESSION_TIPS_ID, TIPS_FILE};
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    fn temp_root(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "irms-native-modules-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_nanos())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn registry(root: &std::path::Path) -> (Registry, Ed25519KeyPair) {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        let kp = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();
        let reg = Registry::new(Some(root.to_path_buf()), "1.3.0-beta.12")
            .with_pubkey(kp.public_key().as_ref().to_vec());
        (reg, kp)
    }

    fn install(reg: &Registry, kp: &Ed25519KeyPair, version: &str, tips: &[&str]) {
        let body =
            serde_json::to_vec(&serde_json::json!({"schema_version": 1, "tips": tips})).unwrap();
        let entry = build_content_entry(
            SESSION_TIPS_ID,
            version,
            "使用提示",
            1,
            "v2026.11.22",
            &[(TIPS_FILE, &body)],
        );
        let raw = serde_json::to_vec(&serde_json::json!({"schema": 1, "native": [entry]})).unwrap();
        let sig = base64::engine::general_purpose::STANDARD.encode(kp.sign(&raw).as_ref());
        let index = irms_core::modules::verify_index(&raw, &sig, kp.public_key().as_ref()).unwrap();
        reg.install(
            &index,
            SESSION_TIPS_ID,
            &[(index.entries[0].files[0].name.clone(), body)],
        )
        .unwrap();
    }

    fn builtin() -> Vec<String> {
        vec!["built-in one".into(), "built-in two".into()]
    }

    #[test]
    fn tips_come_from_the_installed_pack_and_fall_back_to_the_built_in_list() {
        let root = temp_root("tips");
        let (reg, kp) = registry(&root);
        assert_eq!(
            tips_for_display(&reg, &builtin()),
            builtin(),
            "nothing installed"
        );
        install(&reg, &kp, "1.0.0", &["from the pack"]);
        assert_eq!(tips_for_display(&reg, &builtin()), vec!["from the pack"]);
        reg.set_disabled(SESSION_TIPS_ID, true).unwrap();
        assert_eq!(tips_for_display(&reg, &builtin()), builtin(), "disabled");
        reg.set_disabled(SESSION_TIPS_ID, false).unwrap();
        std::fs::write(
            root.join(SESSION_TIPS_ID).join("1.0.0").join(TIPS_FILE),
            b"corrupt",
        )
        .unwrap();
        assert_eq!(
            tips_for_display(&reg, &builtin()),
            builtin(),
            "corrupt pack"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn rows_show_the_pack_status_for_the_page() {
        let root = temp_root("rows");
        let (reg, kp) = registry(&root);
        let rows = items(&reg.rows(&[]));
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status.as_str(), "內建");
        install(&reg, &kp, "1.0.0", &["a"]);
        let rows = items(&reg.rows(&[]));
        assert_eq!(rows[0].installed.as_str(), "1.0.0");
        assert_eq!(rows[0].status.as_str(), "最新");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn file_actions_are_refused_while_a_check_or_install_is_running() {
        let root = temp_root("busy");
        let (reg, kp) = registry(&root);
        install(&reg, &kp, "1.0.0", &["a"]);
        install(&reg, &kp, "1.1.0", &["b"]);
        let m = Modules::new(reg.clone(), builtin(), true);
        m.lock().busy = true;
        m.toggle(SESSION_TIPS_ID);
        m.rollback(SESSION_TIPS_ID);
        m.reset();
        let state = reg.state(SESSION_TIPS_ID);
        assert!(!state.disabled);
        assert_eq!(state.version.as_deref(), Some("1.1.0"));
        assert_eq!(state.previous.as_deref(), Some("1.0.0"));
        assert!(m.lock().status.contains("請稍後"));
        m.lock().busy = false;
        m.toggle(SESSION_TIPS_ID);
        assert!(reg.state(SESSION_TIPS_ID).disabled);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn the_automatic_path_needs_a_normal_run_the_preference_and_an_idle_app() {
        assert!(should_start_check(true, true, false, true));
        assert!(
            !should_start_check(false, true, false, true),
            "developer run"
        );
        assert!(
            !should_start_check(true, false, false, true),
            "preference off"
        );
        assert!(!should_start_check(true, true, true, true), "busy");
        assert!(!should_start_check(true, true, false, false), "not due");
        assert!(should_install(true, true, true, false, true));
        assert!(
            !should_install(false, true, true, false, true),
            "developer run"
        );
        assert!(
            !should_install(true, false, true, false, true),
            "preference off"
        );
        assert!(!should_install(true, true, false, false, true), "not idle");
        assert!(!should_install(true, true, true, true, true), "busy");
        assert!(
            !should_install(true, true, true, false, false),
            "nothing pending"
        );
    }

    #[test]
    fn tick_never_starts_work_when_busy_not_idle_off_or_in_a_developer_run() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let root = temp_root("tick");
        let (reg, _kp) = registry(&root);
        let due = Instant::now() - Duration::from_secs(1);
        for (allowed, auto, idle, busy) in [
            (false, true, true, false),
            (true, false, true, false),
            (true, true, true, true),
        ] {
            let m = Modules::new(reg.clone(), builtin(), allowed);
            {
                let mut inner = m.lock();
                inner.next_check = due;
                inner.busy = busy;
            }
            m.tick(rt.handle(), auto, idle);
            let inner = m.lock();
            assert_eq!(inner.busy, busy, "{allowed} {auto} {idle} {busy}");
            assert_eq!(inner.next_check, due, "no check was started");
        }
        // Found packs wait for an idle moment instead of installing mid-session.
        let m = Modules::new(reg.clone(), builtin(), true);
        m.lock().pending = vec![SESSION_TIPS_ID.to_string()];
        m.tick(rt.handle(), true, false);
        let inner = m.lock();
        assert!(!inner.busy);
        assert_eq!(inner.pending.len(), 1, "still waiting");
        drop(inner);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn nothing_is_checked_before_the_first_check_is_due() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let m = Modules::new(Registry::new(None, "1.3.0"), builtin(), true);
        m.tick(rt.handle(), true, true);
        assert!(!m.lock().busy);
    }

    #[test]
    fn a_rolled_back_version_shows_its_mark_on_the_page() {
        let root = temp_root("mark");
        let (reg, kp) = registry(&root);
        install(&reg, &kp, "1.0.0", &["a"]);
        install(&reg, &kp, "1.1.0", &["b"]);
        reg.rollback(SESSION_TIPS_ID).unwrap();
        let body =
            serde_json::to_vec(&serde_json::json!({"schema_version": 1, "tips": ["b"]})).unwrap();
        let entry = build_content_entry(
            SESSION_TIPS_ID,
            "1.1.0",
            "使用提示",
            1,
            "v2026.11.22",
            &[(TIPS_FILE, &body)],
        );
        let rows = items(&reg.rows(&[entry]));
        assert_eq!(rows[0].status.as_str(), "已退回此版");
        assert!(rows[0].note.contains("不會自動安裝,等待下一版"));
        assert!(rows[0].can_update, "the manual button still works");
        let _ = std::fs::remove_dir_all(root);
    }

    fn offer(kp: &Ed25519KeyPair, version: &str) -> (Index, Vec<(String, Vec<u8>)>) {
        let body = serde_json::to_vec(
            &serde_json::json!({"schema_version": 1, "tips": [format!("tips {version}")]}),
        )
        .unwrap();
        let entry = build_content_entry(
            SESSION_TIPS_ID,
            version,
            "使用提示",
            1,
            "v2026.11.22",
            &[(TIPS_FILE, &body)],
        );
        let raw = serde_json::to_vec(&serde_json::json!({"schema": 1, "native": [entry]})).unwrap();
        let sig = base64::engine::general_purpose::STANDARD.encode(kp.sign(&raw).as_ref());
        let index = irms_core::modules::verify_index(&raw, &sig, kp.public_key().as_ref()).unwrap();
        let files = vec![(index.entries[0].files[0].name.clone(), body)];
        (index, files)
    }

    fn rt() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn a_stale_candidate_list_never_reinstalls_a_version_the_owner_rolled_back_from() {
        let rt = rt();
        let root = temp_root("stale");
        let (reg, kp) = registry(&root);
        install(&reg, &kp, "1.0.0", &["a"]);
        let (idx, files) = offer(&kp, "1.1.0");
        let m = Modules::new(reg.clone(), builtin(), true);
        // The check found 1.1.0 while the app was busy; the pack waits for an idle moment.
        {
            let mut inner = m.lock();
            inner.index = idx.clone();
            inner.pending = reg.auto_candidates(&idx);
            inner.staged = Some(Staged {
                index: idx.clone(),
                packs: vec![(SESSION_TIPS_ID.into(), files.clone())],
            });
        }
        assert_eq!(m.lock().pending.len(), 1);
        // The owner updates by hand to 1.1.0 and rolls back: both manual actions drop the lists.
        reg.install(&idx, SESSION_TIPS_ID, &files).unwrap();
        m.rollback(SESSION_TIPS_ID);
        assert!(m.lock().pending.is_empty() && m.lock().staged.is_none());
        // Even if a stale list survived somehow, the install re-checks the state on disk.
        {
            let mut inner = m.lock();
            inner.pending = vec![SESSION_TIPS_ID.into()];
            inner.staged = Some(Staged {
                index: idx.clone(),
                packs: vec![(SESSION_TIPS_ID.into(), files.clone())],
            });
        }
        m.tick(rt.handle(), true, true);
        let state = reg.state(SESSION_TIPS_ID);
        assert_eq!(state.version.as_deref(), Some("1.0.0"));
        assert_eq!(state.rolled_back_from.as_deref(), Some("1.1.0"));
        // The same holds after 全部還原為內建 and after 停用.
        m.reset();
        assert_eq!(reg.active_tips(), None);
        assert!(reg.auto_candidates(&idx).is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_downloaded_pack_installs_only_at_an_idle_moment() {
        let rt = rt();
        let root = temp_root("idleinstall");
        let (reg, kp) = registry(&root);
        install(&reg, &kp, "1.0.0", &["a"]);
        let (idx, files) = offer(&kp, "1.1.0");
        let m = Modules::new(reg.clone(), builtin(), true);
        m.lock().staged = Some(Staged {
            index: idx,
            packs: vec![(SESSION_TIPS_ID.into(), files)],
        });
        m.tick(rt.handle(), true, false);
        assert_eq!(reg.state(SESSION_TIPS_ID).version.as_deref(), Some("1.0.0"));
        assert!(m.lock().staged.is_some(), "kept for the next idle tick");
        m.tick(rt.handle(), true, true);
        assert_eq!(reg.state(SESSION_TIPS_ID).version.as_deref(), Some("1.1.0"));
        assert!(m.lock().staged.is_none());
        assert!(m.lock().status.contains("已自動更新"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn restore_built_in_is_not_undone_by_the_next_automatic_check() {
        let root = temp_root("resethold");
        let (reg, kp) = registry(&root);
        install(&reg, &kp, "1.0.0", &["a"]);
        let (idx, _) = offer(&kp, "1.1.0");
        let m = Modules::new(reg.clone(), builtin(), true);
        m.lock().index = idx.clone();
        m.reset();
        assert!(
            reg.auto_candidates(&idx).is_empty(),
            "held until a newer version"
        );
        let rows = items(&reg.rows(&idx.entries));
        assert_eq!(rows[0].status.as_str(), "已退回此版");
        assert!(rows[0].note.contains("已還原為內建"));
        assert!(rows[0].can_update);
        let (newer, _) = offer(&kp, "1.2.0");
        assert_eq!(reg.auto_candidates(&newer).len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn manual_clicks_while_an_automatic_task_runs_get_feedback() {
        let rt = rt();
        let m = Modules::new(Registry::new(None, "1.3.0"), builtin(), true);
        m.lock().busy = true;
        m.lock().status.clear();
        m.check(rt.handle());
        assert!(m.lock().status.contains("請稍後"));
        m.lock().status.clear();
        m.update(rt.handle(), SESSION_TIPS_ID);
        assert!(m.lock().status.contains("請稍後"));
        assert!(m.lock().busy, "the running task is untouched");
    }

    #[test]
    fn each_database_file_gets_its_own_modules_folder() {
        use std::path::PathBuf;
        assert_eq!(modules_root(":memory:"), None);
        assert_eq!(
            modules_root(r"C:\data\irms-native-prototype\irms.sqlite"),
            Some(PathBuf::from(r"C:\data\irms-native-prototype").join("modules"))
        );
        let a = modules_root(r"D:\x\a.sqlite").unwrap();
        let b = modules_root(r"D:\x\b.sqlite").unwrap();
        assert_ne!(a, b);
        assert_ne!(a, PathBuf::from(r"D:\x").join("modules"));
    }
}
