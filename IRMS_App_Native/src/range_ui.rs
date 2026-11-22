//! Built-in port of the `angle-range` module (IRMS-Modules `modules/angle-range`, plan D2).
//!
//! Comfort angle: within it there is no pain or only mild pain. Limit (optional): very painful but
//! still reachable. One measurement = comfort, then limit or skip, then a review where the values
//! and a note can be corrected, then one saved record. Records are a dated history; the newest is
//! in force for sessions. The flow state lives in the `App` global so the screen survives page
//! switches; the rules (validation, trend text, list rows) are plain functions tested below.
use crate::store::{local_time, Store};
use crate::{App, MainWindow, RangeRow, Sim};
use irms_core::types::{AngleRangeInput, AngleRangeRecord};
use slint::{ComponentHandle, ModelRc, VecModel};
use std::cell::RefCell;
use std::rc::Rc;

/// The module lists the newest six records.
pub const MAX_LISTED: usize = 6;
const NO_LIVE: &str = "沒有即時角度:請先連線裝置。";

/// Flow steps (`App.range-step`).
pub const STEP_COMFORT: i32 = 0;
pub const STEP_LIMIT: i32 = 1;
pub const STEP_REVIEW: i32 = 2;

/// "(+5°)" / "(−3°)" / "(持平)" against the previous (older) record, "" without one.
pub fn trend(current: Option<f64>, previous: Option<f64>) -> String {
    match (current, previous) {
        (Some(c), Some(p)) => {
            let d = (c - p).round() as i64;
            match d {
                0 => "(持平)".into(),
                d if d > 0 => format!("(+{d}°)"),
                d => format!("(−{}°)", -d),
            }
        }
        _ => String::new(),
    }
}

/// One history line per record, newest first, at most [`MAX_LISTED`].
pub fn rows(records: &[AngleRangeRecord]) -> Vec<RangeRow> {
    records
        .iter()
        .take(MAX_LISTED)
        .enumerate()
        .map(|(i, r)| {
            let prev = records.get(i + 1);
            let limit = match r.limit_angle {
                None => "未設定".to_string(),
                Some(l) => format!(
                    "{}°{}",
                    l.round(),
                    trend(Some(l), prev.and_then(|p| p.limit_angle))
                ),
            };
            let mut text = format!(
                "{} · 舒適 {}°{} · 極限 {limit}",
                local_time(&r.measured_at),
                r.comfort_angle.round(),
                trend(Some(r.comfort_angle), prev.map(|p| p.comfort_angle)),
            );
            if let Some(note) = r.note.as_deref().filter(|n| !n.is_empty()) {
                // Long notes would wrap and push the list past the card (no page scrolling).
                text.push_str(" · ");
                text.push_str(&short_note(note));
            }
            RangeRow {
                id: r.id.to_string().into(),
                text: text.into(),
                current: i == 0,
            }
        })
        .collect()
}

/// Notes are shown cut to [`NOTE_SHOWN`] characters in the list and the delete dialog.
pub const NOTE_SHOWN: usize = 24;

fn short_note(note: &str) -> String {
    if note.chars().count() <= NOTE_SHOWN {
        note.to_string()
    } else {
        format!("{}…", note.chars().take(NOTE_SHOWN).collect::<String>())
    }
}

/// Checks the review form. Empty limit = not set; the note is trimmed and capped at 200 characters.
pub fn parse_review(comfort: &str, limit: &str, note: &str) -> Result<AngleRangeInput, String> {
    let angle = |text: &str, name: &str| -> Result<Option<f64>, String> {
        let text = text.trim().trim_end_matches('°').trim();
        if text.is_empty() {
            return Ok(None);
        }
        match text.parse::<f64>() {
            // Whole degrees, like the module's measured values: the ruler, the sessions and the
            // trend text then all use the same number.
            Ok(v) if v.is_finite() && (0.0..=180.0).contains(&v) => Ok(Some(v.round())),
            _ => Err(format!("{name}必須是 0 到 180 之間的數字。")),
        }
    };
    let comfort = angle(comfort, "舒適角度")?.ok_or("請先記錄舒適角度。")?;
    let limit = angle(limit, "極限範圍")?;
    if limit.is_some_and(|l| l < comfort) {
        return Err("極限範圍不能小於舒適角度。".into());
    }
    let note: String = note.trim().chars().take(200).collect();
    Ok(AngleRangeInput {
        comfort_angle: comfort,
        limit_angle: limit,
        note: (!note.is_empty()).then_some(note),
    })
}

