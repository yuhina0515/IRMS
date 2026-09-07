mod ble;
mod commands;
mod db;
mod defaults;
mod downsample;
mod migrations;
mod protocol;
mod types;

use ble::BleState;
use commands::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BleState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("irms.sqlite");
            let conn = db::init_database(&db_path)?;
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ble::ble_connect,
            ble::ble_disconnect,
            ble::ble_send_command,
            ble::ble_get_firmware_version,
            ble::ble_perform_ota_update,
            ble::ble_abort_ota,
            commands::actions_list,
            commands::actions_create,
            commands::actions_update,
            commands::actions_delete,
            commands::actions_restore_defaults,
            commands::sessions_start,
            commands::sessions_update_reps,
            commands::sessions_end,
            commands::sessions_list,
            commands::sessions_get_data,
            commands::sessions_delete,
            commands::sessions_purge_demo,
            commands::data_append_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
