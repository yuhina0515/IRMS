//! Simulated two-sensor rig and the calibration wizard logic of the prototype.
//!
//! The simulated device no longer hands the app ready-made joint angles. It produces what the real
//! firmware sends in the `V:` field: the gravity direction seen by each sensor, through an arbitrary
//! mounting rotation the app does not know. The app has to calibrate (irms_core::calibration) before
//! it can read a knee angle from them, exactly as with a worn device.

use irms_core::angle_math::Vec3;
use irms_core::calibration::{
    capture_reference, estimate_limb_frame, solve_profile, CalibrationProfile, CalibrationQuality, Firmware, Frame,
    LimbError, Reference, ReferenceError, ReferenceKind, ReferencePosture, Side, SolveInput, Sweep,
};
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
        Self { mount_thigh: mul(rot_z(20.0), rot_x(35.0)), mount_shin: mul(rot_y(-40.0), rot_z(65.0)) }
    }

    /// The shin sensor turns on the leg (strap slipped): `deg` about the segment's long axis.
    pub fn slip_shin(&mut self, deg: f64) {
        self.mount_shin = mul(self.mount_shin, rot_y(deg));
    }

    /// Gravity direction ("up") seen by each sensor for a hip flexion and knee flexion in degrees.
    /// Hip flexion lifts the thigh front (+z); knee flexion tips the shin back by the same amount.
    pub fn gravity(&self, hip_deg: f64, knee_deg: f64) -> (Vec3, Vec3) {
        let tilt = |deg: f64| {
            let (s, c) = deg.to_radians().sin_cos();
            Vec3 { x: 0.0, y: c, z: s }
        };
        (apply(self.mount_thigh, tilt(hip_deg)), apply(self.mount_shin, tilt(hip_deg - knee_deg)))
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
}

pub const REFERENCE_CAPTURE_S: f64 = 2.2;
pub const SWEEP_CAPTURE_S: f64 = 6.0;

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
        Script::ThighRaise(t0) => (60.0 * sweep_effort(t - t0) + 0.3 * tremor, 0.3 * (t * 2.1).sin()),
        Script::KneeCurl(t0) => (0.3 * (t * 1.7).sin(), 80.0 * sweep_effort(t - t0) + 0.3 * tremor),
        Script::Exercise => {
            let effort = exercise_effort(t, cfg.hold_time_ms / 1000.0);
            match cfg.trigger_type {
                TriggerType::JointAngle => (2.0 + 1.5 * (t * 0.7).sin(), 8.0 + (cfg.target_angle - 10.0) * effort + tremor),
                TriggerType::SegmentElevation => (3.0 + (cfg.target_angle + 4.0) * effort + tremor, 5.0 + 2.0 * (t * 0.9).sin()),
                TriggerType::SegmentExtension => {
                    (-(2.0 + (cfg.target_angle + 4.0) * effort) + tremor, 3.0 + 1.5 * (t * 0.9).sin())
                }
            }
        }
    }
}

