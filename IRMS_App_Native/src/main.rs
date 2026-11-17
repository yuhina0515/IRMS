#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Native prototype with an isolated SQLite database and simulated or BLE input.
use chrono::{DateTime, SecondsFormat, Utc};
use irms_core::angle_math::Vec3;
use irms_core::ble::{self, BleHost, BleState};
use irms_core::calibration::{knee_signed, limb_angles, CalibrationProfile};
use irms_core::judge::{
    compute_guidance, compute_metric_zone, AngleLimits, EngineEvent, EngineInput, EnginePhase,
    Guidance, TriggerConfig, TriggerEngine, TriggerType,
};
use irms_core::protocol::{parse_angle_packet, ParsedPacket, RawAngles};
use irms_core::session_controller::{Effect, SessionFeedback};
use irms_core::slip_monitor::SlipMonitor;
use irms_core::types::{CustomAction, SensorReading};
use pipeline::{Rig, Script};
use serde_json::{json, Value};
use slint::{ComponentHandle, Model, ModelRc, Timer, TimerMode, VecModel};
use std::cell::RefCell;
use std::fmt::Write;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};
use store::Store;
use wearing::{Verdict, WearingCheck};
use wizard::Wizard;

mod action_edit;
mod action_ui;
mod firmware_ui;
mod instance;
mod outputs;
mod pipeline;
mod preferences;
mod share_ui;
mod store;
mod wearing;
mod wizard;

slint::include_modules!();

const HZ: f64 = 50.0;
const SAMPLES: usize = 250; // 5 s window
const RULER_MAX: f64 = 160.0;

/// Judging configuration of a stored prescription plus the user's own measured range.
fn action_config(actions: &[CustomAction], index: usize, limits: AngleLimits) -> TriggerConfig {
    let config = match actions.get(index.min(actions.len().saturating_sub(1))) {
        Some(a) => TriggerConfig {
            target_angle: a.target_angle,
            tolerance: a.tolerance,
            hold_time_ms: a.hold_time_ms as f64,
            trigger_type: TriggerType::parse(&a.trigger_type).unwrap_or(TriggerType::JointAngle),
            limits,
        },
        // An empty prescription list cannot be judged; this target is never reached.
        None => TriggerConfig {
            target_angle: 90.0,
            tolerance: 10.0,
            hold_time_ms: 3000.0,
            trigger_type: TriggerType::JointAngle,
            limits,
        },
    };
    config.normalized()
}

fn kind_label(t: TriggerType) -> &'static str {
    match t {
        TriggerType::JointAngle => "關節角度",
        TriggerType::SegmentElevation => "肢段抬高",
        TriggerType::SegmentExtension => "肢段後伸",
    }
}

fn action_item(a: &CustomAction) -> ActionItem {
    let trigger = TriggerType::parse(&a.trigger_type).unwrap_or(TriggerType::JointAngle);
    ActionItem {
        id: a.id.to_string().into(),
        position: 0,
        name: a.name.clone().into(),
        kind: kind_label(trigger).into(),
        target: if trigger == TriggerType::JointAngle {
            format!("{:.0}° ±{:.0}°", a.target_angle, a.tolerance).into()
        } else {
            format!("≥ {:.0}°", a.target_angle).into()
        },
        hold: format!("{:.1} 秒", a.hold_time_ms as f64 / 1000.0).into(),
        note: a.description.clone().unwrap_or_default().into(),
        shown: true,
    }
}

/// History rows from the database, newest first.
fn session_rows(store: &Store) -> rusqlite::Result<Vec<SessionRow>> {
    Ok(session_rows_from(&store.sessions()?))
}
fn session_rows_from(rows: &[irms_core::types::Session]) -> Vec<SessionRow> {
    rows.iter()
        .filter(|x| x.end_time.is_some())
        .map(|x| SessionRow {
            id: x.id.to_string().into(),
            started: store::local_start(x).into(),
            action: x.action_name.clone().unwrap_or_default().into(),
            reps: x.reps_completed as i32,
            duration: store::duration(x).into(),
            demo: x.source == "demo",
            summary: Default::default(),
        })
        .collect()
}

/// Main-metric name and movement verb, as in the app's zh-Hant strings.
fn metric_words(t: TriggerType) -> (&'static str, &'static str) {
    match t {
        TriggerType::JointAngle => ("膝關節夾角", "彎曲"),
        TriggerType::SegmentElevation => ("大腿仰角", "抬高"),
        TriggerType::SegmentExtension => ("大腿後伸", "後伸"),
    }
}

/// Coaching text for a guidance value, worded like the app's zh-Hant strings.
fn guidance_text(g: &Guidance, verb: &str) -> String {
    match *g {
        Guidance::NoData => "等待感測資料…".into(),
        Guidance::Hyperextension { deg } => format!("膝蓋往後伸多了 {deg:.1}°,稍微彎回來就好"),
        Guidance::OverLimit { excess_deg } => format!("超出極限範圍 {excess_deg:.1}°,請立即回落"),
        Guidance::StraightenKnee { excess_deg } => format!("膝蓋再打直 {excess_deg:.1}°"),
        Guidance::Raise { delta_deg } => format!("再{verb} {delta_deg:.1}°"),
        Guidance::Lower { delta_deg } => format!("回降 {delta_deg:.1}° 進入目標區"),
        Guidance::Hold {
            held_sec,
            total_sec,
        } => format!("保持!{held_sec:.1}s / {total_sec:.1}s"),
        Guidance::ReturnToRest { delta_deg } if delta_deg > 0.0 => {
            format!("完成!回到起始位(再回 {delta_deg:.1}°)")
        }
        Guidance::ReturnToRest { .. } => "完成!已回起始位".into(),
    }
}
static FRAME_COUNT: AtomicU32 = AtomicU32::new(0);

#[derive(Clone, Copy)]
struct Receipt {
    monotonic: Instant,
    utc: DateTime<Utc>,
}

impl Receipt {
    fn now() -> Self {
        Self {
            monotonic: Instant::now(),
            utc: Utc::now(),
        }
    }
}

/// Host for `irms_core::ble` (used with `--real-ble`): events go over a channel that the UI
/// timer drains, background work runs on a small tokio runtime, there is no telemetry.
#[derive(Clone)]
struct NativeHost {
    tx: mpsc::Sender<(Receipt, String, Value)>,
    state: Arc<BleState>,
    rt: tokio::runtime::Handle,
    /// Opt-in telemetry; recording is a no-op while it is off.
    telemetry: Arc<irms_core::telemetry::TelemetryState>,
}

impl BleHost for NativeHost {
    fn emit_json(&self, event: &str, payload: Value) {
        let _ = self.tx.send((Receipt::now(), event.to_string(), payload));
    }
    fn record(&self, kind: &str, payload: Value) {
        self.telemetry.record(kind, payload);
    }
    fn ble(&self) -> &BleState {
        &self.state
    }
    fn spawn(&self, task: Pin<Box<dyn Future<Output = ()> + Send>>) {
        self.rt.spawn(task);
    }
}

/// Latest values received from a real device.
#[derive(Default)]
struct RealLink {
    last: Option<Instant>,
    fault: Option<String>,
    connect_error: String,
}

struct Sim {
    preferences: Option<preferences::PreferenceStore>,
    feedback_clock: Instant,
    feedback: SessionFeedback,
    outputs: Option<outputs::Outputs>,
    connection_generation: Option<u64>,
    voice_enabled: bool,
    closing: bool,
    disconnecting: bool,
    t: f64,
    buf: Vec<f64>,
    running: bool,
    hold: f64,
    reps: u32,
    engine: TriggerEngine,
    alarm: bool,
    last_knee: f64,
    last_thigh: f64,
    // Frozen when the session row is created.
    cfg: Option<TriggerConfig>,
    session_started: Instant,
    /// Simulated sensors and what the simulated wearer is doing.
    rig: Rig,
    script: Script,
    wizard: Wizard,
    /// Pre-session wearing check in progress (real device only).
    wearing: Option<WearingCheck>,
    telemetry: Arc<irms_core::telemetry::TelemetryState>,
    /// Result of the calibration wizard; without it only the device's own Euler angles are shown.
    profile: Option<CalibrationProfile>,
    slip: SlipMonitor,
    /// The slip monitor reported that the shin sensor moved during this session.
    mount_shift: bool,
    slip_injected: bool,
    session_s: f64,
    store: Store,
    actions: Vec<CustomAction>,
}

impl Sim {
    fn new(store: Store, actions: Vec<CustomAction>) -> Self {
        Self {
            preferences: None,
            feedback_clock: Instant::now(),
            feedback: SessionFeedback::default(),
            outputs: None,
            connection_generation: None,
            voice_enabled: true,
            closing: false,
            disconnecting: false,
            t: 0.0,
            buf: vec![0.0; SAMPLES],
            running: false,
            hold: 0.0,
            reps: 0,
            engine: TriggerEngine::new(),
            alarm: false,
            last_knee: 0.0,
            last_thigh: 0.0,
            session_started: Instant::now(),
            cfg: None,
            rig: Rig::new(),
            script: Script::Exercise,
            wizard: Wizard::new(None),
            wearing: None,
            telemetry: Arc::new(irms_core::telemetry::TelemetryState::default()),
            profile: None,
            slip: SlipMonitor::new(None),
            mount_shift: false,
            slip_injected: false,
            session_s: 0.0,
            store,
            actions,
        }
    }

    /// Effects 在同一條宿主路徑送出，測試可直接檢查核心 effects 而不啟動硬體。
    fn emit(&mut self, effects: Vec<Effect>) {
        self.alarm = self.feedback.alarm_active;
        if let Some(outputs) = &self.outputs {
            outputs.dispatch(effects, self.connection_generation, self.voice_enabled);
        }
    }
}

