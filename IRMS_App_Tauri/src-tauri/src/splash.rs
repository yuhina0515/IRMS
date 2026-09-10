// splash.rs — boot-splash window lifecycle, Tauri port of the Electron app's
// main/splash.ts + the boot-sequence orchestration in main/index.ts's app.whenReady().
//
// Same two-stage handoff: a small always-on-top splash window plays the renderer's logo-assembly
// animation, then grows its own OS bounds to match the real window and hands off to it. Windows
// has no native animated setBounds/set_size, so growth is still done by stepping the window's
// bounds manually on a timer — same approach as the Electron version, `set_size`/`set_position`
// replacing `BrowserWindow.setBounds`.
//
// One deliberate simplification vs. the Electron version: that one needed two separate round
// trips (did-finish-load, then a follow-up executeJavaScript to read matchMedia) because
// contextBridge only exposed one-shot listeners, not a way for the splash page to push data up.
// Tauri's invoke() can carry a payload on the very first call, so the splash renderer reports
// "loaded and here's whether reduced-motion is on" in one command (`splash_ready`) instead of two.

use serde::Serialize;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tokio::sync::oneshot;
use tokio::time::{sleep, timeout};

// Mirrors shared/splashTiming.ts's constants. Hand-copied rather than shared across languages —
// same tradeoff protocol.rs already made against protocol.ts (see that file's header comment).
const SPLASH_ASSEMBLY_DONE_MS: u64 = 1220;
const SPLASH_ASSEMBLY_FLOOR_MS: u64 = SPLASH_ASSEMBLY_DONE_MS + 650;
const SPLASH_ADVANCE_LEAD_MS: u64 = 0;
const SPLASH_GROWTH_DURATION_MS: u64 = 550;
const SPLASH_FRAME_FADE_OUT_MS: u64 = 340;
/// Not present in the Electron version — that one could rely on did-fail-load firing for a
/// genuinely broken load. Local bundled assets make that near-impossible here, but a timeout
/// still guarantees the app can't hang forever waiting for a splash that never reports ready.
const SPLASH_READY_TIMEOUT_MS: u64 = 5000;

/// Holds the oneshot sender the `splash_ready` command completes once the splash page has loaded
/// and reported its reduced-motion preference. Lives for exactly one boot sequence.
pub struct SplashReadyState(pub Mutex<Option<oneshot::Sender<bool>>>);

