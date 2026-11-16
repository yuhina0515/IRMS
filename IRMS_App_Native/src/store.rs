//! Persistence for the prototype through `irms_core::db`, the same database layer and schema the
//! shipping app uses.
//!
//! The prototype has its own database file and never opens the Tauri app's
//! (`%APPDATA%\com.irms.app.tauri\irms.sqlite`): default `%LOCALAPPDATA%\irms-native-prototype\irms.sqlite`,
//! or the path given with `--db` (`:memory:` keeps nothing).

use chrono::{DateTime, Local, Utc};
use irms_core::calibration::CalibrationProfile;
use irms_core::db::{
    actions_repo, angle_ranges_repo, calibration_repo, data_repo, init_database, mobility_repo,
    sessions_repo,
};
use irms_core::judge::{
    compute_metric_sample, compute_metric_zone, AngleLimits, TriggerConfig, TriggerType,
};
use irms_core::session_analysis::{analyze_session, MetricPoint};
use irms_core::types::{
    AngleRangeInput, CalibrationProfileInput, CustomAction, MobilityRecordInput, MobilityRecordRow,
    SensorReading, Session, SessionStartInput,
};
use rusqlite::Connection;
use std::path::PathBuf;

/// Readings are written in batches of about one second.
const BATCH: usize = 50;

pub struct Store {
    #[cfg(test)]
    fail_mutation_snapshot: std::cell::Cell<bool>,
    conn: Connection,
    _lock: Option<std::fs::File>,
    pub location: String,
    session_id: Option<i64>,
    pending: Vec<SensorReading>,
    stopped_at: Option<String>,
}

pub struct ActionChange {
    pub saved: Option<CustomAction>,
    pub actions: Vec<CustomAction>,
}

fn default_path() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    Some(
        PathBuf::from(base)
            .join("irms-native-prototype")
            .join("irms.sqlite"),
    )
}