fn chart_path(buf: &[f64], w: f64, h: f64) -> String {
    let mut s = String::with_capacity(buf.len() * 12);
    for (i, a) in buf.iter().enumerate() {
        let x = i as f64 / (SAMPLES - 1) as f64 * w;
        let y = h - (a.clamp(0.0, 160.0) / 160.0) * h;
        let _ = write!(s, "{}{x:.1} {y:.1} ", if i == 0 { "M " } else { "L " });
    }
    s
}

/// Side view facing right, in the 300 x 300 stage: the thigh swings from the hip by the thigh
/// pitch (positive = forward), the shin folds back from it by the knee flexion, plus a short foot.
/// Returns the path and the knee position (for the joint marker and the angle label).
fn limb_path(knee_deg: f64, thigh_deg: f64) -> (String, (f64, f64)) {
    let (hx, hy, l) = (110.0, 40.0, 95.0);
    let t = thigh_deg.to_radians();
    let (kx, ky) = (hx + l * t.sin(), hy + l * t.cos());
    let f = (thigh_deg - knee_deg).to_radians();
    let (ax, ay) = (kx + l * f.sin(), ky + l * f.cos());
    let (fx, fy) = (ax + 30.0 * f.cos(), ay - 30.0 * f.sin());
    (
        format!("M {hx} {hy} L {kx:.1} {ky:.1} L {ax:.1} {ay:.1} L {fx:.1} {fy:.1}"),
        (kx, ky),
    )
}

/// Three-quarter projection of a point (x forward, y up, z sideways, in leg-length units) to the stage.
fn project(x: f64, y: f64, z: f64) -> (f64, f64) {
    let (yaw, pitch) = (35f64.to_radians(), 18f64.to_radians());
    let xr = x * yaw.cos() + z * yaw.sin();
    let zr = -x * yaw.sin() + z * yaw.cos();
    let yr = y * pitch.cos() - zr * pitch.sin();
    let depth = 1.0 / (1.0 + 0.12 * (zr * pitch.cos() + y * pitch.sin()));
    (150.0 + xr * 95.0 * depth, 250.0 - yr * 95.0 * depth)
}

fn limb3d_path(knee_deg: f64, thigh_deg: f64) -> String {
    let t = thigh_deg.to_radians();
    let f = (thigh_deg - knee_deg).to_radians();
    let hip = (0.0, 2.1);
    let knee = (hip.0 + 1.05 * t.sin(), hip.1 - 1.05 * t.cos());
    let ankle = (knee.0 + 1.05 * f.sin(), knee.1 - 1.05 * f.cos());
    let toe = (ankle.0 + 0.32 * f.cos(), ankle.1 + 0.32 * f.sin());
    let mut s = String::new();
    // pelvis bar across z, then the leg in the sagittal plane at z = 0.25
    let (ax, ay) = project(hip.0, hip.1, -0.25);
    let _ = write!(s, "M {ax:.1} {ay:.1} ");
    for (x, y) in [hip, knee, ankle, toe] {
        let (px, py) = project(x, y, 0.25);
        let _ = write!(s, "L {px:.1} {py:.1} ");
    }
    s
}

fn grid3d_path() -> String {
    let mut s = String::new();
    for i in -3..=3 {
        let v = i as f64 * 0.5;
        let (a, b) = (project(v, 0.0, -1.5), project(v, 0.0, 1.5));
        let (c, d) = (project(-1.5, 0.0, v), project(1.5, 0.0, v));
        let _ = write!(
            s,
            "M {:.1} {:.1} L {:.1} {:.1} M {:.1} {:.1} L {:.1} {:.1} ",
            a.0, a.1, b.0, b.1, c.0, c.1, d.0, d.1
        );
    }
    s
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1).cloned())
}

