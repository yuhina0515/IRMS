#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Native prototype with an isolated SQLite database and simulated or BLE input.
use irms_core::angle_math::Vec3;
use irms_core::ble::{self, BleHost, BleState};
use irms_core::calibration::{knee_signed, limb_angles, CalibrationProfile};
use irms_core::judge::{
    compute_guidance, compute_metric_zone, AngleLimits, EngineEvent, EngineInput, EnginePhase, Guidance,
    TriggerConfig, TriggerEngine, TriggerType,
};
use irms_core::protocol::{parse_angle_packet, ParsedPacket, RawAngles};
use chrono::{DateTime, SecondsFormat, Utc};
use irms_core::slip_monitor::SlipMonitor;
use irms_core::types::{CustomAction, SensorReading};
use pipeline::{Rig, Script, Wizard};
use store::Store;
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::sync::{mpsc, Arc};
use slint::{ComponentHandle, Model, ModelRc, Timer, TimerMode, VecModel};
use std::cell::RefCell;
use std::fmt::Write;
use std::rc::Rc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

mod pipeline;
mod store;

slint::include_modules!();

const HZ: f64 = 50.0;
const SAMPLES: usize = 250; // 5 s window
const RULER_MAX: f64 = 160.0;

/// Judging configuration of a stored prescription plus the user's own measured range.
fn action_config(actions: &[CustomAction], index: usize, limits: AngleLimits) -> TriggerConfig {
    match actions.get(index.min(actions.len().saturating_sub(1))) {
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
    }
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
    Ok(store
        .sessions()?
        .iter().filter(|x| x.end_time.is_some())
        .map(|x| SessionRow {
            id: x.id.to_string().into(),
            started: store::local_start(x).into(),
            action: x.action_name.clone().unwrap_or_default().into(),
            reps: x.reps_completed as i32,
            duration: store::duration(x).into(),
            demo: x.source == "demo",
            summary: Default::default(),
        })
        .collect())
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
        Guidance::Hold { held_sec, total_sec } => format!("保持!{held_sec:.1}s / {total_sec:.1}s"),
        Guidance::ReturnToRest { delta_deg } if delta_deg > 0.0 => format!("完成!回到起始位(再回 {delta_deg:.1}°)"),
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
        Self { monotonic: Instant::now(), utc: Utc::now() }
    }
}

/// Host for `irms_core::ble` (used with `--real-ble`): events go over a channel that the UI
/// timer drains, background work runs on a small tokio runtime, there is no telemetry.
#[derive(Clone)]
struct NativeHost {
    tx: mpsc::Sender<(Receipt, String, Value)>,
    state: Arc<BleState>,
    rt: tokio::runtime::Handle,
}