fn whole(v: f64) -> String {
    format!("{}", v.round() as i64)
}

/// The live knee angle when it can be recorded (connected, a real reading), rounded.
/// A slightly hyperextended straight leg reads below zero; like the module it counts as 0.
fn knee_now(app: &App) -> Option<i32> {
    (app.get_conn() == 2 && app.get_valid_angle()).then(|| app.get_angle().max(0.0).round() as i32)
}

/// Called on every live tick: keeps "本次最大" while comfort or limit is being measured.
pub fn observe(app: &App) {
    let step = app.get_range_step();
    // Only while measuring on the Tools angle-range tab, never from a session or another page.
    if (step != STEP_COMFORT && step != STEP_LIMIT)
        || app.get_view() != 3
        || app.get_tools_tab() != 0
        || app.get_session_locked()
    {
        return;
    }
    if let Some(k) = knee_now(app) {
        let peak = app.get_range_peak();
        if peak < 0 || k > peak {
            app.set_range_peak(k);
        }
    }
}

/// Reloads the history list and the values in force (used by sessions and the live ruler).
pub fn refresh(app: &App, store: &Store) -> Result<(), String> {
    let records = store.ranges().map_err(|e| e.to_string())?;
    let current = records.first();
    app.set_comfort(current.map_or(-1, |r| r.comfort_angle.round() as i32));
    app.set_limit(
        current
            .and_then(|r| r.limit_angle)
            .map_or(-1, |v| v.round() as i32),
    );
    app.set_range_total(records.len() as i32);
    app.set_range_rows(ModelRc::new(VecModel::from(rows(&records))));
    Ok(())
}

fn restart(app: &App) {
    app.set_range_step(STEP_COMFORT);
    app.set_range_edit_comfort("".into());
    app.set_range_edit_limit("".into());
    app.set_range_edit_note("".into());
    app.set_range_peak(-1);
    app.set_range_error("".into());
}

pub fn wire(ui: &MainWindow, sim: Rc<RefCell<Sim>>) {
    let app = ui.global::<App>();
    {
        let weak = ui.as_weak();
        app.on_range_record_comfort(move || {
            let Some(ui) = weak.upgrade() else { return };
            let app = ui.global::<App>();
            match knee_now(&app) {
                None => app.set_range_error(NO_LIVE.into()),
                Some(k) => {
                    app.set_range_edit_comfort(k.to_string().into());
                    app.set_range_peak(k);
                    app.set_range_step(STEP_LIMIT);
                    app.set_range_error("".into());
                }
            }
        });
    }
    {
        let weak = ui.as_weak();
        app.on_range_record_limit(move || {
            let Some(ui) = weak.upgrade() else { return };
            let app = ui.global::<App>();
            let comfort: i32 = app.get_range_edit_comfort().parse().unwrap_or(0);
            match knee_now(&app) {
                None => app.set_range_error(NO_LIVE.into()),
                Some(k) if k < comfort => app.set_range_error(
                    format!(
                        "極限範圍不能小於舒適角度({comfort}°)。請繼續彎到更大的角度再記錄,或略過。"
                    )
                    .into(),
                ),
                Some(k) => {
                    app.set_range_edit_limit(k.to_string().into());
                    app.set_range_step(STEP_REVIEW);
                    app.set_range_error("".into());
                }
            }
        });
    }
    {
        let weak = ui.as_weak();
        app.on_range_skip_limit(move || {
            let Some(ui) = weak.upgrade() else { return };
            let app = ui.global::<App>();
            app.set_range_edit_limit("".into());
            app.set_range_step(STEP_REVIEW);
            app.set_range_error("".into());
        });
    }
    {
        let weak = ui.as_weak();
        app.on_range_restart(move || {
            if let Some(ui) = weak.upgrade() {
                restart(&ui.global::<App>());
            }
        });
    }
    {
        let (sim, weak) = (sim.clone(), ui.as_weak());
        app.on_range_save(move || {
            let Some(ui) = weak.upgrade() else { return };
            let app = ui.global::<App>();
            let s = sim.borrow();
            let input = match parse_review(
                &app.get_range_edit_comfort(),
                &app.get_range_edit_limit(),
                &app.get_range_edit_note(),
            ) {
                Ok(input) => input,
                Err(e) => return app.set_range_error(e.into()),
            };
            match s.store.save_range(&input) {
                Ok(()) => {
                    restart(&app);
                    // Saved already: a list refresh failure must not read as a failed save (a retry
                    // would store the measurement twice).
                    if let Err(e) = refresh(&app, &s.store) {
                        app.set_range_error(format!("已儲存,但無法重新載入紀錄:{e}").into());
                        return;
                    }
                    app.set_range_notice(
                        format!(
                            "已儲存:舒適 {}°{}。之後的療程會使用這筆紀錄。",
                            whole(input.comfort_angle),
                            input
                                .limit_angle
                                .map_or(String::new(), |l| format!(" · 極限 {}°", whole(l)))
                        )
                        .into(),
                    );
                }
                Err(e) => app.set_range_error(format!("儲存失敗:{e}").into()),
            }
        });
    }
}