fn main() -> Result<(), slint::PlatformError> {
    // 預設資料庫只允許一個執行個體；第二次啟動會把已開啟的視窗帶到前景。指定 --db 的是獨立資料庫。
    let _single = if std::env::args().any(|a| a == "--db") {
        None
    } else {
        match instance::acquire(&format!(
            "IRMS v{} · Native Beta",
            env!("CARGO_PKG_VERSION")
        )) {
            instance::Outcome::Second => return Ok(()),
            instance::Outcome::First(guard) => guard,
        }
    };
    // 安裝後預設採用已驗證的軟體渲染；保留環境變數供開發者切換後端。
    if std::env::var_os("SLINT_BACKEND").is_none() {
        slint::BackendSelector::new()
            .backend_name("winit".into())
            .renderer_name("software".into())
            .select()?;
    }
    let ui = MainWindow::new()?;
    ui.set_release_version(env!("CARGO_PKG_VERSION").into());
    let app = ui.global::<App>();
    app.set_release_version(env!("CARGO_PKG_VERSION").into());
    let live = ui.global::<Live>();
    let theme = ui.global::<Theme>();

    // Prototype switches, mainly for snapshots: --style N, --night, --view N, --settings-tab N,
    // --simulate (simulator instead of the real device), --connected, --calibrated, --mobility-demo, --wizard, --wizard-preset N, --run, --pose N, --search <text>, --db <path>, --action N, --inject-fault, --inject-slip S, --log, --snapshot-after S,
    // --snapshot <png>.
    let args: Vec<String> = std::env::args().collect();
    let has = |n: &str| args.iter().any(|a| a == n);
    let int = |n: &str| arg_value(&args, n).and_then(|v| v.parse::<i32>().ok());
    let log = has("--log");
    if let Some(size) = arg_value(&args, "--window-size") {
        if let Some((width, height)) = size
            .split_once('x')
            .and_then(|(w, h)| Some((w.parse::<u32>().ok()?, h.parse::<u32>().ok()?)))
        {
            ui.window().set_size(slint::PhysicalSize::new(
                width.clamp(1024, 3840),
                height.clamp(680, 2160),
            ));
        }
    }
    app.set_view(int("--view").unwrap_or(0).clamp(0, 4));
    app.set_settings_tab(int("--settings-tab").unwrap_or(0).clamp(0, 5));
    let autorun = has("--run");
    let inject_fault = has("--inject-fault"); // 2 s of ERR:1 every 12 s
                                              // Real device BLE is the default. The simulator runs only when asked for: --simulate or any
                                              // simulator startup option. --real-ble stays as an explicit alias for the default.
    let simulator_flags = [
        "--simulate",
        "--connected",
        "--calibrated",
        "--run",
        "--inject-fault",
        "--inject-slip",
        "--mobility-demo",
    ];
    let wants_simulator = simulator_flags.iter().any(|flag| has(flag));
    if has("--real-ble") && wants_simulator {
        return Err(slint::PlatformError::Other(
            "Real BLE cannot use simulator startup options".into(),
        ));
    }
    let real_mode_flag = !wants_simulator;
    app.set_device_mode(real_mode_flag);
    // --real-ble: the connect button scans for a real IRMS device through irms_core::ble
    // instead of starting the simulator.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("tokio runtime");
    let (ble_tx, ble_rx) = mpsc::channel();
    // Telemetry is opt-in and off at every launch; the uploader idles until it is turned on.
    let telemetry = Arc::new(irms_core::telemetry::TelemetryState::default());
    irms_core::telemetry::spawn_uploader(
        telemetry.clone(),
        runtime.handle(),
        env!("CARGO_PKG_VERSION").into(),
    );
    let sharing = Rc::new(RefCell::new(share_ui::Sharing::new(
        telemetry.clone(),
        runtime.handle(),
        arg_value(&args, "--telemetry-endpoint")
            .unwrap_or_else(|| share_ui::DEFAULT_ENDPOINT.into()),
    )));
    let host = real_mode_flag.then(|| NativeHost {
        tx: ble_tx.clone(),
        state: Arc::new(BleState::default()),
        rt: runtime.handle().clone(),
        telemetry: telemetry.clone(),
    });
    let real = Rc::new(RefCell::new(RealLink::default()));
    if has("--connected") || autorun {
        app.set_conn(2);
    }
    let precalibrate = has("--calibrated") || autorun;
    // Seconds into a session after which the simulated shin sensor turns on the leg.
    let inject_slip = int("--inject-slip").map(f64::from);
    app.set_wizard_open(has("--wizard"));
    // Prescriptions, sessions and the personal range live in the prototype's own database (--db <path>,
    // or :memory: to keep nothing). It is never the Tauri app's database.
    let db_error = |e: rusqlite::Error| slint::PlatformError::Other(e.to_string());
    let mut store = match Store::open(arg_value(&args, "--db")) {
        Ok(store) => store,
        Err(error) => {
            storage_error(&ui, error);
            return ui.run();
        }
    };
    // First launch after the update from the Tauri app: bring its records over (default store only).
    let mut import_notice = String::new();
    if arg_value(&args, "--db").is_none() {
        if let Some(source) = store::tauri_db_path() {
            match store.import_tauri(&source) {
                Ok(Some(r)) => {
                    import_notice = format!(
                        "已從 Tauri 版匯入:{} 場療程、{} 筆讀數、{} 個動作處方、{} 筆活動度。Tauri 版的資料沒有被更動。",
                        r.sessions, r.readings, r.actions, r.mobility
                    );
                }
                Ok(None) => {}
                Err(e) => storage_error(
                    &ui,
                    format!("匯入 Tauri 版資料失敗(原生資料庫未被更動):{e}"),
                ),
            }
        }
    }
    app.set_import_notice(import_notice.into());
    if log {
        println!("database: {}", store.location);
    }
    let stored_actions = store.actions().map_err(db_error)?;
    let mut preferences = preferences::PreferenceStore::open(&store.location);
    let saved = preferences.loaded.clone();
    theme.set_style(int("--style").unwrap_or(saved.style).clamp(0, 2));
    theme.set_night(if has("--day") {
        false
    } else {
        has("--night") || saved.night
    });
    app.set_pose_view(int("--pose").unwrap_or(saved.pose).clamp(0, 2));
    app.set_voice_enabled(if has("--no-voice") {
        false
    } else {
        has("--voice") || saved.voice_enabled
    });
    app.set_preferences_status(preferences.status.clone().into());
    let restored = action_edit::selected_index(&stored_actions, saved.action_id.as_deref())
        .map_or(-1, |i| i as i32);
    let picked = int("--action")
        .map(|i| i.clamp(0, (stored_actions.len() as i32 - 1).max(0)))
        .unwrap_or(restored);
    app.set_action_index(if stored_actions.is_empty() {
        -1
    } else {
        picked
    });
    if let Some(action) = stored_actions.get(picked.max(0) as usize) {
        app.set_active_action_id(action.id.to_string().into());
    }
    preferences.start_run(preference_snapshot(&ui), int("--action").is_none());
    let range = store.latest_range().map_err(db_error)?;
    app.set_comfort(range.comfort.map_or(-1, |v| v.round() as i32));
    app.set_limit(range.limit.map_or(-1, |v| v.round() as i32));
    live.set_grid3d_path(grid3d_path().into());

    // `shown` follows the search box.
    let actions = Rc::new(VecModel::from(
        stored_actions.iter().map(action_item).collect::<Vec<_>>(),
    ));
    app.set_actions(ModelRc::from(actions.clone()));
    let sessions = Rc::new(VecModel::from(session_rows(&store).map_err(db_error)?));
    app.set_sessions(ModelRc::from(sessions.clone()));

    let sim = Rc::new(RefCell::new(Sim::new(store, stored_actions)));
    sim.borrow_mut().telemetry = telemetry.clone();
    {
        // The calibration in force survives a restart; it is replaced only by applying a new one.
        let mut s = sim.borrow_mut();
        if let Some(profile) = s.store.active_profile() {
            s.slip = SlipMonitor::new(Some(profile.limbs.shin.hinge));
            s.profile = Some(profile);
            s.wizard = Wizard::new(s.profile.clone());
            app.set_calibrated(true);
        }
    }
    if has("--mobility-demo") {
        // Same wizard logic as the window on scripted movements, applied through the real store.
        let mut s = sim.borrow_mut();
        let cfg = action_config(&s.actions, 0, AngleLimits::default());
        match pipeline::run_preset(&s.rig, &cfg, irms_core::calibration_flow::Preset::Mobility) {
            Ok(w) => {
                let at = chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
                if let Some(a) = w.apply(&at) {
                    match s.store.apply_calibration(&a.profile, a.mobility.as_ref()) {
                        Ok(_) => {
                            s.slip = SlipMonitor::new(Some(a.profile.limbs.shin.hinge));
                            s.profile = Some(a.profile);
                            app.set_calibrated(true);
                        }
                        Err(e) => println!("mobility demo could not store: {e}"),
                    }
                }
            }
            Err(e) => println!("mobility demo failed: {e}"),
        }
    }
    if let Some(i) = int("--wizard-preset") {
        sim.borrow_mut().wizard.set_preset(i);
    }
    refresh_mobility(&ui, &sim.borrow().store);
    action_ui::wire(&ui, sim.clone(), actions.clone(), sessions.clone());
    if let Some(q) = arg_value(&args, "--search") {
        app.set_search(q.clone().into());
        app.invoke_search_edited(q.into());
    }
    sim.borrow_mut().preferences = Some(preferences);
    wire_preferences(&ui, sim.clone());
    if has("--new-action") {
        app.invoke_new_action();
    }
    if let Some(id) = arg_value(&args, "--edit-action") {
        app.invoke_edit_action(id.into());
    }
    {
        let mut s = sim.borrow_mut();
        s.voice_enabled = app.get_voice_enabled();
        s.outputs = Some(outputs::Outputs::new(
            host.clone(),
            runtime.handle(),
            ble_tx.clone(),
        ));
    }
    {
        let sim = sim.clone();
        live.on_silence_alarm(move || {
            let mut s = sim.borrow_mut();
            let now = s.feedback_clock.elapsed().as_secs_f64() * 1000.0;
            let effects = s.feedback.silence(now);
            s.emit(effects);
        });
    }

    {
        let sim = sim.clone();
        let sessions = sessions.clone();
        let ui_w = ui.as_weak();
        app.on_request_review(move |row| {
            let (Some(ui), Some(target)) = (ui_w.upgrade(), sessions.row_data(row as usize)) else {
                return;
            };
            let s = sim.borrow();
            let text = match s.store.sessions() {
                Ok(rows) => rows
                    .iter()
                    .find(|x| Some(x.id) == target.id.parse().ok())
                    .map_or_else(|| "找不到這場療程".into(), |x| s.store.review(x)),
                Err(e) => format!("讀取失敗：{e}"),
            };
            ui.global::<App>().set_review_summary(text.into());
            ui.global::<App>().set_export_notice("".into());
        });
    }
    {
        // 匯出完整讀數為 CSV：檔案位置由使用者在系統對話框選擇，取消不寫任何東西。
        let sim = sim.clone();
        let sessions = sessions.clone();
        let ui_w = ui.as_weak();
        app.on_export_session(move |row| {
            let (Some(ui), Some(target)) = (ui_w.upgrade(), sessions.row_data(row.max(0) as usize))
            else {
                return;
            };
            let s = sim.borrow();
            let notice = match s.store.sessions() {
                Ok(rows) => match rows.iter().find(|x| Some(x.id) == target.id.parse().ok()) {
                    None => "找不到這場療程".to_string(),
                    Some(session) => match s.store.export_csv(session) {
                        Err(e) => format!("匯出失敗:{e}"),
                        Ok((name, text)) => match rfd::FileDialog::new()
                            .set_file_name(&name)
                            .add_filter("CSV", &["csv"])
                            .save_file()
                        {
                            None => String::new(),
                            Some(path) => match std::fs::write(&path, text) {
                                Ok(()) => format!("已匯出:{}", path.display()),
                                Err(e) => format!("匯出失敗:{e}"),
                            },
                        },
                    },
                },
                Err(e) => format!("讀取失敗:{e}"),
            };
            ui.global::<App>().set_export_notice(notice.into());
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_range_changed(move |comfort, limit| {
            let Some(ui) = ui_w.upgrade() else { return };
            let app = ui.global::<App>();
            let s = sim.borrow();
            if s.store.active() {
                return;
            }
            let result = if comfort < 0 {
                s.store.clear_range()
            } else {
                let measured_limit = (limit >= 0).then(|| f64::from(limit));
                s.store.save_range(f64::from(comfort), measured_limit)
            };
            match result {
                Ok(()) => {
                    app.set_comfort(comfort);
                    app.set_limit(limit);
                    app.set_storage_error("".into());
                }
                Err(e) => storage_error(&ui, e),
            }
        });
    }
    if precalibrate {
        // Same wizard logic as the window, on scripted movements: no faked profile.
        let mut s = sim.borrow_mut();
        let cfg = action_config(
            &s.actions,
            app.get_action_index().max(0) as usize,
            AngleLimits::default(),
        );
        match pipeline::auto_calibrate(&s.rig, &cfg) {
            Ok(profile) => {
                s.slip = SlipMonitor::new(Some(profile.limbs.shin.hinge));
                s.profile = Some(profile);
                app.set_calibrated(true);
            }
            Err(e) => println!("calibration on the simulated rig failed: {e}"),
        }
        if autorun {
            start_session(&ui, &mut s, true);
        }
    }
    let started = Instant::now();
    wire_wizard(&ui, sim.clone(), started);
    share_ui::wire(&ui, sharing.clone());
    let firmware = firmware_ui::FirmwareCheck::default();
    firmware_ui::wire(
        &ui,
        firmware.clone(),
        runtime.handle().clone(),
        host.as_ref().map(|h| h.state.clone()),
    );
    {
        // Test switches for the share path without clicking: --telemetry-on, --share-host, --share-join CODE, --firmware-check.
        let s = sharing.borrow();
        if has("--telemetry-on") || saved.telemetry_on {
            if let Err(e) = s
                .telemetry
                .configure(true, &s.endpoint, env!("CARGO_PKG_VERSION"))
            {
                println!("telemetry refused: {e}");
            }
        }
        if let Some(code) = arg_value(&args, "--share-join") {
            s.viewer
                .join(s.endpoint.clone(), &code, "IRMS 原生版".into());
        }
    }
    if has("--firmware-check") {
        app.invoke_firmware_check();
    }
    if let Some(i) = int("--tools-tab") {
        app.set_tools_tab(i);
    }
    wire_wearing(&ui, sim.clone(), started);

    // Frame counter (GL renderers only), shown in the dock and in --log output.
    let notifier = ui.window().set_rendering_notifier(move |state, _| {
        if matches!(state, slint::RenderingState::AfterRendering) {
            FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
        }
    });
    if log {
        println!("rendering notifier: {notifier:?}");
    }

    // Simulated connection: disconnected -> connecting (1.2 s) -> connected; click again to disconnect.
    let connect_timer = Rc::new(Timer::default());
    {
        let ui_w = ui.as_weak();
        let sim = sim.clone();
        let sessions = sessions.clone();
        let connect_timer = connect_timer.clone();
        let host = host.clone();
        let real = real.clone();
        app.on_request_connect(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let app = ui.global::<App>();
            if sim.borrow().closing || sim.borrow().disconnecting {
                return;
            }
            if let Some(host) = &host {
                // Real device: the result and every later state change arrive as events.
                let h = host.clone();
                if app.get_conn() == 2 {
                    let mut s = sim.borrow_mut();
                    finish_session_with_notice(&ui, &mut s, &sessions, false);
                    let effects = s.feedback.stop();
                    s.emit(effects);
                    s.disconnecting = true;
                    app.set_session_locked(true);
                    app.set_disconnecting(true);
                    if let Some(outputs) = &s.outputs {
                        outputs.disconnect(s.connection_generation, false);
                    }
                } else if app.get_conn() == 0 {
                    app.set_conn(1);
                    real.borrow_mut().connect_error.clear();
                    host.rt.spawn(async move {
                        if let Err(message) = ble::ble_connect(&h, &h.state).await {
                            h.emit_json("native:connect-failed", json!(message));
                        }
                    });
                }
                return;
            }
            if app.get_conn() == 2 {
                finish_session(&ui, &mut sim.borrow_mut(), &sessions);
                app.set_conn(0);
            } else if app.get_conn() == 0 {
                app.set_conn(1);
                let ui_w = ui.as_weak();
                connect_timer.start(
                    TimerMode::SingleShot,
                    Duration::from_millis(1200),
                    move || {
                        if let Some(ui) = ui_w.upgrade() {
                            ui.global::<App>().set_conn(2);
                        }
                    },
                );
            }
        });
    }
    {
        let ui_w = ui.as_weak();
        let sim = sim.clone();
        let sessions = sessions.clone();
        live.on_toggle_run(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            if s.store.active() {
                finish_session(&ui, &mut s, &sessions);
            } else if real_mode_flag && s.wearing.is_none() && session_can_start(&ui, &s, false) {
                // A real device is checked against the stored reference first; the simulator is not.
                if let Some(profile) = s.profile.clone() {
                    s.wearing = Some(WearingCheck::new(profile));
                    ui.global::<App>().set_wearing_open(true);
                }
            } else if s.wearing.is_none() {
                start_session(&ui, &mut s, !real_mode_flag);
            }
        });
    }

    {
        let ui_w = ui.as_weak();
        let sim = sim.clone();
        let sessions = sessions.clone();
        ui.window().on_close_requested(move || {
            if let Some(ui) = ui_w.upgrade() {
                let mut s = sim.borrow_mut();
                if s.closing {
                    return slint::CloseRequestResponse::KeepWindowShown;
                }
                persist_preferences(&ui, &mut s, true);
                ui.global::<App>().set_editor_open(false);
                ui.global::<App>().set_confirmation_open(false);
                if s.store.active() && !finish_session(&ui, &mut s, &sessions) {
                    return slint::CloseRequestResponse::KeepWindowShown;
                }
                if real_mode_flag {
                    s.closing = true;
                    let effects = s.feedback.stop();
                    s.emit(effects);
                    ui.global::<App>().set_closing(true);
                    ui.global::<App>().set_session_locked(true);
                    if let Some(outputs) = &s.outputs {
                        outputs.disconnect(s.connection_generation, true);
                    }
                    return slint::CloseRequestResponse::KeepWindowShown;
                }
            }
            slint::CloseRequestResponse::HideWindow
        });
    }

    // --snapshot <png>: save the renderer's own frame after 3 s (separates "not drawn" from "not shown").
    let snap_timer = Timer::default();
    if let Some(path) = arg_value(&args, "--snapshot") {
        let ui_w = ui.as_weak();
        let after = int("--snapshot-after").unwrap_or(3).max(1) as u64;
        snap_timer.start(
            TimerMode::SingleShot,
            Duration::from_secs(after),
            move || {
                let Some(ui) = ui_w.upgrade() else { return };
                match ui.window().take_snapshot() {
                    Ok(buf) => {
                        let r = image::save_buffer(
                            &path,
                            buf.as_bytes(),
                            buf.width(),
                            buf.height(),
                            image::ColorType::Rgba8,
                        );
                        println!("snapshot {}x{}: {r:?}", buf.width(), buf.height());
                    }
                    Err(e) => println!("snapshot failed: {e}"),
                }
            },
        );
    }

    let mut last_frames = 0u32;
    let mut last_report = Instant::now();
    // --share-host waits until telemetry has delivered something: the collector only shares a run that is ingesting.
    let mut share_host_pending = has("--share-host");
    let mut last_tick = Instant::now();
    let mut ticks = 0u32;

    let real_mode = host.is_some();
    let ui_w = ui.as_weak();
    let timer = Timer::default();
    timer.start(
        TimerMode::Repeated,
        Duration::from_millis((1000.0 / HZ) as u64),
        move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let app = ui.global::<App>();
            let live = ui.global::<Live>();
            let mut s = sim.borrow_mut();
            // Real elapsed time, not a nominal 1/HZ: the UI timer does not fire at exactly 50 Hz.
            let dt = last_tick.elapsed().as_secs_f64().min(0.25);
            last_tick = Instant::now();
            s.t += dt;
            persist_preferences(&ui, &mut s, false);
            if s.voice_enabled != app.get_voice_enabled() {
                s.voice_enabled = app.get_voice_enabled();
                if !s.voice_enabled {
                    s.emit(vec![Effect::StopSpeech]);
                }
            }
            ticks += 1;
            let lim = |v: i32| (v >= 0).then_some(f64::from(v));
            let limits = AngleLimits {
                comfort: lim(app.get_comfort()),
                limit: lim(app.get_limit()),
            };
            let cfg = s.cfg.unwrap_or_else(|| {
                action_config(&s.actions, app.get_action_index().max(0) as usize, limits)
            });
            let limits = cfg.limits;
            let wizard_open = app.get_wizard_open();
            let mut link = real.borrow_mut();
            while let Ok((receipt, event, payload)) = ble_rx.try_recv() {
                match event.as_str() {
                    "ble:connection" => {
                        let up = payload["connected"].as_bool().unwrap_or(false);
                        let was_running = s.running;
                        if !up {
                            if s.running {
                                finish_session_with_notice(&ui, &mut s, &sessions, false);
                            }
                            s.wizard = Wizard::new(s.profile.clone());
                            s.wearing = None;
                            app.set_wearing_open(false);
                            app.set_wizard_open(false);
                        }
                        if up {
                            s.connection_generation = payload["generation"].as_u64();
                            app.set_device_name(
                                payload["deviceName"].as_str().unwrap_or("IRMS 裝置").into(),
                            );
                            app.set_feedback_error("".into());
                            let effects = s.feedback.connected();
                            s.emit(effects);
                        } else {
                            s.connection_generation = None;
                            let mut effects = s.feedback.disconnected();
                            if !was_running {
                                effects.retain(|e| !matches!(e, Effect::Speak(_)));
                            }
                            s.emit(effects);
                        }
                        *link = RealLink::default();
                        app.set_conn(if up { 2 } else { 0 });
                    }
                    "native:connect-failed" => {
                        link.connect_error = payload.as_str().unwrap_or("連線失敗").to_string();
                        app.set_conn(0);
                    }
                    "native:voice-status" => {
                        app.set_voice_status(payload.as_str().unwrap_or("").into())
                    }
                    "native:feedback-wait" => {
                        app.set_feedback_error(payload.as_str().unwrap_or("等待裝置回應").into())
                    }
                    "native:disconnected" => {
                        s.disconnecting = false;
                        app.set_disconnecting(false);
                        app.set_session_locked(s.store.active());
                        if let Some(error) = payload["error"].as_str() {
                            app.set_feedback_error(format!("裝置收尾失敗：{error}").into());
                        }
                    }
                    "native:feedback-error"
                        if payload["generation"].as_u64() == s.connection_generation =>
                    {
                        app.set_feedback_error(
                            payload["message"].as_str().unwrap_or("裝置回饋失敗").into(),
                        );
                        if s.store.active() {
                            finish_session(&ui, &mut s, &sessions);
                        }
                    }
                    "native:shutdown" => {
                        if let Some(error) = payload["error"].as_str() {
                            app.set_feedback_error(
                                format!("裝置收尾失敗：{error}，可再次關閉重試").into(),
                            );
                            s.closing = false;
                            app.set_closing(false);
                            app.set_session_locked(s.store.active());
                        } else {
                            persist_preferences(&ui, &mut s, true);
                            let _ = ui.hide();
                            let _ = slint::quit_event_loop();
                            return;
                        }
                    }
                    "ble:error" => {
                        sample_fault(&mut s, &mut link, payload.as_str().unwrap_or("BLE error"))
                    }
                    "ble:packet" if app.get_conn() == 2 => match payload["kind"].as_str() {
                        Some("angles") => {
                            match serde_json::from_value::<RawAngles>(payload["raw"].clone()) {
                                Ok(raw) => accept_sample(
                                    &ui, &mut s, &mut link, &cfg, raw, receipt, started,
                                ),
                                Err(_) => sample_fault(&mut s, &mut link, "無效的角度封包"),
                            }
                        }
                        Some("error") => sample_fault(
                            &mut s,
                            &mut link,
                            payload["code"].as_str().unwrap_or("BLE error"),
                        ),
                        Some("malformed") => sample_fault(&mut s, &mut link, "無效的角度封包"),
                        _ => {}
                    },
                    _ => {}
                }
            }
            let connected = app.get_conn() == 2;
            let (metric_label, verb) = metric_words(cfg.trigger_type);

            // With the wizard open and nothing being captured, the simulated wearer stands still.
            if wizard_open && !s.wizard.capturing() && s.script == Script::Exercise {
                s.script = Script::Still;
            }
            if let (Some(after), false) = (inject_slip, s.slip_injected) {
                if s.running && s.session_s > after {
                    s.rig.slip_shin(25.0);
                    s.slip_injected = true;
                }
            }

            if !real_mode && connected {
                let (hip, knee) = pipeline::pose(s.script, s.t, &cfg);
                let text = if inject_fault && (s.t % 12.0) > 10.0 {
                    "ERR:1".into()
                } else {
                    pipeline::packet_abd(&s.rig, hip, knee, pipeline::abduction(s.script, s.t))
                };
                match parse_angle_packet(&text) {
                    ParsedPacket::Angles { raw, .. } => {
                        accept_sample(&ui, &mut s, &mut link, &cfg, raw, Receipt::now(), started)
                    }
                    ParsedPacket::Error { code } => sample_fault(&mut s, &mut link, &code),
                    ParsedPacket::Malformed { .. } => {
                        sample_fault(&mut s, &mut link, "無效的角度封包")
                    }
                }
            }
            let stale = real_mode
                && link.last.is_none_or(|t| {
                    t.elapsed().as_secs_f64() * 1000.0 > irms_core::judge::ENGINE_MAX_SAMPLE_GAP_MS
                });
            if connected && stale && link.fault.is_none() {
                sample_fault(&mut s, &mut link, "等待新的量測");
            }
            let hw_error = link.fault.as_deref().or(stale.then_some("等待新的量測"));
            app.set_valid_angle(connected && hw_error.is_none());
            sync_wizard(&app, &s.wizard, started.elapsed().as_secs_f64() * 1000.0);
            sync_wearing(
                &app,
                s.wearing.as_ref(),
                started.elapsed().as_secs_f64() * 1000.0,
            );

            let angle = s.last_knee;
            let thigh = s.last_thigh;
            let input = EngineInput::from_angles(angle, thigh, &cfg);
            let zone = compute_metric_zone(&cfg);
            let value = input.sample.value;
            if s.running {
                s.session_s += dt;
            }
            let phase = s.engine.phase();
            let guidance = compute_guidance(
                connected.then_some(&input.sample),
                &zone,
                phase,
                s.hold * 100.0,
                cfg.hold_time_ms,
                &limits,
            );
            let hold_s = cfg.hold_time_ms / 1000.0;
            {
                let sharing = sharing.borrow();
                if sharing.host.state().status == irms_core::share_session::HostStatus::Sharing {
                    let now = chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
                    let trigger = match cfg.trigger_type {
                        TriggerType::JointAngle => "joint_angle",
                        TriggerType::SegmentElevation => "segment_elevation",
                        TriggerType::SegmentExtension => "segment_extension",
                    };
                    sharing.host.set_snapshot(share_ui::snapshot(
                        &share_ui::SnapshotInput {
                            connected,
                            demo: !real_mode,
                            hardware_error: hw_error,
                            trigger_type: trigger,
                            metric_label,
                            metric_unit: "°",
                            value: connected.then_some(value),
                            knee: angle,
                            thigh,
                            target_angle: cfg.target_angle,
                            tolerance: cfg.tolerance,
                            hold_time_ms: cfg.hold_time_ms,
                            zone_min: zone.min,
                            zone_max: zone.max,
                            zone_rest: zone.rest,
                            comfort: limits.comfort,
                            limit: limits.limit,
                            running: s.running,
                            reps: s.reps,
                            hold_progress: s.hold * 100.0,
                            in_zone: s.running && phase == EnginePhase::Holding,
                            alarm_active: s.alarm,
                            over_comfort: connected && limits.comfort.is_some_and(|c| angle > c),
                            elapsed_s: s.session_s,
                            phase: match phase {
                                EnginePhase::Idle => "idle",
                                EnginePhase::Holding => "holding",
                                EnginePhase::RestPending => "restPending",
                            },
                        },
                        &now,
                    ));
                }
                if share_host_pending && sharing.telemetry.status().sent > 0 {
                    share_host_pending = false;
                    sharing.host.start(
                        sharing.endpoint.clone(),
                        sharing.telemetry.run_id().to_string(),
                        true,
                    );
                }
                share_ui::sync(&app, &sharing);
                firmware_ui::sync(&app, &firmware);
            }

            // State contract kept from v3: fault and personal limit first, blocking conditions, then coaching.
            let (title, sub, tone): (String, String, i32) = if !connected {
                if app.get_conn() == 1 {
                    ("連線中…".into(), "正在尋找裝置(最長 15 秒)".into(), 0)
                } else if !link.connect_error.is_empty() {
                    ("連線失敗".into(), link.connect_error.clone(), 2)
                } else {
                    ("裝置未連線".into(), "請從右上角連線裝置".into(), 0)
                }
            } else if let Some(code) = &hw_error {
                (
                    "感測器異常".into(),
                    format!("裝置回報 {code},請檢查感測器接線後重新連線"),
                    2,
                )
            } else if matches!(
                guidance,
                Guidance::Hyperextension { .. } | Guidance::OverLimit { .. }
            ) {
                (
                    guidance_text(&guidance, verb),
                    "安全優先,先回到舒適範圍".into(),
                    2,
                )
            } else if !app.get_calibrated() {
                (
                    "尚未校準".into(),
                    "未校準時無法開始療程,請先完成校準精靈".into(),
                    3,
                )
            } else if !s.running {
                (
                    "準備開始".into(),
                    "確認動作與參數後按「開始療程」".into(),
                    0,
                )
            } else {
                match phase {
                    EnginePhase::Holding => (
                        "很好,保持這個位置".into(),
                        format!("已進入目標區間,保持滿 {hold_s:.1} 秒"),
                        1,
                    ),
                    EnginePhase::RestPending => (
                        "已完成,請回到起始位".into(),
                        guidance_text(&guidance, verb),
                        1,
                    ),
                    EnginePhase::Idle if s.mount_shift => (
                        guidance_text(&guidance, verb),
                        "感測器可能移位,這場結束後請重新校準".into(),
                        3,
                    ),
                    EnginePhase::Idle => (guidance_text(&guidance, verb), String::new(), 0),
                }
            };
            let right = if s.running && phase == EnginePhase::Holding {
                format!(
                    "再保持 {:.1} 秒 · 第 {} 次",
                    hold_s * (1.0 - s.hold),
                    s.reps + 1
                )
            } else {
                String::new()
            };

            let zone_text = if zone.max.is_finite() {
                format!("{:.0}–{:.0}°", zone.min, zone.max)
            } else {
                format!("≥ {:.0}°", zone.min)
            };
            let frac = |v: f64| (v.clamp(0.0, RULER_MAX) / RULER_MAX) as f32;
            app.set_angle(angle as f32);
            app.set_angle_text(format!("{angle:.0}°").into());
            live.set_metric_label(metric_label.into());
            // Rounding first and adding 0.0 turns a negative zero into zero, so a resting leg never reads "-0".
            live.set_metric_text(if hw_error.is_some() {
                "—".into()
            } else {
                format!("{:.0}°", value.round() + 0.0).into()
            });
            live.set_zone_text(zone_text.clone().into());
            live.set_zone_lo(frac(zone.min));
            live.set_zone_hi(frac(if zone.max.is_finite() {
                zone.max
            } else {
                RULER_MAX
            }));
            live.set_ruler_is_knee(cfg.trigger_type == TriggerType::JointAngle);
            live.set_subtitle(
                format!("{metric_label} · 目標 {zone_text} · 保持 {hold_s:.1} 秒").into(),
            );
            live.set_coach_title(title.into());
            live.set_coach_sub(sub.into());
            live.set_coach_tone(tone);
            live.set_coach_right(right.into());
            live.set_ruler_pos(frac(value));
            live.set_knee_label(format!("{:.0}°", 180.0 - angle).into());
            live.set_hold(s.hold as f32);
            live.set_alarm_active(s.feedback.alarm_active);
            live.set_alarm_silenced(
                s.feedback
                    .silenced(s.feedback_clock.elapsed().as_secs_f64() * 1000.0),
            );
            live.set_reps_text(format!("{} 次", s.reps).into());
            live.set_hold_text(format!("{:.1} / {hold_s:.1} 秒", s.hold * hold_s).into());
            let t = s.session_s as u64;
            live.set_time_text(format!("{:02}:{:02}", t / 60, t % 60).into());
            // Only the live screen draws the pose and the trend; skip the path strings elsewhere.
            if connected && app.get_view() == 0 {
                let (path, (kx, ky)) = limb_path(angle, thigh);
                live.set_limb_path(path.into());
                live.set_knee_x(kx as f32);
                live.set_knee_y(ky as f32);
                live.set_limb3d_path(limb3d_path(angle, thigh).into());
                live.set_chart_path(
                    chart_path(&s.buf, live.get_chart_w() as f64, live.get_chart_h() as f64).into(),
                );
            }

            if last_report.elapsed() >= Duration::from_secs(1) {
                let f = FRAME_COUNT.load(Ordering::Relaxed);
                let dt = last_report.elapsed().as_secs_f64();
                let fps = (f - last_frames) as f64 / dt;
                let tick_rate = ticks as f64 / dt;
                ticks = 0;
                last_frames = f;
                last_report = Instant::now();
                if log {
                    println!("tick {tick_rate:.1} Hz, frames {fps:.1} fps, angle {angle:.1}");
                    let sh = sharing.borrow();
                    let (h, v) = (sh.host.state(), sh.viewer.state());
                    if h.code.is_some() || h.error.is_some() || v.live.is_some() || v.error.is_some() {
                        println!(
                            "share host {:?} code {:?} viewers {} | viewer {:?} metric {:?} err {:?} | telemetry {:?}",
                            h.status,
                            h.code,
                            h.viewers.len(),
                            v.status,
                            v.live.as_ref().map(|l| l["metric"]["value"].clone()),
                            v.error,
                            sh.telemetry.status().sent
                        );
                    }
                }
                live.set_stats(
                    format!(
                        "介面更新 {tick_rate:.0} Hz · 畫面 {fps:.0} fps · 已執行 {:.0} 秒",
                        started.elapsed().as_secs_f64()
                    )
                    .into(),
                );
            }
        },
    );

    ui.run()
}

