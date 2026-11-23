//! Movement judging: the normalised main metric, the coaching guidance, and the rep state machine.
//!
//! Port of `IRMS_App_Tauri/src/services/movementMetric.ts`, `guidance.ts` and `triggerEngine.ts`
//! (plan phase 4). Constants, branch order and comments' intent are kept; the TypeScript files stay
//! the reference until the Tauri app is retired, so a change there must be mirrored here.
//!
//! Sign convention (guaranteed by calibration): pitch 0 deg = standing straight, positive = forward.
//! All three trigger types are normalised to "a larger value is closer to the target".
//!
//! Two deliberate differences from the TypeScript:
//! - The engine returns its events from `handle` / `reset` instead of calling injected callbacks.
//! - The receive time is a parameter (milliseconds on a monotonic clock), not an injected clock.

/// Rest tolerance (deg): in normalised space, `value <= rest` means the limb is back at rest.
pub const REST_TOLERANCE: f64 = 30.0;
/// Minimum gap kept between the rest threshold and the zone minimum. Without it the target zone
/// can sit inside the rest zone and a motionless limb is counted once per hold time.
pub const REST_MARGIN: f64 = 5.0;
/// Exit hysteresis (deg): entry uses the strict zone, holding uses the zone widened by this.
pub const HYSTERESIS_DEG: f64 = 4.0;
/// Exit grace (ms): a short excursion while holding freezes progress instead of clearing it.
pub const EXIT_GRACE_MS: f64 = 250.0;
/// Hyperextension tolerance (deg). PROVISIONAL, see the TypeScript source and knowledge base guide 13.
pub const HYPEREXTENSION_TOLERANCE_DEG: f64 = 5.0;
pub const HYPEREXTENSION_DWELL_MS: f64 = 300.0;
pub const HYPEREXTENSION_CLEAR_MARGIN_DEG: f64 = 2.0;
/// Largest knee bend (deg) still counted as "knee nearly straight" for segment movements.
pub const SEGMENT_KNEE_MAX: f64 = 15.0;
/// Receiver-side continuity guard: at 25 Hz, more than 250 ms without a sample cannot continue a hold.
pub const ENGINE_MAX_SAMPLE_GAP_MS: f64 = 250.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TriggerType {
    JointAngle,
    SegmentElevation,
    SegmentExtension,
}

impl TriggerType {
    /// Parses the value stored in the database / sent over IPC (`joint_angle`, ...).
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "joint_angle" => Some(Self::JointAngle),
            "segment_elevation" => Some(Self::SegmentElevation),
            "segment_extension" => Some(Self::SegmentExtension),
            _ => None,
        }
    }
}

/// The user's own measured knee range. Personal data with no default: unmeasured is `None` and no
/// angle warning is given. Always compared with the knee angle, never with a segment metric.
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct AngleLimits {
    /// Comfort angle: beyond it only a screen hint.
    pub comfort: Option<f64>,
    /// Limit: beyond it an alarm.
    pub limit: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TriggerConfig {
    pub target_angle: f64,
    pub tolerance: f64,
    pub hold_time_ms: f64,
    pub trigger_type: TriggerType,
    pub limits: AngleLimits,
}

impl TriggerConfig {
    /// 與 TypeScript clampTriggerParams 相同，宿主須儲存此實際生效的快照。
    pub fn normalized(mut self) -> Self {
        let clamp = |value: f64, min, max, fallback| {
            if value.is_finite() {
                value.clamp(min, max)
            } else {
                fallback
            }
        };
        self.target_angle = clamp(self.target_angle, 10.0, 170.0, 45.0);
        self.tolerance = clamp(self.tolerance, 1.0, 30.0, 10.0);
        self.hold_time_ms = clamp(self.hold_time_ms, 500.0, 20000.0, 2000.0).round();
        self
    }
}

/// One live reading normalised to the main metric.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetricSample {
    /// Normalised main metric: larger is closer to the target.
    pub value: f64,
    /// Segment precondition "knee nearly straight"; always true for joint_angle.
    pub knee_straight_ok: bool,
    pub knee: f64,
    /// `max(SEGMENT_KNEE_MAX, tolerance)`; `None` for joint_angle.
    pub knee_max: Option<f64>,
    /// Signed knee is past the hyperextension tolerance (safety).
    pub hyperextended: bool,
}

/// Judging zone in normalised space.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MetricZone {
    pub min: f64,
    /// `f64::INFINITY` for segment movements (overshoot still counts).
    pub max: f64,
    pub rest: f64,
}

/// Rest threshold derived from the zone minimum, so `rest <= min - REST_MARGIN < min` always holds.
pub fn rest_threshold(min: f64) -> f64 {
    REST_TOLERANCE.min(min - REST_MARGIN)
}

pub fn compute_metric_sample(
    knee: f64,
    thigh: f64,
    trigger_type: TriggerType,
    tolerance: f64,
) -> MetricSample {
    let knee_max = match trigger_type {
        TriggerType::JointAngle => None,
        _ => Some(SEGMENT_KNEE_MAX.max(tolerance)),
    };
    let value = match trigger_type {
        TriggerType::SegmentElevation => thigh,
        // Extension is taken positive: the further back the thigh (negative), the larger the value.
        TriggerType::SegmentExtension => -thigh,
        TriggerType::JointAngle => knee,
    };
    MetricSample {
        value,
        knee,
        knee_max,
        knee_straight_ok: knee_max.is_none_or(|max| knee <= max),
        hyperextended: knee < -HYPEREXTENSION_TOLERANCE_DEG,
    }
}

