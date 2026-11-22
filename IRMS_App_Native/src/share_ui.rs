//! Telemetry opt-in and live share in the window.
//!
//! Telemetry is OFF at every launch (it is not persisted: a person has to turn it on again, so the
//! decision to leave the machine is always current). The live snapshot carries no prescription name
//! and no user-entered text, only numbers and states.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use irms_core::share_session::{format_code, Host, HostStatus, Viewer, ViewerStatus};
use irms_core::telemetry::TelemetryState;
use serde_json::{json, Value};
use slint::{ComponentHandle, ModelRc, SharedString, VecModel};

use crate::{App, MainWindow, ViewerItem};

pub const DEFAULT_ENDPOINT: &str = "https://hina-tw.ddns.net/irms-api";
/// Shown to the host as the viewer's own name when joining; never a person's name.
const VIEWER_NAME: &str = "IRMS 原生版";

pub struct Sharing {
    pub telemetry: Arc<TelemetryState>,
    pub host: Host,
    pub viewer: Viewer,
    pub endpoint: String,
}

impl Sharing {
    pub fn new(
        telemetry: Arc<TelemetryState>,
        runtime: &tokio::runtime::Handle,
        endpoint: String,
    ) -> Self {
        Self {
            telemetry,
            host: Host::new(runtime.clone()),
            viewer: Viewer::new(runtime.clone()),
            endpoint,
        }
    }
}

/// What the live view of another IRMS app needs, as numbers.
pub struct SnapshotInput<'a> {
    pub connected: bool,
    pub demo: bool,
    pub hardware_error: Option<&'a str>,
    pub trigger_type: &'a str,
    pub metric_label: &'a str,
    pub metric_unit: &'a str,
    pub value: Option<f64>,
    pub knee: f64,
    pub thigh: f64,
    pub target_angle: f64,
    pub tolerance: f64,
    pub hold_time_ms: f64,
    pub zone_min: f64,
    pub zone_max: f64,
    pub zone_rest: f64,
    pub comfort: Option<f64>,
    pub limit: Option<f64>,
    pub running: bool,
    pub reps: u32,
    pub hold_progress: f64,
    pub in_zone: bool,
    pub alarm_active: bool,
    pub over_comfort: bool,
    pub elapsed_s: f64,
    pub phase: &'a str,
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

pub fn snapshot(i: &SnapshotInput, now_iso: &str) -> Value {
    json!({
        "t": now_iso,
        "connected": i.connected,
        "demo": i.demo,
        "hardwareError": i.hardware_error,
        "triggerType": i.trigger_type,
        "metric": { "label": i.metric_label, "value": i.value.map(round1), "unit": i.metric_unit },
        "angles": i.connected.then(|| json!({
            "knee": round1(i.knee.max(0.0)),
            "kneeSigned": round1(i.knee),
            "thigh": round1(i.thigh),
            "shin": round1(i.thigh - i.knee),
        })),
        "params": { "targetAngle": i.target_angle, "tolerance": i.tolerance, "holdTimeMs": i.hold_time_ms },
        // An unbounded zone (segment movements) is sent as null, like the Tauri host does.
        "zone": { "min": i.zone_min, "max": i.zone_max.is_finite().then_some(i.zone_max), "rest": i.zone_rest },
        "limits": { "comfort": i.comfort, "limit": i.limit },
        "session": {
            "running": i.running,
            "reps": i.reps,
            "holdProgress": round1(i.hold_progress),
            "inZone": i.in_zone,
            "alarmActive": i.alarm_active,
            "overComfort": i.over_comfort,
            "elapsedSec": i.elapsed_s.round(),
            "phase": i.phase,
        },
    })
}

