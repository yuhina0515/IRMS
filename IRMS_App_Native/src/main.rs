#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Phase 1 prototype (doc/plans/2026-11-16-rust-native-ui-plan.md): live-session screen on simulated
// sensor data. Gates: G1 chart rate/frame rate, G3 CJK text, G4 memory. Not connected to the app.
use slint::{ComponentHandle, SharedString, Timer, TimerMode};
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

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;
    // Prototype switches: --style N (0..2), --night, --run, --log (stats to stdout once a second).
    let args: Vec<String> = std::env::args().collect();
    let log = args.iter().any(|a| a == "--log");
    if let Some(i) = args.iter().position(|a| a == "--style") {
        let n = args.get(i + 1).and_then(|v| v.parse::<i32>().ok()).unwrap_or(0);
        ui.global::<Theme>().set_style(n.clamp(0, 2));
    }
    ui.global::<Theme>().set_night(args.iter().any(|a| a == "--night"));
    let autorun = args.iter().any(|a| a == "--run");
    ui.set_running(autorun);

    let sim = Rc::new(RefCell::new(Sim {
        t: 0.0,
        buf: vec![0.0; SAMPLES],
        running: autorun,
        hold: 0.0,
        reps: 0,
        armed: true,
        session_s: 0.0,
    }));

    // G1/G4: count rendered frames, shown in the footer once a second.
    let notifier = ui.window().set_rendering_notifier(move |state, _| {
        if matches!(state, slint::RenderingState::AfterRendering) {
            FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
        }
    });
    if log {
        println!("rendering notifier: {notifier:?}");
    }

    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        ui.on_toggle_run(move || {
            let mut s = sim.borrow_mut();
            s.running = !s.running;
            s.hold = 0.0;
            s.reps = 0;
            s.session_s = 0.0;
            if let Some(ui) = ui_w.upgrade() {
                ui.set_running(s.running);
            }
        });
    }
    {
        let ui_w = ui.as_weak();
        ui.on_set_style(move |i| {
            if let Some(ui) = ui_w.upgrade() {
                let g = ui.global::<Theme>();
                g.set_style(i);
            }
        });
    }
    {
        let ui_w = ui.as_weak();
        ui.on_toggle_night(move || {
            if let Some(ui) = ui_w.upgrade() {
                let g = ui.global::<Theme>();
                g.set_night(!g.get_night());
            }
        });
    }

    // --snapshot <png>: save the renderer's own frame after 3 s (separates "not drawn" from "not shown").
    let snap_timer = Timer::default();
    if let Some(i) = args.iter().position(|a| a == "--snapshot") {
        if let Some(path) = args.get(i + 1).cloned() {
            let ui_w = ui.as_weak();
            snap_timer.start(TimerMode::SingleShot, Duration::from_secs(3), move || {
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
            });
        }
    }

    let started = Instant::now();
    let mut last_frames = 0u32;
    let mut last_report = Instant::now();
    let mut fps = 0.0f64;
    let mut ticks = 0u32;
    let mut tick_rate = 0.0f64;

    let ui_w = ui.as_weak();
    let timer = Timer::default();
    timer.start(TimerMode::Repeated, Duration::from_millis((1000.0 / HZ) as u64), move || {
        let Some(ui) = ui_w.upgrade() else { return };
        let mut s = sim.borrow_mut();
        s.t += 1.0 / HZ;
        ticks += 1;
        // Simulated knee: slow sweep 5..110 deg plus a little noise.
        let angle = 57.5 + 52.5 * (s.t * 0.9).sin() + 0.8 * (s.t * 37.0).sin();
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

        let (_mark, title, sub, tone): (&str, &str, String, i32) = if angle > 100.0 {
            ("!", "超過個人極限", format!("膝角 {angle:.0}° · 請放鬆回到目標區"), 2)
        } else if !s.running {
            ("○", "準備開始", "確認動作與參數後按「開始療程」".to_string(), 0)
        } else if in_zone && s.hold >= 1.0 {
            ("✓", "完成,可以放鬆", format!("已完成 {} 次", s.reps), 1)
        } else if in_zone {
            ("✓", "很好,保持這個位置", format!("已進入目標區間,保持滿 {HOLD_S:.1} 秒"), 1)
        } else if angle < ZONE.0 {
            ("→", "再彎一點", format!("距離目標區 {:.0}°", ZONE.0 - angle), 0)
        } else {
            ("→", "稍微放鬆", format!("高於目標區 {:.0}°", angle - ZONE.1), 0)
        };
        let right = if s.running && in_zone && s.hold < 1.0 {
            format!("再保持 {:.1} 秒 · 第 {} 次", HOLD_S * (1.0 - s.hold), s.reps + 1)
        } else {
            String::new()
        };
        ui.set_coach_right(right.into());
        ui.set_ruler_pos((angle.clamp(0.0, 160.0) / 160.0) as f32);
        ui.set_knee_label(format!("{:.0}°", 180.0 - angle).into());
        ui.set_reps_text(format!("{} 次", s.reps).into());
        ui.set_hold_text(format!("{:.1} / {HOLD_S:.1} 秒", s.hold * HOLD_S).into());
        let t = s.session_s as u64;
        ui.set_time_text(format!("{:02}:{:02}", t / 60, t % 60).into());

        ui.set_angle_text(format!("{angle:.0}°").into());
        ui.set_coach_title(SharedString::from(title));
        ui.set_coach_sub(sub.into());
        ui.set_coach_tone(tone);
        ui.set_hold(s.hold as f32);
        ui.set_limb_path(limb_path(angle).into());
        ui.set_chart_path(chart_path(&s.buf, ui.get_chart_w() as f64, ui.get_chart_h() as f64).into());

        if last_report.elapsed() >= Duration::from_secs(1) {
            let f = FRAME_COUNT.load(Ordering::Relaxed);
            let dt = last_report.elapsed().as_secs_f64();
            fps = (f - last_frames) as f64 / dt;
            tick_rate = ticks as f64 / dt;
            ticks = 0;
            last_frames = f;
            last_report = Instant::now();
            if log {
                println!("tick {tick_rate:.1} Hz, frames {fps:.1} fps, angle {angle:.1}");
            }
        }
        ui.set_stats(
            format!(
                "模擬感測 {:.0} Hz · 畫面 {:.0} fps · 已執行 {:.0} 秒",
                tick_rate,
                fps,
                started.elapsed().as_secs_f64()
            )
            .into(),
        );
    });

    ui.run()
}
