//! 原生偏好以獨立資料庫的 sidecar 儲存，不改共用 SQLite schema。
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub version: u32,
    pub style: i32,
    pub night: bool,
    pub pose: i32,
    pub voice_enabled: bool,
    pub action_id: Option<String>,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            version: 1,
            style: 1,
            night: false,
            pose: 0,
            voice_enabled: true,
            action_id: None,
        }
    }
}
impl Preferences {
    /// 無效的列舉回到預設，資料庫 ID 保持字串以避免 i64 精度損失。
    fn normalized(mut self) -> Self {
        if !(0..=2).contains(&self.style) {
            self.style = 1;
        }
        if !(0..=2).contains(&self.pose) {
            self.pose = 0;
        }
        self.action_id = self
            .action_id
            .filter(|id| id.len() <= 20 && id.parse::<i64>().is_ok_and(|id| id > 0));
        self
    }
}

pub struct PreferenceStore {
    path: Option<PathBuf>,
    blocked: bool,
    reset_failed: bool,
    pub status: String,
    pub loaded: Preferences,
    observed: Preferences,
    candidate: Preferences,
    changed_at: Instant,
    attempted: bool,
}
impl PreferenceStore {
    /// Store::open 通過資料庫隔離與鎖定後才呼叫；記憶體模式不建立檔案。
    pub fn open(database: &str) -> Self {
        let path = if database == ":memory:" {
            None
        } else {
            let resolved = fs::canonicalize(database).unwrap_or_else(|_| PathBuf::from(database));
            let mut name = resolved.into_os_string();
            name.push(".preferences.json");
            Some(PathBuf::from(name))
        };
        let mut blocked = false;
        let mut status = String::new();
        let loaded = if let Some(path) = &path {
            let read = (|| -> Result<Preferences, String> {
                let metadata = match fs::metadata(path) {
                    Ok(meta) => meta,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                        return Ok(Preferences::default())
                    }
                    Err(error) => return Err(error.to_string()),
                };
                if metadata.len() > 16 * 1024 {
                    return Err("偏好檔超過大小上限".into());
                }
                let mut bytes = Vec::new();
                fs::File::open(path)
                    .map_err(|e| e.to_string())?
                    .take(16385)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                if bytes.len() > 16 * 1024 {
                    return Err("偏好檔超過大小上限".into());
                }
                let envelope: serde_json::Value =
                    serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                if envelope.get("version").and_then(|v| v.as_u64()) != Some(1) {
                    return Err("缺少或不支援的偏好檔版本".into());
                }
                let value: Preferences =
                    serde_json::from_value(envelope).map_err(|e| e.to_string())?;
                Ok(value.normalized())
            })();
            match read {
                Ok(value) => value,
                Err(error) => {
                    blocked = true;
                    status = format!("偏好讀取失敗：{error}。使用預設值；可按重設偏好重建。");
                    Preferences::default()
                }
            }
        } else {
            Preferences::default()
        };
        Self {
            path,
            blocked,
            reset_failed: false,
            status,
            loaded: loaded.clone(),
            observed: loaded.clone(),
            candidate: loaded,
            changed_at: Instant::now(),
            attempted: false,
        }
    }
    /// CLI 覆寫僅限此次執行；日後只合併使用者實際修改的欄位。
    pub fn start_run(&mut self, current: Preferences, reconcile_action: bool) {
        if reconcile_action {
            self.candidate.action_id = current.action_id.clone();
        }
        self.observed = current;
        self.changed_at = Instant::now();
    }
    pub fn observe(&mut self, current: Preferences) {
        if current == self.observed {
            return;
        }
        macro_rules! merge {
            ($field:ident) => {
                if current.$field != self.observed.$field {
                    self.candidate.$field = current.$field;
                }
            };
        }
        merge!(style);
        merge!(night);
        merge!(pose);
        merge!(voice_enabled);
        if current.action_id != self.observed.action_id {
            self.candidate.action_id = current.action_id.clone();
        }
        self.observed = current;
        self.changed_at = Instant::now();
        self.attempted = false;
    }
    /// 定時器去抖只嘗試一次；失敗保留候選值供明確重試或關窗前補寫。
    pub fn flush(&mut self, force: bool) -> Result<(), String> {
        if self.candidate == self.loaded {
            if !self.blocked && !self.reset_failed {
                self.status.clear();
                self.attempted = false;
            }
            return Ok(());
        }
        if !force && (self.attempted || self.changed_at.elapsed() < Duration::from_millis(300)) {
            return Ok(());
        }
        self.attempted = true;
        if self.blocked {
            return Err(self.status.clone());
        }
        let result = self.write(&self.candidate);
        match result {
            Ok(()) => {
                self.loaded = self.candidate.clone();
                self.status.clear();
                self.reset_failed = false;
                Ok(())
            }
            Err(error) => {
                self.status = format!("偏好儲存失敗：{error}");
                Err(self.status.clone())
            }
        }
    }
    /// 明確重設才解除損壞／未來版本檔案的覆寫保護。
    pub fn reset(&mut self, current: Preferences) -> Result<(), String> {
        if let Err(error) = self.write(&current) {
            self.reset_failed = true;
            self.status = format!("偏好重設失敗：{error}");
            return Err(self.status.clone());
        }
        self.blocked = false;
        self.reset_failed = false;
        self.loaded = current.clone();
        self.candidate = current.clone();
        self.observed = current;
        self.status.clear();
        self.attempted = false;
        Ok(())
    }
    pub fn can_retry(&self) -> bool {
        !self.blocked && !self.reset_failed && self.candidate != self.loaded
    }
    fn write(&self, value: &Preferences) -> Result<(), String> {
        let Some(path) = &self.path else {
            return Ok(());
        };
        let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
        let mut temp_name = path.as_os_str().to_os_string();
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        temp_name.push(format!(".{}.{nonce}.tmp", std::process::id()));
        let temp_path = PathBuf::from(temp_name);
        let result = (|| -> std::io::Result<()> {
            let mut file = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp_path)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            // 同目錄替換；絕不先刪除上次成功的設定。
            fs::rename(&temp_path, path)
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        result.map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    struct TempDb(PathBuf);
    impl TempDb {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir()
                .join(format!("irms-preferences-{}-{nonce}", std::process::id()));
            fs::create_dir(&dir).unwrap();
            let db = dir.join("test.sqlite");
            fs::write(&db, []).unwrap();
            Self(db)
        }
        fn open(&self) -> PreferenceStore {
            PreferenceStore::open(self.0.to_str().unwrap())
        }
    }
    impl Drop for TempDb {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(self.0.parent().unwrap());
        }
    }
    #[test]
    fn preferences_survive_restart_and_databases_are_isolated() {
        let db = TempDb::new();
        let other = TempDb::new();
        let mut store = db.open();
        let mut chosen = Preferences {
            night: true,
            pose: 2,
            voice_enabled: false,
            action_id: Some(i64::MAX.to_string()),
            ..Preferences::default()
        };
        store.observe(chosen.clone());
        store.flush(true).unwrap();
        assert_eq!(db.open().loaded, chosen);
        assert_eq!(other.open().loaded, Preferences::default());
        chosen.style = 2;
        store.observe(chosen.clone());
        store.flush(true).unwrap();
        assert_eq!(db.open().loaded, chosen);
    }
    #[test]
    fn run_local_overrides_do_not_leak_through_unrelated_edits() {
        let db = TempDb::new();
        let mut store = db.open();
        let override_values = Preferences {
            night: true,
            voice_enabled: false,
            ..Preferences::default()
        };
        store.start_run(override_values.clone(), false);
        store.observe(Preferences {
            pose: 1,
            ..override_values
        });
        store.flush(true).unwrap();
        assert_eq!(
            db.open().loaded,
            Preferences {
                pose: 1,
                ..Preferences::default()
            }
        );
    }
    #[test]
    fn corrupt_future_and_oversized_files_are_not_silently_overwritten() {
        for bytes in [
            b"broken".to_vec(),
            br#"{"version":2,"night":true}"#.to_vec(),
            b"{}".to_vec(),
            vec![b' '; 16385],
        ] {
            let db = TempDb::new();
            let path = db.open().path.unwrap();
            fs::write(&path, &bytes).unwrap();
            let mut store = db.open();
            assert!(store.blocked);
            store.observe(Preferences {
                night: true,
                ..Preferences::default()
            });
            assert!(store.flush(true).is_err());
            assert_eq!(fs::read(&path).unwrap(), bytes);
            store.reset(Preferences::default()).unwrap();
            assert!(!db.open().blocked);
        }
    }
    #[test]
    fn memory_mode_has_no_files_and_invalid_enums_are_bounded() {
        let mut store = PreferenceStore::open(":memory:");
        assert!(store.path.is_none());
        store.observe(Preferences {
            night: true,
            ..Preferences::default()
        });
        store.flush(true).unwrap();
        let invalid = Preferences {
            style: 99,
            pose: -2,
            action_id: Some("-1".into()),
            ..Preferences::default()
        }
        .normalized();
        assert_eq!(invalid, Preferences::default());
    }
    #[cfg(windows)]
    #[test]
    fn failed_replacement_retains_previous_file_and_dirty_changes_for_retry() {
        use std::os::windows::fs::OpenOptionsExt;
        let db = TempDb::new();
        let mut store = db.open();
        store.reset(Preferences::default()).unwrap();
        let path = store.path.clone().unwrap();
        let original = fs::read(&path).unwrap();
        let lock = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        store.observe(Preferences {
            night: true,
            ..Preferences::default()
        });
        assert!(store.flush(true).is_err());
        drop(lock);
        assert_eq!(fs::read(&path).unwrap(), original);
        store.flush(true).unwrap();
        assert!(db.open().loaded.night);
    }
    #[cfg(windows)]
    #[test]
    fn cancelled_dirty_changes_clear_write_errors_and_reset_errors_remain_visible() {
        use std::os::windows::fs::OpenOptionsExt;
        let db = TempDb::new();
        let mut store = db.open();
        store.reset(Preferences::default()).unwrap();
        let lock = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(store.path.as_ref().unwrap())
            .unwrap();
        store.observe(Preferences {
            night: true,
            ..Preferences::default()
        });
        assert!(store.flush(true).is_err());
        assert!(!store.status.is_empty());
        store.observe(Preferences::default());
        store.flush(false).unwrap();
        assert!(store.status.is_empty());
        assert!(store.reset(Preferences::default()).is_err());
        let status = store.status.clone();
        store.flush(false).unwrap();
        assert_eq!(store.status, status);
        assert!(!store.can_retry());
        drop(lock);
        store.reset(Preferences::default()).unwrap();
        assert!(store.status.is_empty());
    }
}
