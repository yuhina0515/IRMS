// defaults.rs — port of shared/defaults.ts. Rebuilds custom_actions when empty (fresh install)
// or on an explicit "restore defaults" call. Must stay in sync with the TS version's list until
// Phase 2 retires it.

use crate::types::CustomActionInput;

pub fn default_actions() -> Vec<CustomActionInput> {
    vec![
        CustomActionInput {
            name: "Squat (深蹲屈膝)".to_string(),
            description: Some("站姿屈膝至目標角度並維持".to_string()),
            protocol: "knee".to_string(),
            target_angle: 90.0,
            tolerance: 10.0,
            hold_time_ms: 3000,
            trigger_type: "joint_angle".to_string(),
            safety_limit: Some(135.0),
        },
        CustomActionInput {
            name: "Straight Leg Raise (直膝抬腿)".to_string(),
            description: Some("保持膝伸直,將大腿抬至目標仰角".to_string()),
            protocol: "knee".to_string(),
            target_angle: 45.0,
            tolerance: 10.0,
            hold_time_ms: 3000,
            trigger_type: "segment_elevation".to_string(),
            safety_limit: Some(80.0),
        },
        CustomActionInput {
            name: "Backward Extension (直膝後擺)".to_string(),
            description: Some("保持膝伸直,將大腿向後伸展至目標角度".to_string()),
            protocol: "knee".to_string(),
            target_angle: 20.0,
            tolerance: 8.0,
            hold_time_ms: 2000,
            trigger_type: "segment_extension".to_string(),
            safety_limit: Some(30.0),
        },
        CustomActionInput {
            name: "Elbow Flexion (肘屈曲)".to_string(),
            description: Some("前臂彎曲至目標夾角並維持".to_string()),
            protocol: "elbow".to_string(),
            target_angle: 100.0,
            tolerance: 12.0,
            hold_time_ms: 2500,
            trigger_type: "joint_angle".to_string(),
            safety_limit: Some(145.0),
        },
        CustomActionInput {
            name: "Shoulder Abduction (肩外展)".to_string(),
            description: Some("手臂側向抬升至目標仰角".to_string()),
            protocol: "shoulder".to_string(),
            target_angle: 90.0,
            tolerance: 15.0,
            hold_time_ms: 3000,
            trigger_type: "segment_elevation".to_string(),
            safety_limit: Some(160.0),
        },
    ]
}
