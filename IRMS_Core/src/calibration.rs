//! Unified calibration core: reference capture, hinge estimation per limb, profile solve, movement
//! evaluation, quick re-zero and the pre-session wearing check.
//!
//! Port of `IRMS_App_Tauri/src/services/calibrationCore.ts` and of the three helpers it takes from
//! `calibrationB.ts` (`fitPlaneNormal`, `estimateHingeFromGyro`, `fuseHingeAxes`); plan phase 4.
//! Thresholds and decision order are unchanged. Vectors are unit "specific force" readings (world-up
//! in the sensor frame), as sent by the firmware `V:` field.
//!
//! Not ported: `compileProfile`, `isUnified` and `zeroIsUpright`. They translate a profile into the
//! Tauri app's flat `Settings` object, which the core does not have; a native interface reads the
//! profile directly.
//!
//! Checked against the TypeScript on shared data: `fixtures/calibration-core.json` (see the tests).

use crate::angle_math::{project_onto_hinge_frame, vector_angle_deg, PitchRoll, Vec3};
use crate::slip_monitor::{angular_span_deg, jacobi_eigen};
use serde::{Deserialize, Serialize};

// ---------- constants ----------

/// `abs(norm(raw g) - 1)` above this means linear acceleration is corrupting the gravity reading.
pub const LINEAR_ACC_GATE_G: f64 = 0.1;
pub const REFERENCE_MIN_MS: f64 = 1500.0;
pub const REFERENCE_MIN_FRAMES: usize = 15;
pub const REFERENCE_STILL_RMS_DEG: f64 = 3.0;
pub const REFERENCE_OFF_PLANE_MAX_DEG: f64 = 15.0;
/// Below the sweep span minimum but above this, the two-point fallback may still work.
pub const TWO_POINT_SPAN_MIN_DEG: f64 = 20.0;
pub const HOLD_SEC: f64 = 1.5;
pub const HOLD_MAX_SAMPLES: usize = 10;
pub const HOLD_SPREAD_MAX_DEG: f64 = 4.0;
pub const MIN_PEAK_DEG: f64 = 5.0;
pub const REFERENCE_DRIFT_WARN_DEG: f64 = 10.0;
pub const REFERENCE_DRIFT_FAIL_DEG: f64 = 20.0;
pub const QUALITY_HIGH_SPAN_DEG: f64 = 40.0;
pub const QUALITY_HIGH_PLANARITY_DEG: f64 = 5.0;
pub const QUALITY_HIGH_REFERENCE_RMS_DEG: f64 = 2.0;
pub const QUALITY_LOW_PLANARITY_DEG: f64 = 7.0;
/// Pre-session reference check thresholds (plan 3.6).
pub const RECHECK_OUT_OF_PLANE_DEG: f64 = 10.0;
pub const RECHECK_IN_PLANE_DEG: f64 = 5.0;

// From calibrationB.ts.
pub const SWEEP_SPAN_MIN_DEG: f64 = 25.0;
pub const SWEEP_PLANARITY_MAX_DEG: f64 = 10.0;
pub const GYRO_WEIGHT: f64 = 1.5;
pub const PLANE_WEIGHT: f64 = 1.0;
pub const GYRO_MIN_RATE_DPS: f64 = 20.0;
pub const GYRO_MIN_SAMPLES: usize = 8;
pub const GYRO_MIN_DOMINANCE: f64 = 0.75;
pub const GYRO_PLANE_DISAGREE_DEG: f64 = 15.0;

// ---------- small vector helpers ----------

