//! The calibration wizard: prepare (side, preset, reference kind and posture), reference capture,
//! one guided sweep per movement, review and apply.
//!
//! Which step comes next, what a skip or a re-capture discards, what gets solved and what may be
//! saved is decided by `irms_core::calibration_flow` (port of the Tauri flow). This module owns the
//! timing of a capture and the texts; the window only shows its properties.

use irms_core::angle_math::Vec3;
use irms_core::calibration::{
    capture_reference, estimate_limb_frame, CalibrationProfile, CalibrationQuality, Firmware,
    Frame, LimbError, MovementError, MovementId, Reference, ReferenceError, ReferencePosture, Side,
};
use irms_core::calibration_flow::{
    identity_of, is_mandatory, mobility_input, mobility_record_from_results, preset_movements,
    rezero_profile, solve_flow, FlowOutcome, FlowState, FlowStep, MissingPart, Preset,
    RezeroFailure, SolveFailure,
};
use irms_core::slip_monitor::angular_span_deg;
use irms_core::types::MobilityRecordInput;

pub const REFERENCE_CAPTURE_S: f64 = 2.2;
pub const SWEEP_CAPTURE_S: f64 = 6.0;
/// Below this the hip extension and abduction sweeps say nothing; the final evaluation is stricter.
const HIP_SPAN_MIN_DEG: f64 = 8.0;

pub const POSTURES: [ReferencePosture; 5] = [
    ReferencePosture::Standing,
    ReferencePosture::LongSitting,
    ReferencePosture::Supine,
    ReferencePosture::Seated,
    ReferencePosture::Other,
];

pub fn posture_label(p: ReferencePosture) -> &'static str {
    match p {
        ReferencePosture::Standing => "站立",
        ReferencePosture::LongSitting => "長坐(腿伸直)",
        ReferencePosture::Supine => "仰躺",
        ReferencePosture::Seated => "坐姿(膝彎90°)",
        ReferencePosture::Other => "其他姿勢",
    }
}

pub fn movement_label(id: MovementId) -> &'static str {
    match id {
        MovementId::KneeFlexion => "膝蓋彎曲",
        MovementId::HipFlexion => "髖屈曲(大腿向前抬)",
        MovementId::HipExtension => "髖伸展(大腿向後)",
        MovementId::HipAbduction => "髖外展(大腿向外)",
    }
}

fn movement_body(id: MovementId) -> &'static str {
    match id {
        MovementId::KneeFlexion => "大腿保持不動,小腿向後勾起,停一下,再慢慢放下。",
        MovementId::HipFlexion => {
            "軀幹保持直立,大腿向前抬高至少 20°(建議 40–60°),停一下,再慢慢放下。"
        }
        MovementId::HipExtension => "扶穩,軀幹保持直立,大腿向後伸,停一下,再慢慢放下。",
        MovementId::HipAbduction => "扶穩,軀幹保持直立,大腿向外側打開,停一下,再慢慢放下。",
    }
}

fn movement_error(e: MovementError) -> &'static str {
    match e {
        MovementError::InvalidInput => "資料不足或不可用",
        MovementError::NeedsThighFrame => "需要先完成髖屈曲,才能量測這個動作",
        MovementError::WrongDirection => "動作方向不對",
        MovementError::ReferenceMoved => "量測中另一段肢體移動過多,請保持不動",
        MovementError::NoHold => "沒有穩定停留,請在最高點停住約 2 秒",
        MovementError::PeakTooSmall => "動作幅度太小",
        MovementError::Implausible => "數值不合理,請重做",
    }
}

fn limb_error(limb: &str, e: LimbError) -> String {
    let what = match e {
        LimbError::SweepTooSmall => "動作幅度太小",
        LimbError::SweepNotPlanar => "動作不夠平順(偏離單一平面)",
        LimbError::ReferenceOffPlane => "起始姿勢與動作平面不一致,請重新捕捉零位",
        LimbError::WrongDirection => "動作方向不對",
        LimbError::InvalidInput => "沒有可用的資料",
    };
    format!("{limb}:{what}")
}

fn planarity(p: Option<f64>) -> String {
    p.map_or("未使用".into(), |p| format!("{p:.1}°"))
}

