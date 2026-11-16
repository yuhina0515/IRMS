#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// IRMS native prototype (doc/plans/2026-11-16-rust-native-ui-plan.md, phases 1 and 2): every screen
// on simulated sensor data. Not connected to the shipping app, the device or the database.
use irms_core::ble::{self, BleHost, BleState};
use irms_core::protocol::{parse_angle_packet, ParsedPacket};
use serde_json::{json, Value};
use std::future::Future;
use std::pin::Pin;
use std::sync::{mpsc, Arc};
use slint::{ComponentHandle, Model, ModelRc, SharedString, Timer, TimerMode, VecModel};
use std::cell::RefCell;
use std::fmt::Write;
use std::rc::Rc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

slint::include_modules!();

const HZ: f64 = 50.0;
const SAMPLES: usize = 250; // 5 s window
const ZONE: (f64, f64) = (60.0, 90.0);
const HOLD_S: f64 = 2.0;
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
    armed: bool,
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

fn limb_path(knee_deg: f64) -> String {
    // Side view facing right: thigh hangs from the hip, shin swings back with flexion, short foot.
    let (hx, hy, l) = (150.0, 40.0, 110.0);
    let (kx, ky) = (hx, hy + l);
    let r = knee_deg.to_radians();
    let (ax, ay) = (kx - l * r.sin(), ky + l * r.cos());
    let (fx, fy) = (ax + 34.0 * r.cos(), ay + 34.0 * r.sin());
    format!("M {hx} {hy} L {kx} {ky} L {ax:.1} {ay:.1} L {fx:.1} {fy:.1}")
}

