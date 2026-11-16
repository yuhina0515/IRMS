#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// IRMS native prototype (doc/plans/2026-11-16-rust-native-ui-plan.md, phases 1 and 2): every screen
// on simulated sensor data. Not connected to the shipping app, the device or the database.
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

fn arg_value(args: &[String], name: &str) -> Option<String> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;
    let app = ui.global::<App>();
    let live = ui.global::<Live>();
    let theme = ui.global::<Theme>();

    // Prototype switches, mainly for snapshots: --style N, --night, --view N, --settings-tab N,
    // --connected, --calibrated, --run, --wizard, --seed-history, --log, --snapshot <png>.
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
    if has("--connected") || autorun {
        app.set_conn(2);
    }
    app.set_calibrated(has("--calibrated") || autorun);
    app.set_wizard_open(has("--wizard"));

    let sessions = Rc::new(VecModel::<SessionRow>::default());
    if has("--seed-history") {
        for (started, action, reps, duration) in [
            ("2026/11/16 上午 11:07", "Squat (深蹲屈膝)", 82, "10:54"),
            ("2026/11/15 下午 08:30", "Straight Leg Raise (直膝抬腿)", 24, "06:12"),
            ("2026/11/14 下午 07:45", "Squat (深蹲屈膝)", 30, "05:40"),
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
        app.on_request_connect(move || {
            let Some(ui) = ui_w.upgrade() else { return };
            let app = ui.global::<App>();
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
        snap_timer.start(TimerMode::SingleShot, Duration::from_secs(3), move || {
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
        let angle = sim_angle(s.t);
        if s.buf.len() >= SAMPLES {
            s.buf.remove(0);
        }
        s.buf.push(angle);

        let in_zone = angle >= ZONE.0 && angle <= ZONE.1;
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
                ("連線中…", "正在尋找裝置".into(), 0)
            } else {
                ("裝置未連線", "請從右上角連線裝置".into(), 0)
            }
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
