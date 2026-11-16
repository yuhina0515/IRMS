//! State machine and solve glue for the unified calibration flow, plus the mobility record and trend
//! rules (plan 2026-11-10 section 3.3).
//!
//! Port of `IRMS_App_Tauri/src/services/calibrationFlow.ts` and the record/trend half of
//! `mobilityC.ts`. The UI owns timers and streams; everything that decides which step comes next,
//! what a skip or a re-capture discards, what gets solved and what may be saved lives here so it is
//! tested without a toolkit. Nothing in this module writes settings or the database.

use std::collections::BTreeMap;

use serde::Serialize;

use crate::angle_math::Vec3;
use crate::calibration::{
    check_reference, evaluate_movement, rezero_limb, solve_profile, CalibrationProfile, Firmware,
    Frame, MovementError, MovementId, MovementResult, Reference, ReferenceCheck, ReferenceKind,
    ReferencePosture, RezeroError, Side, SolveError, SolveInput, Sweep,
};
use crate::types::{MobilityRecordInput, MobilityRecordRow};

/// Method identity schema stamped on every record the unified flow saves (migration 10).
pub const MOBILITY_UNIFIED_SCHEMA: i64 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Preset {
    Calibrate,
    Mobility,
    QuickRezero,
}

/// Order matters: knee flexion first (mandatory), then the thigh sweep, then the optional mobility
/// movements.
pub fn preset_movements(preset: Preset) -> &'static [MovementId] {
    match preset {
        Preset::Calibrate => &[MovementId::KneeFlexion, MovementId::HipFlexion],
        Preset::Mobility => &[
            MovementId::KneeFlexion,
            MovementId::HipFlexion,
            MovementId::HipExtension,
            MovementId::HipAbduction,
        ],
        Preset::QuickRezero => &[],
    }
}

/// Only the knee sweep is required: it defines the shin frame. Everything else may be skipped.
pub fn is_mandatory(id: MovementId) -> bool {
    id == MovementId::KneeFlexion
}

