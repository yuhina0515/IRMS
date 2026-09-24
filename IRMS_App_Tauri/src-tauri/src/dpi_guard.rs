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
//
// 2026-09-24: the "correct logical size" is now clamped to the current monitor's work area
// (see `target_logical_size`). At 125% on a 1080p display, 820 logical px = 1025 physical px of
// client area, which plus the native title bar is taller than the work area once the taskbar
// is subtracted — the Dashboard's bottom evidence bar ended up behind the taskbar. Because this
// module re-forces the size on every check, the clamp has to live in its *target*, not in a
// one-off startup resize (which it would just undo). See
// `doc/coding log/log_20260924_window_work_area_clamp.md`.

use tauri::{LogicalSize, PhysicalPosition, PhysicalSize, Position, WebviewWindow, WindowEvent};

/// The main window's configured logical size (tauri.conf.json's `width`/`height`). Duplicated
/// here because `WindowEvent::ScaleFactorChanged` only reports the physical size tao already
/// picked, not the logical size it was supposedly converting from — there's nothing to compare
/// against except our own record of what the config says.
const MAIN_LOGICAL_WIDTH: f64 = 1280.0;
const MAIN_LOGICAL_HEIGHT: f64 = 820.0;
/// tauri.conf.json's `minWidth`/`minHeight` — the work-area clamp never goes below these.
const MAIN_MIN_LOGICAL_WIDTH: f64 = 1024.0;
const MAIN_MIN_LOGICAL_HEIGHT: f64 = 600.0;

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
    fit_into_work_area(window);
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
    let target = target_for(window, scale_factor);
    let expected = PhysicalSize::new(
        (target.width * scale_factor).round() as u32,
        (target.height * scale_factor).round() as u32,
    );
    let drift_w = (reported.width as i64 - expected.width as i64).abs();
    let drift_h = (reported.height as i64 - expected.height as i64).abs();
    // Always logged (not just on drift) — this exact class of "reported size disagrees with
    // what scale_factor implies" was the unexplained fact behind the 09-14 click-offset dig,
    // so a breadcrumb on every check is worth more here than the usual "silent unless wrong".
    eprintln!(
        "[dpi_guard] scale_factor={scale_factor:.3} target={target:?} reported={reported:?} expected={expected:?} drift=({drift_w},{drift_h})px"
    );
    if drift_w <= DRIFT_TOLERANCE_PX && drift_h <= DRIFT_TOLERANCE_PX {
        return;
    }
    eprintln!("[dpi_guard] drift exceeds tolerance — correcting size to target logical size");
    if let Err(err) = window.set_size(target) {
        eprintln!("[dpi_guard] set_size failed: {err}");
    }
}

/// The logical inner size the window should have on its current monitor: the configured size,
/// clamped to that monitor's work area minus the native frame. Falls back to the configured
/// size if the monitor or its work area can't be read.
fn target_for(window: &WebviewWindow, scale_factor: f64) -> LogicalSize<f64> {
    let work_area = match window.current_monitor() {
        Ok(Some(monitor)) => {
            let size = monitor.work_area().size;
            Some(LogicalSize::new(
                size.width as f64 / scale_factor,
                size.height as f64 / scale_factor,
            ))
        }
        Ok(None) => None,
        Err(err) => {
            eprintln!("[dpi_guard] couldn't read current_monitor: {err}");
            None
        }
    };
    target_logical_size(work_area, frame_logical(window, scale_factor))
}

/// Native title bar + borders in logical px, measured as outer − inner size. Used so the
/// clamp fits the *whole* window (not just its client area) into the work area.
fn frame_logical(window: &WebviewWindow, scale_factor: f64) -> LogicalSize<f64> {
    match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => LogicalSize::new(
            outer.width.saturating_sub(inner.width) as f64 / scale_factor,
            outer.height.saturating_sub(inner.height) as f64 / scale_factor,
        ),
        _ => LogicalSize::new(0.0, 0.0),
    }
}

/// Pure sizing rule: min(configured size, work area − frame), never below the configured
/// minimum. Floors to whole logical px so rounding can't push the window 1px past the
/// work area.
fn target_logical_size(
    work_area: Option<LogicalSize<f64>>,
    frame: LogicalSize<f64>,
) -> LogicalSize<f64> {
    let Some(work) = work_area else {
        return LogicalSize::new(MAIN_LOGICAL_WIDTH, MAIN_LOGICAL_HEIGHT);
    };
    let fit =
        |configured: f64, available: f64, min: f64| configured.min(available.floor()).max(min);
    LogicalSize::new(
        fit(
            MAIN_LOGICAL_WIDTH,
            work.width - frame.width,
            MAIN_MIN_LOGICAL_WIDTH,
        ),
        fit(
            MAIN_LOGICAL_HEIGHT,
            work.height - frame.height,
            MAIN_MIN_LOGICAL_HEIGHT,
        ),
    )
}