pub fn compute_metric_zone(config: &TriggerConfig) -> MetricZone {
    if config.trigger_type == TriggerType::JointAngle {
        // Knee is never below 0: too low a min would put rest at or below 0 and rest could never be reached.
        let min = (config.target_angle - config.tolerance).max(2.0 * REST_MARGIN);
        return MetricZone {
            min,
            max: config.target_angle + config.tolerance,
            rest: rest_threshold(min),
        };
    }
    MetricZone {
        min: config.target_angle,
        max: f64::INFINITY,
        rest: rest_threshold(config.target_angle),
    }
}

/// Engine phase: idle = waiting to enter, holding = in the zone, rest_pending = counted, waiting for rest.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnginePhase {
    Idle,
    Holding,
    RestPending,
}

/// What the user should do now.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Guidance {
    NoData,
    Hyperextension { deg: f64 },
    OverLimit { excess_deg: f64 },
    StraightenKnee { excess_deg: f64 },
    Raise { delta_deg: f64 },
    Lower { delta_deg: f64 },
    Hold { held_sec: f64, total_sec: f64 },
    ReturnToRest { delta_deg: f64 },
}

pub fn compute_guidance(
    sample: Option<&MetricSample>,
    zone: &MetricZone,
    phase: EnginePhase,
    hold_progress: f64,
    hold_time_ms: f64,
    limits: &AngleLimits,
) -> Guidance {
    let Some(sample) = sample else {
        return Guidance::NoData;
    };

    // Hyperextension outranks everything else.
    if sample.hyperextended {
        return Guidance::Hyperextension { deg: -sample.knee };
    }
    // Safety first: past the personal limit, ask to come back whatever the phase. Past the comfort
    // angle is only a hint and must not replace normal guidance.
    if let Some(limit) = limits.limit {
        if sample.knee > limit {
            return Guidance::OverLimit {
                excess_deg: sample.knee - limit,
            };
        }
    }
    if phase == EnginePhase::RestPending {
        return Guidance::ReturnToRest {
            delta_deg: (sample.value - zone.rest).max(0.0),
        };
    }
    let total_sec = hold_time_ms / 1000.0;
    if phase == EnginePhase::Holding {
        return Guidance::Hold {
            held_sec: (hold_progress / 100.0) * total_sec,
            total_sec,
        };
    }
    // Idle: precondition first (segment: knee straight), then guide the metric into the zone.
    if let (false, Some(knee_max)) = (sample.knee_straight_ok, sample.knee_max) {
        return Guidance::StraightenKnee {
            excess_deg: sample.knee - knee_max,
        };
    }
    if sample.value < zone.min {
        return Guidance::Raise {
            delta_deg: zone.min - sample.value,
        };
    }
    // Segment zones have max = infinity; reachable when the engine was reset while the limb is still
    // raised. The right hint is "in the zone, hold", not "lower by minus infinity".
    if !zone.max.is_finite() {
        return Guidance::Hold {
            held_sec: 0.0,
            total_sec,
        };
    }
    // joint_angle already in the band while the engine is still idle: also "hold", never a negative delta.
    if sample.value <= zone.max {
        return Guidance::Hold {
            held_sec: 0.0,
            total_sec,
        };
    }
    Guidance::Lower {
        delta_deg: sample.value - zone.max,
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EngineInput {
    pub sample: MetricSample,
    pub zone: MetricZone,
    pub hold_time_ms: f64,
    pub limits: AngleLimits,
}

impl EngineInput {
    /// Builds the input for one live reading from the knee and thigh angles and the action's config.
    pub fn from_angles(knee: f64, thigh: f64, config: &TriggerConfig) -> Self {
        Self {
            sample: compute_metric_sample(knee, thigh, config.trigger_type, config.tolerance),
            zone: compute_metric_zone(config),
            hold_time_ms: config.hold_time_ms,
            limits: config.limits,
        }
    }
}

/// Events in the order the TypeScript engine would have called its callbacks.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EngineEvent {
    ZoneEnter,
    ZoneExit,
    HoldProgress(f64),
    RepCompleted,
    RestCompleted,
    /// Past the personal limit, or hyperextended (the alarm path).
    OverExtension(bool),
    /// Past the comfort angle (screen hint only).
    ComfortExceeded(bool),
    Hyperextension(bool),
}

#[derive(Debug, Clone)]
pub struct TriggerEngine {
    state: EnginePhase,
    in_zone_start: f64,
    /// When holding left the widened zone; `None` = currently inside.
    grace_started_at: Option<f64>,
    alarm_active: bool,
    over_comfort: bool,
    hyperextension: bool,
    /// Start of the current unbroken run of samples past the hyperextension tolerance.
    hyper_since: Option<f64>,
    /// Receive time of the previous sample (receiver clock, not sensor time).
    last_sample_at: Option<f64>,
}

impl Default for TriggerEngine {
    fn default() -> Self {
        Self {
            state: EnginePhase::Idle,
            in_zone_start: 0.0,
            grace_started_at: None,
            alarm_active: false,
            over_comfort: false,
            hyperextension: false,
            hyper_since: None,
            last_sample_at: None,
        }
    }
}

impl TriggerEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn phase(&self) -> EnginePhase {
        self.state
    }

    /// On after the flag has held for the dwell without a break in the data; off once the knee is back
    /// inside the tolerance by the clear margin. A gap restarts the dwell but never ends an active alert.
    fn hyperextension_state(&mut self, sample: &MetricSample, now: f64, continuous: bool) -> bool {
        if self.hyperextension {
            // Written as a negated `>` like the TypeScript so a NaN knee keeps an active alert on.
            #[allow(clippy::neg_cmp_op_on_partial_ord)]
            let not_cleared =
                !(sample.knee > -(HYPEREXTENSION_TOLERANCE_DEG - HYPEREXTENSION_CLEAR_MARGIN_DEG));
            return sample.hyperextended || not_cleared;
        }
        if !sample.hyperextended {
            self.hyper_since = None;
            return false;
        }
        match self.hyper_since {
            Some(since) if continuous => now - since >= HYPEREXTENSION_DWELL_MS,
            _ => {
                self.hyper_since = now.is_finite().then_some(now);
                false
            }
        }
    }

    /// Call for every live reading. `now` is the receive time in milliseconds on a monotonic clock.
    pub fn handle(&mut self, input: &EngineInput, now: f64) -> Vec<EngineEvent> {
        let mut out = Vec::new();
        let EngineInput {
            sample,
            zone,
            hold_time_ms,
            limits,
        } = input;

        // A gap or a clock anomaly only cancels holding; it never clears rest_pending or an angle alarm.
        let valid_time = now.is_finite();
        let discontinuous = !valid_time
            || self
                .last_sample_at
                .is_some_and(|last| now < last || now - last > ENGINE_MAX_SAMPLE_GAP_MS);
        self.last_sample_at = valid_time.then_some(now);

        // Personal range: independent of the rep state machine, judged on every sample (knee angle).
        let hyper = self.hyperextension_state(sample, now, !discontinuous);
        if hyper != self.hyperextension {
            self.hyperextension = hyper;
            out.push(EngineEvent::Hyperextension(hyper));
        }
        let over_extended = limits.limit.is_some_and(|limit| sample.knee > limit) || hyper;
        if over_extended != self.alarm_active {
            self.alarm_active = over_extended;
            out.push(EngineEvent::OverExtension(over_extended));
        }
        let over_comfort = limits.comfort.is_some_and(|comfort| sample.knee > comfort);
        if over_comfort != self.over_comfort {
            self.over_comfort = over_comfort;
            out.push(EngineEvent::ComfortExceeded(over_comfort));
        }

        if discontinuous {
            self.leave_holding(&mut out);
        }
        if !valid_time {
            return out;
        }

        // Rest: after a counted rep the limb must return to rest before the next one.
        if self.state == EnginePhase::RestPending {
            if sample.value <= zone.rest {
                self.state = EnginePhase::Idle;
                out.push(EngineEvent::RestCompleted);
            }
            return out;
        }

        // Entry uses the strict zone (the narrow side of the hysteresis).
        let strict_in =
            sample.knee_straight_ok && sample.value >= zone.min && sample.value <= zone.max;

        // Grace already expired when this sample arrives (e.g. a Bluetooth gap): confirm the exit first,
        // or the whole gap would be counted as hold time.
        if self.state == EnginePhase::Holding
            && self
                .grace_started_at
                .is_some_and(|started| now - started > EXIT_GRACE_MS)
        {
            self.leave_holding(&mut out);
        }

        if self.state == EnginePhase::Idle && strict_in {
            self.state = EnginePhase::Holding;
            self.in_zone_start = now;
            self.grace_started_at = None;
            out.push(EngineEvent::ZoneEnter);
        }

        if self.state == EnginePhase::Holding {
            // While holding, judge the widened zone; the knee-straight precondition is widened too.
            let knee_ok_relaxed = sample
                .knee_max
                .is_none_or(|max| sample.knee <= max + HYSTERESIS_DEG);
            let relaxed_in = knee_ok_relaxed
                && sample.value >= zone.min - HYSTERESIS_DEG
                && sample.value <= zone.max + HYSTERESIS_DEG;
            if relaxed_in {
                self.grace_started_at = None;
                let elapsed = now - self.in_zone_start;
                // hold_time_ms of 0 would give 0/0 = NaN on the first sample; guard here as well.
                let percent = ((elapsed / hold_time_ms.max(1.0)) * 100.0).min(100.0);
                out.push(EngineEvent::HoldProgress(percent));
                if percent >= 100.0 {
                    self.state = EnginePhase::RestPending;
                    out.push(EngineEvent::RepCompleted);
                }
            } else if self.grace_started_at.is_none() {
                // Just left: start the grace timer, progress frozen (no event, no reset).
                self.grace_started_at = Some(now);
            }
        }
        out
    }

    /// Shared by lost continuity and expired exit grace; a counted rep's rest obligation is kept.
    fn leave_holding(&mut self, out: &mut Vec<EngineEvent>) {
        if self.state != EnginePhase::Holding {
            return;
        }
        self.state = EnginePhase::Idle;
        self.in_zone_start = 0.0;
        self.grace_started_at = None;
        out.push(EngineEvent::HoldProgress(0.0));
        out.push(EngineEvent::ZoneExit);
    }

    /// Reset (session start / end, hardware error).
    pub fn reset(&mut self) -> Vec<EngineEvent> {
        let mut out = Vec::new();
        self.state = EnginePhase::Idle;
        self.in_zone_start = 0.0;
        self.grace_started_at = None;
        self.last_sample_at = None;
        if self.alarm_active {
            self.alarm_active = false;
            out.push(EngineEvent::OverExtension(false));
        }
        if self.over_comfort {
            self.over_comfort = false;
            out.push(EngineEvent::ComfortExceeded(false));
        }
        self.hyper_since = None;
        if self.hyperextension {
            self.hyperextension = false;
            out.push(EngineEvent::Hyperextension(false));
        }
        out.push(EngineEvent::HoldProgress(0.0));
        out
    }
}

