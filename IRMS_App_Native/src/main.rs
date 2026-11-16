#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// IRMS native prototype (doc/plans/2026-11-16-rust-native-ui-plan.md, phases 1 and 2): every screen
// on simulated sensor data. Not connected to the shipping app, the device or the database.
use irms_core::ble::{self, BleHost, BleState};
use irms_core::judge::{
    compute_guidance, compute_metric_zone, AngleLimits, EngineEvent, EngineInput, EnginePhase, Guidance,
    TriggerConfig, TriggerEngine, TriggerType,
};
use irms_core::protocol::{parse_angle_packet, ParsedPacket};
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

slint::include_modules!();

const HZ: f64 = 50.0;
const SAMPLES: usize = 250; // 5 s window
const RULER_MAX: f64 = 160.0;

/// Built-in prescriptions (the shipping app's defaults): name, kind label, trigger type, target,
/// tolerance, hold time in ms, note.
const ACTIONS: [(&str, &str, TriggerType, f64, f64, f64, &str); 3] = [
    ("Backward Extension (直膝後擺)", "肢段後伸", TriggerType::SegmentExtension, 20.0, 8.0, 2000.0, "站姿,膝蓋伸直向後擺腿。"),
    ("Squat (深蹲屈膝)", "關節角度", TriggerType::JointAngle, 90.0, 10.0, 3000.0, "雙腳與肩同寬,緩慢下蹲到目標角度後保持。"),
    ("Straight Leg Raise (直膝抬腿)", "肢段抬高", TriggerType::SegmentElevation, 45.0, 10.0, 3000.0, "仰臥,膝蓋伸直抬腿到目標高度後保持。"),
];