/// Simulated knee angle: an 8.5 s rep cycle (bend 2 s, hold 3 s at about 76 deg, return 2 s, rest
/// 1.5 s) with small tremor, so a hold can actually complete. Every fifth rep overshoots to 105 deg.
fn sim_angle(t: f64) -> f64 {
    const CYCLE: f64 = 8.5;
    let n = (t / CYCLE).floor() as u64;
    let p = t % CYCLE;
    let (rest, peak) = (8.0, if n % 5 == 4 { 105.0 } else { 76.0 });
    let ease = |x: f64| 0.5 - 0.5 * (std::f64::consts::PI * x.clamp(0.0, 1.0)).cos();
    let base = if p < 2.0 {
        rest + (peak - rest) * ease(p / 2.0)
    } else if p < 5.0 {
        peak
    } else if p < 7.0 {
        peak - (peak - rest) * ease((p - 5.0) / 2.0)
    } else {
        rest
    };
    base + 0.8 * (t * 37.0).sin() + 1.2 * (t * 2.3).sin()
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

fn limb3d_path(knee_deg: f64) -> String {
    let r = knee_deg.to_radians();
    let hip = (0.0, 2.1);
    let knee = (0.0, 1.05);
    let ankle = (knee.0 - 1.05 * r.sin(), knee.1 - 1.05 * r.cos());
    let toe = (ankle.0 + 0.32 * r.cos(), ankle.1 - 0.32 * r.sin());
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

/// The simulated device speaks the real wire format (same text the ESP32 notifies), so the
/// prototype exercises `irms_core::protocol` exactly as the shipping app does.
fn sim_packet(t: f64, fault: bool) -> String {
    if fault {
        return "ERR:1".to_string();
    }
    let knee = sim_angle(t);
    let thigh = 6.0 + 3.0 * (t * 0.7).sin();
    let shin = thigh + knee;
    let (tr, sr) = (1.5 + 0.5 * (t * 0.9).sin(), -1.2 + 0.6 * (t * 1.1).sin());
    format!("T:{thigh:.1},S:{shin:.1},K:{knee:.1},TR:{tr:.1},SR:{sr:.1},KR:{:.1}", sr - tr)
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
    // --connected, --calibrated, --run, --wizard, --pose N, --search <text>, --seed-history, --inject-fault, --log, --snapshot-after S,
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
    live.set_grid3d_path(grid3d_path().into());

    // Prescriptions (built-in defaults of the shipping app); `shown` follows the search box.
    let actions = Rc::new(VecModel::from(
        [
            ("Backward Extension (直膝後擺)", "肢段後伸", "≥ 20°", "2.0 秒", "站姿,膝蓋伸直向後擺腿。"),
            ("Squat (深蹲屈膝)", "關節角度", "90° ±10°", "3.0 秒", "雙腳與肩同寬,緩慢下蹲到目標角度後保持。"),
            ("Straight Leg Raise (直膝抬腿)", "肢段抬高", "≥ 45°", "3.0 秒", "仰臥,膝蓋伸直抬腿到目標高度後保持。"),
        ]
        .map(|(name, kind, target, hold, note)| ActionItem {
            name: name.into(),
            kind: kind.into(),
            target: target.into(),
            hold: hold.into(),
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
        armed: true,
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
    let mut ticks = 0u32;

    let real_mode = host.is_some();
    let ui_w = ui.as_weak();
    let timer = Timer::default();
    timer.start(TimerMode::Repeated, Duration::from_millis((1000.0 / HZ) as u64), move || {
        let Some(ui) = ui_w.upgrade() else { return };
        let app = ui.global::<App>();
        let live = ui.global::<Live>();
        let mut s = sim.borrow_mut();
        s.t += 1.0 / HZ;
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
        let (angle, hw_error) = if real_mode {
            let r = real.borrow();
            app.set_thigh_text(format!("{:.0}°", r.thigh).into());
            app.set_shin_text(format!("{:.0}°", r.shin).into());
            app.set_roll_text(format!("{:.0}°", r.roll).into());
            (r.angle, r.fault.clone())
        } else {
            // Simulated notification -> real parser. Malformed packets are dropped, as in the app.
            let fault = inject_fault && (s.t % 12.0) > 10.0;
            match parse_angle_packet(&sim_packet(s.t, fault)) {
                ParsedPacket::Angles { raw, .. } => {
                    app.set_thigh_text(format!("{:.0}°", raw.thigh).into());
                    app.set_shin_text(format!("{:.0}°", raw.shin).into());
                    app.set_roll_text(format!("{:.0}°", raw.shin_roll - raw.thigh_roll).into());
                    (raw.shin - raw.thigh, None)
                }
                ParsedPacket::Error { code } => (s.buf.last().copied().unwrap_or(0.0), Some(code)),
                ParsedPacket::Malformed { .. } => return,
            }
        };
        if s.buf.len() >= SAMPLES {
            s.buf.remove(0);
        }
        s.buf.push(angle);

        let in_zone = hw_error.is_none() && angle >= ZONE.0 && angle <= ZONE.1;
        if s.running {
            s.session_s += 1.0 / HZ;
            if in_zone {
                s.hold = (s.hold + 1.0 / HZ / HOLD_S).min(1.0);
                if s.hold >= 1.0 && s.armed {
                    s.reps += 1;
                    s.armed = false;
                }
            } else {
                s.hold = 0.0;
                if angle < 40.0 {
                    s.armed = true;
                }
            }
        }

        // State contract kept from v3: blocking conditions first, then coaching.
        let limit = app.get_limit();
        let (title, sub, tone): (&str, String, i32) = if !connected {
            if app.get_conn() == 1 {
                ("連線中…", "正在尋找裝置(最長 15 秒)".into(), 0)
            } else if !real.borrow().connect_error.is_empty() {
                ("連線失敗", real.borrow().connect_error.clone(), 2)
            } else {
                ("裝置未連線", "請從右上角連線裝置".into(), 0)
            }
        } else if let Some(code) = &hw_error {
            ("感測器異常", format!("裝置回報 {code},請檢查感測器接線後重新連線"), 2)
        } else if limit >= 0 && angle > limit as f64 {
            ("超過個人極限範圍", format!("膝角 {angle:.0}° · 極限 {limit}° · 請放鬆"), 2)
        } else if !app.get_calibrated() {
            ("尚未校準", "未校準時無法開始療程,請先完成校準精靈".into(), 3)
        } else if !s.running {
            ("準備開始", "確認動作與參數後按「開始療程」".into(), 0)
        } else if in_zone && s.hold >= 1.0 {
            ("已完成,請回到起始位", format!("已完成 {} 次", s.reps), 1)
        } else if in_zone {
            ("很好,保持這個位置", format!("已進入目標區間,保持滿 {HOLD_S:.1} 秒"), 1)
        } else if angle < ZONE.0 {
            ("再彎一點", format!("距離目標區 {:.0}°", ZONE.0 - angle), 0)
        } else {
            ("稍微放鬆", format!("高於目標區 {:.0}°", angle - ZONE.1), 0)
        };
        let right = if s.running && in_zone && s.hold < 1.0 {
            format!("再保持 {:.1} 秒 · 第 {} 次", HOLD_S * (1.0 - s.hold), s.reps + 1)
        } else {
            String::new()
        };

        app.set_angle(angle as f32);
        app.set_angle_text(format!("{angle:.0}°").into());
        live.set_coach_title(SharedString::from(title));
        live.set_coach_sub(sub.into());
        live.set_coach_tone(tone);
        live.set_coach_right(right.into());
        live.set_ruler_pos((angle.clamp(0.0, 160.0) / 160.0) as f32);
        live.set_knee_label(format!("{:.0}°", 180.0 - angle).into());
        live.set_hold(s.hold as f32);
        live.set_reps_text(format!("{} 次", s.reps).into());
        live.set_hold_text(format!("{:.1} / {HOLD_S:.1} 秒", s.hold * HOLD_S).into());
        let t = s.session_s as u64;
        live.set_time_text(format!("{:02}:{:02}", t / 60, t % 60).into());
        // Only the live screen draws the pose and the trend; skip the path strings elsewhere.
        if connected && app.get_view() == 0 {
            live.set_limb_path(limb_path(angle).into());
            live.set_limb3d_path(limb3d_path(angle).into());
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