#[cfg(test)]
mod tests {
    //! Ported from movementMetric.test.ts, guidance.test.ts and triggerEngine.test.ts. Not ported:
    //! `metricInfo` and `guidanceText` (translation layer, not in the core yet) and the test that
    //! spies on `performance.now` (the Rust engine takes the time as a parameter).
    use super::*;

    const fn cfg(target: f64, tol: f64, hold: f64, tt: TriggerType) -> TriggerConfig {
        TriggerConfig {
            target_angle: target,
            tolerance: tol,
            hold_time_ms: hold,
            trigger_type: tt,
            limits: AngleLimits {
                comfort: None,
                limit: None,
            },
        }
    }
    const JOINT: TriggerConfig = cfg(90.0, 10.0, 1000.0, TriggerType::JointAngle);
    const ELEV: TriggerConfig = cfg(45.0, 10.0, 1000.0, TriggerType::SegmentElevation);
    const EXT: TriggerConfig = cfg(20.0, 8.0, 1000.0, TriggerType::SegmentExtension);

    fn input(knee: f64, thigh: f64, c: &TriggerConfig) -> EngineInput {
        EngineInput::from_angles(knee, thigh, c)
    }

    /// Records events the way the vitest helper does: names, progress values, alarm and comfort flags.
    #[derive(Default)]
    struct Rig {
        engine: TriggerEngine,
        now: f64,
        events: Vec<&'static str>,
        progress: Vec<f64>,
        alarms: Vec<bool>,
        comfort: Vec<bool>,
    }