/// Vector-protocol firmware over a link that delivers roll. Anything else takes the legacy branch.
pub fn needs_legacy_branch(firmware_protocol_is_euler: bool, link_truncated: bool) -> bool {
    firmware_protocol_is_euler || link_truncated
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowStep {
    Prepare,
    Reference,
    Movement(usize),
    Review,
    Legacy,
}

#[derive(Debug, Clone)]
pub struct FlowState {
    pub step: FlowStep,
    pub preset: Preset,
    pub side: Option<Side>,
    /// "Cannot fully straighten": the reference is recorded as `neutral`, which withholds the
    /// upright-only features.
    pub neutral: bool,
    pub reference: Option<Reference>,
    pub captured: BTreeMap<u8, Vec<Frame>>,
    pub skipped: Vec<MovementId>,
}

fn key(id: MovementId) -> u8 {
    match id {
        MovementId::KneeFlexion => 0,
        MovementId::HipFlexion => 1,
        MovementId::HipExtension => 2,
        MovementId::HipAbduction => 3,
    }
}

impl FlowState {
    pub fn new(preset: Preset, side: Option<Side>) -> Self {
        Self {
            step: FlowStep::Prepare,
            preset,
            side,
            neutral: false,
            reference: None,
            captured: BTreeMap::new(),
            skipped: Vec::new(),
        }
    }

    pub fn captured_frames(&self, id: MovementId) -> Option<&Vec<Frame>> {
        self.captured.get(&key(id))
    }

    pub fn is_captured(&self, id: MovementId) -> bool {
        self.captured.contains_key(&key(id))
    }

    /// The movement the flow is currently asking for, if it is on a movement step.
    pub fn current_movement(&self) -> Option<MovementId> {
        match self.step {
            FlowStep::Movement(i) => preset_movements(self.preset).get(i).copied(),
            _ => None,
        }
    }

    // The side, preset and neutral choice are part of the profile identity, so they only change
    // while the flow is still on the prepare page.
    pub fn set_side(&mut self, side: Side) {
        if self.step == FlowStep::Prepare {
            self.side = Some(side);
        }
    }

    pub fn set_preset(&mut self, preset: Preset) {
        if self.step == FlowStep::Prepare {
            self.preset = preset;
        }
    }

    pub fn set_neutral(&mut self, neutral: bool) {
        if self.step == FlowStep::Prepare {
            self.neutral = neutral;
        }
    }

    pub fn start(&mut self, legacy: bool) {
        if self.step != FlowStep::Prepare || self.side.is_none() {
            return;
        }
        self.step = if legacy { FlowStep::Legacy } else { FlowStep::Reference };
    }

    pub fn reference_captured(&mut self, reference: Reference) {
        if self.step != FlowStep::Reference {
            return;
        }
        let first = !preset_movements(self.preset).is_empty();
        self.reference = Some(reference);
        self.step = if first { FlowStep::Movement(0) } else { FlowStep::Review };
    }

    fn after_movement(&self, index: usize) -> FlowStep {
        if index + 1 < preset_movements(self.preset).len() {
            FlowStep::Movement(index + 1)
        } else {
            FlowStep::Review
        }
    }

    /// Rejected unless the flow is on that movement's step.
    pub fn movement_captured(&mut self, id: MovementId, frames: Vec<Frame>) {
        if self.current_movement() != Some(id) {
            return;
        }
        let FlowStep::Movement(i) = self.step else { return };
        self.captured.insert(key(id), frames);
        self.skipped.retain(|s| *s != id);
        self.step = self.after_movement(i);
    }

    /// The mandatory knee sweep cannot be skipped.
    pub fn skip(&mut self, id: MovementId) {
        if self.current_movement() != Some(id) || is_mandatory(id) {
            return;
        }
        let FlowStep::Movement(i) = self.step else { return };
        self.captured.remove(&key(id));
        self.skipped.retain(|s| *s != id);
        self.skipped.push(id);
        self.step = self.after_movement(i);
    }

    /// Every movement was measured against the old reference, so none of them may survive a new one.
    pub fn recapture_reference(&mut self) {
        if !matches!(self.step, FlowStep::Movement(_) | FlowStep::Review) {
            return;
        }
        self.reference = None;
        self.captured.clear();
        self.skipped.clear();
        self.step = FlowStep::Reference;
    }

    pub fn back_to_movement(&mut self, index: usize) {
        if self.step == FlowStep::Review && index < preset_movements(self.preset).len() {
            self.step = FlowStep::Movement(index);
        }
    }

    /// Whether re-capturing the reference would throw away work, so the UI must ask first.
    pub fn recapture_needs_confirm(&self) -> bool {
        !self.captured.is_empty() || !self.skipped.is_empty()
    }

    pub fn reference_kind(&self) -> ReferenceKind {
        if self.neutral {
            ReferenceKind::Neutral
        } else {
            ReferenceKind::Straight
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MissingPart {
    Reference,
    Side,
    KneeFlexion,
}

#[derive(Debug, Clone, PartialEq)]
pub enum SolveFailure {
    Solve(SolveError),
    Missing(MissingPart),
}

#[derive(Debug, Clone)]
pub struct FlowOutcome {
    pub profile: CalibrationProfile,
    /// Movements that evaluated cleanly (peak held). Used for the optional mobility record.
    pub results: Vec<MovementResult>,
    /// Movements that were captured but rejected, so the review can offer a redo.
    pub failed: Vec<(MovementId, MovementError)>,
}

fn gyro_of(frames: &[Frame], thigh: bool) -> Option<Vec<Vec3>> {
    let g: Vec<Option<Vec3>> = frames.iter().map(|f| if thigh { f.thigh_gyro } else { f.shin_gyro }).collect();
    (!g.is_empty() && g.iter().all(Option::is_some)).then(|| g.into_iter().flatten().collect())
}

/// Solves the profile from the captured sweeps and evaluates every captured movement against it. The
/// knee sweep defines the shin frame and the hip-flexion sweep (when not skipped) the thigh frame.
pub fn solve_flow(
    state: &FlowState,
    id: &str,
    created_at: &str,
    firmware: Firmware,
) -> Result<FlowOutcome, SolveFailure> {
    let reference = state.reference.ok_or(SolveFailure::Missing(MissingPart::Reference))?;
    let side = state.side.ok_or(SolveFailure::Missing(MissingPart::Side))?;
    let knee = state
        .captured_frames(MovementId::KneeFlexion)
        .ok_or(SolveFailure::Missing(MissingPart::KneeFlexion))?;
    let hip = state.captured_frames(MovementId::HipFlexion);
    let profile = solve_profile(&SolveInput {
        id: id.to_string(),
        created_at: created_at.to_string(),
        side,
        firmware,
        reference,
        shin_sweep: Sweep { samples: knee.iter().map(|f| f.shin).collect(), gyro: gyro_of(knee, false) },
        thigh_sweep: hip.map(|h| Sweep { samples: h.iter().map(|f| f.thigh).collect(), gyro: gyro_of(h, true) }),
    })
    .map_err(SolveFailure::Solve)?;
    let mut results = Vec::new();
    let mut failed = Vec::new();
    for (k, frames) in &state.captured {
        let movement = [
            MovementId::KneeFlexion,
            MovementId::HipFlexion,
            MovementId::HipExtension,
            MovementId::HipAbduction,
        ][*k as usize];
        match evaluate_movement(&profile, movement, frames) {
            Ok(r) => results.push(r),
            Err(e) => failed.push((movement, e)),
        }
    }
    Ok(FlowOutcome { profile, results, failed })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RezeroFailure {
    OffPlane(crate::calibration::Limb),
    InvalidInput(crate::calibration::Limb),
}

/// Quick re-zero: keep the stored hinge axes, replace the reference with a fresh still pose (same kind
/// and posture as the stored profile) and re-orthogonalise each limb's zero. A pose off the hinge
/// plane is refused, never forced.
pub fn rezero_profile(
    profile: &CalibrationProfile,
    reference: Reference,
    id: &str,
    created_at: &str,
) -> Result<CalibrationProfile, RezeroFailure> {
    use crate::calibration::Limb;
    let map = |limb: Limb, e: RezeroError| match e {
        RezeroError::ReferenceOffPlane => RezeroFailure::OffPlane(limb),
        RezeroError::InvalidInput => RezeroFailure::InvalidInput(limb),
    };
    let shin = rezero_limb(&profile.limbs.shin, reference.shin).map_err(|e| map(Limb::Shin, e))?;
    let thigh = match &profile.limbs.thigh {
        Some(t) => Some(rezero_limb(t, reference.thigh).map_err(|e| map(Limb::Thigh, e))?),
        None => None,
    };
    let mut out = profile.clone();
    out.id = id.to_string();
    out.created_at = created_at.to_string();
    out.reference = Reference { kind: profile.reference.kind, posture: profile.reference.posture, ..reference };
    out.limbs = crate::calibration::Limbs { thigh, shin };
    Ok(out)
}

/// Pre-session wearing check; `None` when there is no profile or no live vectors.
pub fn wearing_verdict(profile: Option<&CalibrationProfile>, current: Option<(Vec3, Vec3)>) -> Option<ReferenceCheck> {
    let (profile, (thigh, shin)) = (profile?, current?);
    Some(check_reference(profile, thigh, shin))
}

/// Whether a window of live vectors is still enough to use as a reference.
pub fn is_still_window(frames: &[(Vec3, Vec3)], max_spread_deg: f64) -> bool {
    use crate::angle_math::vector_angle_deg;
    if frames.len() < 2 {
        return false;
    }
    let first = frames[0];
    frames
        .iter()
        .all(|f| vector_angle_deg(f.0, first.0) <= max_spread_deg && vector_angle_deg(f.1, first.1) <= max_spread_deg)
}

// ---------- mobility record and trend ----------

/// Method identity of a record (migration 10). A record without it (schema `None`) was measured with
/// the pre-unified method; its totals are not comparable with unified ones or across references.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct MobilityIdentity {
    pub schema: Option<i64>,
    pub side: Option<String>,
    pub reference_kind: Option<String>,
    pub posture: Option<String>,
    pub calibration_id: Option<String>,
}

/// The persisted spellings of the identity enums, as the database CHECK constraints expect them.
pub fn side_name(side: Side) -> &'static str {
    match side {
        Side::Left => "left",
        Side::Right => "right",
    }
}

pub fn kind_name(kind: ReferenceKind) -> &'static str {
    match kind {
        ReferenceKind::Straight => "straight",
        ReferenceKind::Neutral => "neutral",
    }
}

pub fn posture_name(posture: ReferencePosture) -> &'static str {
    match posture {
        ReferencePosture::Standing => "standing",
        ReferencePosture::LongSitting => "longSitting",
        ReferencePosture::Supine => "supine",
        ReferencePosture::Seated => "seated",
        ReferencePosture::Other => "other",
    }
}

pub fn movement_name(id: MovementId) -> &'static str {
    match id {
        MovementId::KneeFlexion => "kneeFlexion",
        MovementId::HipFlexion => "hipFlexion",
        MovementId::HipExtension => "hipExtension",
        MovementId::HipAbduction => "hipAbduction",
    }
}

