//! Settings -> modules: the registry of independently updatable content packs.
//!
//! The pure logic lives in `irms_core::modules`; this file wires it to the window. Network work
//! (check, download) runs on the tokio runtime; file-only actions (disable, roll back, restore) are
//! quick and run on the UI thread. A content pack applies the moment it is installed: tips are read
//! again right away, so no restart is needed. Any failure leaves the previous content in place.

use std::sync::{Arc, Mutex};

use irms_core::modules::{self, Index, ModuleRow, Registry, Status};
use slint::{ComponentHandle, ModelRc, SharedString, VecModel};

use crate::{App, MainWindow, ModuleItem};

struct Inner {
    index: Index,
    status: String,
    busy: bool,
    generation: u64,
    shown: u64,
}

#[derive(Clone)]
pub struct Modules {
    registry: Registry,
    inner: Arc<Mutex<Inner>>,
    builtin_tips: Arc<Vec<String>>,
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
        Status::RolledBack | Status::NeedsNewerApp => 2,
        Status::Disabled => 3,
    }
}

fn note(row: &ModuleRow) -> String {
    match (&row.last_error, row.status) {
        (Some(e), _) => e.clone(),
        (None, Status::Builtin) => "目前使用內建內容".into(),
        (None, Status::Disabled) => "已停用,使用內建內容".into(),
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
    pub fn new(registry: Registry, builtin_tips: Vec<String>) -> Self {
        let index = registry.cached_index();
        Self {
            registry,
            inner: Arc::new(Mutex::new(Inner {
                index,
                status: String::new(),
                busy: false,
                generation: 1,
                shown: 0,
            })),
            builtin_tips: Arc::new(builtin_tips),
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

    pub fn check(&self, runtime: &tokio::runtime::Handle) {
        {
            let mut inner = self.lock();
            if inner.busy {
                return;
            }
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
        let (index, version) = {
            let mut inner = self.lock();
            if inner.busy {
                return;
            }
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
        match self.registry.rollback(id) {
            Ok(v) => self.note_change(format!("已退回 v{v}")),
            Err(e) => self.note_change(e),
        }
    }

    pub fn reset(&self) {
        if self.blocked_by_busy() {
            return;
        }
        match self.registry.reset_all() {
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
        let m = Modules::new(reg.clone(), builtin());
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