/// Summary of a solved profile for the review page.
pub fn describe(profile: &CalibrationProfile) -> String {
    let level = match profile.quality.level {
        CalibrationQuality::High => "高",
        CalibrationQuality::Medium => "中",
        CalibrationQuality::Low => "低",
    };
    let limb = |name: &str, f: &irms_core::calibration::LimbFrame| {
        format!(
            "{name}:動作幅度 {:.0}°,平面度 {},零位偏離平面 {:.1}°",
            f.span_deg,
            planarity(f.planarity_deg),
            f.off_plane_deg.abs()
        )
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

/// What the wizard hands to the app when the wearer applies it.
pub struct Applied {
    pub profile: CalibrationProfile,
    pub mobility: Option<MobilityRecordInput>,
}

enum Pending {
    Reference(Reference),
    Movement(MovementId, Vec<Frame>),
}

pub struct Wizard {
    pub flow: FlowState,
    capture: Option<(f64, f64)>,
    frames: Vec<Frame>,
    pub step_done: bool,
    pub status: String,
    /// 0 plain, 1 good, 2 problem.
    pub tone: i32,
    pub posture: ReferencePosture,
    pending: Option<Pending>,
    /// Calibration currently in force: the base of a quick re-zero.
    stored: Option<CalibrationProfile>,
    outcome: Option<FlowOutcome>,
    rezeroed: Option<CalibrationProfile>,
    pub save_mobility: bool,
    pub result: String,
    confirm_recapture: bool,
}

impl Wizard {
    pub fn new(stored: Option<CalibrationProfile>) -> Self {
        let side = stored.as_ref().map(|p| p.side);
        Self {
            flow: FlowState::new(Preset::Calibrate, side),
            capture: None,
            frames: Vec::new(),
            step_done: false,
            status: String::new(),
            tone: 0,
            posture: ReferencePosture::Standing,
            pending: None,
            stored,
            outcome: None,
            rezeroed: None,
            save_mobility: true,
            result: String::new(),
            confirm_recapture: false,
        }
    }

    pub fn has_stored(&self) -> bool {
        self.stored.is_some()
    }

    pub fn capturing(&self) -> bool {
        self.capture.is_some()
    }

    fn quick(&self) -> bool {
        self.flow.preset == Preset::QuickRezero
    }

    // ----- page state for the window -----

    /// 0 prepare, 1 reference, 2 movement, 3 review.
    pub fn page(&self) -> i32 {
        match self.flow.step {
            FlowStep::Prepare | FlowStep::Legacy => 0,
            FlowStep::Reference => 1,
            FlowStep::Movement(_) => 2,
            FlowStep::Review => 3,
        }
    }

    fn total_steps(&self) -> usize {
        1 + preset_movements(self.flow.preset).len()
    }

    pub fn step_label(&self) -> String {
        let n = match self.flow.step {
            FlowStep::Reference => 1,
            FlowStep::Movement(i) => i + 2,
            _ => return String::new(),
        };
        format!("步驟 {n} / {}", self.total_steps())
    }

    pub fn title(&self) -> String {
        match self.flow.step {
            FlowStep::Prepare | FlowStep::Legacy => "準備校準".into(),
            FlowStep::Reference => {
                if self.flow.neutral {
                    "捕捉起始姿勢(無法完全伸直)".into()
                } else {
                    "捕捉零位".into()
                }
            }
            FlowStep::Movement(_) => self
                .flow
                .current_movement()
                .map_or(String::new(), |m| movement_label(m).into()),
            FlowStep::Review => if self.quick() {
                "快速歸零"
            } else {
                "檢查結果"
            }
            .into(),
        }
    }

    pub fn body(&self) -> String {
        match self.flow.step {
            FlowStep::Prepare | FlowStep::Legacy => match self.flow.preset {
                Preset::Calibrate => "選擇穿戴的腿,依序捕捉零位、膝蓋與大腿動作。".into(),
                Preset::Mobility => {
                    "校準之後再量測四個動作的最大活動度,結果可記錄為長期趨勢。".into()
                }
                Preset::QuickRezero => "沿用目前的校準軸,只重新捕捉一次零位。".into(),
            },
            FlowStep::Reference => {
                let how = if self.quick() {
                    posture_label(
                        self.stored
                            .as_ref()
                            .map_or(self.posture, |p| p.reference.posture),
                    )
                } else {
                    posture_label(self.posture)
                };
                format!("以「{how}」姿勢保持不動,讓系統記下這個姿勢作為零位。")
            }
            FlowStep::Movement(_) => self
                .flow
                .current_movement()
                .map_or(String::new(), |m| movement_body(m).into()),
            FlowStep::Review => String::new(),
        }
    }

    pub fn progress(&self, now_ms: f64) -> f64 {
        match self.capture {
            Some((t0, len)) => ((now_ms - t0) / len).clamp(0.0, 1.0),
            None if self.step_done => 1.0,
            None => 0.0,
        }
    }

    pub fn capture_seconds(&self) -> f64 {
        if self.flow.step == FlowStep::Reference {
            REFERENCE_CAPTURE_S
        } else {
            SWEEP_CAPTURE_S
        }
    }

    pub fn side_index(&self) -> i32 {
        match self.flow.side {
            None => -1,
            Some(Side::Left) => 0,
            Some(Side::Right) => 1,
        }
    }

    pub fn preset_index(&self) -> i32 {
        match self.flow.preset {
            Preset::Calibrate => 0,
            Preset::Mobility => 1,
            Preset::QuickRezero => 2,
        }
    }

    pub fn posture_index(&self) -> i32 {
        POSTURES
            .iter()
            .position(|p| *p == self.posture)
            .unwrap_or(0) as i32
    }

    pub fn can_begin(&self) -> bool {
        self.flow.side.is_some() && (!self.quick() || self.stored.is_some())
    }

    pub fn can_skip(&self) -> bool {
        self.flow
            .current_movement()
            .is_some_and(|m| !is_mandatory(m))
            && !self.capturing()
    }

    /// The saved-record checkbox exists only when there is a mobility result to save.
    pub fn can_save_mobility(&self) -> bool {
        self.flow.preset == Preset::Mobility
            && self.outcome.as_ref().is_some_and(|o| !o.results.is_empty())
    }

    pub fn can_apply(&self) -> bool {
        self.flow.step == FlowStep::Review && (self.outcome.is_some() || self.rezeroed.is_some())
    }

    pub fn can_redo(&self) -> bool {
        self.outcome.as_ref().is_some_and(|o| !o.failed.is_empty())
            || (self.flow.step == FlowStep::Review && !self.can_apply() && !self.quick())
    }

    // ----- prepare page -----

    pub fn set_side(&mut self, index: i32) {
        self.flow
            .set_side(if index == 1 { Side::Right } else { Side::Left });
    }

    pub fn set_preset(&mut self, index: i32) {
        self.flow.set_preset(match index {
            1 => Preset::Mobility,
            2 => Preset::QuickRezero,
            _ => Preset::Calibrate,
        });
        // A quick re-zero keeps the stored profile's identity, including its side.
        if self.quick() {
            if let Some(p) = &self.stored {
                self.flow.set_side(p.side);
            }
        }
    }

    pub fn set_neutral(&mut self, neutral: bool) {
        self.flow.set_neutral(neutral);
    }

    pub fn set_posture(&mut self, index: i32) {
        if self.flow.step == FlowStep::Prepare {
            self.posture = POSTURES[(index.max(0) as usize).min(POSTURES.len() - 1)];
        }
    }

    pub fn begin(&mut self) {
        if !self.can_begin() {
            return;
        }
        self.flow.start(false);
        self.ready();
    }

    fn ready(&mut self) {
        self.pending = None;
        self.step_done = false;
        self.tone = 0;
        self.status = "準備好後按「開始擷取」".into();
    }

    // ----- capture -----

    pub fn start(&mut self, now_ms: f64) {
        if !matches!(self.flow.step, FlowStep::Reference | FlowStep::Movement(_))
            || self.capturing()
        {
            return;
        }
        self.capture = Some((now_ms, self.capture_seconds() * 1000.0));
        self.frames.clear();
        self.pending = None;
        self.step_done = false;
        self.tone = 0;
        self.confirm_recapture = false;
        self.status = if self.flow.step == FlowStep::Reference {
            "擷取中…請保持不動".into()
        } else {
            "擷取中…請完成動作後回到起始位".into()
        };
    }

    /// Feed one sample of both gravity vectors while the wizard is open. Returns true when a step just
    /// finished (successfully or not), so the caller can stop the scripted movement.
    pub fn push(&mut self, now_ms: f64, thigh: Option<Vec3>, shin: Option<Vec3>) -> bool {
        let Some((t0, len)) = self.capture else {
            return false;
        };
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
        self.finish_capture();
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

    fn finish_capture(&mut self) {
        match self.flow.step {
            FlowStep::Reference => {
                let (kind, posture) = match (&self.stored, self.quick()) {
                    (Some(p), true) => (p.reference.kind, p.reference.posture),
                    _ => (self.flow.reference_kind(), self.posture),
                };
                match capture_reference(&self.frames, kind, posture) {
                    Ok(reference) => {
                        self.pass(format!(
                            "零位已捕捉 · 晃動 {:.1}° · {} 筆",
                            reference.still_rms_deg, reference.frames
                        ));
                        self.pending = Some(Pending::Reference(reference));
                    }
                    Err(ReferenceError::Shaking) => self.fail("偵測到晃動"),
                    Err(ReferenceError::TooShort) => self.fail("資料太少"),
                    Err(ReferenceError::InvalidInput) => self.fail("沒有可用的資料"),
                }
            }
            FlowStep::Movement(_) => {
                let Some(id) = self.flow.current_movement() else {
                    return;
                };
                let reference = self.flow.reference.expect("reference comes first");
                let thigh: Vec<Vec3> = self.frames.iter().map(|f| f.thigh).collect();
                let shin: Vec<Vec3> = self.frames.iter().map(|f| f.shin).collect();
                // Early feedback only: the final judgement needs the solved profile (review page).
                let check = match id {
                    MovementId::KneeFlexion => estimate_limb_frame(reference.shin, &shin, None, -1)
                        .map(|f| (f.span_deg, f.planarity_deg))
                        .map_err(|e| limb_error("小腿", e)),
                    MovementId::HipFlexion => estimate_limb_frame(reference.thigh, &thigh, None, 1)
                        .map(|f| (f.span_deg, f.planarity_deg))
                        .map_err(|e| limb_error("大腿", e)),
                    _ => {
                        let span = angular_span_deg(&thigh);
                        if span >= HIP_SPAN_MIN_DEG {
                            Ok((span, None))
                        } else {
                            Err("大腿:動作幅度太小".to_string())
                        }
                    }
                };
                match check {
                    Ok((span, plan)) => {
                        let tail = plan.map_or(String::new(), |p| format!(" · 平面度 {p:.1}°"));
                        self.pass(format!(
                            "{}已擷取 · 幅度 {span:.0}°{tail}",
                            movement_label(id)
                        ));
                        self.pending =
                            Some(Pending::Movement(id, std::mem::take(&mut self.frames)));
                    }
                    Err(message) => self.fail(&message),
                }
            }
            _ => {}
        }
    }

    // ----- navigation -----

    /// Commits the captured step and moves on; entering the review page computes the result.
    pub fn next(&mut self) {
        if !self.step_done {
            return;
        }
        match self.pending.take() {
            Some(Pending::Reference(r)) => self.flow.reference_captured(r),
            Some(Pending::Movement(id, frames)) => self.flow.movement_captured(id, frames),
            None => return,
        }
        self.after_step();
    }

    pub fn skip(&mut self) {
        if let Some(id) = self.flow.current_movement() {
            if !self.capturing() {
                self.flow.skip(id);
                self.after_step();
            }
        }
    }

    fn after_step(&mut self) {
        if self.flow.step == FlowStep::Review {
            self.solve();
        } else {
            self.ready();
        }
    }

    /// Re-capturing the reference throws every movement away, so it asks twice when there is work.
    pub fn recapture(&mut self) {
        if self.flow.recapture_needs_confirm() && !self.confirm_recapture {
            self.confirm_recapture = true;
            self.tone = 2;
            self.status = "重新捕捉零位會捨棄已完成的動作。再按一次確認".into();
            return;
        }
        self.confirm_recapture = false;
        self.flow.recapture_reference();
        self.outcome = None;
        self.rezeroed = None;
        self.result.clear();
        self.ready();
    }

    /// Back to the first movement that failed or is missing.
    pub fn redo(&mut self) {
        let list = preset_movements(self.flow.preset);
        let failed = self
            .outcome
            .as_ref()
            .and_then(|o| o.failed.first().map(|f| f.0));
        let target = failed
            .or_else(|| list.first().copied())
            .and_then(|m| list.iter().position(|x| *x == m));
        if let Some(i) = target {
            self.flow.back_to_movement(i);
            self.outcome = None;
            self.result.clear();
            self.ready();
        }
    }

    fn solve(&mut self) {
        self.outcome = None;
        self.rezeroed = None;
        self.tone = 0;
        self.status.clear();
        let created_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let id = format!("cal-{}", chrono::Utc::now().timestamp_millis());
        if self.quick() {
            let (Some(stored), Some(reference)) = (&self.stored, self.flow.reference) else {
                self.result = "沒有可沿用的校準,請先完成一次完整校準".into();
                self.tone = 2;
                return;
            };
            match rezero_profile(stored, reference, &id, &created_at) {
                Ok(p) => {
                    self.result = format!("沿用原本的軸,只更新零位。\n{}", describe(&p));
                    self.tone = 1;
                    self.rezeroed = Some(p);
                }
                Err(e) => {
                    let (limb, why) = match e {
                        RezeroFailure::OffPlane(l) => (l, "起始姿勢偏離動作平面,請重新校準"),
                        RezeroFailure::InvalidInput(l) => (l, "沒有可用的資料"),
                    };
                    let name = if limb == irms_core::calibration::Limb::Thigh {
                        "大腿"
                    } else {
                        "小腿"
                    };
                    self.result = format!("{name}:{why}");
                    self.tone = 2;
                }
            }
            return;
        }
        match solve_flow(
            &self.flow,
            &id,
            &created_at,
            Firmware {
                version: None,
                raw_stream: false,
            },
        ) {
            Ok(outcome) => {
                let mut lines = vec![describe(&outcome.profile)];
                let mut order: Vec<_> = outcome.results.iter().collect();
                order.sort_by_key(|r| {
                    preset_movements(Preset::Mobility)
                        .iter()
                        .position(|m| *m == r.movement)
                });
                for r in order {
                    lines.push(format!("{}:{:.0}°", movement_label(r.movement), r.peak_deg));
                }
                for (m, e) in &outcome.failed {
                    lines.push(format!("{}:{}", movement_label(*m), movement_error(*e)));
                }
                if self.flow.preset == Preset::Mobility {
                    let total: f64 = outcome.results.iter().map(|r| r.peak_deg).sum();
                    if !outcome.results.is_empty() {
                        lines.push(format!("合計 {total:.0}°"));
                    }
                    let measured = outcome.results.len();
                    if measured < preset_movements(Preset::Mobility).len() {
                        lines.push("動作未全部完成,這次的合計不可與完整紀錄相比".into());
                    }
                }
                self.result = lines.join("\n");
                self.tone = if outcome.failed.is_empty() { 1 } else { 2 };
                self.outcome = Some(outcome);
            }
            Err(SolveFailure::Solve(e)) => {
                let limb = if e.limb == irms_core::calibration::Limb::Thigh {
                    "大腿"
                } else {
                    "小腿"
                };
                self.result = format!("無法算出校準:{}", limb_error(limb, e.error));
                self.tone = 2;
            }
            Err(SolveFailure::Missing(m)) => {
                self.result = match m {
                    MissingPart::Reference => "缺少零位",
                    MissingPart::Side => "尚未選擇腿",
                    MissingPart::KneeFlexion => "缺少膝蓋彎曲動作",
                }
                .into();
                self.tone = 2;
            }
        }
    }

    pub fn toggle_save_mobility(&mut self) {
        self.save_mobility = !self.save_mobility;
    }

    /// The profile to apply, with the mobility record when the wearer asked for it. `None` while the
    /// review has nothing valid to apply.
    pub fn apply(&self, measured_at: &str) -> Option<Applied> {
        if self.flow.step != FlowStep::Review {
            return None;
        }
        if let Some(p) = &self.rezeroed {
            return Some(Applied {
                profile: p.clone(),
                mobility: None,
            });
        }
        let outcome = self.outcome.as_ref()?;
        let mobility = (self.flow.preset == Preset::Mobility && self.save_mobility)
            .then(|| {
                mobility_record_from_results(
                    &outcome.results,
                    measured_at,
                    identity_of(&outcome.profile),
                )
            })
            .flatten()
            .map(|rec| mobility_input(&rec, &outcome.profile, &outcome.results));
        Some(Applied {
            profile: outcome.profile.clone(),
            mobility,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pipeline::{drive, run_preset, Rig};
    use crate::store::Store;
    use irms_core::judge::{AngleLimits, TriggerConfig, TriggerType};

    fn cfg() -> TriggerConfig {
        TriggerConfig {
            target_angle: 60.0,
            tolerance: 5.0,
            hold_time_ms: 3000.0,
            trigger_type: TriggerType::JointAngle,
            limits: AngleLimits::default(),
        }
    }

    #[test]
    fn the_calibrate_preset_solves_and_records_no_mobility() {
        let w = run_preset(&Rig::new(), &cfg(), Preset::Calibrate).unwrap();
        assert_eq!(w.page(), 3);
        assert!(w.can_apply() && !w.can_save_mobility());
        let applied = w.apply("2026-11-17T00:00:00.000Z").unwrap();
        assert!(applied.mobility.is_none());
        assert!(applied.profile.limbs.thigh.is_some());
    }

    #[test]
    fn the_mobility_preset_measures_every_movement_and_sums_the_peaks() {
        let w = run_preset(&Rig::new(), &cfg(), Preset::Mobility).unwrap();
        assert_eq!(w.page(), 3, "{}", w.result);
        assert!(w.can_save_mobility());
        let applied = w.apply("2026-11-17T00:00:00.000Z").unwrap();
        let m = applied.mobility.expect("saved by default");
        assert_eq!(
            m.movement_set,
            "hipAbduction+hipExtension+hipFlexion+kneeFlexion"
        );
        assert_eq!(m.schema, Some(2));
        assert_eq!(m.side.as_deref(), Some("left"));
        assert_eq!(m.reference_kind.as_deref(), Some("straight"));
        assert_eq!(
            m.calibration_id.as_deref(),
            Some(applied.profile.id.as_str())
        );
        let detail: serde_json::Value = serde_json::from_str(&m.detail).unwrap();
        let peaks = detail["peaks"].as_object().unwrap();
        let sum: f64 = peaks.values().map(|v| v.as_f64().unwrap()).sum();
        assert!((sum - m.total_deg).abs() < 1e-9);
        // The scripted wearer raises 60, extends 20, abducts 30 and curls 80 degrees.
        for (name, expected) in [
            ("hipFlexion", 60.0),
            ("hipExtension", 20.0),
            ("hipAbduction", 30.0),
            ("kneeFlexion", 80.0),
        ] {
            let got = peaks[name].as_f64().unwrap();
            assert!((got - expected).abs() < 6.0, "{name}: {got} vs {expected}");
        }
    }

    #[test]
    fn declining_the_record_saves_the_calibration_only() {
        let mut w = run_preset(&Rig::new(), &cfg(), Preset::Mobility).unwrap();
        w.toggle_save_mobility();
        let applied = w.apply("t").unwrap();
        assert!(applied.mobility.is_none());
    }

    #[test]
    fn a_skipped_movement_leaves_a_smaller_set_and_the_knee_cannot_be_skipped() {
        let rig = Rig::new();
        // Walk reference, knee and hip flexion explicitly so the skip lands on hip extension.
        let mut w = Wizard::new(None);
        w.flow.set_side(Side::Right);
        w.flow.set_preset(Preset::Mobility);
        w.begin();
        let mut now = 0.0;
        // reference + knee + hip flexion
        for _ in 0..3 {
            let script = crate::pipeline::script_for(&w, 0.0);
            let t0 = now;
            w.start(now);
            while w.capturing() {
                now += 40.0;
                let (hip, knee) = crate::pipeline::pose(script, (now - t0) / 1000.0, &cfg());
                let (t, s) = rig.gravity_abd(
                    hip,
                    knee,
                    crate::pipeline::abduction(script, (now - t0) / 1000.0),
                );
                w.push(now, Some(t), Some(s));
            }
            assert!(w.step_done, "{}", w.status);
            w.next();
        }
        assert_eq!(w.flow.current_movement(), Some(MovementId::HipExtension));
        assert!(w.can_skip());
        w.skip();
        assert_eq!(w.flow.current_movement(), Some(MovementId::HipAbduction));
        w.skip();
        assert_eq!(w.page(), 3);
        let applied = w.apply("t").unwrap();
        assert_eq!(
            applied.mobility.unwrap().movement_set,
            "hipFlexion+kneeFlexion"
        );
        assert_eq!(applied.profile.side, Side::Right);
        // The knee sweep is mandatory.
        let mut k = Wizard::new(None);
        k.flow.set_side(Side::Left);
        k.begin();
        let t0 = 0.0;
        k.start(t0);
        let still = Rig::new().gravity_abd(0.0, 0.0, 0.0);
        let mut n: f64 = 0.0;
        while k.capturing() {
            n += 40.0;
            k.push(n, Some(still.0), Some(still.1));
        }
        k.next();
        assert_eq!(k.flow.current_movement(), Some(MovementId::KneeFlexion));
        assert!(!k.can_skip());
    }

    #[test]
    fn a_new_reference_needs_two_presses_once_work_exists() {
        let mut w = run_preset(&Rig::new(), &cfg(), Preset::Calibrate).unwrap();
        w.recapture();
        assert_eq!(w.page(), 3, "first press only warns");
        assert_eq!(w.tone, 2);
        w.recapture();
        assert_eq!(w.page(), 1);
        assert!(!w.can_apply());
    }

    #[test]
    fn quick_rezero_keeps_the_axes_and_replaces_the_zero() {
        let rig = Rig::new();
        let base = run_preset(&rig, &cfg(), Preset::Calibrate)
            .unwrap()
            .apply("t")
            .unwrap()
            .profile;
        let mut w = Wizard::new(Some(base.clone()));
        assert_eq!(w.flow.side, Some(base.side));
        w.set_preset(2);
        assert!(w.can_begin());
        w.begin();
        drive(&mut w, &rig, &cfg(), 0.0).unwrap();
        assert_eq!(w.page(), 3);
        let p = w.apply("t").unwrap().profile;
        assert_ne!(p.id, base.id);
        assert_eq!(p.limbs.shin.hinge, base.limbs.shin.hinge);
        assert_eq!(p.reference.kind, base.reference.kind);
        // Without a stored calibration there is nothing to re-zero.
        let mut none = Wizard::new(None);
        none.set_preset(2);
        none.flow.set_side(Side::Left);
        assert!(!none.can_begin());
    }

    #[test]
    fn a_shaking_reference_is_refused_and_can_be_retried() {
        let mut w = Wizard::new(None);
        w.flow.set_side(Side::Left);
        w.begin();
        w.start(0.0);
        let mut n: f64 = 0.0;
        while w.capturing() {
            n += 40.0;
            let swing = (n / 100.0).sin() * 0.6;
            let v = Vec3 {
                x: swing,
                y: 1.0,
                z: 0.2,
            };
            w.push(n, Some(v), Some(v));
        }
        assert!(!w.step_done);
        assert_eq!(w.tone, 2);
        assert_eq!(w.page(), 1, "stays on the reference step");
    }

    #[test]
    fn the_applied_calibration_and_the_mobility_record_survive_a_restart() {
        let dir = std::env::temp_dir().join(format!("irms-wizard-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("irms.sqlite");
        let w = run_preset(&Rig::new(), &cfg(), Preset::Mobility).unwrap();
        let applied = w.apply("2026-11-17T00:00:00.000Z").unwrap();
        {
            let mut store = Store::open(Some(path.display().to_string())).unwrap();
            assert!(store.active_profile().is_none());
            assert!(store
                .apply_calibration(&applied.profile, applied.mobility.as_ref())
                .unwrap());
            assert_eq!(store.mobility_rows().unwrap().len(), 1);
        }
        let store = Store::open(Some(path.display().to_string())).unwrap();
        let restored = store.active_profile().expect("restored");
        // JSON keeps floats to the last digit only approximately; the calibration is the same.
        assert_eq!(restored.id, applied.profile.id);
        assert_eq!(restored.side, applied.profile.side);
        let close =
            |a: Vec3, b: Vec3| (a.x - b.x).abs() + (a.y - b.y).abs() + (a.z - b.z).abs() < 1e-12;
        assert!(close(
            restored.limbs.shin.hinge,
            applied.profile.limbs.shin.hinge
        ));
        assert!(close(
            restored.limbs.shin.zero,
            applied.profile.limbs.shin.zero
        ));
        let rows = store.mobility_rows().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].schema, Some(2));
        drop(store);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_newer_calibration_replaces_the_active_one() {
        let rig = Rig::new();
        let a = run_preset(&rig, &cfg(), Preset::Calibrate)
            .unwrap()
            .apply("t")
            .unwrap()
            .profile;
        std::thread::sleep(std::time::Duration::from_millis(5));
        let b = run_preset(&rig, &cfg(), Preset::Calibrate)
            .unwrap()
            .apply("t")
            .unwrap()
            .profile;
        let mut store = Store::open(Some(":memory:".into())).unwrap();
        store.apply_calibration(&a, None).unwrap();
        store.apply_calibration(&b, None).unwrap();
        assert_eq!(store.active_profile().unwrap().id, b.id);
    }
}