/// One line per fact a viewer cares about.
pub fn viewer_text(live: &Value, updated_at: Option<&str>) -> String {
    let metric = &live["metric"];
    let value = metric["value"]
        .as_f64()
        .map_or("—".to_string(), |v| format!("{v:.1}"));
    let mut lines = vec![format!(
        "{} {}{}",
        metric["label"].as_str().unwrap_or("指標"),
        value,
        metric["unit"].as_str().unwrap_or("")
    )];
    let s = &live["session"];
    lines.push(if s["running"].as_bool() == Some(true) {
        format!(
            "療程進行中 · 完成 {} 次 · {} 秒",
            s["reps"], s["elapsedSec"]
        )
    } else {
        "療程未開始".to_string()
    });
    let mut flags = Vec::new();
    if live["demo"].as_bool() == Some(true) {
        flags.push("示範資料(非真實量測)".to_string());
    }
    flags.push(if live["connected"].as_bool() == Some(true) {
        "裝置已連線".into()
    } else {
        "裝置未連線".into()
    });
    if let Some(e) = live["hardwareError"].as_str() {
        flags.push(format!("硬體錯誤 {e}"));
    }
    if s["alarmActive"].as_bool() == Some(true) {
        flags.push("⚠ 超過極限範圍".into());
    } else if s["overComfort"].as_bool() == Some(true) {
        flags.push("超過舒適角度".into());
    }
    lines.push(flags.join(" · "));
    if let Some(at) = updated_at {
        lines.push(format!("更新時間 {at}"));
    }
    lines.join("\n")
}

fn status_text(t: &TelemetryState) -> String {
    let s = t.status();
    if !s.enabled {
        return "已關閉:沒有任何資料離開這台電腦。".into();
    }
    let mut text = format!(
        "已開啟 · 待傳 {} · 已傳 {} · 捨棄 {}",
        s.pending, s.sent, s.dropped
    );
    if let Some(e) = s.last_error {
        text.push_str(&format!(" · 最近錯誤:{e}"));
    }
    text
}

pub fn sync(app: &App, sharing: &Sharing) {
    app.set_telemetry_on(sharing.telemetry.enabled());
    app.set_telemetry_status(status_text(&sharing.telemetry).into());
    let h = sharing.host.state();
    app.set_share_host_status(match h.status {
        HostStatus::Idle => 0,
        HostStatus::Starting => 1,
        HostStatus::Sharing => 2,
        HostStatus::Ended => 3,
    });
    app.set_share_code(
        h.code
            .as_deref()
            .map(format_code)
            .unwrap_or_default()
            .into(),
    );
    let mut note = h.error.clone().or(h.warning.clone()).unwrap_or_default();
    if let Some(cmd) = &h.last_command {
        if cmd["ok"].as_bool() == Some(false) {
            note = format!(
                "已拒絕 {} 的參數調整:{}",
                cmd["viewerName"].as_str().unwrap_or("觀看者"),
                cmd["error"].as_str().unwrap_or("")
            );
        }
    }
    app.set_share_host_note(note.into());
    let items: Vec<ViewerItem> = h
        .viewers
        .iter()
        .map(|v| ViewerItem {
            id: v["id"].as_str().unwrap_or("").into(),
            name: v["name"].as_str().unwrap_or("觀看者").into(),
        })
        .collect();
    app.set_share_viewers(ModelRc::from(Rc::new(VecModel::from(items))));
    let v = sharing.viewer.state();
    app.set_share_viewer_status(match v.status {
        ViewerStatus::Idle => 0,
        ViewerStatus::Joining => 1,
        ViewerStatus::Watching => 2,
        ViewerStatus::Ended => 3,
    });
    app.set_share_viewer_note(v.error.clone().unwrap_or_default().into());
    let text = v
        .live
        .as_ref()
        .map_or(String::new(), |l| viewer_text(l, v.updated_at.as_deref()));
    app.set_share_viewer_text(SharedString::from(text));
}