pub fn movement_from_name(name: &str) -> Option<MovementId> {
    [MovementId::KneeFlexion, MovementId::HipFlexion, MovementId::HipExtension, MovementId::HipAbduction]
        .into_iter()
        .find(|m| movement_name(*m) == name)
}

#[derive(Debug, Clone, PartialEq)]
pub struct MobilityRecord {
    pub measured_at: String,
    /// Sorted movement names; trends compare only records with the same set.
    pub movement_set: Vec<String>,
    pub peaks: BTreeMap<String, f64>,
    pub total_deg: f64,
    pub identity: MobilityIdentity,
}

/// Two records are comparable only when this key matches. `calibration_id` is deliberately NOT part of
/// it: re-capturing the same kind of reference keeps the trend; changing kind, posture, side or schema
/// starts a new series.
pub fn method_key(id: &MobilityIdentity) -> String {
    match id.schema {
        None => match &id.side {
            Some(side) => format!("legacy|{side}"),
            None => "legacy".into(),
        },
        Some(schema) => format!(
            "{schema}|{}|{}|{}",
            id.side.as_deref().unwrap_or("-"),
            id.reference_kind.as_deref().unwrap_or("-"),
            id.posture.as_deref().unwrap_or("-")
        ),
    }
}

pub fn movement_set_key(set: &[String]) -> String {
    let mut s = set.to_vec();
    s.sort();
    s.join("+")
}

