//! 療程回饋的可測試協調器；儲存與裝置傳輸由宿主依序執行 effects。
use crate::judge::EngineEvent;

pub const ALARM_SILENCE_MS: f64 = 30_000.0;
pub const ALARM_VOICE_REPEAT_MS: f64 = 8_000.0;
pub const SAFETY_HOLD_MS: f64 = 3_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    Led(bool),
    Alarm(bool),
    Goal,
}
impl Command {
    /// 唯一的裝置控制字串映射，與既有韌體協定一致。
    pub fn wire(self) -> &'static str {
        match self {
            Self::Led(true) => "CMD:LED_ON",
            Self::Led(false) => "CMD:LED_OFF",
            Self::Alarm(true) => "CMD:ALARM_ON",
            Self::Alarm(false) => "CMD:ALARM_OFF",
            Self::Goal => "CMD:GOAL",
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Cue {
    Start,
    End(u32),
    Hold,
    Rep(u32),
    OverLimit,
    Hyperextension,
    ConnectionLost,
    MountShift,
    /// The shin sensor turned on the leg and the calibration was carried over (slip correction).
    MountShiftCorrected,
}
impl Cue {
    /// 原生繁中提示；語系抽離仍依完整移植計畫進行。
    pub fn text(self) -> String {
        match self {
            Self::Start => "療程開始".into(),
            Self::End(n) => format!("療程結束，完成 {n} 次"),
            Self::Hold => "保持這個位置".into(),
            Self::Rep(n) => format!("完成第 {n} 次，請回到起始位置"),
            Self::OverLimit => "已超過個人極限範圍，請回到舒適角度".into(),
            Self::Hyperextension => "膝蓋過度伸直，請稍微彎曲".into(),
            Self::ConnectionLost => "裝置已斷線，療程停止".into(),
            Self::MountShift => "感測器可能移位，療程結束後請重新校準".into(),
            Self::MountShiftCorrected => "感測器移位，已自動修正".into(),
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    Command(Command),
    Speak(Cue),
    StopSpeech,
}

#[derive(Default)]
pub struct SessionFeedback {
    running: bool,
    reps: u32,
    want_alarm: bool,
    hyperextended: bool,
    last_led: Option<bool>,
    last_alarm: Option<bool>,
    silenced_until: f64,
    last_alarm_spoken: Option<f64>,
    safety_until: f64,
    pub alarm_active: bool,
}
impl SessionFeedback {
    pub fn reps(&self) -> u32 {
        self.reps
    }
    pub fn silenced(&self, now: f64) -> bool {
        self.want_alarm && now < self.silenced_until
    }
    fn led(&mut self, on: bool, out: &mut Vec<Effect>) {
        if self.last_led != Some(on) {
            self.last_led = Some(on);
            out.push(Effect::Command(Command::Led(on)));
        }
    }
    fn alarm(&mut self, on: bool, out: &mut Vec<Effect>) {
        self.alarm_active = on;
        if self.last_alarm != Some(on) {
            self.last_alarm = Some(on);
            out.push(Effect::Command(Command::Alarm(on)));
        }
    }
    fn speak(&mut self, cue: Cue, now: f64, safety: bool, out: &mut Vec<Effect>) {
        if safety {
            self.safety_until = now + SAFETY_HOLD_MS;
        } else if now < self.safety_until {
            return;
        }
        out.push(Effect::Speak(cue));
    }
    fn reset(&mut self) {
        self.want_alarm = false;
        self.hyperextended = false;
        self.silenced_until = 0.0;
        self.last_alarm_spoken = None;
        self.safety_until = 0.0;
        self.alarm_active = false;
    }
    /// 新連線必須重新設定 OFF，不能沿用上一顆裝置的去重快取。
    pub fn connected(&mut self) -> Vec<Effect> {
        self.reset();
        self.last_led = None;
        self.last_alarm = None;
        let mut out = vec![Effect::StopSpeech];
        self.led(false, &mut out);
        self.alarm(false, &mut out);
        out
    }
    pub fn start(&mut self) -> Vec<Effect> {
        self.reset();
        self.running = true;
        self.reps = 0;
        let mut out = vec![Effect::StopSpeech];
        self.led(false, &mut out);
        self.alarm(false, &mut out);
        out.push(Effect::Speak(Cue::Start));
        out
    }
    /// 停止回饋不代表存檔成功；成功提示由宿主在 DB 確認後另行送出。
    pub fn stop(&mut self) -> Vec<Effect> {
        self.running = false;
        self.reset();
        let mut out = vec![Effect::StopSpeech];
        self.led(false, &mut out);
        self.alarm(false, &mut out);
        out
    }
    /// ERR/資料過期時強制送出 OFF，不依賴軟體快取推測 GPIO 狀態。
    pub fn fault(&mut self) -> Vec<Effect> {
        self.reset();
        self.last_led = Some(false);
        self.last_alarm = Some(false);
        vec![
            Effect::StopSpeech,
            Effect::Command(Command::Led(false)),
            Effect::Command(Command::Alarm(false)),
        ]
    }
    pub fn disconnected(&mut self) -> Vec<Effect> {
        self.running = false;
        self.reset();
        self.last_led = None;
        self.last_alarm = None;
        vec![Effect::StopSpeech, Effect::Speak(Cue::ConnectionLost)]
    }
    pub fn silence(&mut self, now: f64) -> Vec<Effect> {
        self.silenced_until = now + ALARM_SILENCE_MS;
        let mut out = vec![Effect::StopSpeech];
        self.safety_until = 0.0;
        self.apply_alarm(now, &mut out);
        out
    }
    fn apply_alarm(&mut self, now: f64, out: &mut Vec<Effect>) {
        let active = self.want_alarm && self.running && !self.silenced(now);
        if active {
            if self
                .last_alarm_spoken
                .is_none_or(|t| now - t >= ALARM_VOICE_REPEAT_MS)
            {
                self.last_alarm_spoken = Some(now);
                self.speak(
                    if self.hyperextended {
                        Cue::Hyperextension
                    } else {
                        Cue::OverLimit
                    },
                    now,
                    true,
                    out,
                );
            }
        } else {
            self.last_alarm_spoken = None;
        }
        self.alarm(active, out);
    }
    /// 每筆有效封包依引擎事件順序套用，再依時間重算靜音到期與語音重複。
    pub fn handle(&mut self, events: &[EngineEvent], now: f64) -> Vec<Effect> {
        let mut out = Vec::new();
        for event in events {
            match *event {
                EngineEvent::ZoneEnter => {
                    self.led(true, &mut out);
                    if self.running {
                        self.speak(Cue::Hold, now, false, &mut out);
                    }
                }
                EngineEvent::ZoneExit => self.led(false, &mut out),
                EngineEvent::RepCompleted => {
                    self.led(false, &mut out);
                    if self.running {
                        self.reps += 1;
                        out.push(Effect::Command(Command::Goal));
                        self.speak(Cue::Rep(self.reps), now, false, &mut out);
                    }
                }
                EngineEvent::OverExtension(on) => {
                    self.want_alarm = on;
                    if !on {
                        self.silenced_until = 0.0;
                    }
                }
                EngineEvent::Hyperextension(on) => self.hyperextended = on,
                _ => {}
            }
        }
        self.apply_alarm(now, &mut out);
        out
    }
    pub fn mount_shift(&mut self, now: f64) -> Vec<Effect> {
        let mut out = Vec::new();
        self.speak(Cue::MountShift, now, false, &mut out);
        out
    }

    /// Same channel as [`Self::mount_shift`], for a shift that was corrected automatically.
    pub fn mount_shift_corrected(&mut self, now: f64) -> Vec<Effect> {
        let mut out = Vec::new();
        self.speak(Cue::MountShiftCorrected, now, false, &mut out);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_parameters_are_normalized_like_the_typescript_boundary() {
        use crate::judge::{AngleLimits, TriggerConfig, TriggerType};
        let config = TriggerConfig {
            target_angle: f64::NAN,
            tolerance: -10.0,
            hold_time_ms: 0.0,
            trigger_type: TriggerType::JointAngle,
            limits: AngleLimits::default(),
        }
        .normalized();
        assert_eq!(
            (config.target_angle, config.tolerance, config.hold_time_ms),
            (45.0, 1.0, 500.0)
        );
        let config = TriggerConfig {
            target_angle: 999.0,
            tolerance: f64::INFINITY,
            hold_time_ms: 1234.5,
            ..config
        }
        .normalized();
        assert_eq!(
            (config.target_angle, config.tolerance, config.hold_time_ms),
            (170.0, 10.0, 1235.0)
        );
    }
    fn commands(e: &[Effect]) -> Vec<Command> {
        e.iter()
            .filter_map(|e| {
                if let Effect::Command(c) = e {
                    Some(*c)
                } else {
                    None
                }
            })
            .collect()
    }
    #[test]
    fn idle_feedback_has_no_reps_goal_or_alarm() {
        let mut c = SessionFeedback::default();
        c.connected();
        let e = c.handle(
            &[
                EngineEvent::ZoneEnter,
                EngineEvent::RepCompleted,
                EngineEvent::OverExtension(true),
            ],
            0.0,
        );
        assert_eq!(commands(&e), vec![Command::Led(true), Command::Led(false)]);
        assert_eq!(c.reps(), 0);
        assert!(!c.alarm_active);
    }
    #[test]
    fn completed_reps_turn_led_off_before_goal_and_reenter() {
        let mut c = SessionFeedback::default();
        c.start();
        assert_eq!(
            commands(&c.handle(&[EngineEvent::ZoneEnter], 0.0)),
            vec![Command::Led(true)]
        );
        assert_eq!(
            commands(&c.handle(&[EngineEvent::RepCompleted], 2000.0)),
            vec![Command::Led(false), Command::Goal]
        );
        assert_eq!(
            commands(&c.handle(&[EngineEvent::ZoneEnter, EngineEvent::RepCompleted], 4000.0)),
            vec![Command::Led(true), Command::Led(false), Command::Goal]
        );
        assert_eq!(c.reps(), 2);
    }
    #[test]
    fn alarm_is_deduplicated_silenced_and_rearmed() {
        let mut c = SessionFeedback::default();
        c.start();
        let e = c.handle(&[EngineEvent::OverExtension(true)], 10.0);
        assert!(e.contains(&Effect::Speak(Cue::OverLimit)));
        assert_eq!(commands(&e), vec![Command::Alarm(true)]);
        assert!(c.handle(&[], 100.0).is_empty());
        assert_eq!(commands(&c.silence(100.0)), vec![Command::Alarm(false)]);
        assert!(c.handle(&[], 30099.0).is_empty());
        assert_eq!(
            commands(&c.handle(&[], 30100.0)),
            vec![Command::Alarm(true)]
        );
        c.silence(30200.0);
        c.handle(&[EngineEvent::OverExtension(false)], 30300.0);
        assert_eq!(
            commands(&c.handle(&[EngineEvent::OverExtension(true)], 30400.0)),
            vec![Command::Alarm(true)]
        );
    }
    #[test]
    fn safety_repeats_at_eight_seconds_and_blocks_routine_for_three() {
        let mut c = SessionFeedback::default();
        c.start();
        assert!(c
            .handle(
                &[
                    EngineEvent::Hyperextension(true),
                    EngineEvent::OverExtension(true)
                ],
                0.0
            )
            .contains(&Effect::Speak(Cue::Hyperextension)));
        assert!(!c
            .handle(&[EngineEvent::ZoneEnter], 2999.0)
            .iter()
            .any(|e| matches!(e, Effect::Speak(_))));
        assert!(c.handle(&[], 7999.0).is_empty());
        assert!(c
            .handle(&[], 8000.0)
            .contains(&Effect::Speak(Cue::Hyperextension)));
    }
    #[test]
    fn fault_forces_off_stop_clears_alarm_and_new_connection_resends() {
        let mut c = SessionFeedback::default();
        c.start();
        c.handle(
            &[EngineEvent::ZoneEnter, EngineEvent::OverExtension(true)],
            0.0,
        );
        assert_eq!(
            commands(&c.fault()),
            vec![Command::Led(false), Command::Alarm(false)]
        );
        assert_eq!(
            commands(&c.fault()),
            vec![Command::Led(false), Command::Alarm(false)]
        );
        assert_eq!(
            commands(&c.handle(&[EngineEvent::ZoneEnter], 10.0)),
            vec![Command::Led(true)]
        );
        assert!(commands(&c.stop()).contains(&Command::Led(false)));
        assert!(!c.alarm_active);
        assert_eq!(
            commands(&c.connected()),
            vec![Command::Led(false), Command::Alarm(false)]
        );
    }
}