fn action_config(index: usize, limits: AngleLimits) -> TriggerConfig {
    let (_, _, trigger_type, target_angle, tolerance, hold_time_ms, _) = ACTIONS[index.min(ACTIONS.len() - 1)];
    TriggerConfig { target_angle, tolerance, hold_time_ms, trigger_type, limits }
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

/// Host for `irms_core::ble` (used with `--real-ble`): events go over a channel that the UI
/// timer drains, background work runs on a small tokio runtime, there is no telemetry.
#[derive(Clone)]
struct NativeHost {
    tx: mpsc::Sender<(String, Value)>,
    state: Arc<BleState>,
    rt: tokio::runtime::Handle,
}

impl BleHost for NativeHost {
    fn emit_json(&self, event: &str, payload: Value) {
        let _ = self.tx.send((event.to_string(), payload));
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
    angle: f64,
    thigh: f64,
    shin: f64,
    roll: f64,
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
    session_s: f64,
    session_no: u32,
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

/// Simulated movement, 0..1: a rep cycle of bend 2 s, hold `hold_s` + 1.5 s, return 2 s, rest 1.5 s.
/// Every fifth rep overshoots (returns 1.4).
fn sim_effort(t: f64, hold_s: f64) -> f64 {
    let top = hold_s + 1.5;
    let cycle = 2.0 + top + 2.0 + 1.5;
    let n = (t / cycle).floor() as u64;
    let p = t % cycle;
    let peak = if n % 5 == 4 { 1.4 } else { 1.0 };
    let ease = |x: f64| 0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos();
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

/// The simulated device speaks the real wire format (same text the ESP32 notifies), so the
/// prototype exercises `irms_core::protocol` exactly as the shipping app does. The movement
/// follows the selected prescription: knee flexion, thigh raise, or thigh extension.
fn sim_packet(t: f64, fault: bool, cfg: &TriggerConfig) -> String {
    if fault {
        return "ERR:1".to_string();
    }
    let effort = sim_effort(t, cfg.hold_time_ms / 1000.0);
    let tremor = 0.8 * (t * 37.0).sin() + 1.0 * (t * 2.3).sin();
    let (thigh, knee) = match cfg.trigger_type {
        TriggerType::JointAngle => (6.0 + 3.0 * (t * 0.7).sin(), 8.0 + (cfg.target_angle - 10.0) * effort + tremor),
        TriggerType::SegmentElevation => (3.0 + (cfg.target_angle + 4.0) * effort + tremor, 5.0 + 2.0 * (t * 0.9).sin()),
        TriggerType::SegmentExtension => (-(2.0 + (cfg.target_angle + 4.0) * effort) + tremor, 3.0 + 1.5 * (t * 0.9).sin()),
    };
    let shin = thigh + knee;
    let (tr, sr) = (1.5 + 0.5 * (t * 0.9).sin(), -1.2 + 0.6 * (t * 1.1).sin());
    format!("T:{thigh:.1},S:{shin:.1},K:{knee:.1},TR:{tr:.1},SR:{sr:.1},KR:{:.1}", sr - tr)
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
    // --connected, --calibrated, --run, --wizard, --pose N, --search <text>, --seed-history, --action N, --inject-fault, --log, --snapshot-after S,
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
    // --real-ble: the connect button scans for a real IRMS device through irms_core::ble
    // instead of starting the simulator.
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
        .expect("tokio runtime");
    let (ble_tx, ble_rx) = mpsc::channel::<(String, Value)>();
    let host = has("--real-ble").then(|| NativeHost {
        tx: ble_tx.clone(),
        state: Arc::new(BleState::default()),
        rt: runtime.handle().clone(),
    });
    let real = Rc::new(RefCell::new(RealLink::default()));
    if has("--connected") || autorun {
        app.set_conn(2);
    }
    app.set_calibrated(has("--calibrated") || autorun);
    app.set_wizard_open(has("--wizard"));
    app.set_pose_view(int("--pose").unwrap_or(0).clamp(0, 2));
    app.set_action_index(int("--action").unwrap_or(1).clamp(0, ACTIONS.len() as i32 - 1));
    live.set_grid3d_path(grid3d_path().into());

    // Prescriptions (built-in defaults of the shipping app); `shown` follows the search box.
    let actions = Rc::new(VecModel::from(
        ACTIONS
            .map(|(name, kind, trigger_type, target, tolerance, hold_ms, note)| ActionItem {
                name: name.into(),
                kind: kind.into(),
                target: if trigger_type == TriggerType::JointAngle {
                    format!("{target:.0}° ±{tolerance:.0}°").into()
                } else {
                    format!("≥ {target:.0}°").into()
                },
                hold: format!("{:.1} 秒", hold_ms / 1000.0).into(),
                note: note.into(),
                shown: true,
            })
            .to_vec(),
    ));
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

    let sessions = Rc::new(VecModel::<SessionRow>::default());
    if has("--seed-history") {
        for (started, action, reps, duration) in [
            ("2026/11/16 上午 11:07", "Squat (深蹲屈膝)", 82, "10:54"),
            ("2026/11/15 下午 08:30", "Straight Leg Raise (直膝抬腿)", 24, "06:12"),
            ("2026/11/14 下午 07:45", "Squat (深蹲屈膝)", 30, "05:40"),
            ("2026/11/13 下午 08:10", "Backward Extension (直膝後擺)", 18, "04:05"),
            ("2026/11/12 下午 07:50", "Squat (深蹲屈膝)", 28, "05:31"),
            ("2026/11/11 下午 08:20", "Straight Leg Raise (直膝抬腿)", 22, "05:58"),
            ("2026/11/10 下午 07:40", "Squat (深蹲屈膝)", 26, "05:12"),
            ("2026/11/09 下午 08:05", "Squat (深蹲屈膝)", 25, "05:03"),
            ("2026/11/08 上午 10:15", "Backward Extension (直膝後擺)", 16, "03:48"),
            ("2026/11/07 下午 07:55", "Squat (深蹲屈膝)", 24, "04:57"),
        ] {
            sessions.push(SessionRow {
                started: started.into(),
                action: action.into(),
                reps,
                duration: duration.into(),
                demo: true,
            });
        }
    }
    app.set_sessions(ModelRc::from(sessions.clone()));
    {
        let sessions = sessions.clone();
        app.on_delete_session(move |i| {
            if (i as usize) < sessions.row_count() {
                sessions.remove(i as usize);
            }
        });
    }

    let sim = Rc::new(RefCell::new(Sim {
        t: 0.0,
        buf: vec![0.0; SAMPLES],
        running: autorun,
        hold: 0.0,
        reps: 0,
        engine: TriggerEngine::new(),
        alarm: false,
        last_knee: 0.0,
        last_thigh: 0.0,
        session_s: 0.0,
        session_no: 0,
    }));
    live.set_running(autorun);

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
                            let _ = h.tx.send(("native:connect-failed".into(), json!(message)));
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
            if s.running {
                finish_session(&ui, &mut s, &sessions);
            } else {
                s.running = true;
                s.hold = 0.0;
                s.reps = 0;
                s.session_s = 0.0;
                s.engine.reset();
                s.alarm = false;
                ui.global::<Live>().set_running(true);
            }
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

    let started = Instant::now();
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
        let connected = app.get_conn() == 2;
        // Events from a real device (only with --real-ble).
        while let Ok((event, payload)) = ble_rx.try_recv() {
            let mut r = real.borrow_mut();
            match event.as_str() {
                "ble:connection" => {
                    let up = payload["connected"].as_bool().unwrap_or(false);
                    if !up {
                        finish_session(&ui, &mut s, &sessions);
                    }
                    app.set_conn(if up { 2 } else { 0 });
                }
                "native:connect-failed" => {
                    r.connect_error = payload.as_str().unwrap_or("連線失敗").to_string();
                    app.set_conn(0);
                }
                "ble:error" => r.fault = Some(payload.as_str().unwrap_or("BLE error").to_string()),
                "ble:packet" => match payload["kind"].as_str() {
                    Some("angles") => {
                        let raw = &payload["raw"];
                        r.thigh = raw["thigh"].as_f64().unwrap_or(0.0);
                        r.shin = raw["shin"].as_f64().unwrap_or(0.0);
                        r.roll = raw["shinRoll"].as_f64().unwrap_or(0.0) - raw["thighRoll"].as_f64().unwrap_or(0.0);
                        r.angle = r.shin - r.thigh;
                        r.fault = None;
                    }
                    Some("error") => r.fault = payload["code"].as_str().map(str::to_string),
                    _ => {}
                },
                _ => {}
            }
        }
        // The selected prescription and the user's own measured range drive the judging.
        let opt = |v: i32| (v >= 0).then_some(v as f64);
        let limits = AngleLimits { comfort: opt(app.get_comfort()), limit: opt(app.get_limit()) };
        let cfg = action_config(app.get_action_index().max(0) as usize, limits);
        let (metric_label, verb) = metric_words(cfg.trigger_type);

        let (angle, thigh, hw_error) = if real_mode {
            let r = real.borrow();
            app.set_thigh_text(format!("{:.0}°", r.thigh).into());
            app.set_shin_text(format!("{:.0}°", r.shin).into());
            app.set_roll_text(format!("{:.0}°", r.roll).into());
            (r.angle, r.thigh, r.fault.clone())
        } else {
            // Simulated notification -> real parser. Malformed packets are dropped, as in the app.
            let fault = inject_fault && (s.t % 12.0) > 10.0;
            match parse_angle_packet(&sim_packet(s.t, fault, &cfg)) {
                ParsedPacket::Angles { raw, .. } => {
                    app.set_thigh_text(format!("{:.0}°", raw.thigh).into());
                    app.set_shin_text(format!("{:.0}°", raw.shin).into());
                    app.set_roll_text(format!("{:.0}°", raw.shin_roll - raw.thigh_roll).into());
                    (raw.shin - raw.thigh, raw.thigh, None)
                }
                ParsedPacket::Error { code } => (s.last_knee, s.last_thigh, Some(code)),
                ParsedPacket::Malformed { .. } => return,
            }
        };
        s.last_knee = angle;
        s.last_thigh = thigh;

        // Judging by the core crate: metric sample + zone -> rep state machine -> guidance.
        let input = EngineInput::from_angles(angle, thigh, &cfg);
        let zone = compute_metric_zone(&cfg);
        let value = input.sample.value;
        if s.buf.len() >= SAMPLES {
            s.buf.remove(0);
        }
        s.buf.push(value);

        let judging = connected && s.running && hw_error.is_none();
        if s.running {
            s.session_s += dt;
        }
        if judging {
            // Receive time on a monotonic clock, in ms, as the engine expects.
            for event in s.engine.handle(&input, started.elapsed().as_secs_f64() * 1000.0) {
                match event {
                    EngineEvent::HoldProgress(p) => s.hold = p / 100.0,
                    EngineEvent::RepCompleted => s.reps += 1,
                    EngineEvent::OverExtension(on) => s.alarm = on,
                    _ => {}
                }
            }
        } else if s.running && hw_error.is_some() {
            // Hardware error: the app resets the engine so a hold cannot continue across it.
            s.engine.reset();
            s.hold = 0.0;
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

        // State contract kept from v3: fault and personal limit first, blocking conditions, then coaching.
        let (title, sub, tone): (String, String, i32) = if !connected {
            if app.get_conn() == 1 {
                ("連線中…".into(), "正在尋找裝置(最長 15 秒)".into(), 0)
            } else if !real.borrow().connect_error.is_empty() {
                ("連線失敗".into(), real.borrow().connect_error.clone(), 2)
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
        live.set_metric_text(if hw_error.is_some() { "—".into() } else { format!("{value:.0}°").into() });
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
                format!("模擬感測 {tick_rate:.0} Hz · 畫面 {fps:.0} fps · 已執行 {:.0} 秒", started.elapsed().as_secs_f64()).into(),
            );
        }
    });

    ui.run()
}

/// End a running session and add it to the in-memory history (nothing is written to disk).
fn finish_session(ui: &MainWindow, s: &mut Sim, sessions: &Rc<VecModel<SessionRow>>) {
    if !s.running {
        return;
    }
    s.running = false;
    s.session_no += 1;
    let app = ui.global::<App>();
    let action = app
        .get_actions()
        .row_data(app.get_action_index() as usize)
        .map(|a| a.name)
        .unwrap_or_default();
    let t = s.session_s as u64;
    sessions.insert(
        0,
        SessionRow {
            started: format!("本次執行 · 第 {} 場", s.session_no).into(),
            action,
            reps: s.reps as i32,
            duration: format!("{:02}:{:02}", t / 60, t % 60).into(),
            demo: true,
        },
    );
    s.hold = 0.0;
    ui.global::<Live>().set_running(false);
}