/// Record from unified-core results. Refuses an empty or duplicated set so a partial sum is never
/// saved as a total.
pub fn mobility_record_from_results(
    results: &[MovementResult],
    measured_at: &str,
    identity: MobilityIdentity,
) -> Option<MobilityRecord> {
    if results.is_empty() {
        return None;
    }
    let mut peaks = BTreeMap::new();
    for r in results {
        peaks.insert(movement_name(r.movement).to_string(), r.peak_deg);
    }
    if peaks.len() != results.len() {
        return None;
    }
    Some(MobilityRecord {
        measured_at: measured_at.to_string(),
        movement_set: peaks.keys().cloned().collect(),
        total_deg: peaks.values().sum(),
        peaks,
        identity,
    })
}

/// Database input for a unified record. `detail` is informational; the total and set key are
/// authoritative.
pub fn mobility_input(
    record: &MobilityRecord,
    profile: &CalibrationProfile,
    results: &[MovementResult],
) -> MobilityRecordInput {
    let detail = serde_json::json!({
        "peaks": record.peaks,
        "side": side_name(profile.side),
        "neutral": profile.reference.kind == ReferenceKind::Neutral,
        "movements": results,
    });
    MobilityRecordInput {
        movement_set: record.movement_set.join("+"),
        total_deg: record.total_deg,
        detail: detail.to_string(),
        schema: record.identity.schema,
        side: record.identity.side.clone(),
        reference_kind: record.identity.reference_kind.clone(),
        posture: record.identity.posture.clone(),
        calibration_id: record.identity.calibration_id.clone(),
    }
}

