//! 處方與破壞性操作的 UI 接縫；身分固定為 i64 字串，不信任可變列號。
use super::{action_item, session_rows_from, set_history_rows, App, MainWindow, SessionRow, Sim};
use crate::action_edit::{selected_index, Draft};
use slint::{ComponentHandle, VecModel};
use std::cell::RefCell;
use std::rc::Rc;

enum Pending {
    Action(i64),
    Session(i64),
    Range(i64),
    Restore(u64),
    Preferences,
}
#[derive(Default)]
struct State {
    editing: Option<i64>,
    pending: Option<Pending>,
    revision: u64,
}

/// 宿主在每次請求與執行時重新檢查，不只依賴按鈕的 disabled 外觀。
fn allowed(ui: &MainWindow, s: &Sim) -> bool {
    let app = ui.global::<App>();
    !s.store.active()
        && !s.closing
        && !s.disconnecting
        && !app.get_closing()
        && !app.get_disconnecting()
        && !app.get_wizard_open()
}

#[cfg(test)]
pub fn exercise_crud_and_confirmation_flow(ui: &MainWindow) {
    use super::{action_config, finish_session, pipeline, start_session};
    use crate::store::Store;
    use irms_core::judge::AngleLimits;
    use slint::{Model, ModelRc};
    let app = ui.global::<App>();
    app.set_editor_open(false);
    app.set_confirmation_open(false);
    app.set_closing(false);
    app.set_disconnecting(false);
    app.set_session_locked(false);
    app.set_wizard_open(false);
    app.set_search("".into());
    let store = Store::open(Some(":memory:".into())).unwrap();
    let source = store.actions().unwrap();
    let base = source.len();
    let actions = Rc::new(VecModel::from(
        source.iter().map(action_item).collect::<Vec<_>>(),
    ));
    let sessions = Rc::new(VecModel::default());
    app.set_actions(ModelRc::from(actions.clone()));
    app.set_sessions(ModelRc::from(sessions.clone()));
    let sim = Rc::new(RefCell::new(Sim::new(store, source)));
    app.set_action_index(0);
    wire(ui, sim.clone(), actions.clone(), sessions.clone());

    app.invoke_new_action();
    assert!(app.get_editor_open());
    assert_eq!(app.get_editor_target(), "90");
    assert_eq!(app.get_editor_hold(), "3");
    app.set_editor_name("Patient custom".into());
    app.set_editor_description("Individual prescription".into());
    app.set_editor_target("not a number".into());
    app.invoke_save_action();
    assert!(app.get_editor_open());
    assert!(!app.get_editor_error().is_empty());
    assert_eq!(sim.borrow().actions.len(), base);
    app.set_editor_target("78.5".into());
    app.set_editor_tolerance("5.5".into());
    app.set_editor_hold("1.234".into());
    app.set_editor_trigger(2);
    sim.borrow().store.fail_next_mutation_snapshot();
    app.invoke_save_action();
    assert!(app.get_editor_open());
    assert_eq!(sim.borrow().store.actions().unwrap().len(), base);
    app.invoke_save_action();
    assert!(!app.get_editor_open());
    assert_eq!(sim.borrow().actions.len(), base + 1);
    let custom = sim
        .borrow()
        .actions
        .iter()
        .find(|a| a.name == "Patient custom")
        .unwrap()
        .clone();
    let id = custom.id.to_string();
    assert_eq!(
        (custom.target_angle, custom.tolerance, custom.hold_time_ms),
        (78.5, 5.5, 1234)
    );
    assert_eq!(app.get_picked_action_id(), id);
    assert_eq!(actions.row_count(), base + 1);
    app.invoke_request_delete_action(id.clone().into());
    assert!(app.get_confirmation_open());
    app.invoke_cancel_confirmation();
    app.invoke_confirm_mutation();
    assert!(sim
        .borrow()
        .store
        .actions()
        .unwrap()
        .iter()
        .any(|a| a.id == custom.id));
    app.invoke_edit_action(id.clone().into());
    assert_eq!(app.get_editor_hold(), "1.234");
    app.set_editor_target("82.5".into());
    app.set_editor_hold("1.5".into());
    app.invoke_save_action();
    app.invoke_select_action(id.clone().into());
    assert_eq!(app.get_active_action_id(), id);
    assert_eq!(
        sim.borrow().actions[app.get_action_index() as usize].id,
        custom.id
    );

    // 每次篩選先計算位置再分頁，新增第六筆之後仍可抵達。
    for i in 0..7 {
        app.invoke_new_action();
        app.set_editor_name(format!("Paged {i}").into());
        app.invoke_save_action();
    }
    app.set_search("Paged".into());
    app.invoke_search_edited("Paged".into());
    assert_eq!(app.get_action_matches(), 7);
    assert_eq!(app.get_action_page(), 0);
    let positions: Vec<_> = actions
        .iter()
        .filter(|a| a.shown)
        .map(|a| a.position)
        .collect();
    assert_eq!(positions, (0..7).collect::<Vec<_>>());
    app.set_action_page(1);
    app.set_search("does not exist".into());
    app.invoke_search_edited("does not exist".into());
    assert_eq!(app.get_action_matches(), 0);
    assert_eq!(app.get_action_page(), 0);
    app.set_search("".into());
    app.invoke_search_edited("".into());
    app.invoke_select_action(id.clone().into());

    app.set_conn(2);
    app.set_calibrated(true);
    app.set_valid_angle(true);
    {
        let mut s = sim.borrow_mut();
        let cfg = action_config(
            &s.actions,
            app.get_action_index() as usize,
            AngleLimits::default(),
        );
        s.profile = Some(pipeline::auto_calibrate(&s.rig, &cfg).unwrap());
        start_session(ui, &mut s, true);
        assert!(s.store.active());
    }
    app.invoke_new_action();
    assert!(!app.get_editor_open());
    app.invoke_request_restore_actions();
    assert!(!app.get_confirmation_open());
    app.set_editor_open(true);
    app.set_editor_name("must not save".into());
    app.invoke_save_action();
    assert!(!sim
        .borrow()
        .actions
        .iter()
        .any(|a| a.name == "must not save"));
    app.invoke_cancel_editor();
    assert!(finish_session(ui, &mut sim.borrow_mut(), &sessions));
    let old = sim.borrow().store.sessions().unwrap().remove(0);
    assert_eq!(
        (old.action_id, old.target_angle, old.hold_time_ms),
        (Some(custom.id), Some(82.5), Some(1500))
    );

    app.invoke_edit_action(id.clone().into());
    app.set_editor_target("99".into());
    app.invoke_save_action();
    app.invoke_request_delete_action(id.clone().into());
    sim.borrow().store.fail_next_mutation_snapshot();
    app.invoke_confirm_mutation();
    assert!(app.get_confirmation_open());
    assert!(sim
        .borrow()
        .store
        .actions()
        .unwrap()
        .iter()
        .any(|a| a.id == custom.id));
    app.invoke_confirm_mutation();
    assert!(!app.get_confirmation_open());
    assert!(!sim.borrow().actions.iter().any(|a| a.id == custom.id));
    assert_ne!(app.get_active_action_id(), id);
    let saved = sim.borrow().store.sessions().unwrap().remove(0);
    assert_eq!(
        (
            saved.action_name.as_deref(),
            saved.target_angle,
            saved.hold_time_ms
        ),
        (Some("Patient custom"), Some(82.5), Some(1500))
    );

    app.set_review(0);
    app.invoke_request_delete_session(old.id.to_string().into());
    app.invoke_cancel_confirmation();
    assert_eq!(app.get_review(), 0);
    assert_eq!(sim.borrow().store.sessions().unwrap().len(), 1);
    app.invoke_request_delete_session(old.id.to_string().into());
    {
        let mut s = sim.borrow_mut();
        let action = s.actions[0].clone();
        s.store
            .start_session(
                &action,
                &AngleLimits::default(),
                serde_json::Value::Null,
                true,
            )
            .unwrap();
        s.store.end_session(0).unwrap();
        let rows = s.store.sessions().unwrap();
        set_history_rows(ui, &sessions, session_rows_from(&rows));
    }
    sim.borrow().store.fail_next_mutation_snapshot();
    app.invoke_confirm_mutation();
    assert!(app.get_confirmation_open());
    assert_eq!(sim.borrow().store.sessions().unwrap().len(), 2);
    app.invoke_confirm_mutation();
    assert!(!app.get_confirmation_open());
    let remaining = sim.borrow().store.sessions().unwrap();
    assert_eq!(remaining.len(), 1);
    assert_ne!(remaining[0].id, old.id);

    let before = sim.borrow().actions.len();
    app.invoke_request_restore_actions();
    app.invoke_cancel_confirmation();
    assert_eq!(sim.borrow().actions.len(), before);
    app.invoke_request_restore_actions();
    sim.borrow().store.fail_next_mutation_snapshot();
    app.invoke_confirm_mutation();
    assert_eq!(sim.borrow().actions.len(), before);
    assert!(app.get_confirmation_open());
    app.invoke_confirm_mutation();
    assert_eq!(sim.borrow().actions.len(), base);
    assert!(!app.get_confirmation_open());
    assert!(!app.get_has_picked_action());
    assert_eq!(sim.borrow().store.sessions().unwrap().len(), 1);
    ui.global::<super::Theme>().set_night(true);
    app.invoke_request_reset_preferences();
    app.invoke_cancel_confirmation();
    assert!(ui.global::<super::Theme>().get_night());
    app.invoke_request_reset_preferences();
    app.invoke_confirm_mutation();
    assert!(!ui.global::<super::Theme>().get_night());
    sim.borrow_mut().closing = true;
    app.invoke_new_action();
    assert!(!app.get_editor_open());
    app.invoke_request_restore_actions();
    assert!(!app.get_confirmation_open());
    sim.borrow_mut().closing = false;
    sim.borrow_mut().disconnecting = true;
    app.invoke_request_delete_session(remaining[0].id.to_string().into());
    assert!(!app.get_confirmation_open());
}
fn entry_allowed(ui: &MainWindow, s: &Sim) -> bool {
    let app = ui.global::<App>();
    allowed(ui, s) && !app.get_editor_open() && !app.get_confirmation_open()
}
fn draft(ui: &MainWindow) -> Draft {
    let app = ui.global::<App>();
    Draft {
        name: app.get_editor_name().into(),
        description: app.get_editor_description().into(),
        target: app.get_editor_target().into(),
        tolerance: app.get_editor_tolerance().into(),
        hold_seconds: app.get_editor_hold().into(),
        trigger: app.get_editor_trigger(),
    }
}
fn open_editor(ui: &MainWindow, value: Draft, editing: bool) {
    let app = ui.global::<App>();
    app.set_editor_name(value.name.into());
    app.set_editor_description(value.description.into());
    app.set_editor_target(value.target.into());
    app.set_editor_tolerance(value.tolerance.into());
    app.set_editor_hold(value.hold_seconds.into());
    app.set_editor_trigger(value.trigger);
    app.set_editor_error("".into());
    app.set_editor_editing(editing);
    app.set_editor_open(true);
}
fn filter(
    ui: &MainWindow,
    actions: &VecModel<super::ActionItem>,
    source: &[irms_core::types::CustomAction],
) {
    let app = ui.global::<App>();
    let query = app.get_search().trim().to_lowercase();
    let mut rank = 0;
    let rows: Vec<_> = source
        .iter()
        .map(|value| {
            let mut row = action_item(value);
            row.shown = query.is_empty()
                || row.name.to_lowercase().contains(&query)
                || row.kind.to_lowercase().contains(&query)
                || row.note.to_lowercase().contains(&query);
            row.position = rank;
            if row.shown {
                rank += 1;
            }
            row
        })
        .collect();
    actions.set_vec(rows);
    app.set_action_matches(rank);
    app.set_action_page(app.get_action_page().clamp(0, ((rank - 1).max(0)) / 5));
}
fn pick(ui: &MainWindow, s: &Sim, id: &str) {
    let app = ui.global::<App>();
    if let Some(value) = s.actions.iter().find(|a| a.id.to_string() == id) {
        app.set_picked_action_id(id.into());
        app.set_picked_action(action_item(value));
        app.set_has_picked_action(true);
    } else {
        app.set_picked_action_id("".into());
        app.set_has_picked_action(false);
    }
}
fn apply_actions(
    ui: &MainWindow,
    s: &mut Sim,
    model: &VecModel<super::ActionItem>,
    state: &mut State,
    source: Vec<irms_core::types::CustomAction>,
    picked: Option<String>,
) {
    let app = ui.global::<App>();
    let active = app.get_active_action_id().to_string();
    let picked = picked.unwrap_or_else(|| app.get_picked_action_id().to_string());
    s.actions = source;
    let index = selected_index(&s.actions, Some(&active));
    app.set_action_index(index.map_or(-1, |i| i as i32));
    app.set_active_action_id(
        index
            .map_or_else(String::new, |i| s.actions[i].id.to_string())
            .into(),
    );
    pick(ui, s, &picked);
    filter(ui, model, &s.actions);
    state.revision += 1;
}

