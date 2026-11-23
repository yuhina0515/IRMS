//! IRMS core: everything that does not depend on a UI toolkit, shared by the Tauri app
//! (`IRMS_App_Tauri/src-tauri`) and the native prototype (`IRMS_App_Native`).
//! See doc/plans/2026-11-16-rust-native-ui-plan.md, phase 3.
pub mod angle_math;
pub mod app_update;
pub mod ble;
pub mod ble_lifecycle;
pub mod calibration;
#[cfg(test)]
mod calibration_contract_tests;
pub mod calibration_flow;
pub mod db;
pub mod defaults;
pub mod downsample;
pub mod firmware_update;
pub mod import_tauri;
pub mod judge;
pub mod live_share;
pub mod migrations;
pub mod modules;
pub mod protocol;
pub mod session_analysis;
pub mod session_controller;
pub mod share_session;
pub mod slip_monitor;
pub mod telemetry;
pub mod types;
