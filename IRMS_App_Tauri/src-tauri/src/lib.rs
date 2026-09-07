mod ble;
mod db;
mod defaults;
mod downsample;
mod migrations;
mod protocol;
mod types;

use ble::BleState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BleState::default())
        .invoke_handler(tauri::generate_handler![
            ble::ble_connect,
            ble::ble_disconnect,
            ble::ble_send_command,
            ble::ble_get_firmware_version,
            ble::ble_perform_ota_update,
            ble::ble_abort_ota,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
