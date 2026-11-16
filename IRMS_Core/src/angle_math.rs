//! Circular (wrap-safe) angle maths and the tilt-vector geometry used by calibration.
//!
//! Port of `IRMS_App_Tauri/src/services/angleMath.ts` (plan phase 4); the long design notes stay
//! in that file. The firmware produces angles with `atan2f`, so they live on a ring (-180, 180],
//! not on a line: a limb resting at the +/-180 cut jitters between 179.6 and -179.8, and any
//! linear mean, difference or interpolation turns that 0.6 deg into 359.4 deg. Every aggregate or
//! difference of angles must go through this module, never through plain `+ - /`.
//!
//! Checked against the TypeScript on shared data: `fixtures/angle-math.json` (see the tests).

const FULL_TURN: f64 = 360.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PitchRoll {
    pub pitch: f64,
    pub roll: f64,
}

/// Normalises to (-180, 180], the standard range of this project (matches the firmware's atan2f).
pub fn normalize_deg(deg: f64) -> f64 {
    if !deg.is_finite() {
        return deg;
    }
    let wrapped = ((deg % FULL_TURN) + FULL_TURN) % FULL_TURN; // [0, 360)
    if wrapped > 180.0 {
        wrapped - FULL_TURN
    } else {
        wrapped
    }
}

/// Shortest arc from `from` to `to`, in (-180, 180]. `shortest_arc_delta(179, -179) == 2`.
pub fn shortest_arc_delta(from: f64, to: f64) -> f64 {
    normalize_deg(to - from)
}

fn sin_cos_sums(values: &[f64]) -> (f64, f64) {
    values.iter().fold((0.0, 0.0), |(s, c), v| {
        let rad = v.to_radians();
        (s + rad.sin(), c + rad.cos())
    })
}

/// Circular mean `atan2(sum sin, sum cos)`. Empty input gives 0 (callers guarantee non-empty).
pub fn circular_mean_deg(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let (sum_sin, sum_cos) = sin_cos_sums(values);
    sum_sin.atan2(sum_cos).to_degrees()
}

/// Circular standard deviation `sqrt(-2 ln R)`; 180 when fully dispersed, 0 for identical samples.
pub fn circular_std_dev_deg(values: &[f64]) -> f64 {
    let n = values.len() as f64;
    if values.is_empty() {
        return 0.0;
    }
    let (sum_sin, sum_cos) = sin_cos_sums(values);
    let r = (sum_sin / n).hypot(sum_cos / n);
    if r <= 1e-12 {
        return 180.0;
    }
    if r >= 1.0 {
        return 0.0; // rounding can put identical samples slightly above 1
    }
    (-2.0 * r.ln()).sqrt().to_degrees()
}

/// Joint angle: absolute shortest arc between two segment angles, always in [0, 180] by construction.
pub fn joint_angle_deg(proximal: f64, distal: f64) -> f64 {
    shortest_arc_delta(distal, proximal).abs()
}

/// Unit tilt vector equivalent to a pitch/roll pair (`pitch = atan2(ay, az)`, `roll = atan2(ax, az)`).
/// The sign of `az` is recovered from `cos(pitch)`, which `tan()` alone would lose.
pub fn reconstruct_tilt_vector(pitch_deg: f64, roll_deg: f64) -> Vec3 {
    let pitch = pitch_deg.to_radians();
    let tan_pitch = pitch.tan();
    let tan_roll = roll_deg.to_radians().tan();
    let az_sign = if pitch.cos() >= 0.0 { 1.0 } else { -1.0 };
    let scale = az_sign / (1.0 + tan_pitch * tan_pitch + tan_roll * tan_roll).sqrt();
    Vec3 {
        x: scale * tan_roll,
        y: scale * tan_pitch,
        z: scale,
    }
}

fn pitch_roll_of(x: f64, y: f64, z: f64) -> PitchRoll {
    PitchRoll {
        pitch: y.atan2(z).to_degrees(),
        roll: x.atan2(z).to_degrees(),
    }
}

/// Mounting-twist correction on angle output: rebuild the tilt vector, rotate it about the sensor's
/// own normal (`az`), then take `atan2` again.
pub fn rotate_raw_axes(pitch_deg: f64, roll_deg: f64, rotation_deg: f64) -> PitchRoll {
    let v = reconstruct_tilt_vector(pitch_deg, roll_deg);
    let (sin, cos) = rotation_deg.to_radians().sin_cos();
    pitch_roll_of(v.x * cos - v.y * sin, v.x * sin + v.y * cos, v.z)
}