/// Identity of a record saved from this profile.
pub fn identity_of(profile: &CalibrationProfile) -> MobilityIdentity {
    MobilityIdentity {
        schema: Some(MOBILITY_UNIFIED_SCHEMA),
        side: Some(side_name(profile.side).into()),
        reference_kind: Some(kind_name(profile.reference.kind).into()),
        posture: Some(posture_name(profile.reference.posture).into()),
        calibration_id: Some(profile.id.clone()),
    }
}

/// A database row as a record. Pre-migration wizard rows only carry the side inside `detail`.
pub fn record_from_row(row: &MobilityRecordRow) -> MobilityRecord {
    let known: Vec<String> = row
        .movement_set
        .split('+')
        .filter(|n| movement_from_name(n).is_some())
        .map(str::to_string)
        .collect();
    let mut peaks = BTreeMap::new();
    let mut detail_side = None;
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&row.detail) {
        if let Some(p) = v.get("peaks").and_then(|p| p.as_object()) {
            for (k, val) in p {
                if let Some(f) = val.as_f64() {
                    peaks.insert(k.clone(), f);
                }
            }
        }
        if let Some(s) = v.get("side").and_then(|s| s.as_str()) {
            if s == "left" || s == "right" {
                detail_side = Some(s.to_string());
            }
        }
    }
    MobilityRecord {
        measured_at: row.measured_at.clone(),
        movement_set: known,
        peaks,
        total_deg: row.total_deg,
        identity: MobilityIdentity {
            schema: row.schema,
            side: row.side.clone().or(detail_side),
            reference_kind: row.reference_kind.clone(),
            posture: row.posture.clone(),
            calibration_id: row.calibration_id.clone(),
        },
    }
}

/// Records comparable with `current` (same movement set AND same method identity), oldest first.
pub fn comparable_trend<'a>(records: &'a [MobilityRecord], current: &MobilityRecord) -> Vec<&'a MobilityRecord> {
    let set = movement_set_key(&current.movement_set);
    let method = method_key(&current.identity);
    let mut out: Vec<&MobilityRecord> = records
        .iter()
        .filter(|r| movement_set_key(&r.movement_set) == set && method_key(&r.identity) == method)
        .collect();
    out.sort_by(|a, b| a.measured_at.cmp(&b.measured_at));
    out
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub enum TrendEntry {
    Record(usize),
    MethodBreak,
}