    impl Rig {
        fn record(&mut self, events: Vec<EngineEvent>) {
            for e in events {
                match e {
                    EngineEvent::ZoneEnter => self.events.push("enter"),
                    EngineEvent::ZoneExit => self.events.push("exit"),
                    EngineEvent::HoldProgress(p) => self.progress.push(p),
                    EngineEvent::RepCompleted => self.events.push("rep"),
                    EngineEvent::RestCompleted => self.events.push("rest"),
                    EngineEvent::OverExtension(a) => self.alarms.push(a),
                    EngineEvent::ComfortExceeded(a) => self.comfort.push(a),
                    EngineEvent::Hyperextension(_) => {}
                }
            }
        }
        fn handle(&mut self, i: EngineInput) {
            let ev = self.engine.handle(&i, self.now);
            self.record(ev);
        }
        fn reset(&mut self) {
            let ev = self.engine.reset();
            self.record(ev);
        }
        fn tick(&mut self, ms: f64) {
            self.now += ms;
        }
        /// Continuous 25 Hz samples; a bare `tick` is a gap with no packets.
        fn stream(&mut self, sample: EngineInput, duration_ms: f64) {
            let mut remaining = duration_ms;
            while remaining > 0.0 {
                let step = remaining.min(40.0);
                self.tick(step);
                self.handle(sample);
                remaining -= step;
            }
        }
        fn reps(&self) -> usize {
            self.events.iter().filter(|e| **e == "rep").count()
        }
        fn last_progress(&self) -> f64 {
            *self.progress.last().unwrap()
        }
    }

    // ---- movementMetric.test.ts ----

    #[test]
    fn sample_joint_angle_is_knee_without_precondition() {
        let s = compute_metric_sample(87.0, 30.0, TriggerType::JointAngle, 10.0);
        assert_eq!(s.value, 87.0);
        assert!(s.knee_straight_ok);
        assert_eq!(s.knee_max, None);
    }

    #[test]
    fn sample_elevation_is_thigh_with_knee_threshold() {
        let s = compute_metric_sample(12.0, 48.0, TriggerType::SegmentElevation, 10.0);
        assert_eq!(s.value, 48.0);
        assert_eq!(s.knee_max, Some(15.0));
        assert!(s.knee_straight_ok);
        assert!(
            !compute_metric_sample(16.0, 48.0, TriggerType::SegmentElevation, 10.0)
                .knee_straight_ok
        );
        let loose = compute_metric_sample(18.0, 48.0, TriggerType::SegmentElevation, 20.0);
        assert_eq!(loose.knee_max, Some(20.0));
        assert!(loose.knee_straight_ok);
    }

    #[test]
    fn sample_extension_is_negated_thigh() {
        assert_eq!(
            compute_metric_sample(5.0, -25.0, TriggerType::SegmentExtension, 8.0).value,
            25.0
        );
    }

    #[test]
    fn zone_joint_and_segment() {
        let z = compute_metric_zone(&JOINT);
        assert_eq!((z.min, z.max, z.rest), (80.0, 100.0, REST_TOLERANCE));
        let z = compute_metric_zone(&ELEV);
        assert_eq!(z.min, 45.0);
        assert_eq!(z.max, f64::INFINITY);
    }

    #[test]
    fn zone_low_target_rest_is_reachable() {
        let z = compute_metric_zone(&cfg(10.0, 10.0, 1000.0, TriggerType::JointAngle));
        assert!(z.rest > 0.0);
        assert!(z.rest < z.min);
    }

    #[test]
    fn zone_rest_invariant_holds_for_all_legal_parameters() {
        for target in [10.0, 20.0, 35.0, 45.0, 90.0, 170.0] {
            for tol in [1.0, 8.0, 10.0, 30.0] {
                for tt in [
                    TriggerType::JointAngle,
                    TriggerType::SegmentExtension,
                    TriggerType::SegmentElevation,
                ] {
                    let z = compute_metric_zone(&cfg(target, tol, 2000.0, tt));
                    assert!(z.rest < z.min, "target {target} tol {tol} {tt:?}");
                }
            }
        }
    }

