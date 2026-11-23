//! Replays `IRMS_App_Tauri/fixtures/calibration-core.json` through `calibration.rs`. The file is
//! written by the TypeScript calibration core (`src/services/calibrationCore.contract.test.ts`) from
//! simulated IMU data, so this is the check that the two implementations agree.

use crate::angle_math::Vec3;
use crate::calibration::*;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};

fn arg<T: DeserializeOwned>(v: &Value) -> T {
    serde_json::from_value(v.clone()).unwrap_or_else(|e| panic!("argument does not parse: {e}"))
}

/// `{ ok: true, <key>: value }` or `{ ok: false, <err_key>: error }`, the shape the TypeScript returns.
fn outcome<T: Serialize, E: Serialize>(r: Result<T, E>, key: &str, err_key: &str) -> Value {
    match r {
        Ok(v) => json!({ "ok": true, key: v }),
        Err(e) => json!({ "ok": false, err_key: e }),
    }
}

/// Structural comparison with a numeric tolerance. Returns the path of the first difference.
fn diff(got: &Value, want: &Value, path: &str) -> Option<String> {
    match (got, want) {
        (Value::Number(a), Value::Number(b)) => {
            let (a, b) = (a.as_f64().unwrap(), b.as_f64().unwrap());
            ((a - b).abs() > 1e-6).then(|| format!("{path}: {a} vs {b}"))
        }
        (Value::Array(a), Value::Array(b)) => {
            if a.len() != b.len() {
                return Some(format!("{path}: length {} vs {}", a.len(), b.len()));
            }
            a.iter()
                .zip(b)
                .enumerate()
                .find_map(|(i, (x, y))| diff(x, y, &format!("{path}[{i}]")))
        }
        (Value::Object(a), Value::Object(b)) => {
            let keys: std::collections::BTreeSet<&String> = a.keys().chain(b.keys()).collect();
            keys.into_iter().find_map(|k| match (a.get(k), b.get(k)) {
                (Some(x), Some(y)) => diff(x, y, &format!("{path}.{k}")),
                (x, y) => Some(format!(
                    "{path}.{k}: present {} vs {}",
                    x.is_some(),
                    y.is_some()
                )),
            })
        }
        (a, b) => (a != b).then(|| format!("{path}: {a} vs {b}")),
    }
}

#[test]
fn calibration_matches_the_typescript_implementation_on_the_shared_fixture() {
    let calls: Vec<Value> = serde_json::from_str(include_str!(
        "../../IRMS_App_Tauri/fixtures/calibration-core.json"
    ))
    .unwrap();
    let mut per_fn = std::collections::BTreeMap::<String, usize>::new();
    for call in &calls {
        let name = call["fn"].as_str().unwrap();
        let note = call["note"].as_str().unwrap();
        let a = call["args"].as_array().unwrap();
        let got = match name {
            "conditionFrames" => {
                let (kept, dropped, gated) = condition_frames(&arg::<Vec<Frame>>(&a[0]));
                json!({ "kept": kept.len(), "dropped": dropped, "gated": gated })
            }
            "captureReference" => outcome(
                capture_reference(&arg::<Vec<Frame>>(&a[0]), arg(&a[1]), arg(&a[2])),
                "reference",
                "error",
            ),
            "heldPeakTimed" => serde_json::to_value(held_peak_timed(
                &arg::<Vec<TimedValue>>(&a[0]),
                arg::<i8>(&a[1]),
            ))
            .unwrap(),
            "estimateLimbFrame" => {
                let input = &a[0];
                let gyro: Option<Vec<Vec3>> = input.get("gyro").map(arg);
                outcome(
                    estimate_limb_frame(
                        arg(&input["reference"]),
                        &arg::<Vec<Vec3>>(&input["samples"]),
                        gyro.as_deref(),
                        arg(&input["expectedSign"]),
                    ),
                    "frame",
                    "error",
                )
            }
            "solveProfile" => outcome(
                solve_profile(&arg::<SolveInput>(&a[0])),
                "profile",
                "failure",
            ),
            "evaluateMovement" => outcome(
                evaluate_movement(
                    &arg::<CalibrationProfile>(&a[0]),
                    arg(&a[1]),
                    &arg::<Vec<Frame>>(&a[2]),
                ),
                "result",
                "error",
            ),
            "rezeroLimb" => outcome(
                rezero_limb(&arg::<LimbFrame>(&a[0]), arg(&a[1])),
                "frame",
                "error",
            ),
            "checkReference" => {
                let current = &a[1];
                let r = check_reference(
                    &arg::<CalibrationProfile>(&a[0]),
                    arg(&current["thigh"]),
                    arg(&current["shin"]),
                );
                // The TypeScript leaves out a limb that has no frame.
                let mut limbs = serde_json::Map::new();
                if let Some(t) = r.thigh {
                    limbs.insert("thigh".into(), serde_json::to_value(t).unwrap());
                }
                if let Some(s) = r.shin {
                    limbs.insert("shin".into(), serde_json::to_value(s).unwrap());
                }
                json!({ "verdict": r.verdict, "limbs": limbs })
            }
            other => panic!("unknown function {other}"),
        };
        if let Some(d) = diff(&got, &call["out"], "out") {
            panic!("{name} ({note}): {d}\n got: {got}\nwant: {}", call["out"]);
        }
        *per_fn.entry(name.to_string()).or_default() += 1;
    }
    assert_eq!(per_fn.len(), 8, "functions replayed: {per_fn:?}");
    assert!(calls.len() >= 45, "replayed {} calls", calls.len());
}

#[test]
fn non_finite_input_is_rejected() {
    for (time, value) in [(f64::NAN, 50.0), (0.0, f64::INFINITY)] {
        let mut samples: Vec<TimedValue> = (0..50)
            .map(|i| TimedValue {
                t_ms: i as f64 * 40.0,
                value: 50.0,
            })
            .collect();
        samples[0] = TimedValue { t_ms: time, value };
        assert!(held_peak_timed(&samples, 1).is_none());
    }
    // JSON cannot carry NaN, so these cases live here instead of in the shared fixture.
    let nan = Vec3 {
        x: f64::NAN,
        y: 0.0,
        z: 1.0,
    };
    let up = Vec3 {
        x: 0.0,
        y: 1.0,
        z: 0.0,
    };
    let frame = |thigh: Vec3, shin: Vec3| Frame {
        t_ms: 0.0,
        thigh,
        shin,
        thigh_gyro: None,
        shin_gyro: None,
        thigh_raw_g: None,
        shin_raw_g: None,
    };
    let (kept, dropped, gated) = condition_frames(&[frame(nan, up), frame(up, nan), frame(up, up)]);
    assert_eq!((kept.len(), dropped, gated), (1, 2, 0));
    assert_eq!(
        estimate_limb_frame(up, &[up, nan, up, up], None, 1),
        Err(LimbError::InvalidInput)
    );
    assert_eq!(
        estimate_limb_frame(nan, &[up, up, up], None, 1),
        Err(LimbError::InvalidInput)
    );
}
