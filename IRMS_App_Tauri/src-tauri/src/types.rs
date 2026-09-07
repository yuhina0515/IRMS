// types.rs — port of shared/types.ts's DB-facing shapes. Field names use camelCase on the wire
// (serde rename_all) to match what the existing frontend/IPC contract already expects, keeping
// the eventual Phase 2b adapter's job to "call these instead of window.irms" rather than also
// reshaping every payload.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAction {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub protocol: String,
    pub target_angle: f64,
    pub tolerance: f64,
    pub hold_time_ms: i64,
    pub trigger_type: String,
    /// null = derive from target + tolerance + 10 (frontend's job, not this layer's).
    pub safety_limit: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomActionInput {
    pub name: String,
    pub description: Option<String>,
    pub protocol: String,
    pub target_angle: f64,
    pub tolerance: f64,
    pub hold_time_ms: i64,
    pub trigger_type: String,
    pub safety_limit: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: i64,
    pub start_time: String,
    pub end_time: Option<String>,
    pub target_angle: Option<f64>,
    pub tolerance: Option<f64>,
    pub hold_time_ms: Option<i64>,
    pub action_id: Option<i64>,
    pub action_name: Option<String>,
    pub protocol: Option<String>,
    pub reps_completed: i64,
    pub safety_limit: Option<f64>,
    pub trigger_type: Option<String>,
    /// JSON-serialized CalibrationSnapshot — this layer stores and returns it as an opaque
    /// string, same as the TS version; parsing/interpreting it stays in the frontend.
    pub calibration: Option<String>,
    pub abandoned: i64,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStartInput {
    pub target_angle: f64,
    pub tolerance: f64,
    pub hold_time_ms: i64,
    pub action_id: Option<i64>,
    pub action_name: Option<String>,
    pub protocol: Option<String>,
    pub trigger_type: Option<String>,
    pub safety_limit: Option<f64>,
    /// Already-serialized JSON from the frontend (mirrors calibration: CalibrationSnapshot on
    /// the TS side, which db.ts JSON.stringify()s at the DB boundary — done on the frontend side
    /// here instead since serde_json::to_string is just as available there via invoke's payload).
    pub calibration: serde_json::Value,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub knee_angle: f64,
    pub thigh_angle: f64,
    pub shin_angle: f64,
    pub knee_roll: f64,
    pub thigh_roll: f64,
    pub shin_roll: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredReading {
    pub id: i64,
    pub session_id: i64,
    pub knee_angle: f64,
    pub thigh_angle: f64,
    pub shin_angle: f64,
    pub knee_roll: f64,
    pub thigh_roll: f64,
    pub shin_roll: f64,
    pub timestamp: String,
}
