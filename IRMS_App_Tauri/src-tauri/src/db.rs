// db.rs — port of main/db.ts. Same three repos (actions/sessions/data), same schema, same
// WAL+foreign_keys pragmas. Deliberately pure functions over &Connection rather than
// #[tauri::command]s here — wiring this up as IPC surface is Phase 2b's job (it needs the
// platform-adapter decision landed first); this phase's job is just "the data layer works and is
// tested," independent of whether anything is calling it through Tauri yet.

use crate::defaults::default_actions;
use crate::downsample::{lttb, Point};
use crate::migrations::{apply_migrations, finalize_orphaned_sessions, MIGRATIONS};
use crate::types::{CustomAction, CustomActionInput, SensorReading, Session, SessionStartInput, StoredReading};
use rusqlite::{params, Connection};

/// Opens/creates the DB at the given path and brings it up to the latest schema — mirrors
/// db.ts's initDatabase, called once at app startup with the Tauri app data dir.
pub fn init_database(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;

    apply_migrations(&conn, MIGRATIONS, |m| println!("{m}"))?;
    finalize_orphaned_sessions(&conn, |m| println!("{m}"))?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM custom_actions", [], |r| r.get(0))?;
    if count == 0 {
        insert_default_actions(&conn)?;
    }
    Ok(conn)
}

fn insert_default_actions(conn: &Connection) -> rusqlite::Result<()> {
    for a in default_actions() {
        conn.execute(
            "INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType, safetyLimit)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![a.name, a.description, a.protocol, a.target_angle, a.tolerance, a.hold_time_ms, a.trigger_type, a.safety_limit],
        )?;
    }
    Ok(())
}

fn row_to_action(row: &rusqlite::Row) -> rusqlite::Result<CustomAction> {
    Ok(CustomAction {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        protocol: row.get("protocol")?,
        target_angle: row.get("targetAngle")?,
        tolerance: row.get("tolerance")?,
        hold_time_ms: row.get("holdTimeMs")?,
        trigger_type: row.get("triggerType")?,
        safety_limit: row.get("safetyLimit")?,
    })
}

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<Session> {
    Ok(Session {
        id: row.get("id")?,
        start_time: row.get("startTime")?,
        end_time: row.get("endTime")?,
        target_angle: row.get("targetAngle")?,
        tolerance: row.get("tolerance")?,
        hold_time_ms: row.get("holdTimeMs")?,
        action_id: row.get("actionId")?,
        action_name: row.get("actionName")?,
        protocol: row.get("protocol")?,
        reps_completed: row.get("repsCompleted")?,
        safety_limit: row.get("safetyLimit")?,
        trigger_type: row.get("triggerType")?,
        calibration: row.get("calibration")?,
        abandoned: row.get("abandoned")?,
        source: row.get("source")?,
    })
}

fn row_to_reading(row: &rusqlite::Row) -> rusqlite::Result<StoredReading> {
    Ok(StoredReading {
        id: row.get("id")?,
        session_id: row.get("sessionId")?,
        // Schema doesn't declare these NOT NULL even though the TS type claims `number` —
        // defensively coalesce a NULL to 0.0 rather than propagating an Option the frontend
        // contract doesn't expect, same discrepancy the original db.ts silently carried.
        knee_angle: row.get::<_, Option<f64>>("kneeAngle")?.unwrap_or(0.0),
        thigh_angle: row.get::<_, Option<f64>>("thighAngle")?.unwrap_or(0.0),
        shin_angle: row.get::<_, Option<f64>>("shinAngle")?.unwrap_or(0.0),
        knee_roll: row.get::<_, Option<f64>>("kneeRoll")?.unwrap_or(0.0),
        thigh_roll: row.get::<_, Option<f64>>("thighRoll")?.unwrap_or(0.0),
        shin_roll: row.get::<_, Option<f64>>("shinRoll")?.unwrap_or(0.0),
        timestamp: row.get("timestamp")?,
    })
}

pub mod actions_repo {
    use super::*;

    pub fn list(conn: &Connection) -> rusqlite::Result<Vec<CustomAction>> {
        let mut stmt = conn.prepare("SELECT * FROM custom_actions ORDER BY id ASC")?;
        let rows = stmt.query_map([], row_to_action)?;
        rows.collect()
    }

