// commands.rs — Tauri IPC surface for the DB layer (db.rs), wired up now that Phase 2a's
// platform-adapter seam exists on the frontend side to call into. Mirrors main/ipc.ts's handler
// list; command names use snake_case (Rust/Tauri convention) where the Electron IPC channel
// strings used "session:start" style — the frontend adapter is what translates between the two
// naming conventions, not this file.

use crate::db::{actions_repo, angle_ranges_repo, data_repo, sessions_repo};
use crate::types::{
    AngleRangeInput, AngleRangeRecord, CustomAction, CustomActionInput, SensorReading, Session,
    SessionStartInput, StoredReading,
};
use rusqlite::Connection;
use std::sync::{Mutex, MutexGuard};

pub struct DbState(pub Mutex<Connection>);

fn to_err(e: rusqlite::Error) -> String {
    e.to_string()
}

/// SQLite 連線由所有 Tauri DB command 共用。若某次 command 在持鎖期間 panic，
/// Rust 會把 mutex 標記為 poisoned；這裡把它轉成可觀測的 IPC 錯誤，而不是讓後續
/// 每一個 DB command 都因 `unwrap()` 再次 panic、造成整個資料層不可診斷地失效。
fn lock_db(state: &DbState) -> Result<MutexGuard<'_, Connection>, String> {
    state
        .0
        .lock()
        .map_err(|_| "database lock poisoned by a previous command failure".to_string())
}

