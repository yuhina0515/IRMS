mod ble;
mod commands;
mod db;
mod defaults;
mod downsample;
mod migrate_electron;
mod migrations;
mod protocol;
mod splash;
mod types;
mod update;

use ble::BleState;
use commands::DbState;
use splash::SplashReadyState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance lock — must be registered before any other plugin (Tauri's own
    // requirement, so it can intercept the second launch's argv before anything else runs).
    // Desktop-only: mirrors main/index.ts's Electron behavior of bringing the existing window
    // to the foreground instead of quietly spawning a second process that would fight the first
    // one for the same SQLite (WAL) file.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(BleState::default())
        .manage(SplashReadyState::default())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("irms.sqlite");
            // One-time pickup of the Electron app's data on a fresh Tauri install (see
            // migrate_electron.rs for the full design). Deliberately non-fatal: a migration
            // failure must never block the app from starting — it just starts with an empty DB,
            // same as any other fresh install, and the Electron folder is left untouched unless
            // the migration verified success before deleting it.
            match migrate_electron::migrate_if_needed(&db_path) {
                Ok(true) => println!("[migrate] imported existing data from the Electron app"),
                Ok(false) => {}
                Err(err) => eprintln!("[migrate] Electron data migration failed, starting fresh: {err}"),
            }
            let conn = db::init_database(&db_path)?;
            app.manage(DbState(Mutex::new(conn)));
            // Main window is declared `visible: false` in tauri.conf.json — the boot-splash
            // sequence decides exactly when to reveal it, as part of the grow-border-then-fade-in
            // handoff (see splash.rs). By this point in setup(), DB init above has already run,
            // so unlike the Electron version there's no real init work left to race against the
            // splash's assembly-floor timer — it's purely a minimum-visible-time guarantee now.
            splash::spawn_boot_sequence(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            splash::splash_ready,
            update::update_check,
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