impl Default for SplashReadyState {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
pub fn splash_ready(reduced_motion: bool, state: tauri::State<SplashReadyState>) {
    if let Some(tx) = state.0.lock().unwrap().take() {
        let _ = tx.send(reduced_motion);
    }
}

fn ease_out_cubic(t: f64) -> f64 {
    1.0 - (1.0 - t).powi(3)
}

#[derive(Clone, Copy, Serialize)]
struct Rect {
    x: i32,
    y: i32,
    w: u32,
    h: u32,
}

fn lerp_rect(from: Rect, to: Rect, t: f64) -> Rect {
    Rect {
        x: (from.x as f64 + (to.x - from.x) as f64 * t).round() as i32,
        y: (from.y as f64 + (to.y - from.y) as f64 * t).round() as i32,
        w: (from.w as f64 + (to.w as f64 - from.w as f64) * t).round() as u32,
        h: (from.h as f64 + (to.h as f64 - from.h as f64) * t).round() as u32,
    }
}

/// Steps the splash window's OS bounds from `from` to `to` over `duration_ms`, easing out —
/// direct port of main/splash.ts's `animateBounds()`. Stops early (silently) if the window has
/// already been closed, same "best effort, don't crash the boot sequence" stance as the original.
async fn animate_bounds(window: &WebviewWindow, from: Rect, to: Rect, duration_ms: u64) {
    if duration_ms == 0 {
        let _ = window.set_position(PhysicalPosition::new(to.x, to.y));
        let _ = window.set_size(PhysicalSize::new(to.w, to.h));
        return;
    }
    let frame_ms: u64 = 16;
    let steps = ((duration_ms as f64 / frame_ms as f64).round() as u64).max(1);
    for i in 1..=steps {
        let t = ease_out_cubic(i as f64 / steps as f64);
        let r = lerp_rect(from, to, t);
        if window.set_position(PhysicalPosition::new(r.x, r.y)).is_err() {
            return;
        }
        if window.set_size(PhysicalSize::new(r.w, r.h)).is_err() {
            return;
        }
        sleep(Duration::from_millis(frame_ms)).await;
    }
    let _ = window.set_position(PhysicalPosition::new(to.x, to.y));
    let _ = window.set_size(PhysicalSize::new(to.w, to.h));
}

fn assembly_floor_ms(reduced_motion: bool) -> u64 {
    if reduced_motion {
        0
    } else {
        SPLASH_ASSEMBLY_FLOOR_MS
    }
}

fn window_rect(window: &WebviewWindow) -> tauri::Result<Rect> {
    let pos = window.outer_position()?;
    let size = window.outer_size()?;
    Ok(Rect { x: pos.x, y: pos.y, w: size.width, h: size.height })
}

/// Fire-and-forget entry point, called once from `setup()` after the DB/window scaffolding is up.
/// Any failure inside the boot sequence falls back to just showing the main window plainly —
/// same "never leave the user staring at nothing" stance as the Electron version's try/catch.
pub fn spawn_boot_sequence(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_boot_sequence(&app).await {
            eprintln!("[splash] boot animation failed, falling back to plain show: {err}");
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.show();
            }
        }
        if let Some(splash) = app.get_webview_window("splash") {
            let _ = splash.close();
        }
    });
}

async fn run_boot_sequence(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let main = app
        .get_webview_window("main")
        .ok_or("main window not found")?;

    // Splash covers the whole primary display's work area (matches main/splash.ts) so the
    // renderer's finger/mainstem strokes have real off-screen space to travel in from.
    let monitor = main
        .primary_monitor()?
        .ok_or("no primary monitor detected")?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    let logical_pos: LogicalPosition<f64> = work.position.to_logical(scale);
    let logical_size: LogicalSize<f64> = work.size.to_logical(scale);

    let (tx, rx) = oneshot::channel::<bool>();
    app.state::<SplashReadyState>().0.lock().unwrap().replace(tx);

    let splash = WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("splash.html".into()))
        .position(logical_pos.x, logical_pos.y)
        .inner_size(logical_size.width, logical_size.height)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .resizable(false)
        .skip_taskbar(true)
        .shadow(false)
        .focused(false)
        .visible(true)
        .build()?;
    // Splash now covers the whole screen, so without this it would block every click on the
    // user's desktop underneath for however long stage 1 + the assembly floor takes to run.
    let _ = splash.set_ignore_cursor_events(true);

    let reduced_motion = match timeout(Duration::from_millis(SPLASH_READY_TIMEOUT_MS), rx).await {
        Ok(Ok(reduced)) => reduced,
        // Timed out or the splash window was closed/crashed before reporting — degrade to
        // motion-on and proceed anyway rather than hanging the whole app launch on a dead splash.
        _ => false,
    };

    sleep(Duration::from_millis(assembly_floor_ms(reduced_motion))).await;

    let from = window_rect(&splash)?;
    let to = window_rect(&main)?;

    app.emit("splash-advance", ())?;
    sleep(Duration::from_millis(if reduced_motion { 0 } else { SPLASH_ADVANCE_LEAD_MS })).await;
    animate_bounds(
        &splash,
        from,
        to,
        if reduced_motion { 0 } else { SPLASH_GROWTH_DURATION_MS },
    )
    .await;

    let _ = main.show();
    let _ = main.set_focus();

    app.emit("splash-fade-out-frame", ())?;
    sleep(Duration::from_millis(if reduced_motion { 0 } else { SPLASH_FRAME_FADE_OUT_MS })).await;
    let _ = splash.close();

    Ok(())
}
