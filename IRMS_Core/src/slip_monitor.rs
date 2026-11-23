//! In-session mounting check for unified calibrations (plan 2026-11-10, section 4.3).
//!
//! Port of `IRMS_App_Tauri/src/services/slipMonitor.ts`, with the two helpers it takes from
//! `calibrationB.ts` (`jacobiEigen`, `angularSpanDeg`); plan phase 4.
//!
//! A sensor that turns on the limb changes the direction of the joint's hinge axis as seen from the
//! sensor. While the thigh rests and the knee bends and straightens, gravity sweeps a cone in the shin
//! sensor's frame whose axis is the knee hinge, so the exercise itself shows where the axis now lies.
//! Comparing it with the calibrated axis reveals a turn of the shin sensor about the leg or a sideways
//! tilt of its board.
//!
//! What it cannot do, by construction: see a tilt about the hinge axis itself; judge the shin while
//! the thigh moves; judge the thigh sensor at all (the hip is not a hinge).
//!
//! The thresholds are provisional: they come from the simulator, not from a worn device.
//! Checked against the TypeScript on shared data: `fixtures/slip-monitor.json` (see the tests).

use crate::angle_math::{vector_angle_deg, Vec3};

/// History kept. Long enough for one slow repetition, short enough to follow a change.
pub const SLIP_WINDOW_MS: f64 = 8000.0;
pub const SLIP_EVAL_EVERY_MS: f64 = 1000.0;
pub const SLIP_MIN_SAMPLES: usize = 40;
/// The sweep must be wide and regular before its axis means anything.
pub const SLIP_SPAN_MIN_DEG: f64 = 30.0;
pub const SLIP_PLANARITY_MAX_DEG: f64 = 6.0;
/// The thigh counts as resting while its gravity vector stays within this spread over the window.
pub const SLIP_THIGH_STILL_MAX_DEG: f64 = 8.0;
/// Axis difference that counts as a shifted sensor.
pub const SLIP_AXIS_WARN_DEG: f64 = 12.0;
/// The difference must persist this long before it is reported: one window of history plus ten
/// seconds of the shift really being there.
pub const SLIP_CONFIRM_MS: f64 = SLIP_WINDOW_MS + 10000.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SlipReading {
    /// Angle between the calibrated knee hinge and the axis of the recent shin movement (0 to 90 deg).
    pub axis_drift_deg: f64,
    pub span_deg: f64,
    pub planarity_deg: f64,
}

fn finite(v: Vec3) -> bool {
    v.x.is_finite() && v.y.is_finite() && v.z.is_finite()
}

fn unit(v: Vec3) -> Option<Vec3> {
    let n = (v.x * v.x + v.y * v.y + v.z * v.z).sqrt();
    (n > 1e-9).then(|| Vec3 {
        x: v.x / n,
        y: v.y / n,
        z: v.z / n,
    })
}

