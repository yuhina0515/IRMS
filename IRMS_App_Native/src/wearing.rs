//! Pre-session wearing check (plan 2026-11-10 section 3.6).
//!
//! Before a session on a real device the wearer takes the pose the calibration was captured in and
//! holds it for two seconds. The still pose is compared with the stored reference: a turned strap or a
//! shifted sensor is reported, never silently corrected. Only an in-plane offset small enough to be the
//! strap alone can be removed on the spot (quick re-zero), because the check cannot tell a sensor that
//! sits differently from a wearer who is not in the reference posture.

use irms_core::angle_math::Vec3;
use irms_core::calibration::{
    capture_reference, CalibrationProfile, Frame, ReferenceCheck, ReferenceKind, ReferencePosture,
    ReferenceVerdict,
};
use irms_core::calibration_flow::{is_still_window, rezero_profile, wearing_verdict};

pub const SAMPLE_MS: f64 = 2000.0;
/// An unsteady window says nothing about the strap.
pub const STILL_MAX_SPREAD_DEG: f64 = 4.0;
/// Largest in-plane offset the one-step re-zero will absorb. Provisional.
pub const QUICK_REZERO_MAX_DEG: f64 = 20.0;
const MIN_FRAMES: usize = 5;

#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    Ok,
    /// Moving, or no data: no verdict; the wearer decides.
    Inconclusive,
    /// A small in-plane offset the pose just held can remove.
    Rezero,
    /// The strap turned (out-of-plane difference).
    Recalibrate,
    /// An in-plane offset too large to be the strap alone.
    TooFar,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Stage {
    Posture,
    Sampling(f64),
    Result,
}

pub struct WearingCheck {
    profile: CalibrationProfile,
    stage: Stage,
    frames: Vec<Frame>,
    verdict: Option<Verdict>,
}

fn within_reach(check: &ReferenceCheck) -> bool {
    [check.thigh, check.shin]
        .iter()
        .flatten()
        .all(|l| l.in_plane_deg.abs() <= QUICK_REZERO_MAX_DEG)
}

impl WearingCheck {
    pub fn new(profile: CalibrationProfile) -> Self {
        Self {
            profile,
            stage: Stage::Posture,
            frames: Vec::new(),
            verdict: None,
        }
    }

    /// 0 take the pose, 1 sampling, 2 verdict.
    pub fn page(&self) -> i32 {
        match self.stage {
            Stage::Posture => 0,
            Stage::Sampling(_) => 1,
            Stage::Result => 2,
        }
    }

    pub fn sampling(&self) -> bool {
        matches!(self.stage, Stage::Sampling(_))
    }

    pub fn verdict(&self) -> Option<&Verdict> {
        self.verdict.as_ref()
    }