impl Store {
    /// 停止後尚未存妥的療程也會阻擋處方與歷史異動。
    fn allow_mutation(&self) -> Result<(), String> {
        if self.active() {
            Err("請先結束療程並完成儲存".into())
        } else {
            Ok(())
        }
    }
    fn mutation_actions(&self, connection: &Connection) -> rusqlite::Result<Vec<CustomAction>> {
        #[cfg(test)]
        if self.fail_mutation_snapshot.replace(false) {
            return Err(rusqlite::Error::InvalidQuery);
        }
        Ok(actions_repo::list(connection)?
            .into_iter()
            .filter(|a| a.protocol == "knee")
            .collect())
    }
    #[cfg(test)]
    pub fn fail_next_mutation_snapshot(&self) {
        self.fail_mutation_snapshot.set(true);
    }
    pub fn save_action(
        &self,
        id: Option<i64>,
        draft: &crate::action_edit::Draft,
    ) -> Result<ActionChange, String> {
        self.allow_mutation()?;
        let existing = match id {
            Some(id) => Some(
                self.actions()
                    .map_err(|e| e.to_string())?
                    .into_iter()
                    .find(|a| a.id == id)
                    .ok_or("找不到此動作")?,
            ),
            None => None,
        };
        let input = draft.validated(existing.as_ref())?;
        let transaction = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        let saved = match id {
            Some(id) => actions_repo::update(&transaction, id, &input),
            None => actions_repo::create(&transaction, &input),
        }
        .map_err(|e| e.to_string())?;
        let actions = self
            .mutation_actions(&transaction)
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(ActionChange {
            saved: Some(saved),
            actions,
        })
    }
    pub fn delete_action(&self, id: i64) -> Result<ActionChange, String> {
        self.allow_mutation()?;
        if !self
            .actions()
            .map_err(|e| e.to_string())?
            .iter()
            .any(|a| a.id == id)
        {
            return Err("找不到此動作".into());
        }
        let transaction = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        actions_repo::delete(&transaction, id).map_err(|e| e.to_string())?;
        let actions = self
            .mutation_actions(&transaction)
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(ActionChange {
            saved: None,
            actions,
        })
    }
    pub fn restore_actions(&self) -> Result<ActionChange, String> {
        self.allow_mutation()?;
        let transaction = self
            .conn
            .unchecked_transaction()
            .map_err(|e| e.to_string())?;
        actions_repo::replace_defaults_in(&transaction).map_err(|e| e.to_string())?;
        let actions = self
            .mutation_actions(&transaction)
            .map_err(|e| e.to_string())?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(ActionChange {
            saved: None,
            actions,
        })
    }
    pub fn open(path: Option<String>) -> Result<Self, String> {
        let path = match path {
            Some(p) => PathBuf::from(p),
            None => default_path().ok_or("LOCALAPPDATA is not set; pass --db <path>")?,
        };
        let lock = if path.as_os_str() == ":memory:" {
            None
        } else {
            let dir = path
                .parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(std::path::Path::new("."));
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
            let resolved = if path.exists() {
                path.canonicalize()
            } else {
                dir.canonicalize()
                    .map(|dir| dir.join(path.file_name().unwrap_or_default()))
            }
            .map_err(|e| e.to_string())?;
            if let Some(appdata) = std::env::var_os("APPDATA") {
                let shipping = PathBuf::from(appdata).join("com.irms.app.tauri");
                let shipping_db = shipping.join("irms.sqlite");
                let aliases_shipping = resolved.exists()
                    && shipping_db.exists()
                    && same_file::is_same_file(&resolved, &shipping_db)
                        .map_err(|e| e.to_string())?;
                if aliases_shipping
                    || shipping.canonicalize().ok().is_some_and(|dir| {
                        resolved.parent() == Some(dir.as_path())
                            && resolved
                                .file_name()
                                .is_some_and(|name| name.eq_ignore_ascii_case("irms.sqlite"))
                    })
                {
                    return Err("The native prototype requires a separate database".into());
                }
            }
            let mut lock_name = resolved.into_os_string();
            lock_name.push(".lock");
            let file = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(lock_name)
                .map_err(|e| e.to_string())?;
            file.try_lock()
                .map_err(|e| format!("Cannot acquire database lock: {e}"))?;
            Some(file)
        };
        let conn = init_database(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        Ok(Self {
            #[cfg(test)]
            fail_mutation_snapshot: std::cell::Cell::new(false),
            conn,
            _lock: lock,
            location: path.display().to_string(),
            session_id: None,
            pending: Vec::new(),
            stopped_at: None,
        })
    }

    /// Knee prescriptions (the judging supports the knee only, as in the app).
    pub fn actions(&self) -> rusqlite::Result<Vec<CustomAction>> {
        Ok(actions_repo::list(&self.conn)?
            .into_iter()
            .filter(|a| a.protocol == "knee")
            .collect())
    }

    /// The user's latest measured comfort angle and limit, if any.
    pub fn latest_range(&self) -> rusqlite::Result<AngleLimits> {
        Ok(
            match angle_ranges_repo::list(&self.conn)?.into_iter().next() {
                Some(r) => AngleLimits {
                    comfort: Some(r.comfort_angle),
                    limit: r.limit_angle,
                },
                None => AngleLimits::default(),
            },
        )
    }

    /// Records a new measurement (measurements are a history; the newest one is in force).
    pub fn save_range(&self, comfort: f64, limit: Option<f64>) -> Result<(), String> {
        angle_ranges_repo::add(
            &self.conn,
            &AngleRangeInput {
                comfort_angle: comfort,
                limit_angle: limit,
                note: None,
            },
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    }

    /// Removes every measurement, back to "not measured".
    pub fn clear_range(&self) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM angle_range_records", [])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// The calibration in force, restored at startup. A stored profile that no longer parses is
    /// ignored (the wearer calibrates again) instead of blocking the app.
    pub fn active_profile(&self) -> Option<CalibrationProfile> {
        calibration_repo::list(&self.conn)
            .ok()?
            .into_iter()
            .find(|row| row.active)
            .and_then(|row| serde_json::from_str(&row.profile).ok())
    }

    /// Stores `profile` as the only active calibration. A mobility record, when given, is saved
    /// separately afterwards: its failure leaves the calibration applied and is reported back.
    pub fn apply_calibration(
        &mut self,
        profile: &CalibrationProfile,
        mobility: Option<&MobilityRecordInput>,
    ) -> Result<bool, String> {
        self.allow_mutation()?;
        let json = serde_json::to_string(profile).map_err(|e| e.to_string())?;
        calibration_repo::add(
            &mut self.conn,
            &CalibrationProfileInput {
                id: profile.id.clone(),
                side: irms_core::calibration_flow::side_name(profile.side).to_string(),
                profile: json,
                active: true,
            },
        )
        .map_err(|e| e.to_string())?;
        Ok(match mobility {
            Some(input) => mobility_repo::add(&self.conn, input).is_ok(),
            None => true,
        })
    }

    /// Range-of-motion totals, newest first.
    pub fn mobility_rows(&self) -> rusqlite::Result<Vec<MobilityRecordRow>> {
        mobility_repo::list(&self.conn)
    }

    pub fn active(&self) -> bool {
        self.session_id.is_some()
    }

    pub fn start_session(
        &mut self,
        action: &CustomAction,
        limits: &AngleLimits,
        calibration: serde_json::Value,
        simulated: bool,
    ) -> Result<(), String> {
        if self.active() {
            return Err("Previous session still needs saving".into());
        }
        let input = SessionStartInput {
            target_angle: action.target_angle,
            tolerance: action.tolerance,
            hold_time_ms: action.hold_time_ms,
            action_id: Some(action.id),
            action_name: Some(action.name.clone()),
            protocol: Some(action.protocol.clone()),
            trigger_type: Some(action.trigger_type.clone()),
            safety_limit: None,
            comfort_angle: limits.comfort,
            limit_angle: limits.limit,
            calibration,
            // Simulated data must never pass as a real measurement.
            source: if simulated { "demo" } else { "device" }.to_string(),
        };
        self.session_id =
            Some(sessions_repo::start(&self.conn, &input).map_err(|e| e.to_string())?);
        Ok(())
    }

    pub fn push_reading(&mut self, reading: SensorReading) -> rusqlite::Result<()> {
        if !self.active() {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        self.pending.push(reading);
        if self.pending.len() >= BATCH {
            self.flush()?;
        }
        Ok(())
    }

    fn flush(&mut self) -> rusqlite::Result<()> {
        if let Some(id) = self.session_id {
            if !self.pending.is_empty() {
                data_repo::append_batch(&mut self.conn, id, &self.pending)?;
                self.pending.clear();
            }
        }
        Ok(())
    }

    pub fn set_reps(&self, reps: u32) -> rusqlite::Result<()> {
        let id = self
            .session_id
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        sessions_repo::update_reps(&self.conn, id, i64::from(reps))
    }

    pub fn stop_recording(&mut self) {
        self.stopped_at
            .get_or_insert_with(|| Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
    }

    pub fn end_session(&mut self, reps: u32) -> rusqlite::Result<()> {
        let id = self
            .session_id
            .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
        self.stop_recording();
        self.flush()?;
        sessions_repo::end_at(&self.conn, id, i64::from(reps), self.stopped_at.as_deref())?;
        self.stopped_at = None;
        self.session_id = None;
        Ok(())
    }

    pub fn sessions(&self) -> rusqlite::Result<Vec<Session>> {
        sessions_repo::list(&self.conn)
    }

    pub fn delete_session(&self, id: i64) -> rusqlite::Result<Vec<Session>> {
        if self.active() {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let transaction = self.conn.unchecked_transaction()?;
        if !sessions_repo::list(&transaction)?
            .iter()
            .any(|row| row.id == id)
        {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        sessions_repo::delete(&transaction, id)?;
        #[cfg(test)]
        if self.fail_mutation_snapshot.replace(false) {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let rows = sessions_repo::list(&transaction)?;
        transaction.commit()?;
        Ok(rows)
    }

    /// CSV of one stored session with the same metadata header as the Tauri export, from the full
    /// readings (not the downsampled chart data). Returns the suggested file name and the text.
    pub fn export_csv(&self, session: &Session) -> Result<(String, String), String> {
        let readings =
            sessions_repo::get_data(&self.conn, session.id, None).map_err(|e| e.to_string())?;
        let opt = |v: Option<String>| v.unwrap_or_default();
        let num = |v: Option<f64>| opt(v.map(|x| x.to_string()));
        let calibration = session
            .calibration
            .clone()
            .unwrap_or_default()
            .replace('"', "\"\"");
        let meta = [
            format!("# source,{}", session.source),
            format!("# session,{}", session.id),
            format!("# action,{}", opt(session.action_name.clone())),
            format!("# protocol,{}", opt(session.protocol.clone())),
            format!("# triggerType,{}", opt(session.trigger_type.clone())),
            format!("# targetAngle,{}", num(session.target_angle)),
            format!("# tolerance,{}", num(session.tolerance)),
            format!("# holdTimeMs,{}", opt(session.hold_time_ms.map(|v| v.to_string()))),
            format!("# comfortAngle,{}", num(session.comfort_angle)),
            format!("# limitAngle,{}", num(session.limit_angle)),
            format!("# startTime,{}", session.start_time),
            format!("# endTime,{}", opt(session.end_time.clone())),
            format!("# repsCompleted,{}", session.reps_completed),
            format!("# abandoned,{}", session.abandoned != 0),
            format!("# calibration,\"{calibration}\""),
            "# note,thighRoll/shinRoll/kneeRoll are sensor-mounting diagnostics, not validated varus/valgus".to_string(),
        ]
        .join("
");
        let body = readings
            .iter()
            .map(|r| {
                format!(
                    "{},{},{},{},{},{},{}",
                    r.timestamp,
                    r.knee_angle,
                    r.thigh_angle,
                    r.shin_angle,
                    r.knee_roll,
                    r.thigh_roll,
                    r.shin_roll
                )
            })
            .collect::<Vec<_>>()
            .join(
                "
",
            );
        let name = if session.source == "demo" {
            format!("irms_DEMO_session_{}.csv", session.id)
        } else {
            format!("irms_session_{}.csv", session.id)
        };
        Ok((
            name,
            format!(
                "{meta}
timestamp,kneeAngle,thighAngle,shinAngle,kneeRoll,thighRoll,shinRoll
{body}"
            ),
        ))
    }

    /// Review statistics of a stored session, computed from its stored readings (full readings, not
    /// the downsampled chart data) with the prescription and personal range it was recorded with.
    pub fn review(&self, session: &Session) -> String {
        let readings = match sessions_repo::get_data(&self.conn, session.id, None) {
            Ok(r) if !r.is_empty() => r,
            Ok(_) => return "這場沒有儲存的讀數".into(),
            Err(e) => return format!("讀取失敗:{e}"),
        };
        let trigger = session
            .trigger_type
            .as_deref()
            .and_then(TriggerType::parse)
            .unwrap_or(TriggerType::JointAngle);
        let limits = AngleLimits {
            comfort: session.comfort_angle,
            limit: session.limit_angle,
        };
        let tolerance = session.tolerance.unwrap_or(0.0);
        let zone = session.target_angle.map(|target_angle| {
            compute_metric_zone(&TriggerConfig {
                target_angle,
                tolerance,
                hold_time_ms: session.hold_time_ms.unwrap_or(0) as f64,
                trigger_type: trigger,
                limits,
            })
        });
        let points: Vec<MetricPoint> = readings
            .iter()
            .enumerate()
            .map(|(i, r)| MetricPoint {
                t: parse_ms(&r.timestamp).unwrap_or(i as f64 * 40.0),
                v: Some(
                    compute_metric_sample(r.knee_angle, r.thigh_angle, trigger, tolerance).value,
                ),
                k: Some(r.knee_angle),
            })
            .collect();
        let a = analyze_session(&points, zone.as_ref(), &limits);
        let num =
            |v: Option<f64>, unit: &str| v.map_or("—".to_string(), |v| format!("{v:.0}{unit}"));
        let mut out = format!(
            "{} 筆讀數 · 有效量測 {:.1} 秒 · 峰值 {} · 平均 {} · 目標區內 {}",
            readings.len(),
            a.active_sec,
            num(a.peak, "°"),
            num(a.mean, "°"),
            num(a.in_zone_ratio.map(|r| r * 100.0), "%"),
        );
        match a.over_comfort_sec {
            Some(sec) => out.push_str(&format!(" · 超出舒適角度 {sec:.1} 秒")),
            None => out.push_str(" · 未量測舒適角度"),
        }
        if limits.limit.is_some() {
            out.push_str(&format!(
                " · 超出極限 {} 次共 {:.1} 秒",
                a.over_limit_events, a.over_limit_sec
            ));
        }
        out
    }
}

fn parse_utc(iso: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

fn parse_ms(iso: &str) -> Option<f64> {
    parse_utc(iso).map(|d| d.timestamp_millis() as f64)
}

/// Start time in local time for the history list.
pub fn local_start(session: &Session) -> String {
    parse_utc(&session.start_time)
        .map(|d| d.with_timezone(&Local).format("%Y/%m/%d %H:%M").to_string())
        .unwrap_or_else(|| session.start_time.clone())
}

/// `mm:ss` between start and end, or a dash for a session that never ended.
pub fn duration(session: &Session) -> String {
    let span = session
        .end_time
        .as_deref()
        .and_then(parse_utc)
        .zip(parse_utc(&session.start_time));
    match span {
        Some((end, start)) => {
            let s = (end - start).num_seconds().max(0);
            format!("{:02}:{:02}", s / 60, s % 60)
        }
        None => "—".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Store {
        Store::open(Some(":memory:".into())).unwrap()
    }

    fn start(store: &mut Store) -> Result<(), String> {
        let action = store.actions().unwrap().remove(0);
        store.start_session(
            &action,
            &AngleLimits::default(),
            serde_json::Value::Null,
            true,
        )
    }

    fn reading(i: usize) -> SensorReading {
        SensorReading {
            knee_angle: i as f64,
            thigh_angle: 15.0,
            shin_angle: 4.0,
            knee_roll: 3.0,
            thigh_roll: 1.0,
            shin_roll: 4.0,
            timestamp: format!("2026-11-16T09:00:00.{i:03}Z"),
        }
    }

    #[test]
    fn csv_export_has_the_metadata_header_and_every_stored_reading() {
        let mut store = memory();
        start(&mut store).unwrap();
        for i in 0..7 {
            store.push_reading(reading(i)).unwrap();
        }
        store.end_session(1).unwrap();
        let session = store.sessions().unwrap().remove(0);
        let (name, text) = store.export_csv(&session).unwrap();
        assert_eq!(
            name,
            format!("irms_session_{}.csv", session.id).replace(
                "irms_session",
                if session.source == "demo" {
                    "irms_DEMO_session"
                } else {
                    "irms_session"
                }
            )
        );
        let lines: Vec<&str> = text.lines().collect();
        assert!(lines[0].starts_with("# source,"));
        assert!(lines.iter().any(|l| l.starts_with("# calibration,\"")));
        assert!(lines.iter().any(|l| l.starts_with("# note,")));
        let header = lines
            .iter()
            .position(|l| l.starts_with("timestamp,"))
            .unwrap();
        assert_eq!(
            lines.len() - header - 1,
            7,
            "all readings, not a downsample"
        );
        assert!(lines[header + 1].split(',').count() == 7);
    }

    #[test]
    fn failed_start_does_not_activate() {
        let mut store = memory();
        store.conn.execute_batch("CREATE TRIGGER refuse BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'full'); END").unwrap();
        assert!(start(&mut store).is_err());
        assert!(!store.active());
        assert!(store.sessions().unwrap().is_empty());
    }

    #[test]
    fn failed_batch_then_failed_end_retries_without_loss_or_duplication() {
        let mut store = memory();
        start(&mut store).unwrap();
        let id = store.session_id.unwrap();
        store.conn.execute_batch("CREATE TRIGGER refuse BEFORE INSERT ON sensor_data WHEN NEW.kneeAngle = 30 BEGIN SELECT RAISE(ABORT,'full'); END").unwrap();
        for i in 0..BATCH - 1 {
            store.push_reading(reading(i)).unwrap();
        }
        assert!(store.push_reading(reading(BATCH - 1)).is_err());
        assert!(store.end_session(2).is_err());
        let stopped_at = store.stopped_at.clone();
        assert!(store.delete_session(id).is_err());
        assert!(store
            .save_action(None, &crate::action_edit::Draft::new_action())
            .is_err());
        assert!(store.delete_action(store.actions().unwrap()[0].id).is_err());
        assert!(store.restore_actions().is_err());
        assert!(start(&mut store).is_err());
        assert!(sessions_repo::get_data(&store.conn, id, None)
            .unwrap()
            .is_empty());
        store.conn.execute_batch("DROP TRIGGER refuse; CREATE TRIGGER refuse_end BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT,'locked'); END").unwrap();
        assert!(store.end_session(2).is_err());
        assert!(store.active());
        assert!(store.sessions().unwrap()[0].end_time.is_none());
        store.conn.execute_batch("DROP TRIGGER refuse_end").unwrap();
        store.end_session(2).unwrap();
        let samples = sessions_repo::get_data(&store.conn, id, None).unwrap();
        assert_eq!(samples.len(), BATCH);
        assert_eq!(samples[0].thigh_roll, 1.0);
        assert_eq!(samples[0].shin_roll, 4.0);
        let session = &store.sessions().unwrap()[0];
        assert_eq!(session.reps_completed, 2);
        assert_eq!(session.end_time, stopped_at);
        assert!(!store.active());
    }

    #[test]
    fn duplicate_open_cannot_abandon_active_session() {
        let dir = std::env::temp_dir().join(format!("irms-lock-test-{}", std::process::id()));
        let path = dir.join("native.sqlite").display().to_string();
        let mut store = Store::open(Some(path.clone())).unwrap();
        start(&mut store).unwrap();
        assert!(Store::open(Some(path.clone())).is_err());
        assert!(store.sessions().unwrap()[0].end_time.is_none());
        store.push_reading(reading(1)).unwrap();
        store.end_session(1).unwrap();
        drop(store);
        let reopened = Store::open(Some(path)).unwrap();
        let session = &reopened.sessions().unwrap()[0];
        assert_eq!(session.reps_completed, 1);
        assert!(reopened.review(session).contains("1 筆讀數"));
        drop(reopened);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn prescription_changes_keep_session_snapshots_after_reopen_and_preserve_seeding_contract() {
        use crate::action_edit::Draft;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "irms-action-history-{}-{nonce}.sqlite",
            std::process::id()
        ));
        let path_text = path.display().to_string();
        let mut store = Store::open(Some(path_text.clone())).unwrap();
        let draft = Draft {
            name: "Original prescription".into(),
            target: "82.5".into(),
            tolerance: "5.5".into(),
            hold_seconds: "1.234".into(),
            ..Draft::new_action()
        };
        let id = store.save_action(None, &draft).unwrap().saved.unwrap().id;
        store
            .conn
            .execute(
                "UPDATE custom_actions SET safetyLimit=135 WHERE id=?1",
                [id],
            )
            .unwrap();
        let action = store
            .actions()
            .unwrap()
            .into_iter()
            .find(|a| a.id == id)
            .unwrap();
        let limits = AngleLimits {
            comfort: Some(60.0),
            limit: Some(100.0),
        };
        store
            .start_session(
                &action,
                &limits,
                serde_json::json!({"profile":"original"}),
                false,
            )
            .unwrap();
        store.push_reading(reading(1)).unwrap();
        store.end_session(2).unwrap();
        let snapshot = store.sessions().unwrap().remove(0);
        let snapshot_value = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(snapshot.safety_limit, None);
        assert_eq!(
            (snapshot.comfort_angle, snapshot.limit_angle),
            (Some(60.0), Some(100.0))
        );
        let edited = store
            .save_action(
                Some(id),
                &Draft {
                    name: "Changed later".into(),
                    target: "99".into(),
                    ..Draft::from_action(&action)
                },
            )
            .unwrap()
            .saved
            .unwrap();
        assert_eq!(edited.safety_limit, Some(135.0));
        store.delete_action(id).unwrap();
        store.restore_actions().unwrap();
        drop(store);
        let store = Store::open(Some(path_text.clone())).unwrap();
        let reopened = store.sessions().unwrap().remove(0);
        assert_eq!(serde_json::to_value(&reopened).unwrap(), snapshot_value);
        assert!(store.review(&reopened).contains("1 筆讀數"));
        for action in store.actions().unwrap() {
            store.delete_action(action.id).unwrap();
        }
        assert!(store.actions().unwrap().is_empty());
        assert!(!actions_repo::list(&store.conn).unwrap().is_empty());
        drop(store);
        let store = Store::open(Some(path_text.clone())).unwrap();
        assert!(store.actions().unwrap().is_empty());
        for action in actions_repo::list(&store.conn).unwrap() {
            actions_repo::delete(&store.conn, action.id).unwrap();
        }
        drop(store);
        let store = Store::open(Some(path_text)).unwrap();
        assert!(!store.actions().unwrap().is_empty());
        drop(store);
        for suffix in ["", ".lock", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
        }
    }
}
