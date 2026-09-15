// commands.rs — Tauri IPC surface for the DB layer (db.rs), wired up now that Phase 2a's
// platform-adapter seam exists on the frontend side to call into. Mirrors main/ipc.ts's handler
// list; command names use snake_case (Rust/Tauri convention) where the Electron IPC channel
// strings used "session:start" style — the frontend adapter is what translates between the two
// naming conventions, not this file.

use crate::db::{actions_repo, data_repo, sessions_repo};
use crate::types::{
    CustomAction, CustomActionInput, SensorReading, Session, SessionStartInput, StoredReading,
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