pub fn wire(
    ui: &MainWindow,
    sim: Rc<RefCell<Sim>>,
    actions: Rc<VecModel<super::ActionItem>>,
    sessions: Rc<VecModel<SessionRow>>,
) {
    let app = ui.global::<App>();
    let state = Rc::new(RefCell::new(State::default()));
    if let Some(value) = sim
        .borrow()
        .actions
        .get(app.get_action_index().max(0) as usize)
    {
        app.set_active_action_id(value.id.to_string().into());
    }
    filter(ui, &actions, &sim.borrow().actions);
    {
        let (sim, actions) = (sim.clone(), actions.clone());
        let weak = ui.as_weak();
        app.on_search_edited(move |_| {
            if let Some(ui) = weak.upgrade() {
                ui.global::<App>().set_action_page(0);
                filter(&ui, &actions, &sim.borrow().actions);
            }
        });
    }
    {
        let sim = sim.clone();
        let weak = ui.as_weak();
        app.on_pick_action(move |id| {
            if let Some(ui) = weak.upgrade() {
                pick(&ui, &sim.borrow(), &id);
            }
        });
    }
    {
        let sim = sim.clone();
        let weak = ui.as_weak();
        app.on_select_action(move |id| {
            let Some(ui) = weak.upgrade() else { return };
            let s = sim.borrow();
            if !entry_allowed(&ui, &s) {
                return;
            }
            if let Some(index) = s
                .actions
                .iter()
                .position(|a| a.id.to_string() == id.as_str())
            {
                let app = ui.global::<App>();
                app.set_action_index(index as i32);
                app.set_active_action_id(id);
                app.set_view(0);
            }
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_new_action(move || {
            let Some(ui) = weak.upgrade() else { return };
            if !entry_allowed(&ui, &sim.borrow()) {
                return;
            }
            state.borrow_mut().editing = None;
            open_editor(&ui, Draft::new_action(), false);
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_edit_action(move |id| {
            let Some(ui) = weak.upgrade() else { return };
            let s = sim.borrow();
            if !entry_allowed(&ui, &s) {
                return;
            }
            if let Some(value) = s.actions.iter().find(|a| a.id.to_string() == id.as_str()) {
                state.borrow_mut().editing = Some(value.id);
                open_editor(&ui, Draft::from_action(value), true);
            }
        });
    }
    {
        let weak = ui.as_weak();
        app.on_cancel_editor(move || {
            if let Some(ui) = weak.upgrade() {
                ui.global::<App>().set_editor_open(false);
            }
        });
    }
    {
        let (sim, state, actions) = (sim.clone(), state.clone(), actions.clone());
        let weak = ui.as_weak();
        app.on_save_action(move || {
            let Some(ui) = weak.upgrade() else { return };
            let mut s = sim.borrow_mut();
            let app = ui.global::<App>();
            if !app.get_editor_open() {
                return;
            }
            if !allowed(&ui, &s) {
                app.set_editor_error("請先結束療程並完成收尾".into());
                return;
            }
            let id = state.borrow().editing;
            match s.store.save_action(id, &draft(&ui)) {
                Ok(change) => {
                    let saved = change.saved.expect("save returns action");
                    app.set_search("".into());
                    apply_actions(
                        &ui,
                        &mut s,
                        &actions,
                        &mut state.borrow_mut(),
                        change.actions,
                        Some(saved.id.to_string()),
                    );
                    if let Some(index) = s.actions.iter().position(|a| a.id == saved.id) {
                        app.set_action_page(index as i32 / 5);
                    }
                    app.set_editor_open(false);
                    app.set_storage_error("".into());
                }
                Err(error) => app.set_editor_error(error.into()),
            }
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_request_delete_action(move |id| {
            let Some(ui) = weak.upgrade() else { return };
            let s = sim.borrow();
            if !entry_allowed(&ui, &s) {
                return;
            }
            if let Some(value) = s.actions.iter().find(|a| a.id.to_string() == id.as_str()) {
                state.borrow_mut().pending = Some(Pending::Action(value.id));
                let app = ui.global::<App>();
                app.set_confirmation_title("刪除此動作？".into());
                app.set_confirmation_message(
                    format!("將刪除「{}」。過去療程的處方快照會保留。", value.name).into(),
                );
                app.set_confirmation_error("".into());
                app.set_confirmation_open(true);
            }
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_request_restore_actions(move || {
            let Some(ui) = weak.upgrade() else { return };
            if !entry_allowed(&ui, &sim.borrow()) {
                return;
            }
            let mut state = state.borrow_mut();
            state.pending = Some(Pending::Restore(state.revision));
            let app = ui.global::<App>();
            app.set_confirmation_title("還原全部預設動作？".into());
            app.set_confirmation_message(
                "目前全部關節的動作會被替換為預設範本，過去療程仍會保留。".into(),
            );
            app.set_confirmation_error("".into());
            app.set_confirmation_open(true);
        });
    }
    {
        let (sim, state, sessions) = (sim.clone(), state.clone(), sessions.clone());
        let weak = ui.as_weak();
        app.on_request_delete_session(move |id| {
            let Some(ui) = weak.upgrade() else { return };
            let s = sim.borrow();
            if !entry_allowed(&ui, &s) {
                return;
            }
            use slint::Model;
            if let Some(row) = sessions.iter().find(|row| row.id == id) {
                if let Ok(id) = id.parse::<i64>() {
                    state.borrow_mut().pending = Some(Pending::Session(id));
                    let app = ui.global::<App>();
                    app.set_confirmation_title("刪除此療程？".into());
                    app.set_confirmation_message(
                        format!(
                            "{} · {} 的療程與量測讀數將永久刪除。",
                            row.started, row.action
                        )
                        .into(),
                    );
                    app.set_confirmation_error("".into());
                    app.set_confirmation_open(true);
                }
            }
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_request_delete_range(move |id| {
            let Some(ui) = weak.upgrade() else { return };
            if !entry_allowed(&ui, &sim.borrow()) {
                return;
            }
            let app = ui.global::<App>();
            use slint::Model;
            let Some(row) = app.get_range_rows().iter().find(|row| row.id == id) else {
                return;
            };
            let Ok(id) = id.parse::<i64>() else { return };
            state.borrow_mut().pending = Some(Pending::Range(id));
            app.set_confirmation_title("刪除這筆量測紀錄？".into());
            app.set_confirmation_message(
                format!(
                    "{}{}將永久刪除。",
                    row.text,
                    if row.current {
                        "(目前生效,刪除後改用前一筆)"
                    } else {
                        ""
                    }
                )
                .into(),
            );
            app.set_confirmation_error("".into());
            app.set_confirmation_open(true);
        });
    }
    {
        let (sim, state) = (sim.clone(), state.clone());
        let weak = ui.as_weak();
        app.on_request_reset_preferences(move || {
            let Some(ui) = weak.upgrade() else { return };
            if !entry_allowed(&ui, &sim.borrow()) {
                return;
            }
            state.borrow_mut().pending = Some(Pending::Preferences);
            let app = ui.global::<App>();
            app.set_confirmation_title("重設偏好？".into());
            app.set_confirmation_message(
                "已儲存的外觀、語音、姿態與選用處方會替換為預設值。療程資料會保留。".into(),
            );
            app.set_confirmation_error("".into());
            app.set_confirmation_open(true);
        });
    }
    {
        let state = state.clone();
        let weak = ui.as_weak();
        app.on_cancel_confirmation(move || {
            state.borrow_mut().pending = None;
            if let Some(ui) = weak.upgrade() {
                ui.global::<App>().set_confirmation_open(false);
            }
        });
    }
    {
        let weak = ui.as_weak();
        app.on_confirm_mutation(move || {
            let Some(ui) = weak.upgrade() else { return };
            let app = ui.global::<App>();
            let mut s = sim.borrow_mut();
            if !app.get_confirmation_open() {
                state.borrow_mut().pending = None;
                return;
            }
            if !allowed(&ui, &s) {
                app.set_confirmation_error("請先結束療程並完成收尾".into());
                return;
            }
            let mut state = state.borrow_mut();
            let result = match &state.pending {
                Some(Pending::Action(id)) => s.store.delete_action(*id).map(|change| {
                    apply_actions(&ui, &mut s, &actions, &mut state, change.actions, None)
                }),
                Some(Pending::Session(id)) => s
                    .store
                    .delete_session(*id)
                    .map_err(|e| e.to_string())
                    .map(|rows| set_history_rows(&ui, &sessions, session_rows_from(&rows))),
                Some(Pending::Restore(revision)) if *revision == state.revision => {
                    s.store.restore_actions().map(|change| {
                        app.set_active_action_id("".into());
                        apply_actions(
                            &ui,
                            &mut s,
                            &actions,
                            &mut state,
                            change.actions,
                            Some(String::new()),
                        );
                    })
                }
                Some(Pending::Restore(_)) => Err("動作清單已變更，請取消後重新確認".into()),
                Some(Pending::Range(id)) => crate::range_ui::delete(&ui, &s.store, *id),
                Some(Pending::Preferences) => super::reset_preferences(&ui, &mut s),
                None => Err("沒有待確認的操作".into()),
            };
            match result {
                Ok(()) => {
                    state.pending = None;
                    app.set_confirmation_open(false);
                    app.set_storage_error("".into());
                }
                Err(error) => app.set_confirmation_error(error.into()),
            }
        });
    }
}
