// dpi_guard.rs — auto-detects the main window's display scale factor and corrects its
// physical size if it drifts from what tauri.conf.json's logical width/height should produce.
//
// Motivated by 2026-09-14's investigation into the TopHeader click-offset bug (see
// `doc/coding log/log_20260914_titlebar_click_offset_physical_click_test.md`): on this
// machine's 175% scaled monitor, the borderless (decorations:false) main window's actual
// physical size didn't match its configured logical size × the monitor's scale factor — a
// ~100×200 physical-pixel drift with no native chrome to explain it away. The window has
// since been switched back to native decorations (see that same day's follow-up log), which
// sidesteps the click-offset symptom, but the underlying size/scale drift is a separate,
// still-unexplained fact about this environment (suspected `tao`/`wry` DPI handling — not
// something this app can patch inside that dependency). This module is the defensive
// countermeasure: check on startup, and again any time Tauri reports a scale change (moving
// the window to a different-DPI monitor, or a live scale change), and force the window back
// to its correct logical size if it's drifted.

use tauri::{LogicalSize, PhysicalSize, WebviewWindow, WindowEvent};

/// The main window's configured logical size (tauri.conf.json's `width`/`height`). Duplicated
/// here because `WindowEvent::ScaleFactorChanged` only reports the physical size tao already
/// picked, not the logical size it was supposedly converting from — there's nothing to compare
/// against except our own record of what the config says.
const MAIN_LOGICAL_WIDTH: f64 = 1280.0;
const MAIN_LOGICAL_HEIGHT: f64 = 820.0;

/// A few physical px of rounding slack is normal (float scale factors like 1.75 don't always
/// round-trip exactly); only correct drift bigger than this.
const DRIFT_TOLERANCE_PX: i64 = 4;

/// Checks the window's current actual size against what its current scale factor should
/// produce, correcting it if drifted. Call once right after the window is created (startup
/// drift, like the 09-14 finding, happens with no `ScaleFactorChanged` event at all — that
/// event only fires on *runtime* scale changes, not the initial one).
pub fn check_and_correct(window: &WebviewWindow) {
    let scale_factor = match window.scale_factor() {
        Ok(s) => s,
        Err(err) => {
            eprintln!("[dpi_guard] couldn't read scale_factor: {err}");
            return;
        }
    };
    let reported = match window.inner_size() {
        Ok(s) => s,
        Err(err) => {
            eprintln!("[dpi_guard] couldn't read inner_size: {err}");
            return;
        }
    };
    correct_drift(window, scale_factor, reported);
}

/// Registers a listener so future `ScaleFactorChanged` events (display swapped, scale changed
/// live) get the same correction applied, not just the one-time startup check above.
pub fn watch(window: &WebviewWindow) {
    let watched = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::ScaleFactorChanged {
            scale_factor,
            new_inner_size,
            ..
        } = event
        {
            correct_drift(&watched, *scale_factor, *new_inner_size);
        }
    });
}

fn correct_drift(window: &WebviewWindow, scale_factor: f64, reported: PhysicalSize<u32>) {
    let expected = PhysicalSize::new(
        (MAIN_LOGICAL_WIDTH * scale_factor).round() as u32,
        (MAIN_LOGICAL_HEIGHT * scale_factor).round() as u32,
    );
    let drift_w = (reported.width as i64 - expected.width as i64).abs();
    let drift_h = (reported.height as i64 - expected.height as i64).abs();
    // Always logged (not just on drift) — this exact class of "reported size disagrees with
    // what scale_factor implies" was the unexplained fact behind the 09-14 click-offset dig,
    // so a breadcrumb on every check is worth more here than the usual "silent unless wrong".
    eprintln!(
        "[dpi_guard] scale_factor={scale_factor:.3} reported={reported:?} expected={expected:?} drift=({drift_w},{drift_h})px"
    );
    if drift_w <= DRIFT_TOLERANCE_PX && drift_h <= DRIFT_TOLERANCE_PX {
        return;
    }
    eprintln!(
        "[dpi_guard] drift exceeds tolerance — correcting size back to configured logical size"
    );
    if let Err(err) = window.set_size(LogicalSize::new(MAIN_LOGICAL_WIDTH, MAIN_LOGICAL_HEIGHT)) {
        eprintln!("[dpi_guard] set_size failed: {err}");
    }
}