fn refresh_mobility(ui: &MainWindow, store: &Store) {
    use irms_core::calibration_flow::{
        movement_from_name, record_from_row, trend_with_breaks, TrendEntry,
    };
    let app = ui.global::<App>();
    let Ok(rows) = store.mobility_rows() else {
        app.set_mobility_latest("讀取活動度紀錄失敗".into());
        app.set_mobility_history(ModelRc::default());
        return;
    };
    let records: Vec<_> = rows.iter().map(record_from_row).collect();
    let Some(latest) = records.first() else {
        app.set_mobility_latest("尚無活動度紀錄".into());
        app.set_mobility_history(ModelRc::default());
        return;
    };
    let names = latest
        .movement_set
        .iter()
        .filter_map(|n| movement_from_name(n))
        .map(wizard::movement_label)
        .collect::<Vec<_>>()
        .join("、");
    let entries = trend_with_breaks(&records, latest);
    let best = entries
        .iter()
        .filter_map(|e| {
            if let TrendEntry::Record(i) = e {
                Some(records[*i].total_deg)
            } else {
                None
            }
        })
        .fold(f64::MIN, f64::max);
    let side = match latest.identity.side.as_deref() {
        Some("left") => " · 左腿",
        Some("right") => " · 右腿",
        _ => "",
    };
    app.set_mobility_latest(
        format!(
            "最新合計 {:.0}° · 最佳 {:.0}° · {}{side}
動作:{names}",
            latest.total_deg,
            best.max(latest.total_deg),
            local_minute(&latest.measured_at)
        )
        .into(),
    );
    let lines: Vec<slint::SharedString> = entries
        .iter()
        .rev()
        .take(10)
        .map(|e| match e {
            TrendEntry::MethodBreak => "—— 量測方式不同,以上不可直接比較 ——".into(),
            TrendEntry::Record(i) => format!(
                "{} · {:.0}°",
                local_minute(&records[*i].measured_at),
                records[*i].total_deg
            )
            .into(),
        })
        .collect();
    app.set_mobility_history(ModelRc::from(Rc::new(VecModel::from(lines))));
}