    pub fn create(conn: &Connection, input: &CustomActionInput) -> rusqlite::Result<CustomAction> {
        conn.execute(
            "INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType, safetyLimit)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![input.name, input.description, input.protocol, input.target_angle, input.tolerance, input.hold_time_ms, input.trigger_type, input.safety_limit],
        )?;
        let id = conn.last_insert_rowid();
        conn.query_row("SELECT * FROM custom_actions WHERE id = ?1", [id], row_to_action)
    }

    pub fn update(conn: &Connection, id: i64, input: &CustomActionInput) -> rusqlite::Result<CustomAction> {
        conn.execute(
            "UPDATE custom_actions
             SET name=?1, description=?2, protocol=?3, targetAngle=?4, tolerance=?5,
                 holdTimeMs=?6, triggerType=?7, safetyLimit=?8
             WHERE id=?9",
            params![input.name, input.description, input.protocol, input.target_angle, input.tolerance, input.hold_time_ms, input.trigger_type, input.safety_limit, id],
        )?;
        conn.query_row("SELECT * FROM custom_actions WHERE id = ?1", [id], row_to_action)
    }

    pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
        conn.execute("DELETE FROM custom_actions WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Clears existing actions and reloads the default template set (avoids duplicates).
    pub fn restore_defaults(conn: &Connection) -> rusqlite::Result<Vec<CustomAction>> {
        conn.execute_batch("BEGIN")?;
        let result = (|| {
            conn.execute("DELETE FROM custom_actions", [])?;
            insert_default_actions(conn)
        })();
        match result {
            Ok(()) => conn.execute_batch("COMMIT")?,
            Err(e) => {
                conn.execute_batch("ROLLBACK").ok();
                return Err(e);
            }
        }
        list(conn)
    }
}

pub mod sessions_repo {
    use super::*;