fn finite(v: Vec3) -> bool {
    v.x.is_finite() && v.y.is_finite() && v.z.is_finite()
}
fn dot(a: Vec3, b: Vec3) -> f64 {
    a.x * b.x + a.y * b.y + a.z * b.z
}
fn cross(a: Vec3, b: Vec3) -> Vec3 {
    Vec3 {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    }
}
fn norm(v: Vec3) -> f64 {
    (v.x * v.x + v.y * v.y + v.z * v.z).sqrt()
}
/// `norm || 1`: a zero or NaN length divides by 1 instead.
fn unit(v: Vec3) -> Vec3 {
    let n = norm(v);
    let n = if n == 0.0 || n.is_nan() { 1.0 } else { n };
    Vec3 {
        x: v.x / n,
        y: v.y / n,
        z: v.z / n,
    }
}
fn neg(v: Vec3) -> Vec3 {
    Vec3 {
        x: -v.x,
        y: -v.y,
        z: -v.z,
    }
}
fn median(values: &[f64]) -> f64 {
    let mut s = values.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = s.len() >> 1;
    if s.len() % 2 == 1 {
        s[m]
    } else {
        (s[m - 1] + s[m]) / 2.0
    }
}
fn mean_unit(vs: &[Vec3]) -> Vec3 {
    unit(vs.iter().fold(
        Vec3 {
            x: 0.0,
            y: 0.0,
            z: 0.0,
        },
        |a, b| Vec3 {
            x: a.x + b.x,
            y: a.y + b.y,
            z: a.z + b.z,
        },
    ))
}
fn rms_angle_deg(vs: &[Vec3], center: Vec3) -> f64 {
    (vs.iter()
        .map(|v| vector_angle_deg(*v, center).powi(2))
        .sum::<f64>()
        / vs.len().max(1) as f64)
        .sqrt()
}
/// `asin(clamp(dot(v, axis)))` in degrees: how far `v` tilts out of the plane normal to `axis`.
fn off_plane_deg(v: Vec3, axis: Vec3) -> f64 {
    dot(v, axis).clamp(-1.0, 1.0).asin().to_degrees()
}
/// The part of `v` perpendicular to `axis`, as a unit vector.
fn reject(v: Vec3, axis: Vec3) -> Vec3 {
    let d = dot(v, axis);
    unit(Vec3 {
        x: v.x - d * axis.x,
        y: v.y - d * axis.y,
        z: v.z - d * axis.z,
    })
}

// ---------- helpers from calibrationB ----------

/// Plane through the origin that best contains the vectors; the normal is the least-variance axis.
pub fn fit_plane_normal(vectors: &[Vec3]) -> (Vec3, f64) {
    let mut c = [[0.0; 3]; 3];
    for raw in vectors {
        let u = [raw.x, raw.y, raw.z];
        for (i, row) in c.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell += u[i] * u[j];
            }
        }
    }
    let (values, eig) = jacobi_eigen(c);
    let mut k = 0;
    for i in 1..3 {
        if values[i] < values[k] {
            k = i;
        }
    }
    let normal = unit(Vec3 {
        x: eig[k][0],
        y: eig[k][1],
        z: eig[k][2],
    });
    let sum: f64 = vectors
        .iter()
        .map(|s| off_plane_deg(unit(*s), normal).powi(2))
        .sum();
    (normal, (sum / vectors.len().max(1) as f64).sqrt())
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GyroAxisEstimate {
    /// Unit rotation axis in sensor coordinates, sign arbitrary.
    pub axis: Vec3,
    /// Share of motion energy along the axis (1 = pure hinge rotation).
    pub dominance: f64,
    pub samples_used: usize,
}

/// Principal axis of the angular-velocity cloud: during a pure flexion sweep every rate lies on the hinge.
pub fn estimate_hinge_from_gyro(samples: &[Vec3]) -> Option<GyroAxisEstimate> {
    let used: Vec<Vec3> = samples
        .iter()
        .copied()
        .filter(|w| finite(*w) && norm(*w) >= GYRO_MIN_RATE_DPS)
        .collect();
    if used.len() < GYRO_MIN_SAMPLES {
        return None;
    }
    let mut m = [[0.0; 3]; 3];
    for w in &used {
        let a = [w.x, w.y, w.z];
        for (i, row) in m.iter_mut().enumerate() {
            for (j, cell) in row.iter_mut().enumerate() {
                *cell += a[i] * a[j];
            }
        }
    }
    let (values, vectors) = jacobi_eigen(m);
    let mut k = 0;
    for i in 1..3 {
        if values[i] > values[k] {
            k = i;
        }
    }
    let trace = values[0] + values[1] + values[2];
    // Negated `>` like the TypeScript, so a NaN trace gives no estimate.
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(trace > 0.0) {
        return None;
    }
    Some(GyroAxisEstimate {
        axis: unit(Vec3 {
            x: vectors[k][0],
            y: vectors[k][1],
            z: vectors[k][2],
        }),
        dominance: values[k] / trace,
        samples_used: used.len(),
    })
}