/// Mounting-twist rotation that keeps the full 3D vector (normalised).
pub fn rotate_acceleration_vector(a: Vec3, rotation_deg: f64) -> Vec3 {
    let (sin, cos) = rotation_deg.to_radians().sin_cos();
    let x = a.x * cos - a.y * sin;
    let y = a.x * sin + a.y * cos;
    let norm = or_one(norm3(x, y, a.z));
    Vec3 {
        x: x / norm,
        y: y / norm,
        z: a.z / norm,
    }
}

/// New-firmware path: rotate the pre-atan2 acceleration vector directly.
pub fn rotate_acceleration_axes(a: Vec3, rotation_deg: f64) -> PitchRoll {
    let v = rotate_acceleration_vector(a, rotation_deg);
    pitch_roll_of(v.x, v.y, v.z)
}

fn norm3(x: f64, y: f64, z: f64) -> f64 {
    (x * x + y * y + z * z).sqrt()
}

/// JavaScript's `value || 1`: a zero or NaN length falls back to 1.
fn or_one(v: f64) -> f64 {
    if v == 0.0 || v.is_nan() {
        1.0
    } else {
        v
    }
}

fn cross(a: Vec3, b: Vec3) -> Vec3 {
    Vec3 {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    }
}

fn dot(a: Vec3, b: Vec3) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z
}

fn normalize(v: Vec3) -> Vec3 {
    let norm = or_one(norm3(v.x, v.y, v.z));
    Vec3 {
        x: v.x / norm,
        y: v.y / norm,
        z: v.z / norm,
    }
}

/// Shortest angle between two 3D directions, in [0, 180].
pub fn vector_angle_deg(a: Vec3, b: Vec3) -> f64 {
    let an = or_one(norm3(a.x, a.y, a.z));
    let bn = or_one(norm3(b.x, b.y, b.z));
    (dot(a, b) / (an * bn)).clamp(-1.0, 1.0).acos().to_degrees()
}

/// Flexion axis (unit vector in the sensor frame) from the standing baseline and the end of one
/// reference movement, by cross product. Works for any 3D mounting orientation.
pub fn derive_hinge_axis(baseline: Vec3, moved: Vec3) -> Vec3 {
    normalize(cross(baseline, moved))
}

/// Projects the current gravity vector into the frame spanned by the flexion axis and the baseline.
/// Roll is `asin(x / |v|)`, not `atan2(x, z)`, so it stays defined at deep flexion (CAL-02, 2026-09-16).
pub fn project_onto_hinge_frame(vector: Vec3, hinge_axis: Vec3, baseline: Vec3) -> PitchRoll {
    let side = cross(hinge_axis, baseline);
    let x = dot(vector, hinge_axis);
    let y = dot(vector, side);
    let z = dot(vector, baseline);
    let magnitude = or_one(norm3(vector.x, vector.y, vector.z));
    PitchRoll {
        pitch: y.atan2(z).to_degrees(),
        roll: (x / magnitude).clamp(-1.0, 1.0).asin().to_degrees(),
    }
}