    pub fn start(conn: &Connection, input: &SessionStartInput) -> rusqlite::Result<i64> {
        let calibration_json = serde_json::to_string(&input.calibration)
            .unwrap_or_else(|_| "null".to_string());
        conn.execute(
            "INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, actionId, actionName, protocol, triggerType, safetyLimit, calibration, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                input.target_angle,
                input.tolerance,
                input.hold_time_ms,
                input.action_id,
                input.action_name,
                input.protocol,
                input.trigger_type,
                input.safety_limit,
                calibration_json,
                input.source
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Called once per completed rep so a killed/closed session still shows real progress
    /// instead of the stale "0 reps" repsCompleted would otherwise freeze at (see end()).
    pub fn update_reps(conn: &Connection, session_id: i64, reps_completed: i64) -> rusqlite::Result<()> {
        conn.execute(
            "UPDATE sessions SET repsCompleted = ?1 WHERE id = ?2",
            params![reps_completed, session_id],
        )?;
        Ok(())
    }

    /// Deletes every demo-sourced session (sensor_data cascades via the FK). Demo rows are
    /// intentionally visible in History rather than hidden — a hidden row still exists in any DB
    /// copy, just harder to notice — so this exists to make "is there fake data in here" an
    /// answerable question.
    pub fn purge_demo(conn: &Connection) -> rusqlite::Result<usize> {
        let n = conn.execute("DELETE FROM sessions WHERE source = 'demo'", [])?;
        Ok(n)
    }

    pub fn end(conn: &Connection, session_id: i64, reps_completed: i64) -> rusqlite::Result<()> {
        conn.execute(
            "UPDATE sessions
             SET endTime = strftime('%Y-%m-%dT%H:%M:%fZ','now'), repsCompleted = ?1
             WHERE id = ?2",
            params![reps_completed, session_id],
        )?;
        Ok(())
    }

    pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Session>> {
        let mut stmt = conn.prepare("SELECT * FROM sessions ORDER BY startTime DESC")?;
        let rows = stmt.query_map([], row_to_session)?;
        rows.collect()
    }

    /// `max_points`, when given, LTTB-downsamples for chart display (a 25Hz x 10min session is
    /// ~15,000 rows — shipping that whole array over IPC to Chart.js stalls the analysis view).
    /// Omit it for full-fidelity export (CSV).
    pub fn get_data(
        conn: &Connection,
        session_id: i64,
        max_points: Option<usize>,
    ) -> rusqlite::Result<Vec<StoredReading>> {
        let mut stmt = conn.prepare(
            "SELECT * FROM sensor_data WHERE sessionId = ?1 ORDER BY timestamp ASC, id ASC",
        )?;
        let rows: Vec<StoredReading> = stmt.query_map([session_id], row_to_reading)?.collect::<rusqlite::Result<_>>()?;

        let Some(max_points) = max_points else {
            return Ok(rows);
        };
        if rows.len() <= max_points {
            return Ok(rows);
        }

        // LTTB needs a numeric x axis; use the parsed timestamp (ms since epoch) falling back to
        // the row's own index if parsing fails, same defensive fallback as the TS version's
        // `Date.parse(r.timestamp) || i`.
        let points: Vec<Point> = rows
            .iter()
            .enumerate()
            .map(|(i, r)| Point {
                x: parse_timestamp_millis(&r.timestamp).unwrap_or(i as f64),
                y: r.knee_angle,
            })
            .collect();
        let sampled = lttb(&points, max_points);

        // Map sampled points back to their source rows by matching (x, y) — points carry no
        // index, so recover it the same way the TS version does implicitly via array identity;
        // here we rebuild via a parallel index scan since Rust doesn't share object identity.
        let mut out = Vec::with_capacity(sampled.len());
        for p in &sampled {
            if let Some((idx, _)) = points.iter().enumerate().find(|(_, pt)| pt.x == p.x && pt.y == p.y) {
                out.push(rows[idx].clone());
            }
        }
        Ok(out)
    }

    pub fn delete(conn: &Connection, session_id: i64) -> rusqlite::Result<()> {
        // sensor_data cascades via the FK.
        conn.execute("DELETE FROM sessions WHERE id = ?1", [session_id])?;
        Ok(())
    }
}

pub mod data_repo {
    use super::*;

    /// Single-transaction batch insert (replaces the old per-reading HTTP POST from v1).
    pub fn append_batch(conn: &mut Connection, session_id: i64, readings: &[SensorReading]) -> rusqlite::Result<usize> {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO sensor_data (sessionId, timestamp, kneeAngle, thighAngle, shinAngle, kneeRoll, thighRoll, shinRoll)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for r in readings {
                stmt.execute(params![
                    session_id,
                    r.timestamp,
                    r.knee_angle,
                    r.thigh_angle,
                    r.shin_angle,
                    r.knee_roll,
                    r.thigh_roll,
                    r.shin_roll
                ])?;
            }
        }
        tx.commit()?;
        Ok(readings.len())
    }
}

fn parse_timestamp_millis(iso: &str) -> Option<f64> {
    use chrono::DateTime;
    DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.timestamp_millis() as f64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::apply_migrations as run_migrations;

    fn fresh_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn, MIGRATIONS, |_| {}).unwrap();
        conn
    }

    fn sample_input() -> CustomActionInput {
        CustomActionInput {
            name: "Test Squat".to_string(),
            description: Some("desc".to_string()),
            protocol: "knee".to_string(),
            target_angle: 90.0,
            tolerance: 10.0,
            hold_time_ms: 3000,
            trigger_type: "joint_angle".to_string(),
            safety_limit: Some(135.0),
        }
    }

    #[test]
    fn fresh_database_seeds_default_actions() {
        let dir = std::env::temp_dir().join(format!("irms_test_{}.sqlite", uuid::Uuid::new_v4()));
        let conn = init_database(&dir).unwrap();
        let actions = actions_repo::list(&conn).unwrap();
        assert_eq!(actions.len(), default_actions().len());
        drop(conn);
        std::fs::remove_file(&dir).ok();
    }

    #[test]
    fn actions_repo_crud_roundtrip() {
        let conn = fresh_db();
        let created = actions_repo::create(&conn, &sample_input()).unwrap();
        assert_eq!(created.name, "Test Squat");
        assert!(created.id > 0);

        let mut updated_input = sample_input();
        updated_input.name = "Renamed Squat".to_string();
        let updated = actions_repo::update(&conn, created.id, &updated_input).unwrap();
        assert_eq!(updated.name, "Renamed Squat");

        let listed = actions_repo::list(&conn).unwrap();
        assert_eq!(listed.len(), 1);

        actions_repo::delete(&conn, created.id).unwrap();
        assert_eq!(actions_repo::list(&conn).unwrap().len(), 0);
    }