fn local_minute(iso: &str) -> String {
    DateTime::parse_from_rfc3339(iso)
        .or_else(|_| DateTime::parse_from_rfc3339(&format!("{}Z", iso.trim_end_matches('Z'))))
        .map(|d| {
            d.with_timezone(&chrono::Local)
                .format("%Y-%m-%d %H:%M")
                .to_string()
        })
        .unwrap_or_else(|_| iso.to_string())
}

fn sync_wizard(app: &App, w: &Wizard, now_ms: f64) {
    app.set_wizard_page(w.page());
    app.set_wizard_title(w.title().into());
    app.set_wizard_body(w.body().into());
    app.set_wizard_label(w.step_label().into());
    app.set_wizard_progress(w.progress(now_ms) as f32);
    app.set_wizard_busy(w.capturing());
    app.set_wizard_step_done(w.step_done);
    app.set_wizard_status(w.status.clone().into());
    app.set_wizard_tone(w.tone);
    app.set_wizard_result(w.result.clone().into());
    app.set_wizard_seconds(w.capture_seconds() as f32);
    app.set_wizard_side(w.side_index());
    app.set_wizard_preset(w.preset_index());
    app.set_wizard_neutral(w.flow.neutral);
    app.set_wizard_posture(w.posture_index());
    app.set_wizard_posture_name(wizard::posture_label(w.posture).into());
    app.set_wizard_has_stored(w.has_stored());
    app.set_wizard_can_begin(w.can_begin());
    app.set_wizard_can_skip(w.can_skip());
    app.set_wizard_can_apply(w.can_apply());
    app.set_wizard_can_redo(w.can_redo());
    app.set_wizard_can_save_mobility(w.can_save_mobility());
    app.set_wizard_save_mobility(w.save_mobility);
}