/// Same-set, same-leg records, oldest first, with a `MethodBreak` wherever the method identity changes
/// between neighbours, so a jump caused by a new reference is never read as progress. `Record(i)`
/// indexes `records`.
pub fn trend_with_breaks(records: &[MobilityRecord], current: &MobilityRecord) -> Vec<TrendEntry> {
    let set = movement_set_key(&current.movement_set);
    // Legs are never listed together; only method changes within one leg get a separator.
    let mut idx: Vec<usize> = (0..records.len())
        .filter(|i| movement_set_key(&records[*i].movement_set) == set && records[*i].identity.side == current.identity.side)
        .collect();
    idx.sort_by(|a, b| records[*a].measured_at.cmp(&records[*b].measured_at));
    let mut out = Vec::new();
    for (n, i) in idx.iter().enumerate() {
        if n > 0 && method_key(&records[*i].identity) != method_key(&records[idx[n - 1]].identity) {
            out.push(TrendEntry::MethodBreak);
        }
        out.push(TrendEntry::Record(*i));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(at: &str, set: &[&str], total: f64, side: Option<&str>, schema: Option<i64>, kind: Option<&str>) -> MobilityRecord {
        MobilityRecord {
            measured_at: at.into(),
            movement_set: set.iter().map(|s| s.to_string()).collect(),
            peaks: BTreeMap::new(),
            total_deg: total,
            identity: MobilityIdentity {
                schema,
                side: side.map(Into::into),
                reference_kind: kind.map(Into::into),
                posture: schema.map(|_| "standing".to_string()),
                calibration_id: None,
            },
        }
    }

    fn reference() -> Reference {
        Reference {
            kind: ReferenceKind::Straight,
            posture: ReferencePosture::Standing,
            thigh: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            shin: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            still_rms_deg: 0.1,
            duration_ms: 2000.0,
            frames: 40,
        }
    }

    fn frame() -> Frame {
        Frame {
            t_ms: 0.0,
            thigh: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            shin: Vec3 { x: 0.0, y: 0.0, z: 1.0 },
            thigh_gyro: None,
            shin_gyro: None,
            thigh_raw_g: None,
            shin_raw_g: None,
        }
    }

    #[test]
    fn presets_list_knee_first_and_quick_rezero_has_no_movements() {
        assert_eq!(preset_movements(Preset::Calibrate), &[MovementId::KneeFlexion, MovementId::HipFlexion]);
        assert_eq!(preset_movements(Preset::Mobility).len(), 4);
        assert!(preset_movements(Preset::QuickRezero).is_empty());
        assert!(is_mandatory(MovementId::KneeFlexion) && !is_mandatory(MovementId::HipFlexion));
    }

    #[test]
    fn start_needs_a_side_and_identity_choices_lock_after_prepare() {
        let mut s = FlowState::new(Preset::Calibrate, None);
        s.start(false);
        assert_eq!(s.step, FlowStep::Prepare);
        s.set_side(Side::Left);
        s.set_neutral(true);
        s.start(false);
        assert_eq!(s.step, FlowStep::Reference);
        s.set_side(Side::Right);
        s.set_preset(Preset::Mobility);
        s.set_neutral(false);
        assert_eq!(s.side, Some(Side::Left));
        assert_eq!(s.preset, Preset::Calibrate);
        assert!(s.neutral);
    }

    #[test]
    fn legacy_start_goes_to_the_legacy_branch() {
        let mut s = FlowState::new(Preset::Calibrate, Some(Side::Left));
        s.start(true);
        assert_eq!(s.step, FlowStep::Legacy);
        assert!(needs_legacy_branch(true, false) && needs_legacy_branch(false, true) && !needs_legacy_branch(false, false));
    }

    #[test]
    fn movements_advance_skip_and_the_knee_cannot_be_skipped() {
        let mut s = FlowState::new(Preset::Mobility, Some(Side::Left));
        s.start(false);
        s.reference_captured(reference());
        assert_eq!(s.step, FlowStep::Movement(0));
        s.skip(MovementId::KneeFlexion);
        assert_eq!(s.step, FlowStep::Movement(0), "mandatory");
        s.movement_captured(MovementId::HipFlexion, vec![frame()]);
        assert_eq!(s.step, FlowStep::Movement(0), "wrong movement is ignored");
        s.movement_captured(MovementId::KneeFlexion, vec![frame()]);
        s.skip(MovementId::HipFlexion);
        assert_eq!(s.skipped, vec![MovementId::HipFlexion]);
        s.movement_captured(MovementId::HipExtension, vec![frame()]);
        s.movement_captured(MovementId::HipAbduction, vec![frame()]);
        assert_eq!(s.step, FlowStep::Review);
        assert!(s.is_captured(MovementId::KneeFlexion) && !s.is_captured(MovementId::HipFlexion));
    }

    #[test]
    fn capturing_a_skipped_movement_again_clears_the_skip() {
        let mut s = FlowState::new(Preset::Mobility, Some(Side::Left));
        s.start(false);
        s.reference_captured(reference());
        s.movement_captured(MovementId::KneeFlexion, vec![frame()]);
        s.skip(MovementId::HipFlexion);
        s.movement_captured(MovementId::HipExtension, vec![frame()]);
        s.movement_captured(MovementId::HipAbduction, vec![frame()]);
        s.back_to_movement(1);
        s.movement_captured(MovementId::HipFlexion, vec![frame()]);
        assert!(s.skipped.is_empty());
        assert_eq!(s.step, FlowStep::Movement(2));
    }

    #[test]
    fn a_new_reference_discards_every_movement() {
        let mut s = FlowState::new(Preset::Calibrate, Some(Side::Left));
        s.start(false);
        s.reference_captured(reference());
        s.movement_captured(MovementId::KneeFlexion, vec![frame()]);
        assert!(s.recapture_needs_confirm());
        s.recapture_reference();
        assert_eq!(s.step, FlowStep::Reference);
        assert!(s.reference.is_none() && s.captured.is_empty() && s.skipped.is_empty());
        assert!(!s.recapture_needs_confirm());
    }

    #[test]
    fn quick_rezero_preset_goes_straight_to_review() {
        let mut s = FlowState::new(Preset::QuickRezero, Some(Side::Right));
        s.start(false);
        s.reference_captured(reference());
        assert_eq!(s.step, FlowStep::Review);
    }

    #[test]
    fn solving_without_the_knee_sweep_reports_what_is_missing() {
        let mut s = FlowState::new(Preset::Calibrate, Some(Side::Left));
        let fw = || Firmware { version: None, raw_stream: false };
        assert_eq!(
            solve_flow(&s, "a", "t", fw()).unwrap_err(),
            SolveFailure::Missing(MissingPart::Reference)
        );
        s.start(false);
        s.reference_captured(reference());
        assert_eq!(
            solve_flow(&s, "a", "t", fw()).unwrap_err(),
            SolveFailure::Missing(MissingPart::KneeFlexion)
        );
        s.side = None;
        assert_eq!(solve_flow(&s, "a", "t", fw()).unwrap_err(), SolveFailure::Missing(MissingPart::Side));
    }

    #[test]
    fn still_window_needs_two_frames_within_the_spread() {
        let v = |x: f64, z: f64| Vec3 { x, y: 0.0, z };
        assert!(!is_still_window(&[(v(0.0, 1.0), v(0.0, 1.0))], 5.0));
        assert!(is_still_window(&[(v(0.0, 1.0), v(0.0, 1.0)), (v(0.02, 1.0), v(0.0, 1.0))], 5.0));
        assert!(!is_still_window(&[(v(0.0, 1.0), v(0.0, 1.0)), (v(1.0, 1.0), v(0.0, 1.0))], 5.0));
    }

    #[test]
    fn method_key_separates_schema_side_kind_and_posture_but_not_calibration() {
        let a = rec("1", &["kneeFlexion"], 100.0, Some("left"), Some(2), Some("straight"));
        let mut b = a.clone();
        b.identity.calibration_id = Some("other".into());
        assert_eq!(method_key(&a.identity), method_key(&b.identity));
        let c = rec("1", &["kneeFlexion"], 100.0, Some("left"), Some(2), Some("neutral"));
        assert_ne!(method_key(&a.identity), method_key(&c.identity));
        let legacy = rec("1", &["kneeFlexion"], 100.0, Some("left"), None, None);
        assert_eq!(method_key(&legacy.identity), "legacy|left");
        assert_eq!(method_key(&MobilityIdentity::default()), "legacy");
    }

    #[test]
    fn comparable_trend_needs_the_same_set_and_method_and_is_oldest_first() {
        let rs = vec![
            rec("2026-11-03", &["hipFlexion", "kneeFlexion"], 200.0, Some("left"), Some(2), Some("straight")),
            rec("2026-11-01", &["kneeFlexion", "hipFlexion"], 190.0, Some("left"), Some(2), Some("straight")),
            rec("2026-11-02", &["kneeFlexion"], 120.0, Some("left"), Some(2), Some("straight")),
            rec("2026-11-04", &["kneeFlexion", "hipFlexion"], 90.0, Some("left"), Some(2), Some("neutral")),
        ];
        let t = comparable_trend(&rs, &rs[0]);
        assert_eq!(t.iter().map(|r| r.total_deg).collect::<Vec<_>>(), vec![190.0, 200.0]);
    }

    #[test]
    fn trend_breaks_where_method_changes_and_never_mixes_legs() {
        let rs = vec![
            rec("2026-11-01", &["kneeFlexion"], 100.0, Some("left"), None, None),
            rec("2026-11-02", &["kneeFlexion"], 110.0, Some("left"), Some(2), Some("straight")),
            rec("2026-11-03", &["kneeFlexion"], 115.0, Some("left"), Some(2), Some("straight")),
            rec("2026-11-04", &["kneeFlexion"], 50.0, Some("right"), Some(2), Some("straight")),
        ];
        let t = trend_with_breaks(&rs, &rs[2]);
        assert_eq!(
            t,
            vec![TrendEntry::Record(0), TrendEntry::MethodBreak, TrendEntry::Record(1), TrendEntry::Record(2)]
        );
    }

    #[test]
    fn mobility_record_sums_peaks_and_refuses_empty_or_duplicate_sets() {
        let r = |m, p| MovementResult { movement: m, peak_deg: p, hold_sec: 2.0, spread_deg: 1.0, instant_max_deg: p, warnings: vec![] };
        assert!(mobility_record_from_results(&[], "t", MobilityIdentity::default()).is_none());
        assert!(mobility_record_from_results(
            &[r(MovementId::KneeFlexion, 100.0), r(MovementId::KneeFlexion, 90.0)],
            "t",
            MobilityIdentity::default()
        )
        .is_none());
        let rec = mobility_record_from_results(
            &[r(MovementId::KneeFlexion, 100.0), r(MovementId::HipFlexion, 80.0)],
            "t",
            MobilityIdentity::default(),
        )
        .unwrap();
        assert_eq!(rec.total_deg, 180.0);
        assert_eq!(rec.movement_set, vec!["hipFlexion".to_string(), "kneeFlexion".to_string()]);
    }

    #[test]
    fn row_conversion_keeps_the_column_side_and_falls_back_to_detail() {
        let mut row = MobilityRecordRow {
            id: 1,
            measured_at: "t".into(),
            movement_set: "hipFlexion+bogus+kneeFlexion".into(),
            total_deg: 180.0,
            detail: r#"{"peaks":{"kneeFlexion":100,"hipFlexion":80},"side":"right"}"#.into(),
            schema: None,
            side: None,
            reference_kind: None,
            posture: None,
            calibration_id: None,
        };
        let r = record_from_row(&row);
        assert_eq!(r.movement_set, vec!["hipFlexion".to_string(), "kneeFlexion".to_string()]);
        assert_eq!(r.identity.side.as_deref(), Some("right"));
        assert_eq!(r.peaks["kneeFlexion"], 100.0);
        row.side = Some("left".into());
        row.detail = "not json".into();
        let r = record_from_row(&row);
        assert_eq!(r.identity.side.as_deref(), Some("left"));
        assert!(r.peaks.is_empty());
    }
}
