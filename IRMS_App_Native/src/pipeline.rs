//! Simulated two-sensor rig and the calibration wizard logic of the prototype.
//!
//! The simulated device no longer hands the app ready-made joint angles. It produces what the real
//! firmware sends in the `V:` field: the gravity direction seen by each sensor, through an arbitrary
//! mounting rotation the app does not know. The app has to calibrate (irms_core::calibration) before
//! it can read a knee angle from them, exactly as with a worn device.

use crate::wizard::Wizard;
use irms_core::angle_math::Vec3;
use irms_core::calibration::CalibrationProfile;
use irms_core::calibration_flow::Preset;
use irms_core::judge::{TriggerConfig, TriggerType};

type Mat3 = [[f64; 3]; 3];

fn mul(a: Mat3, b: Mat3) -> Mat3 {
    let mut out = [[0.0; 3]; 3];
    for (i, row) in out.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            *cell = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    out
}
fn apply(m: Mat3, v: Vec3) -> Vec3 {
    Vec3 {
        x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
        y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
        z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
    }
}
fn rot_x(deg: f64) -> Mat3 {
    let (s, c) = deg.to_radians().sin_cos();
    [[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]]
}
fn rot_y(deg: f64) -> Mat3 {
    let (s, c) = deg.to_radians().sin_cos();
    [[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]]
}
fn rot_z(deg: f64) -> Mat3 {
    let (s, c) = deg.to_radians().sin_cos();
    [[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]]
}

/// How the two sensors sit on the leg. Segment frame: x lateral, y up along the segment, z forward.
pub struct Rig {
    mount_thigh: Mat3,
    mount_shin: Mat3,
}

impl Rig {
    /// Sensors strapped on at arbitrary angles, as a person would.
    pub fn new() -> Self {
        Self {
            mount_thigh: mul(rot_z(20.0), rot_x(35.0)),
            mount_shin: mul(rot_y(-40.0), rot_z(65.0)),
        }
    }

    /// The shin sensor turns on the leg (strap slipped): `deg` about the segment's long axis.
    pub fn slip_shin(&mut self, deg: f64) {
        self.mount_shin = mul(self.mount_shin, rot_y(deg));
    }

    /// Gravity direction ("up") seen by each sensor for a hip flexion and knee flexion in degrees.
    /// Hip flexion lifts the thigh front (+z); knee flexion tips the shin back by the same amount.
    /// With `abd_deg` the thigh is also opened sideways (hip abduction, +x lateral).
    pub fn gravity_abd(&self, hip_deg: f64, knee_deg: f64, abd_deg: f64) -> (Vec3, Vec3) {
        let tilt = |deg: f64| {
            let (s, c) = deg.to_radians().sin_cos();
            Vec3 { x: 0.0, y: c, z: s }
        };
        let (sa, ca) = abd_deg.to_radians().sin_cos();
        let thigh = tilt(hip_deg);
        let thigh = Vec3 {
            x: thigh.x * ca + sa,
            y: thigh.y * ca,
            z: thigh.z * ca,
        };
        (
            apply(self.mount_thigh, thigh),
            apply(self.mount_shin, tilt(hip_deg - knee_deg)),
        )
    }
}

/// What the simulated wearer is doing.
#[derive(Clone, Copy, PartialEq)]
pub enum Script {
    /// Repetitions of the selected prescription.
    Exercise,
    /// Standing still (reference capture).
    Still,
    /// One slow thigh raise starting at the given simulator time.
    ThighRaise(f64),
    /// One slow knee curl starting at the given simulator time.
    KneeCurl(f64),
    /// One slow thigh extension (leg backwards) starting at the given simulator time.
    HipExtend(f64),
    /// One slow thigh abduction (leg sideways) starting at the given simulator time.
    HipAbduct(f64),
}

fn ease(x: f64) -> f64 {
    0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos()
}

/// 0..1 over one sweep: still 0.5 s, up 2 s, hold 1.5 s, down 2 s.
fn sweep_effort(p: f64) -> f64 {
    if p < 0.5 {
        0.0
    } else if p < 2.5 {
        ease((p - 0.5) / 2.0)
    } else if p < 4.0 {
        1.0
    } else {
        1.0 - ease((p - 4.0) / 2.0)
    }
}

/// Repetitions: bend 2 s, hold `hold_s` + 1.5 s, return 2 s, rest 1.5 s. Every fifth rep overshoots.
fn exercise_effort(t: f64, hold_s: f64) -> f64 {
    let top = hold_s + 1.5;
    let cycle = 2.0 + top + 2.0 + 1.5;
    let n = (t / cycle).floor() as u64;
    let p = t % cycle;
    let peak = if n % 5 == 4 { 1.4 } else { 1.0 };
    if p < 2.0 {
        peak * ease(p / 2.0)
    } else if p < 2.0 + top {
        peak
    } else if p < 4.0 + top {
        peak * (1.0 - ease((p - 2.0 - top) / 2.0))
    } else {
        0.0
    }
}