impl BleHost for NativeHost {
    fn emit_json(&self, event: &str, payload: Value) {
        let _ = self.tx.send((Receipt::now(), event.to_string(), payload));
    }
    fn record(&self, _kind: &str, _payload: Value) {}
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
            wizard: Wizard::new(),
            profile: None,
            slip: SlipMonitor::new(None),
            mount_shift: false,
            slip_injected: false,
            session_s: 0.0,
            store,
            actions,
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
    (format!("M {hx} {hy} L {kx:.1} {ky:.1} L {ax:.1} {ay:.1} L {fx:.1} {fy:.1}"), (kx, ky))
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
        let _ = write!(s, "M {:.1} {:.1} L {:.1} {:.1} M {:.1} {:.1} L {:.1} {:.1} ", a.0, a.1, b.0, b.1, c.0, c.1, d.0, d.1);
    }
    s
}

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;
    let app = ui.global::<App>();
    let live = ui.global::<Live>();
    let theme = ui.global::<Theme>();

    // Prototype switches, mainly for snapshots: --style N, --night, --view N, --settings-tab N,
    // --connected, --calibrated, --run, --wizard, --pose N, --search <text>, --db <path>, --action N, --inject-fault, --inject-slip S, --log, --snapshot-after S,
    // --snapshot <png>.
    let args: Vec<String> = std::env::args().collect();
    let has = |n: &str| args.iter().any(|a| a == n);
    let int = |n: &str| arg_value(&args, n).and_then(|v| v.parse::<i32>().ok());
    let log = has("--log");
    if let Some(n) = int("--style") {
        theme.set_style(n.clamp(0, 2));
    }
    theme.set_night(has("--night"));
    app.set_view(int("--view").unwrap_or(0).clamp(0, 4));
    app.set_settings_tab(int("--settings-tab").unwrap_or(0).clamp(0, 5));
    let autorun = has("--run");
    let inject_fault = has("--inject-fault"); // 2 s of ERR:1 every 12 s
    let real_mode_flag = has("--real-ble");
    if real_mode_flag && ["--connected", "--calibrated", "--run", "--inject-fault", "--inject-slip"].iter().any(|flag| has(flag)) {
        return Err(slint::PlatformError::Other("Real BLE cannot use simulator startup options".into()));
    }
    app.set_device_mode(real_mode_flag);
    // --real-ble: the connect button scans for a real IRMS device through irms_core::ble
    // instead of starting the simulator.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("tokio runtime");
    let (ble_tx, ble_rx) = mpsc::channel();
    let host = has("--real-ble").then(|| NativeHost {
        tx: ble_tx.clone(),
        state: Arc::new(BleState::default()),
        rt: runtime.handle().clone(),
    });
    let real = Rc::new(RefCell::new(RealLink::default()));
    if has("--connected") || autorun {
        app.set_conn(2);
    }
    let precalibrate = has("--calibrated") || autorun;
    // Seconds into a session after which the simulated shin sensor turns on the leg.
    let inject_slip = int("--inject-slip").map(f64::from);
    app.set_wizard_open(has("--wizard"));
    app.set_pose_view(int("--pose").unwrap_or(0).clamp(0, 2));
    // Prescriptions, sessions and the personal range live in the prototype's own database (--db <path>,
    // or :memory: to keep nothing). It is never the Tauri app's database.
    let db_error = |e: rusqlite::Error| slint::PlatformError::Other(e.to_string());
    let store = match Store::open(arg_value(&args, "--db")) {
        Ok(store) => store,
        Err(error) => { storage_error(&ui, error); return ui.run(); }
    };
    if log {
        println!("database: {}", store.location);
    }
    let stored_actions = store.actions().map_err(db_error)?;
    let default_action = stored_actions.iter().position(|a| a.trigger_type == "joint_angle").unwrap_or(0) as i32;
    app.set_action_index(int("--action").unwrap_or(default_action).clamp(0, (stored_actions.len() as i32 - 1).max(0)));
    let range = store.latest_range().map_err(db_error)?;
    app.set_comfort(range.comfort.map_or(-1, |v| v.round() as i32));
    app.set_limit(range.limit.map_or(-1, |v| v.round() as i32));
    live.set_grid3d_path(grid3d_path().into());

    // `shown` follows the search box.
    let actions = Rc::new(VecModel::from(stored_actions.iter().map(action_item).collect::<Vec<_>>()));
    app.set_actions(ModelRc::from(actions.clone()));
    {
        let actions = actions.clone();
        app.on_search_edited(move |q| {
            let q = q.trim().to_lowercase();
            for i in 0..actions.row_count() {
                if let Some(mut a) = actions.row_data(i) {
                    a.shown = q.is_empty()
                        || a.name.to_lowercase().contains(&q)
                        || a.kind.contains(q.as_str())
                        || a.note.contains(q.as_str());
                    actions.set_row_data(i, a);
                }
            }
        });
    }
    if let Some(q) = arg_value(&args, "--search") {
        app.set_search(q.clone().into());
        app.invoke_search_edited(q.into());
    }

    let sessions = Rc::new(VecModel::from(session_rows(&store).map_err(db_error)?));
    app.set_sessions(ModelRc::from(sessions.clone()));

    let sim = Rc::new(RefCell::new(Sim::new(store, stored_actions)));

    {
        let sim = sim.clone();
        let sessions = sessions.clone();
        let ui_w = ui.as_weak();
        app.on_delete_session(move |row| {
            let Some(ui) = ui_w.upgrade() else {return};
            let Some(target) = sessions.row_data(row as usize) else { return };
            let s = sim.borrow();
            if let Ok(id) = target.id.parse() {
                let result = s.store.delete_session(id).and_then(|_| refresh_history(&ui, &s.store, &sessions));
                if let Err(e) = result { storage_error(&ui, e); }
            }
        });
    }
    {
        let sim = sim.clone();
        let sessions = sessions.clone();
        let ui_w = ui.as_weak();
        app.on_request_review(move |row| {
            let (Some(ui), Some(target)) = (ui_w.upgrade(), sessions.row_data(row as usize)) else { return };
            let s = sim.borrow();
            let text = match s.store.sessions() {
                Ok(rows) => rows.iter().find(|x| Some(x.id) == target.id.parse().ok()).map_or_else(|| "找不到這場療程".into(), |x| s.store.review(x)),
                Err(e) => format!("讀取失敗：{e}"),
            };
            ui.global::<App>().set_review_summary(text.into());
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_range_changed(move |comfort, limit| {
            let Some(ui) = ui_w.upgrade() else { return };
            let app = ui.global::<App>();
            let s = sim.borrow();
            if s.store.active() { return; }
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
        let cfg = action_config(&s.actions, app.get_action_index().max(0) as usize, AngleLimits::default());
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
    {
        let sim = sim.clone();
        app.on_wizard_start(move || {
            let mut s = sim.borrow_mut();
            let now_ms = started.elapsed().as_secs_f64() * 1000.0;
            // The simulated wearer performs the movement this step asks for.
            let t = s.t;
            s.script = match s.wizard.step {
                0 => Script::Still,
                1 => Script::ThighRaise(t),
                _ => Script::KneeCurl(t),
            };
            s.wizard.start(now_ms);
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wizard_next(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let mut s = sim.borrow_mut();
            if s.wizard.step < 2 || (s.wizard.step == 2 && s.wizard.profile.is_none()) {
                s.wizard.next();
                return;
            }
            if s.wizard.step == 2 {
                s.wizard.next(); // to the result page
                return;
            }
            // Result page accepted: the profile becomes the active calibration.
            if let Some(profile) = s.wizard.profile.take() {
                s.slip = SlipMonitor::new(Some(profile.limbs.shin.hinge));
                s.profile = Some(profile);
                ui.global::<App>().set_calibrated(true);
            }
            s.wizard = Wizard::new();
            s.script = Script::Exercise;
            ui.global::<App>().set_wizard_open(false);
        });
    }
    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        app.on_wizard_cancel(move || {
            let mut s = sim.borrow_mut();
            s.wizard = Wizard::new();
            s.script = Script::Exercise;
            if let Some(ui) = ui_w.upgrade() {
                ui.global::<App>().set_wizard_open(false);
            }
        });
    }

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
            if let Some(host) = &host {
                // Real device: the result and every later state change arrive as events.
                let h = host.clone();
                if app.get_conn() == 2 {
                    finish_session(&ui, &mut sim.borrow_mut(), &sessions);
                    host.rt.spawn(async move {
                        let _ = ble::ble_disconnect(&h, &h.state).await;
                    });
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
                connect_timer.start(TimerMode::SingleShot, Duration::from_millis(1200), move || {
                    if let Some(ui) = ui_w.upgrade() {
                        ui.global::<App>().set_conn(2);
                    }
                });
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
            } else {
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
                if s.store.active() && !finish_session(&ui, &mut s, &sessions) {
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
        snap_timer.start(TimerMode::SingleShot, Duration::from_secs(after), move || {
            let Some(ui) = ui_w.upgrade() else { return };
            match ui.window().take_snapshot() {
                Ok(buf) => {
                    let r = image::save_buffer(&path, buf.as_bytes(), buf.width(), buf.height(), image::ColorType::Rgba8);
                    println!("snapshot {}x{}: {r:?}", buf.width(), buf.height());
                }
                Err(e) => println!("snapshot failed: {e}"),
            }
        });
    }

    let mut last_frames = 0u32;
    let mut last_report = Instant::now();
    let mut last_tick = Instant::now();
    let mut ticks = 0u32;

    let real_mode = host.is_some();
    let ui_w = ui.as_weak();
    let timer = Timer::default();
    timer.start(TimerMode::Repeated, Duration::from_millis((1000.0 / HZ) as u64), move || {
        let Some(ui) = ui_w.upgrade() else { return };
        let app = ui.global::<App>();
        let live = ui.global::<Live>();
        let mut s = sim.borrow_mut();
        // Real elapsed time, not a nominal 1/HZ: the UI timer does not fire at exactly 50 Hz.
        let dt = last_tick.elapsed().as_secs_f64().min(0.25);
        last_tick = Instant::now();
        s.t += dt;
        ticks += 1;
        let lim = |v: i32| (v >= 0).then_some(f64::from(v));
        let limits = AngleLimits { comfort: lim(app.get_comfort()), limit: lim(app.get_limit()) };
        let cfg = s.cfg.unwrap_or_else(|| action_config(&s.actions, app.get_action_index().max(0) as usize, limits));
        let limits = cfg.limits;
        let wizard_open = app.get_wizard_open();
        let mut link = real.borrow_mut();
        while let Ok((receipt, event, payload)) = ble_rx.try_recv() {
            match event.as_str() {
                "ble:connection" => {
                    let up = payload["connected"].as_bool().unwrap_or(false);
                    if !up {
                        if s.running { finish_session(&ui, &mut s, &sessions); }
                        s.wizard = Wizard::new();
                        s.profile = None;
                        app.set_calibrated(false);
                        app.set_wizard_open(false);
                    }
                    *link = RealLink::default();
                    app.set_conn(if up { 2 } else { 0 });
                }
                "native:connect-failed" => {
                    link.connect_error = payload.as_str().unwrap_or("連線失敗").to_string();
                    app.set_conn(0);
                }
                "ble:error" => sample_fault(&mut s, &mut link, payload.as_str().unwrap_or("BLE error")),
                "ble:packet" if app.get_conn() == 2 => match payload["kind"].as_str() {
                    Some("angles") => match serde_json::from_value::<RawAngles>(payload["raw"].clone()) {
                        Ok(raw) => accept_sample(&ui, &mut s, &mut link, &cfg, raw, receipt, started),
                        Err(_) => sample_fault(&mut s, &mut link, "無效的角度封包"),
                    },
                    Some("error") => sample_fault(&mut s, &mut link, payload["code"].as_str().unwrap_or("BLE error")),
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
                pipeline::packet(&s.rig, hip, knee)
            };
            match parse_angle_packet(&text) {
                ParsedPacket::Angles { raw, .. } => accept_sample(&ui, &mut s, &mut link, &cfg, raw, Receipt::now(), started),
                ParsedPacket::Error { code } => sample_fault(&mut s, &mut link, &code),
                ParsedPacket::Malformed { .. } => sample_fault(&mut s, &mut link, "無效的角度封包"),
            }
        }
        let stale = real_mode && link.last.is_none_or(|t| t.elapsed().as_secs_f64() * 1000.0 > irms_core::judge::ENGINE_MAX_SAMPLE_GAP_MS);
        let hw_error = link.fault.as_deref().or(stale.then_some("等待新的量測"));
        app.set_valid_angle(connected && hw_error.is_none());
        app.set_wizard_step(s.wizard.step);
        app.set_wizard_progress(s.wizard.progress(started.elapsed().as_secs_f64() * 1000.0) as f32);
        app.set_wizard_busy(s.wizard.capturing());
        app.set_wizard_step_done(s.wizard.step_done);
        app.set_wizard_status(s.wizard.status.clone().into());
        app.set_wizard_tone(s.wizard.tone);
        app.set_wizard_result(s.wizard.result.clone().into());
        app.set_wizard_seconds(s.wizard.capture_seconds() as f32);

        let angle = s.last_knee;
        let thigh = s.last_thigh;
        let input = EngineInput::from_angles(angle, thigh, &cfg);
        let zone = compute_metric_zone(&cfg);
        let value = input.sample.value;
        if s.running { s.session_s += dt; }
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
            ("感測器異常".into(), format!("裝置回報 {code},請檢查感測器接線後重新連線"), 2)
        } else if matches!(guidance, Guidance::Hyperextension { .. } | Guidance::OverLimit { .. }) {
            (guidance_text(&guidance, verb), "安全優先,先回到舒適範圍".into(), 2)
        } else if !app.get_calibrated() {
            ("尚未校準".into(), "未校準時無法開始療程,請先完成校準精靈".into(), 3)
        } else if !s.running {
            ("準備開始".into(), "確認動作與參數後按「開始療程」".into(), 0)
        } else {
            match phase {
                EnginePhase::Holding => ("很好,保持這個位置".into(), format!("已進入目標區間,保持滿 {hold_s:.1} 秒"), 1),
                EnginePhase::RestPending => ("已完成,請回到起始位".into(), guidance_text(&guidance, verb), 1),
                EnginePhase::Idle if s.mount_shift => {
                    (guidance_text(&guidance, verb), "感測器可能移位,這場結束後請重新校準".into(), 3)
                }
                EnginePhase::Idle => (guidance_text(&guidance, verb), String::new(), 0),
            }
        };
        let right = if s.running && phase == EnginePhase::Holding {
            format!("再保持 {:.1} 秒 · 第 {} 次", hold_s * (1.0 - s.hold), s.reps + 1)
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
        live.set_metric_text(if hw_error.is_some() { "—".into() } else { format!("{:.0}°", value.round() + 0.0).into() });
        live.set_zone_text(zone_text.clone().into());
        live.set_zone_lo(frac(zone.min));
        live.set_zone_hi(frac(if zone.max.is_finite() { zone.max } else { RULER_MAX }));
        live.set_ruler_is_knee(cfg.trigger_type == TriggerType::JointAngle);
        live.set_subtitle(format!("{metric_label} · 目標 {zone_text} · 保持 {hold_s:.1} 秒").into());
        live.set_coach_title(title.into());
        live.set_coach_sub(sub.into());
        live.set_coach_tone(tone);
        live.set_coach_right(right.into());
        live.set_ruler_pos(frac(value));
        live.set_knee_label(format!("{:.0}°", 180.0 - angle).into());
        live.set_hold(s.hold as f32);
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
            live.set_chart_path(chart_path(&s.buf, live.get_chart_w() as f64, live.get_chart_h() as f64).into());
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
            }
            live.set_stats(
                format!("介面更新 {tick_rate:.0} Hz · 畫面 {fps:.0} fps · 已執行 {:.0} 秒", started.elapsed().as_secs_f64()).into(),
            );
        }
    });

    ui.run()
}

fn storage_error(ui: &MainWindow, error: impl std::fmt::Display) {
    ui.global::<App>()
        .set_storage_error(format!("儲存或讀取失敗：{error}").into());
}

fn refresh_history(
    ui: &MainWindow,
    store: &Store,
    sessions: &VecModel<SessionRow>,
) -> rusqlite::Result<()> {
    let rows = session_rows(store)?;
    let app = ui.global::<App>();
    app.set_review(-1);
    app.set_history_page(
        app.get_history_page()
            .min((rows.len().saturating_sub(1) / 8) as i32),
    );
    sessions.set_vec(rows);
    Ok(())
}

fn start_session(ui: &MainWindow, s: &mut Sim, simulated: bool) {
    let app = ui.global::<App>();
    if app.get_conn() != 2 || app.get_wizard_open() || s.profile.is_none() || s.store.active() {
        return;
    }
    let index = app.get_action_index() as usize;
    let Some(action) = s.actions.get(index) else {
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
    let calibration = serde_json::to_value(&s.profile).expect("serializable calibration");
    if let Err(e) = s
        .store
        .start_session(action, &limits, calibration, simulated)
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
    s.alarm = false;
    s.mount_shift = false;
    s.slip_injected = false;
    s.slip = SlipMonitor::new(s.profile.as_ref().map(|p| p.limbs.shin.hinge));
    app.set_storage_error("".into());
    app.set_session_locked(true);
    ui.global::<Live>().set_running(true);
}

fn stop_collection(ui: &MainWindow, s: &mut Sim) {
    s.store.stop_recording();
    s.running = false;
    s.hold = 0.0;
    ui.global::<Live>().set_running(false);
    ui.global::<App>().set_save_pending(true);
}

fn finish_session(ui: &MainWindow, s: &mut Sim, sessions: &VecModel<SessionRow>) -> bool {
    if !s.store.active() {
        return true;
    }
    stop_collection(ui, s);
    if let Err(e) = s.store.end_session(s.reps) {
        storage_error(ui, e);
        return false;
    }
    s.cfg = None;
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
    if !s.running || received < s.session_started {
        return;
    }
    if let Some((tv, sv)) = vectors {
        if s.slip.push(now_ms, Some(tv), Some(sv)).is_some() {
            s.mount_shift = true;
        }
    }
    let previous_reps = s.reps;
    for event in s.engine.handle(&input, now_ms) {
        match event {
            EngineEvent::HoldProgress(p) => s.hold = p / 100.0,
            EngineEvent::RepCompleted => s.reps += 1,
            EngineEvent::OverExtension(on) => s.alarm = on,
            _ => {}
        }
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
                Receipt { monotonic: start + Duration::from_millis(ms), utc: wall + chrono::Duration::milliseconds(ms as i64) },
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
    }
}