    #[test]
    fn zone_rest_thresholds() {
        assert_eq!(
            compute_metric_zone(&cfg(90.0, 10.0, 3000.0, TriggerType::JointAngle)).rest,
            REST_TOLERANCE
        );
        let ext = compute_metric_zone(&cfg(20.0, 8.0, 2000.0, TriggerType::SegmentExtension));
        assert_eq!((ext.min, ext.rest), (20.0, 15.0));
        // clampTolerance(-5) is the minimum tolerance, 1.
        let clamped = compute_metric_zone(&cfg(90.0, 1.0, 2000.0, TriggerType::JointAngle));
        assert!(clamped.min < clamped.max);
    }

    #[test]
    fn zone_does_not_depend_on_personal_limits() {
        let mut ranged = cfg(90.0, 10.0, 3000.0, TriggerType::JointAngle);
        ranged.limits = AngleLimits {
            comfort: Some(95.0),
            limit: Some(120.0),
        };
        assert_eq!(
            compute_metric_zone(&ranged),
            compute_metric_zone(&cfg(90.0, 10.0, 3000.0, TriggerType::JointAngle))
        );
    }

    // ---- guidance.test.ts ----

    fn sample(value: f64) -> MetricSample {
        MetricSample {
            value,
            knee: value,
            knee_max: None,
            knee_straight_ok: true,
            hyperextended: false,
        }
    }
    const NONE: AngleLimits = AngleLimits {
        comfort: None,
        limit: None,
    };

    #[test]
    fn guidance_no_data() {
        let z = compute_metric_zone(&JOINT);
        assert_eq!(
            compute_guidance(None, &z, EnginePhase::Idle, 0.0, 3000.0, &NONE),
            Guidance::NoData
        );
    }

    #[test]
    fn guidance_personal_limit_outranks_phase() {
        let z = compute_metric_zone(&JOINT);
        let lim = AngleLimits {
            comfort: Some(100.0),
            limit: Some(110.0),
        };
        assert_eq!(
            compute_guidance(
                Some(&sample(120.0)),
                &z,
                EnginePhase::Holding,
                50.0,
                3000.0,
                &lim
            ),
            Guidance::OverLimit { excess_deg: 10.0 }
        );
        // No measured range: no angle warning at all.
        assert!(matches!(
            compute_guidance(
                Some(&sample(170.0)),
                &z,
                EnginePhase::Holding,
                50.0,
                3000.0,
                &NONE
            ),
            Guidance::Hold { .. }
        ));
        // Past comfort only: normal guidance stays.
        let comfort_only = AngleLimits {
            comfort: Some(85.0),
            limit: None,
        };
        assert!(matches!(
            compute_guidance(
                Some(&sample(95.0)),
                &z,
                EnginePhase::Holding,
                50.0,
                3000.0,
                &comfort_only
            ),
            Guidance::Hold { .. }
        ));
    }

    #[test]
    fn guidance_segment_compares_knee_not_thigh_with_limit() {
        let z = compute_metric_zone(&ELEV);
        let mut s = sample(60.0);
        s.knee = 5.0;
        let lim = AngleLimits {
            comfort: Some(30.0),
            limit: Some(40.0),
        };
        assert!(!matches!(
            compute_guidance(Some(&s), &z, EnginePhase::Idle, 0.0, 3000.0, &lim),
            Guidance::OverLimit { .. }
        ));
    }

    #[test]
    fn guidance_idle_branches() {
        let z = compute_metric_zone(&JOINT);
        let g =
            |v: f64| compute_guidance(Some(&sample(v)), &z, EnginePhase::Idle, 0.0, 3000.0, &NONE);
        assert_eq!(g(62.0), Guidance::Raise { delta_deg: 18.0 });
        assert_eq!(g(105.0), Guidance::Lower { delta_deg: 5.0 });
        assert!(matches!(g(88.0), Guidance::Hold { .. }));
        let mut bent = sample(30.0);
        bent.knee = 22.0;
        bent.knee_max = Some(15.0);
        bent.knee_straight_ok = false;
        assert_eq!(
            compute_guidance(
                Some(&bent),
                &compute_metric_zone(&ELEV),
                EnginePhase::Idle,
                0.0,
                3000.0,
                &NONE
            ),
            Guidance::StraightenKnee { excess_deg: 7.0 }
        );
    }

    #[test]
    fn guidance_holding_and_rest_pending() {
        let z = compute_metric_zone(&JOINT);
        match compute_guidance(
            Some(&sample(90.0)),
            &z,
            EnginePhase::Holding,
            60.0,
            3000.0,
            &NONE,
        ) {
            Guidance::Hold {
                held_sec,
                total_sec,
            } => {
                assert!((held_sec - 1.8).abs() < 1e-9);
                assert_eq!(total_sec, 3.0);
            }
            other => panic!("expected hold, got {other:?}"),
        }
        assert_eq!(
            compute_guidance(
                Some(&sample(50.0)),
                &z,
                EnginePhase::RestPending,
                100.0,
                3000.0,
                &NONE
            ),
            Guidance::ReturnToRest { delta_deg: 20.0 }
        );
    }

    // ---- triggerEngine.test.ts: sample continuity ----

    #[test]
    fn accepts_250ms_spacing_but_restarts_after_251ms() {
        let mut r = Rig::default();
        let target = input(90.0, 0.0, &JOINT);
        r.handle(target);
        for _ in 0..4 {
            r.tick(250.0);
            r.handle(target);
        }
        assert_eq!(r.events, ["enter", "rep"]);
        r.reset();
        r.handle(target);
        r.tick(251.0);
        r.handle(target);
        assert_eq!(r.events, ["enter", "rep", "enter", "exit", "enter"]);
        assert_eq!(r.last_progress(), 0.0);
        r.stream(target, 1000.0);
        assert_eq!(r.reps(), 2);
    }