#[tauri::command]
pub fn actions_list(state: tauri::State<DbState>) -> Result<Vec<CustomAction>, String> {
    let conn = lock_db(&state)?;
    actions_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn actions_create(
    state: tauri::State<DbState>,
    input: CustomActionInput,
) -> Result<CustomAction, String> {
    let conn = lock_db(&state)?;
    actions_repo::create(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn actions_update(
    state: tauri::State<DbState>,
    id: i64,
    input: CustomActionInput,
) -> Result<CustomAction, String> {
    let conn = lock_db(&state)?;
    actions_repo::update(&conn, id, &input).map_err(to_err)
}

#[tauri::command]
pub fn actions_delete(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = lock_db(&state)?;
    actions_repo::delete(&conn, id).map_err(to_err)
}

#[tauri::command]
pub fn actions_restore_defaults(state: tauri::State<DbState>) -> Result<Vec<CustomAction>, String> {
    let conn = lock_db(&state)?;
    actions_repo::restore_defaults(&conn).map_err(to_err)
}

#[tauri::command]
pub fn sessions_start(
    state: tauri::State<DbState>,
    input: SessionStartInput,
) -> Result<i64, String> {
    let conn = lock_db(&state)?;
    sessions_repo::start(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn sessions_update_reps(
    state: tauri::State<DbState>,
    session_id: i64,
    reps_completed: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    sessions_repo::update_reps(&conn, session_id, reps_completed).map_err(to_err)
}

#[tauri::command]
pub fn sessions_end(
    state: tauri::State<DbState>,
    session_id: i64,
    reps_completed: i64,
) -> Result<(), String> {
    let conn = lock_db(&state)?;
    sessions_repo::end(&conn, session_id, reps_completed).map_err(to_err)
}

#[tauri::command]
pub fn sessions_list(state: tauri::State<DbState>) -> Result<Vec<Session>, String> {
    let conn = lock_db(&state)?;
    sessions_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn sessions_get_data(
    state: tauri::State<DbState>,
    session_id: i64,
    max_points: Option<usize>,
) -> Result<Vec<StoredReading>, String> {
    let conn = lock_db(&state)?;
    sessions_repo::get_data(&conn, session_id, max_points).map_err(to_err)
}

#[tauri::command]
pub fn sessions_delete(state: tauri::State<DbState>, session_id: i64) -> Result<(), String> {
    let conn = lock_db(&state)?;
    sessions_repo::delete(&conn, session_id).map_err(to_err)
}

#[tauri::command]
pub fn angle_ranges_list(state: tauri::State<DbState>) -> Result<Vec<AngleRangeRecord>, String> {
    let conn = lock_db(&state)?;
    angle_ranges_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn angle_ranges_add(
    state: tauri::State<DbState>,
    input: AngleRangeInput,
) -> Result<AngleRangeRecord, String> {
    let conn = lock_db(&state)?;
    angle_ranges_repo::add(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn mobility_list(
    state: tauri::State<DbState>,
) -> Result<Vec<crate::types::MobilityRecordRow>, String> {
    let conn = lock_db(&state)?;
    crate::db::mobility_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn mobility_add(
    state: tauri::State<DbState>,
    input: crate::types::MobilityRecordInput,
) -> Result<crate::types::MobilityRecordRow, String> {
    let conn = lock_db(&state)?;
    crate::db::mobility_repo::add(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn mobility_delete(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = lock_db(&state)?;
    crate::db::mobility_repo::delete(&conn, id).map_err(to_err)
}

#[tauri::command]
pub fn calibration_profiles_list(
    state: tauri::State<DbState>,
) -> Result<Vec<crate::types::CalibrationProfileRow>, String> {
    let conn = lock_db(&state)?;
    crate::db::calibration_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn calibration_profiles_add(
    state: tauri::State<DbState>,
    input: crate::types::CalibrationProfileInput,
) -> Result<crate::types::CalibrationProfileRow, String> {
    let mut conn = lock_db(&state)?;
    crate::db::calibration_repo::add(&mut conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn calibration_profiles_delete(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = lock_db(&state)?;
    crate::db::calibration_repo::delete(&conn, &id).map_err(to_err)
}

#[tauri::command]
pub fn angle_ranges_delete(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = lock_db(&state)?;
    angle_ranges_repo::delete(&conn, id).map_err(to_err)
}

#[tauri::command]
pub fn export_write_text(path: String, contents: String) -> Result<(), String> {
    validate_export_target(&path, contents.len())?;
    std::fs::write(&path, contents).map_err(|e| format!("write {path}: {e}"))
}

/// RISK-FIX (2026-10-10): the only caller exports CSV after a native save dialog, so the command
/// accepts nothing else: a `.csv` file in an existing directory, bounded in size. This stops a
/// compromised WebView from using it to overwrite arbitrary files (configs, executables).
const MAX_EXPORT_BYTES: usize = 256 * 1024 * 1024;

fn validate_export_target(path: &str, len: usize) -> Result<(), String> {
    let p = std::path::Path::new(path);
    let is_csv = p
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("csv"));
    if path.is_empty() || !p.is_absolute() || !is_csv {
        return Err("export path must be an absolute .csv file path".to_string());
    }
    if len > MAX_EXPORT_BYTES {
        return Err("export is too large".to_string());
    }
    if p.is_dir() {
        return Err("export path is a directory".to_string());
    }
    match p.parent() {
        Some(dir) if dir.is_dir() => Ok(()),
        _ => Err("export directory does not exist".to_string()),
    }
}

#[tauri::command]
pub fn sessions_purge_demo(state: tauri::State<DbState>) -> Result<usize, String> {
    let conn = lock_db(&state)?;
    sessions_repo::purge_demo(&conn).map_err(to_err)
}

#[tauri::command]
pub fn data_append_batch(
    state: tauri::State<DbState>,
    session_id: i64,
    readings: Vec<SensorReading>,
) -> Result<usize, String> {
    let mut conn = lock_db(&state)?;
    data_repo::append_batch(&mut conn, session_id, &readings).map_err(to_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_target_accepts_only_absolute_csv_in_existing_dir() {
        let dir = std::env::temp_dir();
        let ok = dir.join("irms_export_ok.CSV");
        assert!(validate_export_target(ok.to_str().unwrap(), 10).is_ok());
        assert!(validate_export_target("", 10).is_err());
        assert!(validate_export_target("relative.csv", 10).is_err());
        let exe = dir.join("evil.exe");
        assert!(validate_export_target(exe.to_str().unwrap(), 10).is_err());
        let missing = dir.join("no_such_dir_irms").join("a.csv");
        assert!(validate_export_target(missing.to_str().unwrap(), 10).is_err());
        assert!(validate_export_target(ok.to_str().unwrap(), MAX_EXPORT_BYTES + 1).is_err());
    }
    use std::sync::Arc;

    #[test]
    fn poisoned_db_lock_becomes_an_ipc_error_instead_of_panicking_again() {
        let state = Arc::new(DbState(Mutex::new(Connection::open_in_memory().unwrap())));
        let poisoning_thread = Arc::clone(&state);

        let _ = std::thread::spawn(move || {
            let _guard = poisoning_thread.0.lock().unwrap();
            panic!("simulate a command failure while holding the DB lock");
        })
        .join();

        match lock_db(&state) {
            Ok(_) => panic!("a poisoned DB lock must not be treated as healthy"),
            Err(message) => assert!(message.contains("database lock poisoned")),
        };
    }
}
