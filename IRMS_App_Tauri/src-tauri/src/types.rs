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

// Field names below stay `thigh`/`shin` internally (matching the SQLite column names in
// db.rs/migrations.rs unchanged by this pass) but are renamed on the wire via explicit
// `serde(rename)` to `proximal`/`distal`, matching shared/types.ts's `SensorReading`/
// `StoredReading` (2026-09-11, ROADMAP D3 step 1 — see that day's coding log). DB schema,
// UI labels, and judgment-logic axis mapping are deliberately untouched by this step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub knee_angle: f64,
    #[serde(rename = "proximalAngle")]
    pub thigh_angle: f64,
    #[serde(rename = "distalAngle")]
    pub shin_angle: f64,
    pub knee_roll: f64,
    #[serde(rename = "proximalRoll")]
    pub thigh_roll: f64,
    #[serde(rename = "distalRoll")]
    pub shin_roll: f64,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredReading {
    pub id: i64,
    pub session_id: i64,
    pub knee_angle: f64,
    #[serde(rename = "proximalAngle")]
    pub thigh_angle: f64,
    #[serde(rename = "distalAngle")]
    pub shin_angle: f64,
    pub knee_roll: f64,
    #[serde(rename = "proximalRoll")]
    pub thigh_roll: f64,
    #[serde(rename = "distalRoll")]
    pub shin_roll: f64,
    pub timestamp: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    // CON-01 (2026-09-17): the BLE wire protocol has shared TS/Rust contract fixtures, but the
    // Tauri IPC layer's Rust structs and shared/types.ts's hand-written interfaces have no
    // generated bridge (no ts-rs/specta) — a field rename on either side would not be caught by
    // either compiler, only discovered at runtime. These tests pin the exact camelCase field set
    // each IPC-returned struct serializes to, so a drift shows up as a failing Rust test instead
    // of a silent runtime shape mismatch. Field lists must be kept in sync with the corresponding
    // interface in src/shared/types.ts by hand until/unless this project adopts type generation.
    #[test]
    fn custom_action_wire_shape_matches_shared_types_ts() {
        let action = CustomAction {
            id: 1,
            name: "Knee Flexion".to_string(),
            description: None,
            protocol: "knee".to_string(),
            target_angle: 90.0,
            tolerance: 5.0,
            hold_time_ms: 2000,
            trigger_type: "joint_angle".to_string(),
            safety_limit: None,
        };
        let json = serde_json::to_value(&action).unwrap();
        let obj = json.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                "description",
                "holdTimeMs",
                "id",
                "name",
                "protocol",
                "safetyLimit",
                "targetAngle",
                "tolerance",
                "triggerType",
            ]
        );
    }

    #[test]
    fn session_wire_shape_matches_shared_types_ts() {
        let session = Session {
            id: 1,
            start_time: "2026-09-17T00:00:00Z".to_string(),
            end_time: None,
            target_angle: None,
            tolerance: None,
            hold_time_ms: None,
            action_id: None,
            action_name: None,
            protocol: None,
            reps_completed: 0,
            safety_limit: None,
            trigger_type: None,
            calibration: None,
            abandoned: 0,
            source: "device".to_string(),
        };
        let json = serde_json::to_value(&session).unwrap();
        let obj = json.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                "abandoned",
                "actionId",
                "actionName",
                "calibration",
                "endTime",
                "holdTimeMs",
                "id",
                "protocol",
                "repsCompleted",
                "safetyLimit",
                "source",
                "startTime",
                "targetAngle",
                "tolerance",
                "triggerType",
            ]
        );
        // shared/types.ts's Session.targetAngle/tolerance/holdTimeMs were fixed 2026-09-17 to
        // be `number | null` (the sessions table has no NOT NULL constraint on these columns) —
        // pin that these really do serialize to JSON null, not get dropped or default to 0.
        assert_eq!(json.get("targetAngle").unwrap(), &serde_json::Value::Null);
        assert_eq!(json.get("tolerance").unwrap(), &serde_json::Value::Null);
        assert_eq!(json.get("holdTimeMs").unwrap(), &serde_json::Value::Null);
    }

    #[test]
    fn stored_reading_wire_shape_matches_shared_types_ts() {
        let reading = StoredReading {
            id: 1,
            session_id: 1,
            knee_angle: 90.0,
            thigh_angle: 30.0,
            shin_angle: -60.0,
            knee_roll: 1.0,
            thigh_roll: 2.0,
            shin_roll: 3.0,
            timestamp: "2026-09-17T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&reading).unwrap();
        let obj = json.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort();
        // shared/types.ts's StoredReading extends SensorReading with id/sessionId — same
        // proximal/distal wire rename as SensorReading below applies here too.
        assert_eq!(
            keys,
            vec![
                "distalAngle",
                "distalRoll",
                "id",
                "kneeAngle",
                "kneeRoll",
                "proximalAngle",
                "proximalRoll",
                "sessionId",
                "timestamp",
            ]
        );
    }

    // Regression lock for the 2026-09-11 wire rename: a JSON key mismatch here would not be
    // caught by the Rust compiler (unknown fields just deserialize to defaults or fail at
    // runtime), so this pins the exact wire shape shared/types.ts's SensorReading depends on.
    #[test]
    fn sensor_reading_serializes_with_proximal_distal_wire_names_not_thigh_shin() {
        let reading = SensorReading {
            knee_angle: 90.0,
            thigh_angle: 30.0,
            shin_angle: -60.0,
            knee_roll: 1.0,
            thigh_roll: 2.0,
            shin_roll: 3.0,
            timestamp: "2026-09-11T00:00:00Z".to_string(),
        };
        let json = serde_json::to_value(&reading).unwrap();
        assert_eq!(json.get("proximalAngle").unwrap(), 30.0);
        assert_eq!(json.get("distalAngle").unwrap(), -60.0);
        assert_eq!(json.get("proximalRoll").unwrap(), 2.0);
        assert_eq!(json.get("distalRoll").unwrap(), 3.0);
        assert!(json.get("thighAngle").is_none());
        assert!(json.get("shinAngle").is_none());
        assert!(json.get("thighRoll").is_none());
        assert!(json.get("shinRoll").is_none());
    }

    #[test]
    fn sensor_reading_deserializes_from_proximal_distal_wire_names() {
        let json = serde_json::json!({
            "kneeAngle": 90.0,
            "proximalAngle": 30.0,
            "distalAngle": -60.0,
            "kneeRoll": 1.0,
            "proximalRoll": 2.0,
            "distalRoll": 3.0,
            "timestamp": "2026-09-11T00:00:00Z"
        });
        let reading: SensorReading = serde_json::from_value(json).unwrap();
        assert_eq!(reading.thigh_angle, 30.0);
        assert_eq!(reading.shin_angle, -60.0);
        assert_eq!(reading.thigh_roll, 2.0);
        assert_eq!(reading.shin_roll, 3.0);
    }
}