    #[test]
    fn silence_after_a_completed_hold_keeps_rest_gating() {
        let mut r = Rig::default();
        let target = input(90.0, 0.0, &JOINT);
        r.handle(target);
        r.stream(target, 1000.0);
        r.tick(10_000.0);
        r.handle(target);
        r.stream(target, 2000.0);
        assert_eq!(r.events, ["enter", "rep"]);
        assert_eq!(r.engine.phase(), EnginePhase::RestPending);
        r.handle(input(20.0, 0.0, &JOINT));
        r.handle(target);
        r.stream(target, 1000.0);
        assert_eq!(r.events, ["enter", "rep", "rest", "enter", "rep"]);
    }

    #[test]
    fn nonfinite_time_is_rejected_and_requires_a_new_complete_hold() {
        for invalid in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            let mut r = Rig::default();
            let target = input(90.0, 0.0, &JOINT);
            r.handle(target);
            r.stream(target, 800.0);
            r.now = invalid;
            r.handle(target);
            assert_eq!(r.engine.phase(), EnginePhase::Idle);
            assert_eq!(r.last_progress(), 0.0);
            r.now = 10_000.0;
            r.handle(target);
            assert_eq!(r.reps(), 0);
            r.stream(target, 1000.0);
            assert_eq!(
                r.events,
                ["enter", "exit", "enter", "rep"],
                "time {invalid}"
            );
        }
    }

    #[test]
    fn backwards_time_restarts_and_repeated_timestamps_add_no_progress() {
        let mut r = Rig::default();
        let target = input(90.0, 0.0, &JOINT);
        r.handle(target);
        r.stream(target, 800.0);
        r.now = 100.0;
        r.handle(target);
        for _ in 0..100 {
            r.handle(target);
        }
        assert_eq!(r.events, ["enter", "exit", "enter"]);
        assert_eq!(r.last_progress(), 0.0);
        r.stream(target, 1000.0);
        assert_eq!(r.events.last(), Some(&"rep"));
    }

    // ---- joint_angle full cycle ----

    #[test]
    fn one_in_zone_sample_followed_by_silence_does_not_complete_a_hold() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.tick(3000.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "exit", "enter"]);
        assert_eq!(r.last_progress(), 0.0);
    }

    #[test]
    fn full_cycle_enter_hold_rep_rest() {
        let mut r = Rig::default();
        assert_eq!(r.engine.phase(), EnginePhase::Idle);
        r.handle(input(50.0, 0.0, &JOINT));
        assert!(r.events.is_empty());
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter"]);
        assert_eq!(r.engine.phase(), EnginePhase::Holding);
        r.stream(input(90.0, 0.0, &JOINT), 500.0);
        r.handle(input(85.0, 0.0, &JOINT));
        assert_eq!(r.last_progress(), 50.0);
        r.stream(input(85.0, 0.0, &JOINT), 500.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep"]);
        assert_eq!(r.engine.phase(), EnginePhase::RestPending);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep"]);
        r.handle(input(20.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep", "rest"]);
        assert_eq!(r.engine.phase(), EnginePhase::Idle);
        r.handle(input(95.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep", "rest", "enter"]);
    }

    #[test]
    fn a_gap_after_leaving_the_zone_is_not_counted_as_hold_time() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.tick(100.0);
        r.handle(input(50.0, 0.0, &JOINT));
        r.tick(3000.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.reps(), 0);
        assert!(r.events.contains(&"exit"));
    }

    #[test]
    fn leaving_early_past_the_grace_resets_progress_and_exits() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.stream(input(90.0, 0.0, &JOINT), 700.0);
        r.handle(input(50.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter"]);
        assert_eq!(r.engine.phase(), EnginePhase::Holding);
        r.tick(EXIT_GRACE_MS + 1.0);
        r.handle(input(50.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "exit"]);
        assert_eq!(r.last_progress(), 0.0);
        assert_eq!(r.engine.phase(), EnginePhase::Idle);
    }

    // ---- hysteresis and exit grace ----

    #[test]
    fn a_noise_spike_inside_the_grace_keeps_progress() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.stream(input(90.0, 0.0, &JOINT), 400.0);
        r.handle(input(60.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter"]);
        r.tick(100.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.last_progress(), 50.0);
        r.stream(input(90.0, 0.0, &JOINT), 500.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep"]);
        assert!(!r.progress[1..].contains(&0.0));
    }

    #[test]
    fn progress_is_frozen_during_the_grace_and_no_rep_completes_outside() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.stream(input(90.0, 0.0, &JOINT), 960.0);
        let count = r.progress.len();
        r.tick(40.0);
        r.handle(input(60.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter"]);
        assert_eq!(r.progress.len(), count);
        r.tick(100.0);
        r.handle(input(90.0, 0.0, &JOINT));
        assert_eq!(r.events, ["enter", "rep"]);
    }

    #[test]
    fn hysteresis_widens_holding_but_not_entry() {
        let mut r = Rig::default();
        r.handle(input(90.0, 0.0, &JOINT));
        r.stream(input(90.0, 0.0, &JOINT), 500.0);
        r.handle(input(80.0 - HYSTERESIS_DEG, 0.0, &JOINT));
        assert_eq!(r.events, ["enter"]);
        assert_eq!(r.last_progress(), 50.0);
        assert_eq!(r.engine.phase(), EnginePhase::Holding);

        let mut idle = Rig::default();
        idle.handle(input(80.0 - HYSTERESIS_DEG, 0.0, &JOINT));
        assert!(idle.events.is_empty());
        assert_eq!(idle.engine.phase(), EnginePhase::Idle);
    }

    #[test]
    fn segment_knee_precondition_is_widened_while_holding() {
        let mut r = Rig::default();
        r.handle(input(10.0, 50.0, &ELEV));
        r.stream(input(10.0, 50.0, &ELEV), 500.0);
        r.handle(input(15.0 + HYSTERESIS_DEG, 50.0, &ELEV));
        assert_eq!(r.last_progress(), 50.0);
        r.handle(input(30.0, 50.0, &ELEV));
        r.tick(EXIT_GRACE_MS + 1.0);
        r.handle(input(30.0, 50.0, &ELEV));
        assert_eq!(r.events, ["enter", "exit"]);
    }

    // ---- personal comfort angle and limit ----

    fn ranged() -> TriggerConfig {
        let mut c = JOINT;
        c.limits = AngleLimits {
            comfort: Some(100.0),
            limit: Some(115.0),
        };
        c
    }

    #[test]
    fn limit_alarm_fires_only_past_the_limit_and_clears_on_return() {
        let mut r = Rig::default();
        r.handle(input(115.0, 0.0, &ranged()));
        assert!(r.alarms.is_empty());
        r.handle(input(116.0, 0.0, &ranged()));
        assert_eq!(r.alarms, [true]);
        r.handle(input(80.0, 0.0, &ranged()));
        assert_eq!(r.alarms, [true, false]);
    }

    #[test]
    fn comfort_is_reported_separately_from_the_limit() {
        let mut r = Rig::default();
        r.handle(input(105.0, 0.0, &ranged()));
        assert_eq!(r.comfort, [true]);
        assert!(r.alarms.is_empty());
        r.handle(input(95.0, 0.0, &ranged()));
        assert_eq!(r.comfort, [true, false]);
    }

    #[test]
    fn no_measured_range_means_no_angle_warning() {
        let mut r = Rig::default();
        r.handle(input(175.0, 0.0, &JOINT));
        assert!(r.alarms.is_empty());
        assert!(r.comfort.is_empty());
    }

    #[test]
    fn segment_movements_compare_the_knee_with_the_limit() {
        let mut r = Rig::default();
        let mut elev = ELEV;
        elev.limits = AngleLimits {
            comfort: Some(30.0),
            limit: Some(40.0),
        };
        r.handle(input(5.0, 80.0, &elev));
        assert!(r.alarms.is_empty());
        r.handle(input(45.0, 80.0, &elev));
        assert_eq!(r.alarms, [true]);
    }

    #[test]
    fn reset_clears_an_active_alarm_and_returns_to_idle() {
        let mut r = Rig::default();
        r.handle(input(150.0, 0.0, &ranged()));
        assert_eq!(r.alarms, [true]);
        r.reset();
        assert_eq!(r.alarms, [true, false]);
        assert_eq!(r.comfort, [true, false]);
        assert_eq!(r.engine.phase(), EnginePhase::Idle);
    }

    // ---- segment judging ----

    #[test]
    fn elevation_needs_a_straight_knee_and_thigh_at_target() {
        let mut r = Rig::default();
        r.handle(input(30.0, 50.0, &ELEV));
        assert!(r.events.is_empty());
        r.handle(input(10.0, 50.0, &ELEV));
        assert_eq!(r.events, ["enter"]);

        let mut loose_rig = Rig::default();
        let mut loose = ELEV;
        loose.tolerance = 20.0;
        loose_rig.handle(input(18.0, 50.0, &loose));
        assert_eq!(loose_rig.events, ["enter"]);
    }

    #[test]
    fn extension_needs_the_thigh_below_minus_target() {
        let mut r = Rig::default();
        r.handle(input(5.0, -10.0, &EXT));
        assert!(r.events.is_empty());
        r.handle(input(5.0, -25.0, &EXT));
        assert_eq!(r.events, ["enter"]);
    }

    // ---- a motionless limb must not produce phantom reps ----

    const BACKWARD_EXTENSION: TriggerConfig = cfg(20.0, 8.0, 2000.0, TriggerType::SegmentExtension);

    #[test]
    fn a_limb_resting_inside_the_zone_counts_once() {
        let mut r = Rig::default();
        for _ in 0..200 {
            r.handle(input(0.0, -25.0, &BACKWARD_EXTENSION));
            r.tick(40.0);
        }
        assert_eq!(r.reps(), 1);
        assert_eq!(r.engine.phase(), EnginePhase::RestPending);
    }

    #[test]
    fn the_limb_must_really_return_to_rest_before_the_next_rep() {
        let mut r = Rig::default();
        let up = input(0.0, -25.0, &BACKWARD_EXTENSION);
        r.handle(up);
        r.stream(up, 2000.0);
        r.handle(up);
        assert_eq!(r.events, ["enter", "rep"]);
        r.handle(input(0.0, -16.0, &BACKWARD_EXTENSION));
        assert_eq!(r.events, ["enter", "rep"]);
        r.handle(input(0.0, -10.0, &BACKWARD_EXTENSION));
        assert_eq!(r.events, ["enter", "rep", "rest"]);
        r.handle(up);
        r.stream(up, 2000.0);
        r.handle(up);
        assert_eq!(r.reps(), 2);
    }

    #[test]
    fn a_gentle_low_target_joint_movement_does_not_loop() {
        let gentle = cfg(35.0, 10.0, 1000.0, TriggerType::JointAngle);
        let mut r = Rig::default();
        for _ in 0..150 {
            r.handle(input(30.0, 0.0, &gentle));
            r.tick(40.0);
        }
        assert_eq!(r.reps(), 1);
    }

    #[test]
    fn zero_hold_time_never_gives_nan_progress() {
        let mut r = Rig::default();
        let mut zero = JOINT;
        zero.hold_time_ms = 0.0;
        r.handle(input(90.0, 0.0, &zero));
        assert!(r.progress.iter().all(|p| p.is_finite()));
    }

    // ---- hyperextension (not covered by the three ported files; checks the dwell and the clear margin) ----

    #[test]
    fn hyperextension_needs_the_dwell_and_clears_with_the_margin() {
        let mut engine = TriggerEngine::new();
        let has = |ev: &[EngineEvent], want: bool| ev.contains(&EngineEvent::Hyperextension(want));
        let mut now = 0.0;
        assert!(!has(&engine.handle(&input(-6.0, 0.0, &JOINT), now), true));
        now += 200.0;
        assert!(!has(&engine.handle(&input(-6.0, 0.0, &JOINT), now), true));
        now += 100.0;
        let ev = engine.handle(&input(-6.0, 0.0, &JOINT), now);
        assert!(has(&ev, true) && ev.contains(&EngineEvent::OverExtension(true)));
        // Back to -4: inside the tolerance but not by the 2 deg margin, alert stays on.
        now += 40.0;
        assert!(!has(&engine.handle(&input(-4.0, 0.0, &JOINT), now), false));
        now += 40.0;
        assert!(has(&engine.handle(&input(-2.0, 0.0, &JOINT), now), false));
    }
}

#[cfg(test)]
mod contract_tests {
    //! Replays `IRMS_App_Tauri/fixtures/engine-sequences.json` through this engine. The file is
    //! produced by the TypeScript engine (`src/services/triggerEngine.contract.test.ts`), so this is
    //! the check that the two implementations emit the same events for the same samples.
    use super::*;
    use serde_json::Value;

    fn fmt_event(e: &EngineEvent) -> (String, Option<f64>) {
        match *e {
            EngineEvent::ZoneEnter => ("enter".into(), None),
            EngineEvent::ZoneExit => ("exit".into(), None),
            EngineEvent::HoldProgress(p) => ("progress".into(), Some(p)),
            EngineEvent::RepCompleted => ("rep".into(), None),
            EngineEvent::RestCompleted => ("rest".into(), None),
            EngineEvent::OverExtension(a) => (format!("alarm:{a}"), None),
            EngineEvent::ComfortExceeded(a) => (format!("comfort:{a}"), None),
            EngineEvent::Hyperextension(a) => (format!("hyper:{a}"), None),
        }
    }

    /// The TypeScript side writes `progress:<number>`; compare the number numerically.
    fn parse_expected(s: &str) -> (String, Option<f64>) {
        match s.strip_prefix("progress:") {
            Some(n) => (
                "progress".into(),
                Some(n.parse::<f64>().expect("progress value")),
            ),
            None => (s.to_string(), None),
        }
    }

    fn phase_name(p: EnginePhase) -> &'static str {
        match p {
            EnginePhase::Idle => "idle",
            EnginePhase::Holding => "holding",
            EnginePhase::RestPending => "restPending",
        }
    }

    #[test]
    fn engine_matches_the_typescript_engine_on_the_shared_sequences() {
        let sequences: Vec<Value> = serde_json::from_str(include_str!(
            "../../IRMS_App_Tauri/fixtures/engine-sequences.json"
        ))
        .unwrap();
        assert!(
            sequences.len() >= 7,
            "fixture has {} sequences",
            sequences.len()
        );
        let mut samples = 0usize;
        let mut events = 0usize;
        for seq in &sequences {
            let name = seq["name"].as_str().unwrap();
            let c = &seq["config"];
            let config = TriggerConfig {
                target_angle: c["targetAngle"].as_f64().unwrap(),
                tolerance: c["tolerance"].as_f64().unwrap(),
                hold_time_ms: c["holdTimeMs"].as_f64().unwrap(),
                trigger_type: TriggerType::parse(c["triggerType"].as_str().unwrap()).unwrap(),
                limits: AngleLimits {
                    comfort: c["comfort"].as_f64(),
                    limit: c["limit"].as_f64(),
                },
            };
            let steps = seq["steps"].as_array().unwrap();
            let expected = seq["expected"].as_array().unwrap();
            assert_eq!(steps.len(), expected.len(), "{name}");
            let mut engine = TriggerEngine::new();
            for (i, (step, want)) in steps.iter().zip(expected).enumerate() {
                let mut got = Vec::new();
                if step["reset"].as_bool() == Some(true) {
                    got.extend(engine.reset());
                }
                // A null time stands for a non-finite clock reading.
                let now = step["t"].as_f64().unwrap_or(f64::NAN);
                let input = EngineInput::from_angles(
                    step["knee"].as_f64().unwrap(),
                    step["thigh"].as_f64().unwrap(),
                    &config,
                );
                got.extend(engine.handle(&input, now));

                let got: Vec<_> = got.iter().map(fmt_event).collect();
                let want_events: Vec<_> = want["events"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| parse_expected(e.as_str().unwrap()))
                    .collect();
                assert_eq!(
                    got.len(),
                    want_events.len(),
                    "{name} step {i}: got {got:?}, want {want_events:?}"
                );
                for (g, w) in got.iter().zip(&want_events) {
                    assert_eq!(
                        g.0, w.0,
                        "{name} step {i}: got {got:?}, want {want_events:?}"
                    );
                    if let (Some(a), Some(b)) = (g.1, w.1) {
                        assert!((a - b).abs() < 1e-9, "{name} step {i}: progress {a} vs {b}");
                    }
                }
                assert_eq!(
                    phase_name(engine.phase()),
                    want["phase"].as_str().unwrap(),
                    "{name} step {i}"
                );
                samples += 1;
                events += got.len();
            }
        }
        assert!(
            samples > 2000 && events > 1000,
            "replayed {samples} samples, {events} events"
        );
    }
}