/// Weighted blend of gyro axis and plane normal after sign alignment, and their disagreement.
pub fn fuse_hinge_axes(gyro: Vec3, plane: Vec3) -> (Vec3, f64) {
    let g = if dot(gyro, plane) < 0.0 {
        neg(gyro)
    } else {
        gyro
    };
    let axis = unit(Vec3 {
        x: GYRO_WEIGHT * g.x + PLANE_WEIGHT * plane.x,
        y: GYRO_WEIGHT * g.y + PLANE_WEIGHT * plane.y,
        z: GYRO_WEIGHT * g.z + PLANE_WEIGHT * plane.z,
    });
    (axis, vector_angle_deg(g, plane))
}

// ---------- shared types ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Left,
    Right,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Limb {
    Thigh,
    Shin,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReferenceKind {
    Straight,
    Neutral,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReferencePosture {
    Standing,
    LongSitting,
    Supine,
    Seated,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CalibrationQuality {
    Low,
    Medium,
    High,
}

// ---------- conditioning ----------

/// One timestamped sample of both sensors. The optional fields exist only with the firmware `G:` raw stream.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Frame {
    pub t_ms: f64,
    pub thigh: Vec3,
    pub shin: Vec3,
    #[serde(default)]
    pub thigh_gyro: Option<Vec3>,
    #[serde(default)]
    pub shin_gyro: Option<Vec3>,
    #[serde(default, rename = "thighRawG")]
    pub thigh_raw_g: Option<Vec3>,
    #[serde(default, rename = "shinRawG")]
    pub shin_raw_g: Option<Vec3>,
}

/// Drops unusable frames. Non-finite vectors always go; with the raw stream, frames whose accelerometer
/// norm is more than `LINEAR_ACC_GATE_G` from 1 g go too (the segment is accelerating). Returns the kept
/// frames, the number dropped and the number gated. No bias or scale correction is applied (plan W4-1).
pub fn condition_frames(frames: &[Frame]) -> (Vec<Frame>, usize, usize) {
    let mut kept = Vec::new();
    let (mut dropped, mut gated) = (0, 0);
    for f in frames {
        if !finite(f.thigh) || !finite(f.shin) || norm(f.thigh) < 0.5 || norm(f.shin) < 0.5 {
            dropped += 1;
            continue;
        }
        let bad = [f.thigh_raw_g, f.shin_raw_g]
            .iter()
            .flatten()
            .any(|g| finite(*g) && (norm(*g) - 1.0).abs() > LINEAR_ACC_GATE_G);
        if bad {
            gated += 1;
            continue;
        }
        kept.push(*f);
    }
    (kept, dropped, gated)
}

// ---------- reference capture ----------

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub kind: ReferenceKind,
    pub posture: ReferencePosture,
    pub thigh: Vec3,
    pub shin: Vec3,
    pub still_rms_deg: f64,
    pub duration_ms: f64,
    pub frames: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReferenceError {
    InvalidInput,
    TooShort,
    Shaking,
}

pub fn capture_reference(
    input: &[Frame],
    kind: ReferenceKind,
    posture: ReferencePosture,
) -> Result<Reference, ReferenceError> {
    let (frames, _, _) = condition_frames(input);
    let (Some(first), Some(last)) = (frames.first(), frames.last()) else {
        return Err(ReferenceError::InvalidInput);
    };
    let duration_ms = last.t_ms - first.t_ms;
    if frames.len() < REFERENCE_MIN_FRAMES || duration_ms < REFERENCE_MIN_MS {
        return Err(ReferenceError::TooShort);
    }
    let thighs: Vec<Vec3> = frames.iter().map(|f| unit(f.thigh)).collect();
    let shins: Vec<Vec3> = frames.iter().map(|f| unit(f.shin)).collect();
    let thigh = mean_unit(&thighs);
    let shin = mean_unit(&shins);
    let still_rms_deg = rms_angle_deg(&thighs, thigh).max(rms_angle_deg(&shins, shin));
    if still_rms_deg > REFERENCE_STILL_RMS_DEG {
        return Err(ReferenceError::Shaking);
    }
    Ok(Reference {
        kind,
        posture,
        thigh,
        shin,
        still_rms_deg,
        duration_ms,
        frames: frames.len(),
    })
}

// ---------- held peak (time-based) ----------

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimedValue {
    pub t_ms: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeldPeak {
    pub peak: f64,
    pub spread: f64,
    pub hold_sec: f64,
}

/// Median interval in ms between consecutive times (0 with fewer than 2).
pub fn median_interval_ms(times: &[f64]) -> f64 {
    if times.len() < 2 {
        return 0.0;
    }
    median(&times.windows(2).map(|w| w[1] - w[0]).collect::<Vec<_>>())
}

/// Highest median over a window that lasts at least `HOLD_SEC` and whose spread stays within the
/// stillness tolerance. The sample count needed scales with the stream rate, so a slow link is judged
/// by time, not by a fixed count. `direction` -1 finds the most negative hold instead.
pub fn held_peak_timed(samples: &[TimedValue], direction: i8) -> Option<HeldPeak> {
    if samples.len() < 3 {
        return None;
    }
    let dt = median_interval_ms(&samples.iter().map(|s| s.t_ms).collect::<Vec<_>>());
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(dt > 0.0) {
        return None;
    }
    let rate = 1000.0 / dt;
    let needed = ((rate * HOLD_SEC).floor().min(HOLD_MAX_SAMPLES as f64)).max(3.0) as usize;
    let mut best: Option<HeldPeak> = None;
    for i in 0..samples.len() {
        let mut j = i;
        while j < samples.len() && samples[j].t_ms - samples[i].t_ms < HOLD_SEC * 1000.0 {
            j += 1;
        }
        if j >= samples.len() {
            break; // the window would run past the end: not a full hold
        }
        let w = &samples[i..=j];
        if w.len() < needed {
            continue;
        }
        let values: Vec<f64> = w.iter().map(|s| s.value).collect();
        let max = values.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        let min = values.iter().copied().fold(f64::INFINITY, f64::min);
        let spread = max - min;
        if spread > HOLD_SPREAD_MAX_DEG {
            continue;
        }
        let m = median(&values);
        let better = best.is_none_or(|b| {
            if direction == 1 {
                m > b.peak
            } else {
                m < b.peak
            }
        });
        if better {
            best = Some(HeldPeak {
                peak: m,
                spread,
                hold_sec: (w[w.len() - 1].t_ms - w[0].t_ms) / 1000.0,
            });
        }
    }
    best
}

// ---------- hinge estimation per limb ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HingeSource {
    Sweep,
    SweepGyro,
    TwoPoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HingeWarning {
    GyroWeak,
    GyroDisagrees,
    TwoPoint,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LimbFrame {
    /// Unit hinge axis in the sensor frame, oriented so a forward tilt of the segment reads positive.
    pub hinge: Vec3,
    /// Reference gravity, made exactly perpendicular to `hinge`.
    pub zero: Vec3,
    pub source: HingeSource,
    pub span_deg: f64,
    pub planarity_deg: Option<f64>,
    pub gyro_agree_deg: Option<f64>,
    /// How far the raw reference was from the sweep plane before orthogonalisation.
    pub off_plane_deg: f64,
    pub warnings: Vec<HingeWarning>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LimbError {
    InvalidInput,
    SweepTooSmall,
    SweepNotPlanar,
    ReferenceOffPlane,
    WrongDirection,
}

/// A's cross product of the reference and the sample furthest from it (the held end position).
fn two_point_axis(reference: Vec3, samples: &[Vec3]) -> Option<Vec3> {
    let mut best: Option<Vec3> = None;
    let mut best_deg = 0.0;
    for s in samples {
        let d = vector_angle_deg(reference, *s);
        if d > best_deg {
            best_deg = d;
            best = Some(*s);
        }
    }
    let best = best.filter(|_| best_deg >= TWO_POINT_SPAN_MIN_DEG)?;
    let axis = cross(reference, best);
    (norm(axis) >= 1e-6).then(|| unit(axis))
}

/// `reference` is this limb's reference gravity; `samples` the gravity samples of the whole sweep in
/// time order; `gyro` the bias-removed gyro of the same sweep (raw stream only); `expected_sign` the
/// sign of the sweep's largest excursion on the forward-positive axis (+1 thigh hip flexion, -1 shin
/// knee flexion).
pub fn estimate_limb_frame(
    reference: Vec3,
    samples: &[Vec3],
    gyro: Option<&[Vec3]>,
    expected_sign: i8,
) -> Result<LimbFrame, LimbError> {
    let reference = unit(reference);
    let samples: Vec<Vec3> = samples.iter().map(|s| unit(*s)).collect();
    if !finite(reference) || samples.len() < 3 || !samples.iter().all(|s| finite(*s)) {
        return Err(LimbError::InvalidInput);
    }

    let mut planar = vec![reference];
    planar.extend_from_slice(&samples);
    let span_deg = angular_span_deg(&planar);
    if span_deg < TWO_POINT_SPAN_MIN_DEG {
        return Err(LimbError::SweepTooSmall);
    }

    let (normal, planarity_deg) = fit_plane_normal(&planar);
    let mut warnings = Vec::new();
    let mut source = HingeSource::Sweep;
    let mut gyro_agree_deg = None;
    let plane_ok = span_deg >= SWEEP_SPAN_MIN_DEG && planarity_deg <= SWEEP_PLANARITY_MAX_DEG;
    let mut axis = if plane_ok {
        let mut axis = normal;
        if let Some(gyro) = gyro.filter(|g| !g.is_empty()) {
            match estimate_hinge_from_gyro(gyro).filter(|g| g.dominance >= GYRO_MIN_DOMINANCE) {
                None => warnings.push(HingeWarning::GyroWeak),
                Some(g) => {
                    let (fused, disagree) = fuse_hinge_axes(g.axis, axis);
                    gyro_agree_deg = Some(disagree);
                    if disagree > GYRO_PLANE_DISAGREE_DEG {
                        warnings.push(HingeWarning::GyroDisagrees);
                    } else {
                        axis = fused;
                        source = HingeSource::SweepGyro;
                    }
                }
            }
        }
        axis
    } else {
        // Short or slightly non-planar sweep: cross product of the reference and the end position.
        let Some(two) = two_point_axis(reference, &samples) else {
            return Err(if span_deg < SWEEP_SPAN_MIN_DEG {
                LimbError::SweepTooSmall
            } else {
                LimbError::SweepNotPlanar
            });
        };
        source = HingeSource::TwoPoint;
        warnings.push(HingeWarning::TwoPoint);
        two
    };

    // The reference must lie in the hinge plane, otherwise the angle about the hinge is not observable.
    let off_plane = off_plane_deg(reference, axis);
    if off_plane.abs() > REFERENCE_OFF_PLANE_MAX_DEG {
        return Err(LimbError::ReferenceOffPlane);
    }
    let zero = reject(reference, axis);

    // Orient the axis so the defining movement's largest excursion has the expected sign.
    let extreme = samples
        .iter()
        .map(|s| project_onto_hinge_frame(*s, axis, zero).pitch)
        .fold(0.0, |a: f64, b| if b.abs() > a.abs() { b } else { a });
    if extreme * f64::from(expected_sign) < 0.0 {
        axis = neg(axis);
    }

    Ok(LimbFrame {
        hinge: axis,
        zero,
        source,
        span_deg,
        planarity_deg: plane_ok.then_some(planarity_deg),
        gyro_agree_deg,
        off_plane_deg: off_plane,
        warnings,
    })
}

// ---------- runtime angles ----------

/// Pitch: rotation about the hinge from `zero`, forward tilt positive. Roll: out-of-plane tilt.
pub fn limb_angles(frame: &LimbFrame, vector: Vec3) -> PitchRoll {
    project_onto_hinge_frame(vector, frame.hinge, frame.zero)
}

/// Signed knee: thigh forward tilt minus shin forward tilt. Negative = hyperextension. A missing thigh
/// frame falls back to the shin alone (no compensation for thigh motion).
pub fn knee_signed(
    thigh: Option<&LimbFrame>,
    shin: &LimbFrame,
    thigh_vec: Vec3,
    shin_vec: Vec3,
) -> f64 {
    let shin_angle = limb_angles(shin, shin_vec).pitch;
    let thigh_angle = thigh.map_or(0.0, |t| limb_angles(t, thigh_vec).pitch);
    thigh_angle - shin_angle
}

// ---------- profile ----------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Firmware {
    pub version: Option<String>,
    pub raw_stream: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Limbs {
    pub thigh: Option<LimbFrame>,
    pub shin: LimbFrame,
}

/// +1 = outward roll reads positive with the stored hinge; `None` = not verified on a device.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct RollSign {
    pub thigh: Option<i8>,
    pub shin: Option<i8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Quality {
    pub level: CalibrationQuality,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationProfile {
    pub schema: u32,
    pub id: String,
    pub method: String,
    pub created_at: String,
    pub side: Side,
    pub protocol: String,
    pub firmware: Firmware,
    pub reference: Reference,
    pub limbs: Limbs,
    pub roll_sign: RollSign,
    pub quality: Quality,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Sweep {
    pub samples: Vec<Vec3>,
    #[serde(default)]
    pub gyro: Option<Vec<Vec3>>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveInput {
    pub id: String,
    pub created_at: String,
    pub side: Side,
    pub firmware: Firmware,
    pub reference: Reference,
    /// Hip-flexion sweep of the thigh; omit for a shin-only profile.
    #[serde(default)]
    pub thigh_sweep: Option<Sweep>,
    /// Knee-flexion sweep of the shin (the thigh should stay still).
    pub shin_sweep: Sweep,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct SolveError {
    pub limb: Limb,
    pub error: LimbError,
}

fn warning_name(w: HingeWarning) -> &'static str {
    match w {
        HingeWarning::GyroWeak => "gyroWeak",
        HingeWarning::GyroDisagrees => "gyroDisagrees",
        HingeWarning::TwoPoint => "twoPoint",
    }
}

pub fn assess_quality(
    reference: &Reference,
    thigh: Option<&LimbFrame>,
    shin: &LimbFrame,
) -> Quality {
    let mut warnings: Vec<String> = Vec::new();
    let frames: Vec<&LimbFrame> = thigh.into_iter().chain(std::iter::once(shin)).collect();
    for f in &frames {
        for w in &f.warnings {
            if !warnings.iter().any(|x| x == warning_name(*w)) {
                warnings.push(warning_name(*w).to_string());
            }
        }
    }
    if thigh.is_none() {
        warnings.push("shinOnly".to_string());
    }

    let limb_level = |f: &LimbFrame| {
        if f.warnings.contains(&HingeWarning::GyroDisagrees)
            || f.planarity_deg
                .is_some_and(|p| p > QUALITY_LOW_PLANARITY_DEG)
        {
            CalibrationQuality::Low
        } else if f.source == HingeSource::SweepGyro
            && f.span_deg >= QUALITY_HIGH_SPAN_DEG
            && f.planarity_deg
                .is_some_and(|p| p <= QUALITY_HIGH_PLANARITY_DEG)
        {
            CalibrationQuality::High
        } else {
            CalibrationQuality::Medium
        }
    };
    let mut level = if reference.still_rms_deg <= QUALITY_HIGH_REFERENCE_RMS_DEG {
        CalibrationQuality::High
    } else {
        CalibrationQuality::Medium
    };
    for f in &frames {
        level = level.min(limb_level(f));
    }
    if thigh.is_none() && level == CalibrationQuality::High {
        level = CalibrationQuality::Medium;
    }
    Quality { level, warnings }
}

pub fn solve_profile(input: &SolveInput) -> Result<CalibrationProfile, SolveError> {
    let shin = estimate_limb_frame(
        input.reference.shin,
        &input.shin_sweep.samples,
        input.shin_sweep.gyro.as_deref(),
        -1,
    )
    .map_err(|error| SolveError {
        limb: Limb::Shin,
        error,
    })?;
    let thigh = match &input.thigh_sweep {
        Some(sweep) => Some(
            estimate_limb_frame(
                input.reference.thigh,
                &sweep.samples,
                sweep.gyro.as_deref(),
                1,
            )
            .map_err(|error| SolveError {
                limb: Limb::Thigh,
                error,
            })?,
        ),
        None => None,
    };
    // An outward tilt reads positive for the left leg and negative for the right. Derived from geometry
    // and pinned by the simulator tests; not verified on a device.
    let roll: i8 = if input.side == Side::Left { 1 } else { -1 };
    let quality = assess_quality(&input.reference, thigh.as_ref(), &shin);
    Ok(CalibrationProfile {
        schema: 1,
        id: input.id.clone(),
        method: "unified".to_string(),
        created_at: input.created_at.clone(),
        side: input.side,
        protocol: "vector".to_string(),
        firmware: input.firmware.clone(),
        reference: input.reference,
        roll_sign: RollSign {
            thigh: thigh.as_ref().map(|_| roll),
            shin: Some(roll),
        },
        limbs: Limbs { thigh, shin },
        quality,
    })
}

// ---------- movements ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MovementId {
    KneeFlexion,
    HipFlexion,
    HipExtension,
    HipAbduction,
}

impl MovementId {
    /// Largest value accepted as physiologically plausible, and whether the movement needs a thigh frame.
    pub fn spec(self) -> (f64, bool) {
        match self {
            Self::KneeFlexion => (170.0, false),
            Self::HipFlexion => (150.0, true),
            Self::HipExtension => (50.0, true),
            Self::HipAbduction => (70.0, true),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MovementError {
    InvalidInput,
    NeedsThighFrame,
    WrongDirection,
    ReferenceMoved,
    NoHold,
    PeakTooSmall,
    Implausible,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovementResult {
    pub movement: MovementId,
    pub peak_deg: f64,
    pub hold_sec: f64,
    pub spread_deg: f64,
    pub instant_max_deg: f64,
    /// Only `"referenceDrift"` exists today.
    pub warnings: Vec<String>,
}

/// Value of the measured quantity for one frame, positive in the movement's own direction. `None` when
/// the movement needs a thigh frame and the profile has none.
pub fn movement_value(profile: &CalibrationProfile, id: MovementId, f: &Frame) -> Option<f64> {
    let thigh = profile.limbs.thigh.as_ref();
    Some(match id {
        MovementId::KneeFlexion => knee_signed(thigh, &profile.limbs.shin, f.thigh, f.shin),
        MovementId::HipFlexion => limb_angles(thigh?, f.thigh).pitch,
        MovementId::HipExtension => -limb_angles(thigh?, f.thigh).pitch,
        MovementId::HipAbduction => {
            f64::from(profile.roll_sign.thigh.unwrap_or(1)) * limb_angles(thigh?, f.thigh).roll
        }
    })
}

/// Evaluates one movement from timestamped frames that cover the whole sweep and hold. The knee uses
/// the thigh frame to remove thigh motion (plan W4-7); the thigh drifting more than 10 deg is a
/// warning, more than 20 a failure. A sweep whose largest excursion points the wrong way is rejected
/// instead of being sign-flipped.
pub fn evaluate_movement(
    profile: &CalibrationProfile,
    id: MovementId,
    input: &[Frame],
) -> Result<MovementResult, MovementError> {
    let (plausible_max_deg, needs_thigh) = id.spec();
    if needs_thigh && profile.limbs.thigh.is_none() {
        return Err(MovementError::NeedsThighFrame);
    }
    let (frames, _, _) = condition_frames(input);
    if frames.len() < 3 {
        return Err(MovementError::InvalidInput);
    }
    let mut values = Vec::with_capacity(frames.len());
    for f in &frames {
        let value = movement_value(profile, id, f)
            .filter(|v| v.is_finite())
            .ok_or(MovementError::InvalidInput)?;
        values.push(TimedValue {
            t_ms: f.t_ms,
            value,
        });
    }

    let mut warnings = Vec::new();
    if let (MovementId::KneeFlexion, Some(thigh)) = (id, profile.limbs.thigh.as_ref()) {
        let drift = frames
            .iter()
            .map(|f| limb_angles(thigh, f.thigh).pitch.abs())
            .fold(f64::NEG_INFINITY, f64::max);
        if drift > REFERENCE_DRIFT_FAIL_DEG {
            return Err(MovementError::ReferenceMoved);
        }
        if drift > REFERENCE_DRIFT_WARN_DEG {
            warnings.push("referenceDrift".to_string());
        }
    }

    let extreme = values.iter().fold(
        0.0,
        |a: f64, b| if b.value.abs() > a.abs() { b.value } else { a },
    );
    if extreme < 0.0 && extreme.abs() >= MIN_PEAK_DEG {
        return Err(MovementError::WrongDirection);
    }

    let hold = held_peak_timed(&values, 1).ok_or(MovementError::NoHold)?;
    if hold.peak < MIN_PEAK_DEG {
        return Err(MovementError::PeakTooSmall);
    }
    if hold.peak > plausible_max_deg {
        return Err(MovementError::Implausible);
    }
    Ok(MovementResult {
        movement: id,
        peak_deg: hold.peak,
        hold_sec: hold.hold_sec,
        spread_deg: hold.spread,
        instant_max_deg: values
            .iter()
            .map(|v| v.value)
            .fold(f64::NEG_INFINITY, f64::max),
        warnings,
    })
}

// ---------- re-zero and reference check ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RezeroError {
    ReferenceOffPlane,
    InvalidInput,
}

/// Quick re-zero: keep the hinge axis, replace the reference with the current still pose, and
/// re-orthogonalise. Rejects a pose that is off the hinge plane by more than
/// `REFERENCE_OFF_PLANE_MAX_DEG`.
pub fn rezero_limb(frame: &LimbFrame, reference: Vec3) -> Result<LimbFrame, RezeroError> {
    let reference = unit(reference);
    if !finite(reference) {
        return Err(RezeroError::InvalidInput);
    }
    let off_plane = off_plane_deg(reference, frame.hinge);
    if off_plane.abs() > REFERENCE_OFF_PLANE_MAX_DEG {
        return Err(RezeroError::ReferenceOffPlane);
    }
    Ok(LimbFrame {
        zero: reject(reference, frame.hinge),
        off_plane_deg: off_plane,
        ..frame.clone()
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReferenceVerdict {
    Ok,
    Rezero,
    Recalibrate,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LimbOffset {
    /// Signed pitch of the current pose against `zero`.
    pub in_plane_deg: f64,
    /// Signed roll of the current pose against `zero`.
    pub out_of_plane_deg: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct ReferenceCheck {
    pub verdict: ReferenceVerdict,
    pub thigh: Option<LimbOffset>,
    pub shin: Option<LimbOffset>,
}

/// Pre-session wearing check (plan 3.6): compares the current still pose with the stored reference
/// within and out of the hinge plane. A large out-of-plane difference means the strap rotated (full
/// recalibration); only an in-plane offset can be fixed by a quick re-zero.
pub fn check_reference(profile: &CalibrationProfile, thigh: Vec3, shin: Vec3) -> ReferenceCheck {
    let mut verdict = ReferenceVerdict::Ok;
    let mut offsets = [None, None];
    let limbs = [
        (profile.limbs.thigh.as_ref(), thigh),
        (Some(&profile.limbs.shin), shin),
    ];
    for (slot, (frame, current)) in offsets.iter_mut().zip(limbs) {
        let Some(frame) = frame else { continue };
        let a = limb_angles(frame, current);
        *slot = Some(LimbOffset {
            in_plane_deg: a.pitch,
            out_of_plane_deg: a.roll,
        });
        if a.roll.abs() > RECHECK_OUT_OF_PLANE_DEG {
            verdict = ReferenceVerdict::Recalibrate;
        } else if a.pitch.abs() > RECHECK_IN_PLANE_DEG && verdict == ReferenceVerdict::Ok {
            verdict = ReferenceVerdict::Rezero;
        }
    }
    ReferenceCheck {
        verdict,
        thigh: offsets[0],
        shin: offsets[1],
    }
}