/// Hip flexion and knee flexion (deg) of the simulated wearer at simulator time `t`.
pub fn pose(script: Script, t: f64, cfg: &TriggerConfig) -> (f64, f64) {
    let tremor = 0.5 * (t * 37.0).sin() + 0.6 * (t * 2.3).sin();
    match script {
        Script::Still => (0.3 * (t * 1.7).sin(), 0.3 * (t * 2.1).sin()),
        Script::ThighRaise(t0) => (
            60.0 * sweep_effort(t - t0) + 0.3 * tremor,
            0.3 * (t * 2.1).sin(),
        ),
        Script::KneeCurl(t0) => (
            0.3 * (t * 1.7).sin(),
            80.0 * sweep_effort(t - t0) + 0.3 * tremor,
        ),
        Script::HipExtend(t0) => (
            -(20.0 * sweep_effort(t - t0)) + 0.3 * tremor,
            0.3 * (t * 2.1).sin(),
        ),
        Script::HipAbduct(_) => (0.3 * (t * 1.7).sin(), 0.3 * (t * 2.1).sin()),
        Script::Exercise => {
            let effort = exercise_effort(t, cfg.hold_time_ms / 1000.0);
            match cfg.trigger_type {
                TriggerType::JointAngle => (
                    2.0 + 1.5 * (t * 0.7).sin(),
                    8.0 + (cfg.target_angle - 10.0) * effort + tremor,
                ),
                TriggerType::SegmentElevation => (
                    3.0 + (cfg.target_angle + 4.0) * effort + tremor,
                    5.0 + 2.0 * (t * 0.9).sin(),
                ),
                TriggerType::SegmentExtension => (
                    -(2.0 + (cfg.target_angle + 4.0) * effort) + tremor,
                    3.0 + 1.5 * (t * 0.9).sin(),
                ),
            }
        }
    }
}

/// Hip abduction (deg) of the simulated wearer at simulator time `t`; zero except while abducting.
pub fn abduction(script: Script, t: f64) -> f64 {
    match script {
        Script::HipAbduct(t0) => 30.0 * sweep_effort(t - t0),
        _ => 0.0,
    }
}

/// One notification in the firmware's wire format, with the pre-atan2 vectors in the `V:` field.
/// The Euler fields carry the true pose so an uncalibrated app has something to show; the judged
/// angles come from the vectors once a profile exists.
#[cfg(test)]
pub fn packet(rig: &Rig, hip: f64, knee: f64) -> String {
    packet_abd(rig, hip, knee, 0.0)
}

pub fn packet_abd(rig: &Rig, hip: f64, knee: f64, abd: f64) -> String {
    let (t, s) = rig.gravity_abd(hip, knee, abd);
    format!(
        "T:{hip:.1},S:{:.1},K:{knee:.1},TR:1.5,SR:-1.2,KR:-2.7,V:{:.4}/{:.4}/{:.4}/{:.4}/{:.4}/{:.4}",
        hip - knee,
        t.x,
        t.y,
        t.z,
        s.x,
        s.y,
        s.z
    )
}

/// Runs the whole wizard on scripted movements without a window (used by `--calibrated` and `--run`,
/// so those flags still go through the real calibration instead of faking a profile).
pub fn auto_calibrate(rig: &Rig, cfg: &TriggerConfig) -> Result<CalibrationProfile, String> {
    let wizard = run_preset(rig, cfg, Preset::Calibrate)?;
    wizard
        .apply("")
        .map(|a| a.profile)
        .ok_or_else(|| "no profile".to_string())
}

/// The scripted movement a wizard step asks for.
pub fn script_for(wizard: &Wizard, t: f64) -> Script {
    use irms_core::calibration::MovementId;
    match wizard.flow.current_movement() {
        None => Script::Still,
        Some(MovementId::KneeFlexion) => Script::KneeCurl(t),
        Some(MovementId::HipFlexion) => Script::ThighRaise(t),
        Some(MovementId::HipExtension) => Script::HipExtend(t),
        Some(MovementId::HipAbduction) => Script::HipAbduct(t),
    }
}

/// Drives a wizard on the simulated rig until it leaves the capture pages; returns the time reached.
pub fn drive(
    wizard: &mut Wizard,
    rig: &Rig,
    cfg: &TriggerConfig,
    mut now_ms: f64,
) -> Result<f64, String> {
    while wizard.page() == 1 || wizard.page() == 2 {
        let script = script_for(wizard, 0.0);
        let t_start = now_ms;
        wizard.start(now_ms);
        while wizard.capturing() {
            now_ms += 40.0;
            let local = (now_ms - t_start) / 1000.0;
            let (hip, knee) = pose(script, local, cfg);
            let (thigh, shin) = rig.gravity_abd(hip, knee, abduction(script, local));
            wizard.push(now_ms, Some(thigh), Some(shin));
        }
        if !wizard.step_done {
            return Err(wizard.status.clone());
        }
        wizard.next();
    }
    Ok(now_ms)
}

/// Drives a preset to its review page on the simulated rig.
pub fn run_preset(rig: &Rig, cfg: &TriggerConfig, preset: Preset) -> Result<Wizard, String> {
    let mut wizard = Wizard::new(None);
    wizard.flow.set_side(irms_core::calibration::Side::Left);
    wizard.flow.set_preset(preset);
    wizard.begin();
    drive(&mut wizard, rig, cfg, 0.0)?;
    Ok(wizard)
}