fn wire_wizard(ui: &MainWindow, sim: Rc<RefCell<Sim>>, started: Instant) {
    let app = ui.global::<App>();
    let now_ms = move || started.elapsed().as_secs_f64() * 1000.0;
    {
        let sim = sim.clone();
        app.on_wizard_set_side(move |i| sim.borrow_mut().wizard.set_side(i));
    }
    {
        let sim = sim.clone();
        app.on_wizard_set_preset(move |i| sim.borrow_mut().wizard.set_preset(i));
    }
    {
        let sim = sim.clone();
        app.on_wizard_set_neutral(move |n| sim.borrow_mut().wizard.set_neutral(n));
    }
    {
        let sim = sim.clone();
        app.on_wizard_set_posture(move |i| sim.borrow_mut().wizard.set_posture(i));
    }
    {
        let sim = sim.clone();
        app.on_wizard_begin(move || sim.borrow_mut().wizard.begin());
    }
    {
        let sim = sim.clone();
        app.on_wizard_start(move || {
            let mut s = sim.borrow_mut();
            // The simulated wearer performs the movement this step asks for.
            s.script = pipeline::script_for(&s.wizard, s.t);
            s.wizard.start(now_ms());
        });
    }
    {
        let sim = sim.clone();
        app.on_wizard_next(move || sim.borrow_mut().wizard.next());
    }
    {
        let sim = sim.clone();
        app.on_wizard_skip(move || sim.borrow_mut().wizard.skip());
    }
    {
        let sim = sim.clone();
        app.on_wizard_recapture(move || sim.borrow_mut().wizard.recapture());
    }
    {
        let sim = sim.clone();
        app.on_wizard_redo(move || sim.borrow_mut().wizard.redo());
    }
    {
        let sim = sim.clone();
        app.on_wizard_toggle_save(move || sim.borrow_mut().wizard.toggle_save_mobility());
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wizard_apply(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            let measured_at = chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true);
            let Some(applied) = s.wizard.apply(&measured_at) else {
                return;
            };
            // The stored row comes first: a calibration that could not be recorded is not applied.
            let mobility_saved = match s
                .store
                .apply_calibration(&applied.profile, applied.mobility.as_ref())
            {
                Ok(saved) => saved,
                Err(e) => {
                    s.wizard.status = format!("校準未能儲存:{e}");
                    s.wizard.tone = 2;
                    return;
                }
            };
            s.slip = SlipMonitor::new(Some(applied.profile.limbs.shin.hinge));
            s.profile = Some(applied.profile);
            s.wizard = Wizard::new(s.profile.clone());
            s.script = Script::Exercise;
            let app = ui.global::<App>();
            app.set_calibrated(true);
            app.set_wizard_open(false);
            refresh_mobility(&ui, &s.store);
            if !mobility_saved {
                storage_error(&ui, "校準已套用,但活動度紀錄未能儲存");
            }
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wizard_cancel(move || {
            let mut s = sim.borrow_mut();
            s.wizard = Wizard::new(s.profile.clone());
            s.script = Script::Exercise;
            if let Some(ui) = ui_w.upgrade() {
                ui.global::<App>().set_wizard_open(false);
            }
        });
    }
}

fn sync_wearing(app: &App, check: Option<&WearingCheck>, now_ms: f64) {
    let Some(c) = check else { return };
    app.set_wearing_page(c.page());
    app.set_wearing_body(c.body().into());
    app.set_wearing_progress(c.progress(now_ms) as f32);
    app.set_wearing_verdict(match c.verdict() {
        None => 0,
        Some(Verdict::Ok) => 1,
        Some(Verdict::Inconclusive) => 2,
        Some(Verdict::Rezero) => 3,
        Some(Verdict::Recalibrate) => 4,
        Some(Verdict::TooFar) => 5,
    });
}