/// One notification in the firmware's wire format, with the pre-atan2 vectors in the `V:` field.
/// The Euler fields carry the true pose so an uncalibrated app has something to show; the judged
/// angles come from the vectors once a profile exists.
pub fn packet(rig: &Rig, hip: f64, knee: f64) -> String {
    let (t, s) = rig.gravity(hip, knee);
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

// ---------- calibration wizard ----------

/// Steps: 0 reference, 1 thigh sweep, 2 shin sweep, 3 result.
pub struct Wizard {
    pub step: i32,
    /// Start time (ms) and length (ms) of the capture in progress.
    capture: Option<(f64, f64)>,
    frames: Vec<Frame>,
    pub step_done: bool,
    pub status: String,
    /// 0 plain, 1 good, 2 problem.
    pub tone: i32,
    reference: Option<Reference>,
    thigh_sweep: Option<Vec<Vec3>>,
    pub result: String,
    pub profile: Option<CalibrationProfile>,
}

impl Wizard {
    pub fn new() -> Self {
        Self {
            step: 0,
            capture: None,
            frames: Vec::new(),
            step_done: false,
            status: "準備好後按「開始擷取」".into(),
            tone: 0,
            reference: None,
            thigh_sweep: None,
            result: String::new(),
            profile: None,
        }
    }

    pub fn capturing(&self) -> bool {
        self.capture.is_some()
    }

    pub fn progress(&self, now_ms: f64) -> f64 {
        match self.capture {
            Some((t0, len)) => ((now_ms - t0) / len).clamp(0.0, 1.0),
            None if self.step_done => 1.0,
            None => 0.0,
        }
    }

    /// Length of the capture for the current step, in seconds.
    pub fn capture_seconds(&self) -> f64 {
        if self.step == 0 {
            REFERENCE_CAPTURE_S
        } else {
            SWEEP_CAPTURE_S
        }
    }

    pub fn start(&mut self, now_ms: f64) {
        if self.step > 2 || self.capturing() {
            return;
        }
        self.capture = Some((now_ms, self.capture_seconds() * 1000.0));
        self.frames.clear();
        self.step_done = false;
        self.tone = 0;
        self.status = if self.step == 0 { "擷取中…請保持不動".into() } else { "擷取中…請完成動作後回到起始位".into() };
    }

    pub fn next(&mut self) {
        if self.step_done && self.step < 3 {
            self.step += 1;
            self.step_done = false;
            self.tone = 0;
            self.status = "準備好後按「開始擷取」".into();
        }
    }

    /// Feed one sample of both gravity vectors while the wizard is open. Returns true when a step
    /// just finished (successfully or not), so the caller can stop the scripted movement.
    pub fn push(&mut self, now_ms: f64, thigh: Option<Vec3>, shin: Option<Vec3>) -> bool {
        let Some((t0, len)) = self.capture else { return false };
        match (thigh, shin) {
            (Some(thigh), Some(shin)) => self.frames.push(Frame {
                t_ms: now_ms,
                thigh,
                shin,
                thigh_gyro: None,
                shin_gyro: None,
                thigh_raw_g: None,
                shin_raw_g: None,
            }),
            _ => {
                self.capture = None;
                self.fail("裝置沒有送出重力向量,這個韌體版本無法用統一校準");
                return true;
            }
        }
        if now_ms - t0 < len {
            return false;
        }
        self.capture = None;
        self.finish_step();
        true
    }

    fn fail(&mut self, message: &str) {
        self.step_done = false;
        self.tone = 2;
        self.status = format!("{message}。請再擷取一次");
    }

    fn pass(&mut self, message: String) {
        self.step_done = true;
        self.tone = 1;
        self.status = message;
    }

    fn finish_step(&mut self) {
        match self.step {
            0 => match capture_reference(&self.frames, ReferenceKind::Straight, ReferencePosture::Standing) {
                Ok(reference) => {
                    self.pass(format!("零位已捕捉 · 晃動 {:.1}° · {} 筆", reference.still_rms_deg, reference.frames));
                    self.reference = Some(reference);
                }
                Err(ReferenceError::Shaking) => self.fail("偵測到晃動"),
                Err(ReferenceError::TooShort) => self.fail("資料太少"),
                Err(ReferenceError::InvalidInput) => self.fail("沒有可用的資料"),
            },
            1 => {
                let samples: Vec<Vec3> = self.frames.iter().map(|f| f.thigh).collect();
                let reference = self.reference.expect("reference comes first").thigh;
                match estimate_limb_frame(reference, &samples, None, 1) {
                    Ok(frame) => {
                        self.pass(format!("大腿軸已建立 · 幅度 {:.0}° · 平面度 {}", frame.span_deg, planarity(frame.planarity_deg)));
                        self.thigh_sweep = Some(samples);
                    }
                    Err(e) => self.fail(limb_error("大腿", e)),
                }
            }
            _ => {
                let reference = self.reference.expect("reference comes first");
                let input = SolveInput {
                    id: "prototype".into(),
                    created_at: String::new(),
                    side: Side::Left,
                    firmware: Firmware { version: None, raw_stream: false },
                    reference,
                    thigh_sweep: self.thigh_sweep.clone().map(|samples| Sweep { samples, gyro: None }),
                    shin_sweep: Sweep { samples: self.frames.iter().map(|f| f.shin).collect(), gyro: None },
                };
                match solve_profile(&input) {
                    Ok(profile) => {
                        let shin = &profile.limbs.shin;
                        self.pass(format!("小腿軸已建立 · 幅度 {:.0}° · 平面度 {}", shin.span_deg, planarity(shin.planarity_deg)));
                        self.result = describe(&profile);
                        self.profile = Some(profile);
                    }
                    Err(e) => self.fail(limb_error("小腿", e.error)),
                }
            }
        }
    }
}

fn planarity(p: Option<f64>) -> String {
    p.map_or("未使用".into(), |p| format!("{p:.1}°"))
}

fn limb_error(limb: &str, e: LimbError) -> &'static str {
    match (limb, e) {
        (_, LimbError::SweepTooSmall) => "動作幅度太小",
        (_, LimbError::SweepNotPlanar) => "動作不夠平順(偏離單一平面)",
        (_, LimbError::ReferenceOffPlane) => "起始姿勢與動作平面不一致,請重新捕捉零位",
        (_, LimbError::WrongDirection) => "動作方向不對",
        (_, LimbError::InvalidInput) => "沒有可用的資料",
    }
}

/// Summary of a solved profile for the wizard's last page.
pub fn describe(profile: &CalibrationProfile) -> String {
    let level = match profile.quality.level {
        CalibrationQuality::High => "高",
        CalibrationQuality::Medium => "中",
        CalibrationQuality::Low => "低",
    };
    let limb = |name: &str, f: &irms_core::calibration::LimbFrame| {
        format!("{name}:動作幅度 {:.0}°,平面度 {},零位偏離平面 {:.1}°", f.span_deg, planarity(f.planarity_deg), f.off_plane_deg.abs())
    };
    let mut lines = vec![format!("品質:{level}(沒有陀螺儀資料時最高為中)")];
    if let Some(thigh) = &profile.limbs.thigh {
        lines.push(limb("大腿", thigh));
    }
    lines.push(limb("小腿", &profile.limbs.shin));
    if !profile.quality.warnings.is_empty() {
        lines.push(format!("提醒:{}", profile.quality.warnings.join("、")));
    }
    lines.join("\n")
}

/// Runs the whole wizard on scripted movements without a window (used by `--calibrated` and `--run`,
/// so those flags still go through the real calibration instead of faking a profile).
pub fn auto_calibrate(rig: &Rig, cfg: &TriggerConfig) -> Result<CalibrationProfile, String> {
    let mut wizard = Wizard::new();
    let mut now_ms = 0.0;
    for script in [Script::Still, Script::ThighRaise(0.0), Script::KneeCurl(0.0)] {
        let t_start = now_ms;
        wizard.start(now_ms);
        while wizard.capturing() {
            now_ms += 40.0;
            let local = (now_ms - t_start) / 1000.0;
            let (hip, knee) = pose(script, local, cfg);
            let (thigh, shin) = rig.gravity(hip, knee);
            wizard.push(now_ms, Some(thigh), Some(shin));
        }
        if !wizard.step_done {
            return Err(wizard.status.clone());
        }
        wizard.next();
    }
    wizard.profile.ok_or_else(|| "no profile".to_string())
}