/// Runs a confirmed delete (the confirmation dialog lives in `action_ui`).
pub fn delete(ui: &MainWindow, store: &Store, id: i64) -> Result<(), String> {
    let app = ui.global::<App>();
    store.delete_range(id)?;
    refresh(&app, store)?;
    app.set_range_notice("已刪除一筆量測紀錄。".into());
    Ok(())
}

/// Drives the whole measurement on a real window: comfort, skip, review edit, save, then a confirmed
/// delete through the shared confirmation dialog. Called from the main window test (one window per
/// test process).
#[cfg(test)]
pub fn exercise_flow(ui: &MainWindow) {
    use slint::Model;
    let app = ui.global::<App>();
    let store = Store::open(Some(":memory:".into())).unwrap();
    let actions = store.actions().unwrap();
    let sim = Rc::new(RefCell::new(Sim::new(store, actions)));
    crate::action_ui::wire(
        ui,
        sim.clone(),
        Rc::new(VecModel::default()),
        Rc::new(VecModel::default()),
    );
    wire(ui, sim.clone());
    app.set_closing(false);
    app.set_disconnecting(false);
    app.set_session_locked(false);
    app.set_wizard_open(false);
    app.set_editor_open(false);
    app.set_confirmation_open(false);
    app.set_view(3);
    app.set_tools_tab(0);
    refresh(&app, &sim.borrow().store).unwrap();
    restart(&app);
    assert_eq!((app.get_comfort(), app.get_range_total()), (-1, 0));

    // No live angle: nothing is recorded.
    app.set_conn(0);
    app.invoke_range_record_comfort();
    assert_eq!(app.get_range_step(), STEP_COMFORT);
    assert!(!app.get_range_error().is_empty());

    app.set_conn(2);
    app.set_valid_angle(true);
    app.set_angle(81.6);
    app.invoke_range_record_comfort();
    assert_eq!(app.get_range_step(), STEP_LIMIT);
    assert_eq!(app.get_range_edit_comfort(), "82");
    app.set_angle(97.0);
    observe(&app);
    app.set_angle(90.0);
    observe(&app);
    assert_eq!(app.get_range_peak(), 97, "peak keeps the highest angle");
    // A limit below comfort is refused and the step stays.
    app.set_angle(70.0);
    app.invoke_range_record_limit();
    assert_eq!(app.get_range_step(), STEP_LIMIT);
    app.invoke_range_skip_limit();
    assert_eq!(app.get_range_step(), STEP_REVIEW);
    app.set_range_edit_comfort("80".into());
    app.set_range_edit_note(" 早上量 ".into());
    app.invoke_range_save();
    assert_eq!(app.get_range_step(), STEP_COMFORT);
    assert_eq!(
        (app.get_comfort(), app.get_limit(), app.get_range_total()),
        (80, -1, 1)
    );

    // Second measurement with a limit: still exactly one record per measurement.
    app.set_angle(85.0);
    app.invoke_range_record_comfort();
    app.set_angle(110.0);
    app.invoke_range_record_limit();
    app.invoke_range_save();
    assert_eq!(
        (app.get_comfort(), app.get_limit(), app.get_range_total()),
        (85, 110, 2)
    );
    let rows = app.get_range_rows();
    let first = rows.row_data(0).unwrap();
    assert!(
        first.current && first.text.contains("舒適 85°(+5°)"),
        "{}",
        first.text
    );
    assert!(rows.row_data(1).unwrap().text.contains("早上量"));

    // Deleting the record in force asks first, then falls back to the older one.
    app.invoke_request_delete_range(first.id.clone());
    assert!(app.get_confirmation_open());
    assert_eq!(
        app.get_range_total(),
        2,
        "nothing deleted before confirming"
    );
    app.invoke_confirm_mutation();
    assert!(!app.get_confirmation_open());
    assert_eq!(
        (app.get_comfort(), app.get_limit(), app.get_range_total()),
        (80, -1, 1)
    );
    assert_eq!(
        sim.borrow().store.latest_range().unwrap().comfort,
        Some(80.0)
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(
        id: i64,
        at: &str,
        comfort: f64,
        limit: Option<f64>,
        note: Option<&str>,
    ) -> AngleRangeRecord {
        AngleRangeRecord {
            id,
            measured_at: at.into(),
            metric: "kneeAngle".into(),
            comfort_angle: comfort,
            limit_angle: limit,
            note: note.map(Into::into),
        }
    }

    #[test]
    fn trend_matches_the_module() {
        assert_eq!(trend(Some(95.0), Some(90.0)), "(+5°)");
        assert_eq!(trend(Some(87.0), Some(90.0)), "(−3°)");
        assert_eq!(trend(Some(90.2), Some(90.0)), "(持平)");
        assert_eq!(trend(Some(90.0), None), "");
        assert_eq!(trend(None, Some(90.0)), "");
    }

    #[test]
    fn rows_list_newest_six_with_trends_notes_and_the_one_in_force() {
        let records: Vec<_> = (0..8)
            .map(|i| {
                record(
                    8 - i,
                    "2026-11-22T01:00:00.000Z",
                    100.0 - i as f64 * 2.0,
                    (i == 0).then_some(120.0),
                    (i == 0).then_some("術後第 3 週"),
                )
            })
            .collect();
        let out = rows(&records);
        assert_eq!(out.len(), MAX_LISTED);
        assert!(out[0].current && !out[1].current);
        assert_eq!(out[0].id, "8");
        let first = out[0].text.as_str();
        assert!(first.contains("舒適 100°(+2°)"), "{first}");
        assert!(
            first.contains("極限 120°") && !first.contains("120°("),
            "{first}"
        );
        assert!(first.ends_with("· 術後第 3 週"), "{first}");
        assert!(out[1].text.contains("極限 未設定"));
        let long = record(
            1,
            "2026-11-22T01:00:00.000Z",
            90.0,
            None,
            Some(&"長".repeat(200)),
        );
        let shown = rows(&[long])[0].text.to_string();
        assert!(
            shown.ends_with(&format!("{}…", "長".repeat(NOTE_SHOWN))),
            "{shown}"
        );
        // The last listed row still compares against the (unlisted) older record.
        assert!(out[5].text.contains("(+2°)"));
    }

    #[test]
    fn review_validation_follows_the_module_rules() {
        let ok = parse_review("85", "", "  早上量  ").unwrap();
        assert_eq!((ok.comfort_angle, ok.limit_angle), (85.0, None));
        assert_eq!(ok.note.as_deref(), Some("早上量"));
        assert_eq!(
            parse_review("85°", "110", "").unwrap().limit_angle,
            Some(110.0)
        );
        assert!(parse_review("", "", "").unwrap_err().contains("舒適角度"));
        assert!(parse_review("90", "80", "")
            .unwrap_err()
            .contains("不能小於"));
        assert!(parse_review("190", "", "").is_err());
        assert!(parse_review("abc", "", "").is_err());
        assert!(parse_review("90", "x", "").is_err());
        let long = "字".repeat(250);
        assert_eq!(
            parse_review("90", "", &long)
                .unwrap()
                .note
                .unwrap()
                .chars()
                .count(),
            200
        );
        assert!(parse_review("90", "", "   ").unwrap().note.is_none());
    }

    #[test]
    fn store_keeps_one_record_per_measurement_and_deletes_one_at_a_time() {
        let store = Store::open(Some(":memory:".into())).unwrap();
        store
            .save_range(&parse_review("80", "", "").unwrap())
            .unwrap();
        store
            .save_range(&parse_review("90", "115", "b").unwrap())
            .unwrap();
        let list = store.ranges().unwrap();
        assert_eq!(list.len(), 2);
        let newest = list[0].id;
        assert_eq!(list[0].limit_angle, Some(115.0));
        store.delete_range(newest).unwrap();
        let list = store.ranges().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].comfort_angle, 80.0);
        assert_eq!(store.latest_range().unwrap().comfort, Some(80.0));
    }
}