pub fn wire(ui: &MainWindow, sharing: Rc<RefCell<Sharing>>) {
    let app = ui.global::<App>();
    {
        let sharing = sharing.clone();
        app.on_telemetry_set(move |on| {
            let s = sharing.borrow();
            let result = s
                .telemetry
                .configure(on, &s.endpoint, env!("CARGO_PKG_VERSION"));
            if let Err(e) = result {
                s.telemetry.log(
                    "app_log",
                    json!({ "message": format!("telemetry endpoint refused: {e}") }),
                );
            }
            if !on {
                // A share needs ingesting telemetry: turning it off ends a running share.
                s.host.stop(s.endpoint.clone());
            }
        });
    }
    {
        let sharing = sharing.clone();
        app.on_share_start(move || {
            let s = sharing.borrow();
            s.host.start(
                s.endpoint.clone(),
                s.telemetry.run_id().to_string(),
                s.telemetry.enabled(),
            );
        });
    }
    {
        let sharing = sharing.clone();
        app.on_share_stop(move || {
            let s = sharing.borrow();
            s.host.stop(s.endpoint.clone());
        });
    }
    {
        let sharing = sharing.clone();
        app.on_share_kick(move |id| {
            let s = sharing.borrow();
            s.host.kick(s.endpoint.clone(), id.to_string());
        });
    }
    {
        let sharing = sharing.clone();
        app.on_share_join(move |code| {
            let s = sharing.borrow();
            s.viewer
                .join(s.endpoint.clone(), code.as_str(), VIEWER_NAME.into());
        });
    }
    {
        let sharing = sharing.clone();
        app.on_share_leave(move || {
            let s = sharing.borrow();
            s.viewer.leave(s.endpoint.clone());
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> SnapshotInput<'static> {
        SnapshotInput {
            connected: true,
            demo: false,
            hardware_error: None,
            trigger_type: "joint_angle",
            metric_label: "膝關節夾角",
            metric_unit: "°",
            value: Some(41.26),
            knee: 41.26,
            thigh: 10.0,
            target_angle: 60.0,
            tolerance: 5.0,
            hold_time_ms: 3000.0,
            zone_min: 55.0,
            zone_max: 65.0,
            zone_rest: 15.0,
            comfort: Some(90.0),
            limit: None,
            running: true,
            reps: 3,
            hold_progress: 40.0,
            in_zone: false,
            alarm_active: false,
            over_comfort: false,
            elapsed_s: 62.4,
            phase: "idle",
        }
    }

    #[test]
    fn the_snapshot_has_the_contract_fields_and_no_names() {
        let v = snapshot(&input(), "2026-11-17T00:00:00.000Z");
        assert_eq!(v["metric"]["value"], 41.3);
        assert_eq!(v["angles"]["knee"], 41.3);
        assert_eq!(v["angles"]["shin"], -31.3);
        assert_eq!(v["zone"]["max"], 65.0);
        assert_eq!(v["limits"]["comfort"], 90.0);
        assert!(v["limits"]["limit"].is_null());
        assert_eq!(v["session"]["elapsedSec"], 62.0);
        assert_eq!(v["session"]["reps"], 3);
        assert!(v.get("actionName").is_none() && v.get("name").is_none());
        let text = v.to_string();
        assert!(!text.contains("action"), "no prescription names: {text}");
    }

    #[test]
    fn hyperextension_keeps_its_sign_and_an_unbounded_zone_is_null() {
        let mut i = input();
        i.knee = -4.0;
        i.zone_max = f64::INFINITY;
        i.connected = true;
        let v = snapshot(&i, "t");
        assert_eq!(v["angles"]["knee"], 0.0);
        assert_eq!(v["angles"]["kneeSigned"], -4.0);
        assert!(v["zone"]["max"].is_null());
        i.connected = false;
        assert!(snapshot(&i, "t")["angles"].is_null());
    }

    #[test]
    fn a_viewer_sees_state_flags_and_alarms() {
        let mut i = input();
        i.demo = true;
        i.alarm_active = true;
        i.hardware_error = Some("ERR:1");
        let text = viewer_text(&snapshot(&i, "t"), Some("2026-11-17T00:00:00Z"));
        assert!(text.contains("膝關節夾角 41.3°"));
        assert!(text.contains("療程進行中 · 完成 3 次"));
        assert!(
            text.contains("示範資料")
                && text.contains("硬體錯誤 ERR:1")
                && text.contains("超過極限")
        );
        assert!(text.contains("更新時間"));
        i.running = false;
        assert!(viewer_text(&snapshot(&i, "t"), None).contains("療程未開始"));
    }
}