fn wire_wearing(ui: &MainWindow, sim: Rc<RefCell<Sim>>, started: Instant) {
    let app = ui.global::<App>();
    let now_ms = move || started.elapsed().as_secs_f64() * 1000.0;
    let close = |ui: &MainWindow, s: &mut Sim| {
        s.wearing = None;
        ui.global::<App>().set_wearing_open(false);
    };
    {
        let sim = sim.clone();
        app.on_wearing_begin(move || {
            if let Some(c) = sim.borrow_mut().wearing.as_mut() {
                c.begin(now_ms());
            }
        });
    }
    {
        let sim = sim.clone();
        app.on_wearing_retry(move || {
            if let Some(c) = sim.borrow_mut().wearing.as_mut() {
                c.retry();
            }
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wearing_cancel(move || {
            if let Some(ui) = ui_w.upgrade() {
                close(&ui, &mut sim.borrow_mut());
            }
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wearing_start_anyway(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            close(&ui, &mut s);
            start_session(&ui, &mut s, false);
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wearing_recalibrate(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            close(&ui, &mut s);
            ui.global::<App>().set_wizard_open(true);
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wearing_rezero(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            let now = chrono::Utc::now();
            let id = wizard::new_calibration_id();
            let at = now.to_rfc3339_opts(SecondsFormat::Millis, true);
            let Some(check) = s.wearing.as_ref() else {
                return;
            };
            let fixed = match check.rezeroed(&id, &at) {
                Ok(p) => p,
                Err(why) => {
                    storage_error(&ui, why);
                    close(&ui, &mut s);
                    return;
                }
            };
            // Stored first, like the wizard: a calibration that could not be recorded is not applied.
            if let Err(e) = s.store.apply_calibration(&fixed, None) {
                storage_error(&ui, e);
                close(&ui, &mut s);
                return;
            }
            s.slip = SlipMonitor::new(Some(fixed.limbs.shin.hinge));
            s.profile = Some(fixed);
            s.wizard = Wizard::new(s.profile.clone());
            close(&ui, &mut s);
            start_session(&ui, &mut s, false);
        });
    }
}

fn storage_error(ui: &MainWindow, error: impl std::fmt::Display) {
    ui.global::<App>()
        .set_storage_error(format!("儲存或讀取失敗：{error}").into());
}

/// UI 快照僅包含使用者偏好，不儲存連線、校準或療程暫態。
fn preference_snapshot(ui: &MainWindow) -> preferences::Preferences {
    let app = ui.global::<App>();
    let theme = ui.global::<Theme>();
    let id = app.get_active_action_id();
    preferences::Preferences {
        style: theme.get_style(),
        night: theme.get_night(),
        pose: app.get_pose_view(),
        voice_enabled: app.get_voice_enabled(),
        action_id: (!id.is_empty()).then(|| id.to_string()),
        telemetry_on: app.get_telemetry_on(),
        ..preferences::Preferences::default()
    }
}
fn persist_preferences(ui: &MainWindow, s: &mut Sim, force: bool) {
    let current = preference_snapshot(ui);
    if let Some(preferences) = s.preferences.as_mut() {
        preferences.observe(current);
        if let Err(error) = preferences.flush(force) {
            if force {
                eprintln!("{error}");
            }
        }
        ui.global::<App>()
            .set_preferences_status(preferences.status.clone().into());
        ui.global::<App>()
            .set_preferences_can_retry(preferences.can_retry());
    }
}
fn wire_preferences(ui: &MainWindow, sim: Rc<RefCell<Sim>>) {
    let app = ui.global::<App>();
    {
        let sim = sim.clone();
        let weak = ui.as_weak();
        app.on_retry_preferences(move || {
            if let Some(ui) = weak.upgrade() {
                persist_preferences(&ui, &mut sim.borrow_mut(), true);
            }
        });
    }
}
/// 由 ID 綁定的確認流程呼叫，成功寫檔後才變更畫面。
fn reset_preferences(ui: &MainWindow, s: &mut Sim) -> Result<(), String> {
    let app = ui.global::<App>();
    if s.store.active() || s.closing || s.disconnecting || app.get_wizard_open() {
        return Err("請先完成療程與收尾".into());
    }
    let selected = action_edit::selected_index(&s.actions, None);
    let value = preferences::Preferences {
        action_id: selected.map(|i| s.actions[i].id.to_string()),
        // Resetting display preferences must not silently change the data-sharing choice.
        telemetry_on: app.get_telemetry_on(),
        ..preferences::Preferences::default()
    };
    if let Some(preferences) = s.preferences.as_mut() {
        preferences.reset(value.clone())?;
    }
    let theme = ui.global::<Theme>();
    theme.set_style(value.style);
    theme.set_night(value.night);
    app.set_pose_view(value.pose);
    app.set_voice_enabled(value.voice_enabled);
    app.set_action_index(selected.map_or(-1, |i| i as i32));
    app.set_active_action_id(value.action_id.unwrap_or_default().into());
    app.set_preferences_status("".into());
    app.set_preferences_can_retry(false);
    Ok(())
}

fn refresh_history(
    ui: &MainWindow,
    store: &Store,
    sessions: &VecModel<SessionRow>,
) -> rusqlite::Result<()> {
    set_history_rows(ui, sessions, session_rows(store)?);
    Ok(())
}
fn set_history_rows(ui: &MainWindow, sessions: &VecModel<SessionRow>, rows: Vec<SessionRow>) {
    let app = ui.global::<App>();
    app.set_review(-1);
    app.set_history_page(
        app.get_history_page().min(
            (rows.len().saturating_sub(1) / app.get_history_page_size().max(1) as usize) as i32,
        ),
    );
    sessions.set_vec(rows);
}

/// Whether a session may start right now (nothing else owns the device, a calibration is in force).
fn session_can_start(ui: &MainWindow, s: &Sim, simulated: bool) -> bool {
    let app = ui.global::<App>();
    !(s.closing
        || app.get_editor_open()
        || app.get_confirmation_open()
        || s.disconnecting
        || (!simulated && !app.get_valid_angle())
        || app.get_conn() != 2
        || app.get_wizard_open()
        || s.profile.is_none()
        || s.store.active())
}

fn start_session(ui: &MainWindow, s: &mut Sim, simulated: bool) {
    let app = ui.global::<App>();
    if !session_can_start(ui, s, simulated) {
        return;
    }
    let index = app.get_action_index() as usize;
    let Some(mut action) = s.actions.get(index).cloned() else {
        storage_error(ui, "請先選擇動作");
        return;
    };
    let limits = match s.store.latest_range() {
        Ok(limits) => limits,
        Err(e) => {
            storage_error(ui, e);
            return;
        }
    };
    let effective = action_config(&s.actions, index, limits);
    action.target_angle = effective.target_angle;
    action.tolerance = effective.tolerance;
    action.hold_time_ms = effective.hold_time_ms as i64;
    let calibration = serde_json::to_value(&s.profile).expect("serializable calibration");
    if let Err(e) = s
        .store
        .start_session(&action, &limits, calibration, simulated)
    {
        storage_error(ui, e);
        return;
    }
    s.cfg = Some(action_config(&s.actions, index, limits));
    s.session_started = Instant::now();
    s.running = true;
    s.hold = 0.0;
    s.reps = 0;
    s.session_s = 0.0;
    s.engine.reset();
    let effects = s.feedback.start();
    s.emit(effects);
    s.alarm = false;
    s.mount_shift = false;
    s.slip_injected = false;
    s.slip = SlipMonitor::new(s.profile.as_ref().map(|p| p.limbs.shin.hinge));
    app.set_storage_error("".into());
    app.set_session_locked(true);
    ui.global::<Live>().set_running(true);
    s.telemetry.log(
        "session_start",
        serde_json::json!({ "simulated": simulated, "triggerType": s.cfg.map(|c| c.trigger_type as u8) }),
    );
}

fn stop_collection(ui: &MainWindow, s: &mut Sim) {
    s.store.stop_recording();
    s.telemetry.log(
        "session_end",
        serde_json::json!({ "reps": s.reps, "seconds": s.session_s.round() }),
    );
    s.running = false;
    s.hold = 0.0;
    s.engine.reset();
    let effects = s.feedback.stop();
    s.emit(effects);
    ui.global::<Live>().set_running(false);
    ui.global::<App>().set_save_pending(true);
}

fn finish_session(ui: &MainWindow, s: &mut Sim, sessions: &VecModel<SessionRow>) -> bool {
    finish_session_with_notice(ui, s, sessions, true)
}

fn finish_session_with_notice(
    ui: &MainWindow,
    s: &mut Sim,
    sessions: &VecModel<SessionRow>,
    announce: bool,
) -> bool {
    if !s.store.active() {
        return true;
    }
    stop_collection(ui, s);
    if let Err(e) = s.store.end_session(s.reps) {
        storage_error(ui, e);
        return false;
    }
    s.cfg = None;
    if announce {
        if let Some(outputs) = &s.outputs {
            outputs.saved(s.reps, s.voice_enabled);
        }
    }
    let app = ui.global::<App>();
    app.set_save_pending(false);
    app.set_session_locked(false);
    app.set_storage_error("".into());
    if let Err(e) = refresh_history(ui, &s.store, sessions) {
        storage_error(ui, e);
    }
    true
}

fn sample_fault(s: &mut Sim, link: &mut RealLink, message: &str) {
    if link.fault.as_deref() != Some(message) {
        let effects = s.feedback.fault();
        s.emit(effects);
    }
    link.fault = Some(message.into());
    s.engine.reset();
    s.hold = 0.0;
}

fn accept_sample(
    ui: &MainWindow,
    s: &mut Sim,
    link: &mut RealLink,
    cfg: &TriggerConfig,
    raw: RawAngles,
    receipt: Receipt,
    started: Instant,
) {
    let vector = |v: irms_core::protocol::AccelVector| Vec3 {
        x: v.x,
        y: v.y,
        z: v.z,
    };
    let vectors = raw.thigh_accel.map(vector).zip(raw.shin_accel.map(vector));
    let received = receipt.monotonic;
    let now_ms = received.saturating_duration_since(started).as_secs_f64() * 1000.0;
    link.last = Some(received);
    link.fault = None;
    let app = ui.global::<App>();
    if s.wearing.as_ref().is_some_and(WearingCheck::sampling) {
        let done = s
            .wearing
            .as_mut()
            .is_some_and(|c| c.push(now_ms, vectors.map(|v| v.0), vectors.map(|v| v.1)));
        if done && s.wearing.as_ref().and_then(|c| c.verdict()) == Some(&Verdict::Ok) {
            // Worn as calibrated: nothing to ask, the session starts.
            s.wearing = None;
            app.set_wearing_open(false);
            start_session(ui, s, false);
        }
    }
    if app.get_wizard_open()
        && s.wizard
            .push(now_ms, vectors.map(|v| v.0), vectors.map(|v| v.1))
    {
        s.script = Script::Still;
    }
    let (angle, thigh) = match (&s.profile, vectors) {
        (Some(p), Some((tv, sv))) => (
            knee_signed(p.limbs.thigh.as_ref(), &p.limbs.shin, tv, sv),
            p.limbs
                .thigh
                .as_ref()
                .map_or(0.0, |f| limb_angles(f, tv).pitch),
        ),
        _ => (raw.thigh - raw.shin, raw.thigh),
    };
    s.last_knee = angle;
    s.last_thigh = thigh;
    let roll = raw.shin_roll - raw.thigh_roll;
    app.set_thigh_text(format!("{thigh:.0}°").into());
    app.set_shin_text(format!("{:.0}°", thigh - angle).into());
    app.set_roll_text(format!("{roll:.0}°").into());
    if s.profile.is_some() && vectors.is_none() {
        sample_fault(s, link, "缺少校準所需的重力向量");
        return;
    }
    let input = EngineInput::from_angles(angle, thigh, cfg);
    if s.buf.len() >= SAMPLES {
        s.buf.remove(0);
    }
    s.buf.push(input.sample.value);
    if s.closing
        || s.disconnecting
        || (s.store.active() && !s.running)
        || (s.running && received < s.session_started)
    {
        return;
    }
    if let (true, Some((tv, sv))) = (s.running, vectors) {
        if s.slip.push(now_ms, Some(tv), Some(sv)).is_some() {
            if !s.mount_shift {
                let feedback_ms = received
                    .saturating_duration_since(s.feedback_clock)
                    .as_secs_f64()
                    * 1000.0;
                let effects = s.feedback.mount_shift(feedback_ms);
                s.emit(effects);
            }
            s.mount_shift = true;
        }
    }
    let previous_reps = s.reps;
    let events = s.engine.handle(&input, now_ms);
    for event in &events {
        match event {
            EngineEvent::HoldProgress(p) => s.hold = *p / 100.0,
            EngineEvent::RestCompleted => s.hold = 0.0,
            _ => {}
        }
    }
    let feedback_ms = received
        .saturating_duration_since(s.feedback_clock)
        .as_secs_f64()
        * 1000.0;
    let effects = s.feedback.handle(&events, feedback_ms);
    s.emit(effects);
    s.reps = s.feedback.reps();
    if !s.running {
        s.hold = 0.0;
        return;
    }
    let result = s.store.push_reading(SensorReading {
        knee_angle: angle,
        thigh_angle: thigh,
        shin_angle: thigh - angle,
        knee_roll: roll,
        thigh_roll: raw.thigh_roll,
        shin_roll: raw.shin_roll,
        timestamp: receipt.utc.to_rfc3339_opts(SecondsFormat::Millis, true),
    });
    let result = result.and_then(|_| {
        if previous_reps != s.reps {
            s.store.set_reps(s.reps)
        } else {
            Ok(())
        }
    });
    if let Err(e) = result {
        stop_collection(ui, s);
        storage_error(ui, e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use slint::platform::software_renderer::{MinimalSoftwareWindow, RepaintBufferType};
    use slint::platform::{Platform, WindowAdapter};

    struct TestPlatform;
    impl Platform for TestPlatform {
        fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, slint::PlatformError> {
            Ok(MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer))
        }
    }

    #[test]
    fn calibrated_packets_preserve_order_and_interrupt_holds() {
        slint::platform::set_platform(Box::new(TestPlatform)).unwrap();
        let ui = MainWindow::new().unwrap();
        let store = Store::open(Some(":memory:".into())).unwrap();
        let actions = store.actions().unwrap();
        let index = actions
            .iter()
            .position(|a| a.trigger_type == "joint_angle")
            .unwrap();
        let mut s = Sim::new(store, actions);
        let cfg = action_config(&s.actions, index, AngleLimits::default());
        s.profile = Some(pipeline::auto_calibrate(&s.rig, &cfg).unwrap());
        let app = ui.global::<App>();
        app.set_conn(2);
        app.set_valid_angle(true);
        app.set_action_index(index as i32);
        start_session(&ui, &mut s, false);
        let start = s.session_started;
        let mut link = RealLink::default();
        let wall = Utc::now();
        let ParsedPacket::Angles { raw, .. } =
            parse_angle_packet(&pipeline::packet(&s.rig, 0.0, cfg.target_angle))
        else {
            panic!()
        };
        let deliver = |s: &mut Sim, link: &mut RealLink, ms: u64, packet: RawAngles| {
            accept_sample(
                &ui,
                s,
                link,
                &cfg,
                packet,
                Receipt {
                    monotonic: start + Duration::from_millis(ms),
                    utc: wall + chrono::Duration::milliseconds(ms as i64),
                },
                start,
            );
        };
        deliver(&mut s, &mut link, 0, raw);
        deliver(&mut s, &mut link, 4000, raw);
        assert_eq!(s.reps, 0);
        deliver(&mut s, &mut link, 4020, raw);
        sample_fault(&mut s, &mut link, "ERR:1");
        assert_eq!(s.engine.phase(), EnginePhase::Idle);
        deliver(&mut s, &mut link, 4040, raw);
        let mut missing = raw;
        missing.shin_accel = None;
        deliver(&mut s, &mut link, 4060, missing);
        assert_eq!(s.engine.phase(), EnginePhase::Idle);
        let sessions = VecModel::default();
        assert!(finish_session(&ui, &mut s, &sessions));
        let session = s.store.sessions().unwrap().remove(0);
        assert_eq!(session.source, "device");
        assert_eq!(session.reps_completed, 0);
        assert!(s.store.review(&session).contains("4 筆讀數"));
        // 完整一回合後回位必須清掉進度；停止也不能留下 RestPending。
        start_session(&ui, &mut s, false);
        for i in 0..101 {
            deliver(&mut s, &mut link, 8000 + i * 40, raw);
        }
        assert_eq!(s.reps, 1);
        assert_eq!(s.engine.phase(), EnginePhase::RestPending);
        let ParsedPacket::Angles { raw: resting, .. } =
            parse_angle_packet(&pipeline::packet(&s.rig, 0.0, 0.0))
        else {
            panic!()
        };
        for i in 0..25 {
            deliver(&mut s, &mut link, 12040 + i * 40, resting);
        }
        assert_eq!(s.engine.phase(), EnginePhase::Idle);
        assert_eq!(s.hold, 0.0);
        assert!(finish_session(&ui, &mut s, &sessions));
        assert_eq!(s.engine.phase(), EnginePhase::Idle);
        assert!(!s.alarm);
        // 儲存與判定必須使用相同的鉗制值，而非留下不可能重現的處方快照。
        s.actions[index].target_angle = f64::NAN;
        s.actions[index].tolerance = -1.0;
        s.actions[index].hold_time_ms = 0;
        start_session(&ui, &mut s, false);
        let effective = s.cfg.unwrap();
        assert_eq!(
            (
                effective.target_angle,
                effective.tolerance,
                effective.hold_time_ms
            ),
            (45.0, 1.0, 500.0)
        );
        assert!(finish_session(&ui, &mut s, &sessions));
        let saved = s
            .store
            .sessions()
            .unwrap()
            .into_iter()
            .max_by_key(|row| row.id)
            .unwrap();
        assert_eq!(
            (saved.target_angle, saved.tolerance, saved.hold_time_ms),
            (Some(45.0), Some(1.0), Some(500))
        );
        action_ui::exercise_crud_and_confirmation_flow(&ui);

        // 穿戴檢查：與校準一致時直接開始療程；位置不同時留在檢查畫面，由使用者決定。
        let profile = s.profile.clone().unwrap();
        let hold_pose = |s: &mut Sim, link: &mut RealLink, shin: Vec3| {
            let mut ms = 20_000u64;
            while s.wearing.as_ref().is_some_and(WearingCheck::sampling) {
                ms += 40;
                let vec = |v: Vec3| irms_core::protocol::AccelVector {
                    x: v.x,
                    y: v.y,
                    z: v.z,
                };
                let mut r = raw;
                r.thigh_accel = Some(vec(profile.reference.thigh));
                r.shin_accel = Some(vec(shin));
                accept_sample(
                    &ui,
                    s,
                    link,
                    &cfg,
                    r,
                    Receipt {
                        monotonic: start + Duration::from_millis(ms),
                        utc: wall + chrono::Duration::milliseconds(ms as i64),
                    },
                    start,
                );
                // The wizard clock in `accept_sample` is the receipt time since `start`; the check began
                // at the same clock, so it finishes after SAMPLE_MS of receipts.
                let _ = ms;
            }
        };
        s.wearing = Some(WearingCheck::new(profile.clone()));
        s.wearing.as_mut().unwrap().begin(20_000.0);
        app.set_wearing_open(true);
        hold_pose(&mut s, &mut link, profile.reference.shin);
        assert!(s.wearing.is_none(), "matching pose closes the check");
        assert!(!app.get_wearing_open());
        assert!(s.store.active(), "and starts the session");
        assert!(finish_session(&ui, &mut s, &sessions));
        // A pose 40 degrees off the reference does not start anything.
        let shifted = {
            let a = profile.limbs.shin.hinge;
            let v = profile.reference.shin;
            let (sn, c) = 40f64.to_radians().sin_cos();
            let k = Vec3 {
                x: a.y * v.z - a.z * v.y,
                y: a.z * v.x - a.x * v.z,
                z: a.x * v.y - a.y * v.x,
            };
            let d = (a.x * v.x + a.y * v.y + a.z * v.z) * (1.0 - c);
            Vec3 {
                x: v.x * c + k.x * sn + a.x * d,
                y: v.y * c + k.y * sn + a.y * d,
                z: v.z * c + k.z * sn + a.z * d,
            }
        };
        s.wearing = Some(WearingCheck::new(profile.clone()));
        s.wearing.as_mut().unwrap().begin(20_000.0);
        hold_pose(&mut s, &mut link, shifted);
        assert!(s.wearing.is_some(), "a shifted sensor waits for the wearer");
        assert_eq!(
            s.wearing.as_ref().unwrap().verdict(),
            Some(&Verdict::TooFar)
        );
        assert!(!s.store.active());
    }
}
