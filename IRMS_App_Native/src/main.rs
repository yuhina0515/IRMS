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
const FRAMES: AtomicU32 = AtomicU32::new(0);
static FRAME_COUNT: AtomicU32 = FRAMES;

struct Sim {
    t: f64,
    buf: Vec<f64>,
    running: bool,
    hold: f64,
    reps: u32,
    armed: bool,
}

fn y_of(angle: f64) -> f64 {
    200.0 - (angle.clamp(0.0, 160.0) / 160.0) * 200.0
}

fn chart_path(buf: &[f64]) -> String {
    let mut s = String::with_capacity(buf.len() * 12);
    for (i, a) in buf.iter().enumerate() {
        let x = i as f64 / (SAMPLES - 1) as f64 * 500.0;
        let _ = write!(s, "{}{:.1} {:.1} ", if i == 0 { "M " } else { "L " }, x, y_of(*a));
    }
    s
}

fn zone_path() -> String {
    let (top, bot) = (y_of(ZONE.1), y_of(ZONE.0));
    format!("M 0 {top:.1} L 500 {top:.1} L 500 {bot:.1} L 0 {bot:.1} Z")
}

fn limb_path(knee_deg: f64) -> String {
    let (hx, hy, l) = (150.0, 40.0, 100.0);
    let (kx, ky) = (hx, hy + l);
    let r = knee_deg.to_radians();
    let (ax, ay) = (kx - l * r.sin(), ky + l * r.cos());
    format!("M {hx} {hy} L {kx} {ky} L {ax:.1} {ay:.1}")
}

fn main() -> Result<(), slint::PlatformError> {
    let ui = MainWindow::new()?;
    ui.set_zone_path(zone_path().into());
    ui.set_style_name("Workbook".into());

    let sim = Rc::new(RefCell::new(Sim {
        t: 0.0,
        buf: vec![0.0; SAMPLES],
        running: false,
        hold: 0.0,
        reps: 0,
        armed: true,
    }));

    // G1/G4: count rendered frames, shown in the footer once a second.
    let weak = ui.as_weak();
    ui.window()
        .set_rendering_notifier(move |state, _| {
            if matches!(state, slint::RenderingState::AfterRendering) {
                FRAME_COUNT.fetch_add(1, Ordering::Relaxed);
            }
        })
        .ok();
    let _ = weak;

    {
        let sim = sim.clone();
        let ui_w = ui.as_weak();
        ui.on_toggle_run(move || {
            let mut s = sim.borrow_mut();
            s.running = !s.running;
            s.hold = 0.0;
            s.reps = 0;
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

        let (title, sub, tone): (&str, String, i32) = if angle > 100.0 {
            ("超過個人極限", format!("膝角 {angle:.0}° · 請放鬆回到目標區"), 2)
        } else if !s.running {
            ("準備就緒", "按「開始訓練」開始".to_string(), 0)
        } else if in_zone && s.hold >= 1.0 {
            ("完成!放鬆", format!("已完成 {} 次", s.reps), 1)
        } else if in_zone {
            ("保持住", format!("剩餘 {:.1} 秒", HOLD_S * (1.0 - s.hold)), 1)
        } else if angle < ZONE.0 {
            ("再彎一點", format!("距離目標區 {:.0}°", ZONE.0 - angle), 0)
        } else {
            ("稍微放鬆", format!("高於目標區 {:.0}°", angle - ZONE.1), 0)
        };

        ui.set_angle_text(format!("{angle:.0}°").into());
        ui.set_coach_title(SharedString::from(title));
        ui.set_coach_sub(sub.into());
        ui.set_coach_tone(tone);
        ui.set_hold(s.hold as f32);
        ui.set_limb_path(limb_path(angle).into());
        ui.set_chart_path(chart_path(&s.buf).into());

        if last_report.elapsed() >= Duration::from_secs(1) {
            let f = FRAME_COUNT.load(Ordering::Relaxed);
            let dt = last_report.elapsed().as_secs_f64();
            fps = (f - last_frames) as f64 / dt;
            tick_rate = ticks as f64 / dt;
            ticks = 0;
            last_frames = f;
            last_report = Instant::now();
        }
        ui.set_stats(
            format!(
                "模擬感測 {:.0} Hz · 畫面 {:.0} fps · 完成 {} 次 · 已執行 {:.0} 秒",
                tick_rate,
                fps,
                s.reps,
                started.elapsed().as_secs_f64()
            )
            .into(),
        );
    });

    ui.run()
}