    fn posture_name(&self) -> &'static str {
        if self.profile.reference.kind == ReferenceKind::Neutral {
            return "校準時的起始姿勢";
        }
        match self.profile.reference.posture {
            ReferencePosture::Standing => "站立",
            ReferencePosture::LongSitting => "長坐(腿伸直)",
            ReferencePosture::Supine => "仰躺",
            ReferencePosture::Seated => "坐姿(膝彎90°)",
            ReferencePosture::Other => "校準時的姿勢",
        }
    }

    pub fn body(&self) -> String {
        match (self.stage, &self.verdict) {
            (Stage::Posture, _) => format!("請先擺出校準時的姿勢(「{}」)並保持不動,再按「開始檢查」。", self.posture_name()),
            (Stage::Sampling(_), _) => "檢查中…請保持不動".into(),
            (Stage::Result, Some(Verdict::Ok)) => "穿戴位置與校準一致。".into(),
            (Stage::Result, Some(Verdict::Inconclusive)) => {
                "沒有取得穩定的讀數(動了或沒有資料),無法判斷穿戴位置。可以再檢查一次,或仍要開始。".into()
            }
            (Stage::Result, Some(Verdict::Rezero)) => {
                "感測器相對校準的零位有些偏移。你剛才的姿勢就是校準姿勢,可以直接歸零;不歸零就開始,整個療程的角度都會帶著這個偏移。".into()
            }
            (Stage::Result, Some(Verdict::Recalibrate)) => {
                "感測器的方向和校準時不同(綁帶可能轉動了)。建議重新校準;仍要開始的話,角度可能不準。".into()
            }
            (Stage::Result, Some(Verdict::TooFar)) => {
                "偏移太大,可能是姿勢不對,也可能是感測器移位。建議重做姿勢再檢查,或重新校準;仍要開始的話,角度可能不準。".into()
            }
            (Stage::Result, None) => String::new(),
        }
    }

    pub fn begin(&mut self, now_ms: f64) {
        if self.stage == Stage::Posture || self.stage == Stage::Result {
            self.stage = Stage::Sampling(now_ms);
            self.frames.clear();
            self.verdict = None;
        }
    }

    /// Back to the pose page, for another try.
    pub fn retry(&mut self) {
        if self.stage == Stage::Result {
            self.stage = Stage::Posture;
            self.verdict = None;
        }
    }

    pub fn progress(&self, now_ms: f64) -> f64 {
        match self.stage {
            Stage::Sampling(t0) => ((now_ms - t0) / SAMPLE_MS).clamp(0.0, 1.0),
            Stage::Result => 1.0,
            Stage::Posture => 0.0,
        }
    }

    /// One sample of both gravity vectors. Returns true when the verdict just became known.
    pub fn push(&mut self, now_ms: f64, thigh: Option<Vec3>, shin: Option<Vec3>) -> bool {
        let Stage::Sampling(t0) = self.stage else {
            return false;
        };
        if let (Some(thigh), Some(shin)) = (thigh, shin) {
            self.frames.push(Frame {
                t_ms: now_ms,
                thigh,
                shin,
                thigh_gyro: None,
                shin_gyro: None,
                thigh_raw_g: None,
                shin_raw_g: None,
            });
        }
        if now_ms - t0 < SAMPLE_MS {
            return false;
        }
        self.stage = Stage::Result;
        self.verdict = Some(self.judge());
        true
    }

    fn judge(&self) -> Verdict {
        let pairs: Vec<(Vec3, Vec3)> = self.frames.iter().map(|f| (f.thigh, f.shin)).collect();
        if pairs.len() < MIN_FRAMES || !is_still_window(&pairs, STILL_MAX_SPREAD_DEG) {
            return Verdict::Inconclusive;
        }
        let n = pairs.len() as f64;
        let mean = |pick: fn(&(Vec3, Vec3)) -> Vec3| {
            let sum = pairs.iter().map(pick).fold(
                Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: 0.0,
                },
                |a, v| Vec3 {
                    x: a.x + v.x,
                    y: a.y + v.y,
                    z: a.z + v.z,
                },
            );
            Vec3 {
                x: sum.x / n,
                y: sum.y / n,
                z: sum.z / n,
            }
        };
        let current = (mean(|p| p.0), mean(|p| p.1));
        let Some(check) = wearing_verdict(Some(&self.profile), Some(current)) else {
            return Verdict::Inconclusive;
        };
        match check.verdict {
            ReferenceVerdict::Ok => Verdict::Ok,
            ReferenceVerdict::Recalibrate => Verdict::Recalibrate,
            ReferenceVerdict::Rezero if within_reach(&check) => Verdict::Rezero,
            ReferenceVerdict::Rezero => Verdict::TooFar,
        }
    }

    /// The re-zeroed profile from the frames just held (same kind and posture as the stored one).
    pub fn rezeroed(&self, id: &str, created_at: &str) -> Result<CalibrationProfile, &'static str> {
        if self.verdict != Some(Verdict::Rezero) {
            return Err("這次的檢查結果不能歸零");
        }
        let reference = capture_reference(
            &self.frames,
            self.profile.reference.kind,
            self.profile.reference.posture,
        )
        .map_err(|_| "姿勢不夠穩定,無法歸零")?;
        rezero_profile(&self.profile, reference, id, created_at)
            .map_err(|_| "姿勢偏離動作平面,請重新校準")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::{run_preset, Rig};
    use irms_core::calibration::MovementId;
    use irms_core::calibration_flow::Preset;
    use irms_core::judge::{AngleLimits, TriggerConfig, TriggerType};

    fn profile() -> CalibrationProfile {
        let cfg = TriggerConfig {
            target_angle: 60.0,
            tolerance: 5.0,
            hold_time_ms: 3000.0,
            trigger_type: TriggerType::JointAngle,
            limits: AngleLimits::default(),
        };
        let w = run_preset(&Rig::new(), &cfg, Preset::Calibrate).unwrap();
        assert!(w.flow.is_captured(MovementId::KneeFlexion));
        w.apply("t").unwrap().profile
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
    /// Rodrigues rotation of `v` about the unit `axis`.
    fn rotate(v: Vec3, axis: Vec3, deg: f64) -> Vec3 {
        let (s, c) = deg.to_radians().sin_cos();
        let k = cross(axis, v);
        let d = dot(axis, v) * (1.0 - c);
        Vec3 {
            x: v.x * c + k.x * s + axis.x * d,
            y: v.y * c + k.y * s + axis.y * d,
            z: v.z * c + k.z * s + axis.z * d,
        }
    }

    /// Holds the pose for the whole window and returns the finished check.
    fn hold(profile: &CalibrationProfile, thigh: Vec3, shin: Vec3) -> WearingCheck {
        let mut c = WearingCheck::new(profile.clone());
        assert_eq!(c.page(), 0);
        c.begin(0.0);
        let mut t = 0.0;
        while c.sampling() {
            t += 40.0;
            c.push(t, Some(thigh), Some(shin));
        }
        assert_eq!(c.page(), 2);
        c
    }

    #[test]
    fn the_reference_pose_passes() {
        let p = profile();
        let c = hold(&p, p.reference.thigh, p.reference.shin);
        assert_eq!(c.verdict(), Some(&Verdict::Ok));
    }

    #[test]
    fn a_small_in_plane_offset_can_be_rezeroed_on_the_spot() {
        let p = profile();
        let shin = rotate(p.reference.shin, p.limbs.shin.hinge, 12.0);
        let c = hold(&p, p.reference.thigh, shin);
        assert_eq!(c.verdict(), Some(&Verdict::Rezero));
        let fixed = c.rezeroed("new", "t").unwrap();
        assert_eq!(fixed.id, "new");
        assert_eq!(fixed.limbs.shin.hinge, p.limbs.shin.hinge, "axes kept");
        // The offset pose is now the zero: checking it again passes.
        let again = hold(&fixed, p.reference.thigh, shin);
        assert_eq!(again.verdict(), Some(&Verdict::Ok));
    }

    #[test]
    fn a_large_in_plane_offset_is_not_offered_a_rezero() {
        let p = profile();
        let shin = rotate(p.reference.shin, p.limbs.shin.hinge, 40.0);
        let c = hold(&p, p.reference.thigh, shin);
        assert_eq!(c.verdict(), Some(&Verdict::TooFar));
        assert!(c.rezeroed("x", "t").is_err());
    }

    #[test]
    fn a_turned_strap_asks_for_a_new_calibration() {
        let p = profile();
        // Rotate about an axis perpendicular to the hinge: the offset leaves the hinge plane.
        let across = cross(p.limbs.shin.hinge, p.reference.shin);
        let norm = dot(across, across).sqrt();
        let axis = Vec3 {
            x: across.x / norm,
            y: across.y / norm,
            z: across.z / norm,
        };
        let shin = rotate(p.reference.shin, axis, 25.0);
        let c = hold(&p, p.reference.thigh, shin);
        assert_eq!(c.verdict(), Some(&Verdict::Recalibrate));
    }

    #[test]
    fn moving_during_the_window_gives_no_verdict() {
        let p = profile();
        let mut c = WearingCheck::new(p.clone());
        c.begin(0.0);
        let mut t: f64 = 0.0;
        while c.sampling() {
            t += 40.0;
            let shin = rotate(
                p.reference.shin,
                p.limbs.shin.hinge,
                (t / 150.0).sin() * 30.0,
            );
            c.push(t, Some(p.reference.thigh), Some(shin));
        }
        assert_eq!(c.verdict(), Some(&Verdict::Inconclusive));
        c.retry();
        assert_eq!(c.page(), 0);
    }

    #[test]
    fn no_vectors_gives_no_verdict() {
        let p = profile();
        let mut c = WearingCheck::new(p);
        c.begin(0.0);
        let mut t = 0.0;
        while c.sampling() {
            t += 40.0;
            c.push(t, None, None);
        }
        assert_eq!(c.verdict(), Some(&Verdict::Inconclusive));
    }
}