/// Cyclic Jacobi for a 3 x 3 symmetric matrix. `vectors[k]` is the eigenvector of `values[k]`.
// Index loops are kept so the matrix code reads like the TypeScript it mirrors.
#[allow(clippy::needless_range_loop)]
pub fn jacobi_eigen(input: [[f64; 3]; 3]) -> ([f64; 3], [[f64; 3]; 3]) {
    let mut a = input;
    let mut v = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for _sweep in 0..60 {
        let mut off = 0.0;
        for i in 0..3 {
            for j in (i + 1)..3 {
                off += a[i][j] * a[i][j];
            }
        }
        if off < 1e-26 {
            break;
        }
        for p in 0..3 {
            for q in (p + 1)..3 {
                if a[p][q].abs() < 1e-300 {
                    continue;
                }
                let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
                let t = (if theta >= 0.0 { 1.0 } else { -1.0 })
                    / (theta.abs() + (theta * theta + 1.0).sqrt());
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for row in &mut a {
                    let (akp, akq) = (row[p], row[q]);
                    row[p] = c * akp - s * akq;
                    row[q] = s * akp + c * akq;
                }
                for k in 0..3 {
                    let (apk, aqk) = (a[p][k], a[q][k]);
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for row in &mut v {
                    let (vkp, vkq) = (row[p], row[q]);
                    row[p] = c * vkp - s * vkq;
                    row[q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let values = [a[0][0], a[1][1], a[2][2]];
    let mut vectors = [[0.0; 3]; 3];
    for (k, vector) in vectors.iter_mut().enumerate() {
        for (row, out) in v.iter().zip(vector.iter_mut()) {
            *out = row[k];
        }
    }
    (values, vectors)
}

/// Largest pairwise angle among the vectors (subsampled to at most about 60 points).
pub fn angular_span_deg(vectors: &[Vec3]) -> f64 {
    let stride = vectors.len().div_ceil(60).max(1);
    let pts: Vec<Vec3> = vectors.iter().step_by(stride).copied().collect();
    let mut span: f64 = 0.0;
    for i in 0..pts.len() {
        for j in (i + 1)..pts.len() {
            // `Math.max` semantics: a NaN angle makes the span NaN.
            let angle = vector_angle_deg(pts[i], pts[j]);
            span = if span.is_nan() || angle.is_nan() {
                f64::NAN
            } else {
                span.max(angle)
            };
        }
    }
    span
}

/// Axis of the cone (or plane) that unit vectors sweep: the direction of least variance about their
/// mean, so a hinge that is not level still gives the hinge. `planarity_deg` is the RMS distance of
/// the samples from that cone, as an angle.
// Index loops are kept so the matrix code reads like the TypeScript it mirrors.
#[allow(clippy::needless_range_loop)]
pub fn fit_sweep_axis(units: &[Vec3]) -> (Vec3, f64) {
    let n = if units.is_empty() {
        1.0
    } else {
        units.len() as f64
    };
    let mut m = Vec3 {
        x: 0.0,
        y: 0.0,
        z: 0.0,
    };
    for u in units {
        m = Vec3 {
            x: m.x + u.x / n,
            y: m.y + u.y / n,
            z: m.z + u.z / n,
        };
    }
    let mut c = [[0.0; 3]; 3];
    for u in units {
        let d = [u.x - m.x, u.y - m.y, u.z - m.z];
        for i in 0..3 {
            for j in 0..3 {
                c[i][j] += d[i] * d[j];
            }
        }
    }
    let (values, vectors) = jacobi_eigen(c);
    // `values.indexOf(Math.min(...values))`: the first index holding the smallest value.
    let mut k = 0;
    for i in 1..3 {
        if values[i] < values[k] {
            k = i;
        }
    }
    let axis = unit(Vec3 {
        x: vectors[k][0],
        y: vectors[k][1],
        z: vectors[k][2],
    })
    .unwrap_or(Vec3 {
        x: 0.0,
        y: 0.0,
        z: 1.0,
    });
    let rms = (values[k].max(0.0) / n).sqrt();
    (axis, rms.min(1.0).asin().to_degrees())
}

/// Axis of a window of unit shin vectors compared with the calibrated hinge; `None` when it is not a
/// clean sweep.
pub fn axis_drift(hinge: Vec3, samples: &[Vec3]) -> Option<SlipReading> {
    sweep_axis(hinge, samples).map(|(reading, _)| reading)
}

/// Like [`axis_drift`], plus the fitted axis itself, signed to agree with `hinge` (the fit gives a
/// line, not a direction). This is where the hinge now lies in the shin sensor frame.
pub fn sweep_axis(hinge: Vec3, samples: &[Vec3]) -> Option<(SlipReading, Vec3)> {
    let h = unit(hinge)?;
    if samples.len() < SLIP_MIN_SAMPLES {
        return None;
    }
    let span_deg = angular_span_deg(samples);
    if span_deg < SLIP_SPAN_MIN_DEG {
        return None;
    }
    let (axis, planarity_deg) = fit_sweep_axis(samples);
    // Written as a negated `<=` like the TypeScript, so a NaN planarity gives no reading.
    #[allow(clippy::neg_cmp_op_on_partial_ord)]
    if !(planarity_deg <= SLIP_PLANARITY_MAX_DEG) {
        return None;
    }
    let d = axis.x * h.x + axis.y * h.y + axis.z * h.z;
    let signed = if d < 0.0 {
        Vec3 {
            x: -axis.x,
            y: -axis.y,
            z: -axis.z,
        }
    } else {
        axis
    };
    Some((
        SlipReading {
            axis_drift_deg: d.abs().min(1.0).acos().to_degrees(),
            span_deg,
            planarity_deg,
        },
        signed,
    ))
}

#[derive(Debug, Clone, Copy)]
struct Sample {
    t_ms: f64,
    thigh: Vec3,
    shin: Vec3,
}

#[derive(Debug, Clone)]
pub struct SlipMonitor {
    hinge: Option<Vec3>,
    samples: std::collections::VecDeque<Sample>,
    last_eval: f64,
    /// Time of the first evaluation of the current unbroken run above the warning threshold.
    over_since: Option<f64>,
    reported: bool,
    last: Option<SlipReading>,
    /// Hinge direction fitted from the most recent clean sweep (shin sensor frame, signed like the
    /// calibrated hinge).
    axis: Option<Vec3>,
    worst: f64,
}

impl SlipMonitor {
    /// `shin_hinge` is the calibrated knee hinge in the shin sensor frame; without one nothing is watched.
    pub fn new(shin_hinge: Option<Vec3>) -> Self {
        Self {
            hinge: shin_hinge.filter(|h| finite(*h) && unit(*h).is_some()),
            samples: std::collections::VecDeque::new(),
            last_eval: f64::NEG_INFINITY,
            over_since: None,
            reported: false,
            last: None,
            axis: None,
            worst: 0.0,
        }
    }

    pub fn active(&self) -> bool {
        self.hinge.is_some()
    }

    /// The hinge as the most recent clean sweep shows it: what the calibrated hinge becomes if the sensor
    /// turned on the leg. `None` until a clean knee-only sweep was seen.
    pub fn observed_axis(&self) -> Option<Vec3> {
        self.axis
    }

    /// Most recent clean reading and the largest drift seen (for logs and session notes).
    pub fn summary(&self) -> (Option<SlipReading>, f64) {
        (self.last, self.worst)
    }

    /// Feed one sample of both gravity vectors (both are needed: the thigh proves the knee moved alone).
    /// Returns at most one reading per monitor lifetime, meaning "the shin sensor has shifted": the
    /// report is latched, so a shifted sensor gives one warning.
    pub fn push(
        &mut self,
        t_ms: f64,
        thigh: Option<Vec3>,
        shin: Option<Vec3>,
    ) -> Option<SlipReading> {
        let hinge = self.hinge?;
        if !t_ms.is_finite() {
            return None;
        }
        // A clock that runs backwards (reconnect, resume) makes the window meaningless: start over.
        if self.samples.back().is_some_and(|last| t_ms < last.t_ms) {
            self.samples.clear();
            self.over_since = None;
            self.last_eval = f64::NEG_INFINITY;
        }
        let thigh = thigh.filter(|v| finite(*v)).and_then(unit);
        let shin = shin.filter(|v| finite(*v)).and_then(unit);
        if let (Some(thigh), Some(shin)) = (thigh, shin) {
            self.samples.push_back(Sample { t_ms, thigh, shin });
        }
        while self
            .samples
            .front()
            .is_some_and(|first| first.t_ms < t_ms - SLIP_WINDOW_MS)
        {
            self.samples.pop_front();
        }

        if t_ms - self.last_eval < SLIP_EVAL_EVERY_MS {
            return None;
        }
        self.last_eval = t_ms;

        // No clean knee-only sweep in the window says nothing either way: the current run is left as it is.
        if self.samples.len() < SLIP_MIN_SAMPLES {
            return None;
        }
        let thighs: Vec<Vec3> = self.samples.iter().map(|s| s.thigh).collect();
        if angular_span_deg(&thighs) > SLIP_THIGH_STILL_MAX_DEG {
            return None;
        }
        let shins: Vec<Vec3> = self.samples.iter().map(|s| s.shin).collect();
        let (reading, axis) = sweep_axis(hinge, &shins)?;

        self.last = Some(reading);
        self.axis = Some(axis);
        self.worst = self.worst.max(reading.axis_drift_deg);
        if reading.axis_drift_deg <= SLIP_AXIS_WARN_DEG {
            self.over_since = None;
            return None;
        }
        let since = *self.over_since.get_or_insert(t_ms);
        if self.reported || t_ms - since < SLIP_CONFIRM_MS {
            return None;
        }
        self.reported = true;
        Some(reading)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn close(a: f64, b: f64) -> bool {
        a == b || (a - b).abs() < 1e-7
    }
    fn vec3(v: &Value) -> Option<Vec3> {
        let a = v.as_array()?;
        // A null component stands for a non-finite number.
        let n = |x: &Value| x.as_f64().unwrap_or(f64::NAN);
        Some(Vec3 {
            x: n(&a[0]),
            y: n(&a[1]),
            z: n(&a[2]),
        })
    }
    fn check_reading(got: Option<SlipReading>, want: &Value, what: &str) {
        match (got, want.is_null()) {
            (None, true) => {}
            (Some(g), false) => {
                assert!(
                    close(g.axis_drift_deg, want["axisDriftDeg"].as_f64().unwrap()),
                    "{what}: drift {g:?} vs {want}"
                );
                assert!(
                    close(g.span_deg, want["spanDeg"].as_f64().unwrap()),
                    "{what}: span {g:?} vs {want}"
                );
                assert!(
                    close(g.planarity_deg, want["planarityDeg"].as_f64().unwrap()),
                    "{what}: planarity {g:?} vs {want}"
                );
            }
            (g, _) => panic!("{what}: got {g:?}, want {want}"),
        }
    }

    #[test]
    fn inactive_without_a_usable_hinge() {
        assert!(!SlipMonitor::new(None).active());
        assert!(!SlipMonitor::new(Some(Vec3 {
            x: 0.0,
            y: 0.0,
            z: 0.0
        }))
        .active());
        assert!(!SlipMonitor::new(Some(Vec3 {
            x: f64::NAN,
            y: 0.0,
            z: 1.0
        }))
        .active());
        let up = Some(Vec3 {
            x: 0.0,
            y: 1.0,
            z: 0.0,
        });
        assert_eq!(SlipMonitor::new(None).push(0.0, up, up), None);
    }

    /// Replays the sample streams recorded from the TypeScript monitor (simulated IMU sessions) and the
    /// direct calls of its helper functions.
    #[test]
    fn matches_the_typescript_implementation_on_the_shared_fixture() {
        let fx: Value = serde_json::from_str(include_str!(
            "../../IRMS_App_Tauri/fixtures/slip-monitor.json"
        ))
        .unwrap();

        for (i, case) in fx["jacobi"].as_array().unwrap().iter().enumerate() {
            let m: Vec<Vec<f64>> = serde_json::from_value(case["matrix"].clone()).unwrap();
            let (values, vectors) = jacobi_eigen([
                [m[0][0], m[0][1], m[0][2]],
                [m[1][0], m[1][1], m[1][2]],
                [m[2][0], m[2][1], m[2][2]],
            ]);
            let want_values: Vec<f64> = serde_json::from_value(case["values"].clone()).unwrap();
            let want_vectors: Vec<Vec<f64>> =
                serde_json::from_value(case["vectors"].clone()).unwrap();
            for k in 0..3 {
                assert!(
                    close(values[k], want_values[k]),
                    "jacobi {i}: values {values:?} vs {want_values:?}"
                );
                for j in 0..3 {
                    assert!(
                        close(vectors[k][j], want_vectors[k][j]),
                        "jacobi {i}: vectors {vectors:?} vs {want_vectors:?}"
                    );
                }
            }
        }

        let mut frames_total = 0usize;
        let mut events_total = 0usize;
        let mut readings = 0usize;
        for sc in fx["scenarios"].as_array().unwrap() {
            let name = sc["name"].as_str().unwrap();
            let hinge = vec3(&sc["hinge"]);
            let frames = sc["frames"].as_array().unwrap();
            let mut monitor = SlipMonitor::new(hinge);
            let mut events: Vec<(usize, SlipReading)> = Vec::new();
            for (i, f) in frames.iter().enumerate() {
                let t = f[0].as_f64().unwrap_or(f64::NAN);
                if let Some(e) = monitor.push(t, vec3(&f[1]), vec3(&f[2])) {
                    events.push((i, e));
                }
            }
            let want_events = sc["events"].as_array().unwrap();
            assert_eq!(
                events.len(),
                want_events.len(),
                "{name}: events {events:?} vs {want_events:?}"
            );
            for ((index, reading), want) in events.iter().zip(want_events) {
                assert_eq!(
                    *index as u64,
                    want["index"].as_u64().unwrap(),
                    "{name}: event index"
                );
                check_reading(Some(*reading), want, name);
            }
            let (last, worst) = monitor.summary();
            check_reading(last, &sc["summary"]["last"], &format!("{name} summary"));
            assert!(
                close(worst, sc["summary"]["worstDeg"].as_f64().unwrap()),
                "{name}: worst {worst}"
            );
            if last.is_some() {
                readings += 1;
            }

            // The helper functions on the first window of shin vectors of this scenario.
            let d = &sc["firstWindow"];
            let shins: Vec<Vec3> = d["samples"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(vec3)
                .collect();
            assert!(
                close(angular_span_deg(&shins), d["spanDeg"].as_f64().unwrap()),
                "{name}: span"
            );
            if let Some(h) = hinge {
                check_reading(
                    axis_drift(h, &shins),
                    &d["drift"],
                    &format!("{name} first window"),
                );
            }
            frames_total += frames.len();
            events_total += events.len();
        }
        assert!(frames_total > 3000, "replayed {frames_total} frames");
        assert_eq!(events_total, 1, "exactly one scenario reports a shift");
        assert!(
            readings >= 3,
            "scenarios ending with a clean reading: {readings}"
        );
    }
}
