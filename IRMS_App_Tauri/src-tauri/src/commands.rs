// commands.rs — Tauri IPC surface for the DB layer (db.rs), wired up now that Phase 2a's
// platform-adapter seam exists on the frontend side to call into. Mirrors main/ipc.ts's handler
// list; command names use snake_case (Rust/Tauri convention) where the Electron IPC channel
// strings used "session:start" style — the frontend adapter is what translates between the two
// naming conventions, not this file.

use crate::db::{actions_repo, data_repo, sessions_repo};
use crate::types::{CustomAction, CustomActionInput, SensorReading, Session, SessionStartInput, StoredReading};
use rusqlite::Connection;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

fn to_err(e: rusqlite::Error) -> String {
    e.to_string()
}

#[tauri::command]
pub fn actions_list(state: tauri::State<DbState>) -> Result<Vec<CustomAction>, String> {
    let conn = state.0.lock().unwrap();
    actions_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn actions_create(state: tauri::State<DbState>, input: CustomActionInput) -> Result<CustomAction, String> {
    let conn = state.0.lock().unwrap();
    actions_repo::create(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn actions_update(
    state: tauri::State<DbState>,
    id: i64,
    input: CustomActionInput,
) -> Result<CustomAction, String> {
    let conn = state.0.lock().unwrap();
    actions_repo::update(&conn, id, &input).map_err(to_err)
}

#[tauri::command]
pub fn actions_delete(state: tauri::State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    actions_repo::delete(&conn, id).map_err(to_err)
}

#[tauri::command]
pub fn actions_restore_defaults(state: tauri::State<DbState>) -> Result<Vec<CustomAction>, String> {
    let conn = state.0.lock().unwrap();
    actions_repo::restore_defaults(&conn).map_err(to_err)
}

#[tauri::command]
pub fn sessions_start(state: tauri::State<DbState>, input: SessionStartInput) -> Result<i64, String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::start(&conn, &input).map_err(to_err)
}

#[tauri::command]
pub fn sessions_update_reps(
    state: tauri::State<DbState>,
    session_id: i64,
    reps_completed: i64,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::update_reps(&conn, session_id, reps_completed).map_err(to_err)
}

#[tauri::command]
pub fn sessions_end(state: tauri::State<DbState>, session_id: i64, reps_completed: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::end(&conn, session_id, reps_completed).map_err(to_err)
}

#[tauri::command]
pub fn sessions_list(state: tauri::State<DbState>) -> Result<Vec<Session>, String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::list(&conn).map_err(to_err)
}

#[tauri::command]
pub fn sessions_get_data(
    state: tauri::State<DbState>,
    session_id: i64,
    max_points: Option<usize>,
) -> Result<Vec<StoredReading>, String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::get_data(&conn, session_id, max_points).map_err(to_err)
}

#[tauri::command]
pub fn sessions_delete(state: tauri::State<DbState>, session_id: i64) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::delete(&conn, session_id).map_err(to_err)
}

#[tauri::command]
pub fn sessions_purge_demo(state: tauri::State<DbState>) -> Result<usize, String> {
    let conn = state.0.lock().unwrap();
    sessions_repo::purge_demo(&conn).map_err(to_err)
}

#[tauri::command]
pub fn data_append_batch(
    state: tauri::State<DbState>,
    session_id: i64,
    readings: Vec<SensorReading>,
) -> Result<usize, String> {
    let mut conn = state.0.lock().unwrap();
    data_repo::append_batch(&mut conn, session_id, &readings).map_err(to_err)
}