    #[test]
    fn restore_defaults_clears_and_reloads_without_duplicates() {
        let conn = fresh_db();
        actions_repo::create(&conn, &sample_input()).unwrap();
        actions_repo::create(&conn, &sample_input()).unwrap();
        let restored = actions_repo::restore_defaults(&conn).unwrap();
        assert_eq!(restored.len(), default_actions().len());
    }

    fn sample_session_input() -> SessionStartInput {
        SessionStartInput {
            target_angle: 90.0,
            tolerance: 10.0,
            hold_time_ms: 3000,
            action_id: None,
            action_name: Some("Test".to_string()),
            protocol: Some("knee".to_string()),
            trigger_type: Some("joint_angle".to_string()),
            safety_limit: Some(135.0),
            calibration: serde_json::json!({"thighInvert": false}),
            source: "device".to_string(),
        }
    }

    #[test]
    fn sessions_repo_start_update_end_roundtrip() {
        let conn = fresh_db();
        let id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        assert!(id > 0);

        sessions_repo::update_reps(&conn, id, 5).unwrap();
        let mid = sessions_repo::list(&conn).unwrap();
        assert_eq!(mid[0].reps_completed, 5);
        assert!(mid[0].end_time.is_none());

        sessions_repo::end(&conn, id, 12).unwrap();
        let done = sessions_repo::list(&conn).unwrap();
        assert_eq!(done[0].reps_completed, 12);
        assert!(done[0].end_time.is_some());
        assert_eq!(done[0].source, "device");
    }

    #[test]
    fn purge_demo_only_deletes_demo_sessions() {
        let conn = fresh_db();
        let mut real_input = sample_session_input();
        real_input.source = "device".to_string();
        let mut demo_input = sample_session_input();
        demo_input.source = "demo".to_string();

        sessions_repo::start(&conn, &real_input).unwrap();
        sessions_repo::start(&conn, &demo_input).unwrap();
        assert_eq!(sessions_repo::list(&conn).unwrap().len(), 2);

        let deleted = sessions_repo::purge_demo(&conn).unwrap();
        assert_eq!(deleted, 1);
        let remaining = sessions_repo::list(&conn).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].source, "device");
    }

    #[test]
    fn data_repo_append_batch_and_get_data_full_fidelity() {
        let mut conn = fresh_db();
        let session_id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        let readings = vec![
            SensorReading {
                knee_angle: 10.0,
                thigh_angle: 5.0,
                shin_angle: 5.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: "2026-09-07T10:00:00.000Z".to_string(),
            },
            SensorReading {
                knee_angle: 20.0,
                thigh_angle: 10.0,
                shin_angle: 10.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: "2026-09-07T10:00:00.040Z".to_string(),
            },
        ];
        let count = data_repo::append_batch(&mut conn, session_id, &readings).unwrap();
        assert_eq!(count, 2);

        let full = sessions_repo::get_data(&conn, session_id, None).unwrap();
        assert_eq!(full.len(), 2);
        assert_eq!(full[0].knee_angle, 10.0);
        assert_eq!(full[1].knee_angle, 20.0);
    }

    #[test]
    fn get_data_downsamples_when_over_max_points() {
        let mut conn = fresh_db();
        let session_id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        let readings: Vec<SensorReading> = (0..1000)
            .map(|i| SensorReading {
                knee_angle: (i as f64 / 10.0).sin() * 90.0,
                thigh_angle: 0.0,
                shin_angle: 0.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: format!("2026-09-07T10:{:02}:{:02}.000Z", i / 60, i % 60),
            })
            .collect();
        data_repo::append_batch(&mut conn, session_id, &readings).unwrap();

        let sampled = sessions_repo::get_data(&conn, session_id, Some(100)).unwrap();
        assert_eq!(sampled.len(), 100);
    }

    #[test]
    fn cascade_delete_removes_sensor_data_with_session() {
        let mut conn = fresh_db();
        let session_id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        data_repo::append_batch(
            &mut conn,
            session_id,
            &[SensorReading {
                knee_angle: 1.0,
                thigh_angle: 1.0,
                shin_angle: 1.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: "2026-09-07T10:00:00.000Z".to_string(),
            }],
        )
        .unwrap();

        sessions_repo::delete(&conn, session_id).unwrap();
        let remaining = sessions_repo::get_data(&conn, session_id, None).unwrap();
        assert_eq!(remaining.len(), 0);
    }
}