/// Startup only: if the (possibly just-shrunk) window's outer rect sticks out past the work
/// area — e.g. Windows' default placement put its top-left low enough that the bottom still
/// hides behind the taskbar — shift it back inside. Not run on `ScaleFactorChanged`, so it
/// never fights a user dragging the window between monitors.
fn fit_into_work_area(window: &WebviewWindow) {
    let (Ok(Some(monitor)), Ok(pos), Ok(size)) = (
        window.current_monitor(),
        window.outer_position(),
        window.outer_size(),
    ) else {
        return;
    };
    let work = monitor.work_area();
    if let Some(new_pos) = fitted_position(pos, size, work.position, work.size) {
        eprintln!("[dpi_guard] window outside work area — moving from {pos:?} to {new_pos:?}");
        if let Err(err) = window.set_position(Position::Physical(new_pos)) {
            eprintln!("[dpi_guard] set_position failed: {err}");
        }
    }
}

/// Pure placement rule (physical px): the position that shifts `size` at `pos` inside the work
/// area, or `None` if it already fits. If the window is larger than the work area on an axis,
/// its top/left edge wins so the title bar stays reachable.
fn fitted_position(
    pos: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    work_pos: PhysicalPosition<i32>,
    work_size: PhysicalSize<u32>,
) -> Option<PhysicalPosition<i32>> {
    let fit = |p: i32, len: u32, wp: i32, wlen: u32| {
        let max = wp + wlen as i32 - len as i32;
        p.min(max).max(wp)
    };
    let new = PhysicalPosition::new(
        fit(pos.x, size.width, work_pos.x, work_size.width),
        fit(pos.y, size.height, work_pos.y, work_size.height),
    );
    (new != pos).then_some(new)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Windows 11 native frame at 125%: ~31px title bar + ~8px borders, in logical px.
    fn frame() -> LogicalSize<f64> {
        LogicalSize::new(16.0, 39.0)
    }

    #[test]
    fn falls_back_to_configured_size_without_work_area() {
        let t = target_logical_size(None, frame());
        assert_eq!(
            (t.width, t.height),
            (MAIN_LOGICAL_WIDTH, MAIN_LOGICAL_HEIGHT)
        );
    }

    #[test]
    fn keeps_configured_size_when_it_fits() {
        // 1080p at 100%, 48px taskbar → 1920×1032 logical work area.
        let t = target_logical_size(Some(LogicalSize::new(1920.0, 1032.0)), frame());
        assert_eq!((t.width, t.height), (1280.0, 820.0));
    }

    #[test]
    fn clamps_height_at_125_percent_on_1080p() {
        // PR #10 case: 1920×1032 physical work area / 1.25 = 1536×825.6 logical.
        let t = target_logical_size(Some(LogicalSize::new(1536.0, 825.6)), frame());
        assert_eq!((t.width, t.height), (1280.0, 786.0));
        // Whole window (client + frame) must fit the work area in physical px.
        assert!((t.height + frame().height) * 1.25 <= 1032.0);
    }

    #[test]
    fn never_goes_below_configured_minimum() {
        // 1080p at 175%: 1097×589.7 logical work area — smaller than min in both axes.
        let t = target_logical_size(Some(LogicalSize::new(1097.1, 589.7)), frame());
        assert_eq!((t.width, t.height), (1081.0, 600.0));
        let t = target_logical_size(Some(LogicalSize::new(800.0, 500.0)), frame());
        assert_eq!(
            (t.width, t.height),
            (MAIN_MIN_LOGICAL_WIDTH, MAIN_MIN_LOGICAL_HEIGHT)
        );
    }

    fn pos(x: i32, y: i32) -> PhysicalPosition<i32> {
        PhysicalPosition::new(x, y)
    }

    fn size(w: u32, h: u32) -> PhysicalSize<u32> {
        PhysicalSize::new(w, h)
    }

    #[test]
    fn fitted_position_is_none_when_inside_work_area() {
        assert_eq!(
            fitted_position(pos(26, 26), size(1620, 1000), pos(0, 0), size(1920, 1032)),
            None
        );
    }

    #[test]
    fn fitted_position_shifts_window_up_out_of_taskbar() {
        assert_eq!(
            fitted_position(pos(26, 60), size(1620, 1030), pos(0, 0), size(1920, 1032)),
            Some(pos(26, 2))
        );
    }

    #[test]
    fn fitted_position_keeps_top_left_visible_when_window_is_larger() {
        // Secondary monitor to the left at negative coordinates.
        assert_eq!(
            fitted_position(
                pos(-1900, -50),
                size(2000, 1200),
                pos(-1920, 0),
                size(1920, 1032)
            ),
            Some(pos(-1920, 0))
        );
    }
}