/// Experimental CAL-03 candidate, not wired to any live path in the app (see the TypeScript notes on
/// its known limits). Moves a vector from the source sensor's frame to the target sensor's frame
/// through the shared `{hinge, hinge x baseline, baseline}` basis.
pub fn reconcile_to_reference_frame(
    vector: Vec3,
    source_hinge: Vec3,
    source_baseline: Vec3,
    target_hinge: Vec3,
    target_baseline: Vec3,
) -> Vec3 {
    let source_side = cross(source_hinge, source_baseline);
    let (cx, cy, cz) = (
        dot(vector, source_hinge),
        dot(vector, source_side),
        dot(vector, source_baseline),
    );
    let target_side = cross(target_hinge, target_baseline);
    Vec3 {
        x: cx * target_hinge.x + cy * target_side.x + cz * target_baseline.x,
        y: cx * target_hinge.y + cy * target_side.y + cz * target_baseline.y,
        z: cx * target_hinge.z + cy * target_side.z + cz * target_baseline.z,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn close(a: f64, b: f64) -> bool {
        (a.is_nan() && b.is_nan()) || a == b || (a - b).abs() < 1e-9
    }

    #[test]
    fn wrap_and_shortest_arc() {
        assert_eq!(normalize_deg(190.0), -170.0);
        assert_eq!(normalize_deg(-180.0), 180.0);
        assert_eq!(normalize_deg(540.0), 180.0);
        assert!(normalize_deg(f64::NAN).is_nan());
        assert!(close(shortest_arc_delta(179.0, -179.0), 2.0));
        assert!(close(joint_angle_deg(179.6, -179.8), 0.6));
    }

    #[test]
    fn circular_statistics_survive_the_branch_cut() {
        let samples = [179.6, -179.8, 179.9, -179.7];
        assert!(circular_mean_deg(&samples).abs() > 179.0);
        assert!(circular_std_dev_deg(&samples) < 1.0);
        assert_eq!(circular_mean_deg(&[]), 0.0);
        assert_eq!(circular_std_dev_deg(&[0.0, 180.0]), 180.0);
        assert_eq!(circular_std_dev_deg(&[42.0, 42.0, 42.0]), 0.0);
    }

    fn num(v: &Value) -> f64 {
        // The fixture writes non-finite numbers as strings ("NaN", "Infinity", "-Infinity").
        match v {
            Value::String(s) => s.parse().unwrap(),
            other => other.as_f64().unwrap(),
        }
    }
    fn vec3(v: &Value) -> Vec3 {
        Vec3 {
            x: num(&v["x"]),
            y: num(&v["y"]),
            z: num(&v["z"]),
        }
    }

    /// Replays every recorded call of the TypeScript functions and compares the results.
    #[test]
    fn matches_the_typescript_implementation_on_the_shared_fixture() {
        let cases: Vec<Value> = serde_json::from_str(include_str!(
            "../../IRMS_App_Tauri/fixtures/angle-math.json"
        ))
        .unwrap();
        let mut per_fn = std::collections::BTreeMap::<String, usize>::new();
        for (i, case) in cases.iter().enumerate() {
            let name = case["fn"].as_str().unwrap();
            let a = case["args"].as_array().unwrap();
            let want = &case["out"];
            let list = |v: &Value| v.as_array().unwrap().iter().map(num).collect::<Vec<_>>();
            let got: Vec<f64> = match name {
                "normalizeDeg" => vec![normalize_deg(num(&a[0]))],
                "shortestArcDelta" => vec![shortest_arc_delta(num(&a[0]), num(&a[1]))],
                "circularMeanDeg" => vec![circular_mean_deg(&list(&a[0]))],
                "circularStdDevDeg" => vec![circular_std_dev_deg(&list(&a[0]))],
                "jointAngleDeg" => vec![joint_angle_deg(num(&a[0]), num(&a[1]))],
                "reconstructTiltVector" => {
                    let v = reconstruct_tilt_vector(num(&a[0]), num(&a[1]));
                    vec![v.x, v.y, v.z]
                }
                "rotateRawAxes" => {
                    let r = rotate_raw_axes(num(&a[0]), num(&a[1]), num(&a[2]));
                    vec![r.pitch, r.roll]
                }
                "rotateAccelerationAxes" => {
                    let r = rotate_acceleration_axes(vec3(&a[0]), num(&a[1]));
                    vec![r.pitch, r.roll]
                }
                "rotateAccelerationVector" => {
                    let v = rotate_acceleration_vector(vec3(&a[0]), num(&a[1]));
                    vec![v.x, v.y, v.z]
                }
                "vectorAngleDeg" => vec![vector_angle_deg(vec3(&a[0]), vec3(&a[1]))],
                "deriveHingeAxis" => {
                    let v = derive_hinge_axis(vec3(&a[0]), vec3(&a[1]));
                    vec![v.x, v.y, v.z]
                }
                "projectOntoHingeFrame" => {
                    let r = project_onto_hinge_frame(vec3(&a[0]), vec3(&a[1]), vec3(&a[2]));
                    vec![r.pitch, r.roll]
                }
                "reconcileToReferenceFrame" => {
                    let v = reconcile_to_reference_frame(
                        vec3(&a[0]),
                        vec3(&a[1]),
                        vec3(&a[2]),
                        vec3(&a[3]),
                        vec3(&a[4]),
                    );
                    vec![v.x, v.y, v.z]
                }
                other => panic!("case {i}: unknown function {other}"),
            };
            let want = list(want);
            assert_eq!(got.len(), want.len(), "case {i} {name}");
            for (g, w) in got.iter().zip(&want) {
                assert!(
                    close(*g, *w),
                    "case {i} {name} args {a:?}: got {got:?}, want {want:?}"
                );
            }
            *per_fn.entry(name.to_string()).or_default() += 1;
        }
        assert_eq!(per_fn.len(), 13, "functions covered: {per_fn:?}");
        assert!(
            per_fn.values().all(|n| *n >= 40),
            "cases per function: {per_fn:?}"
        );
    }
}
