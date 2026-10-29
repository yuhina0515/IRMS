// db.rs — port of main/db.ts. Same three repos (actions/sessions/data), same schema, same
// WAL+foreign_keys pragmas. Deliberately pure functions over &Connection rather than
// #[tauri::command]s here — wiring this up as IPC surface is Phase 2b's job (it needs the
// platform-adapter decision landed first); this phase's job is just "the data layer works and is
// tested," independent of whether anything is calling it through Tauri yet.

use crate::defaults::default_actions;
use crate::downsample::{lttb, Point};
use crate::migrations::{apply_migrations, finalize_orphaned_sessions, MIGRATIONS};
use crate::types::{
    AngleRangeInput, AngleRangeRecord, CustomAction, CustomActionInput, SensorReading, Session,
    SessionStartInput, StoredReading,
};
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
        comfort_angle: row.get("comfortAngle")?,
        limit_angle: row.get("limitAngle")?,
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
        conn.query_row(
            "SELECT * FROM custom_actions WHERE id = ?1",
            [id],
            row_to_action,
        )
    }

    pub fn update(
        conn: &Connection,
        id: i64,
        input: &CustomActionInput,
    ) -> rusqlite::Result<CustomAction> {
        conn.execute(
            "UPDATE custom_actions
             SET name=?1, description=?2, protocol=?3, targetAngle=?4, tolerance=?5,
                 holdTimeMs=?6, triggerType=?7, safetyLimit=?8
             WHERE id=?9",
            params![
                input.name,
                input.description,
                input.protocol,
                input.target_angle,
                input.tolerance,
                input.hold_time_ms,
                input.trigger_type,
                input.safety_limit,
                id
            ],
        )?;
        conn.query_row(
            "SELECT * FROM custom_actions WHERE id = ?1",
            [id],
            row_to_action,
        )
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

pub mod angle_ranges_repo {
    use super::*;

    fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<AngleRangeRecord> {
        Ok(AngleRangeRecord {
            id: row.get("id")?,
            measured_at: row.get("measuredAt")?,
            metric: row.get("metric")?,
            comfort_angle: row.get("comfortAngle")?,
            limit_angle: row.get("limitAngle")?,
            note: row.get("note")?,
        })
    }

    /// Newest first.
    pub fn list(conn: &Connection) -> rusqlite::Result<Vec<AngleRangeRecord>> {
        let mut stmt =
            conn.prepare("SELECT * FROM angle_range_records ORDER BY measuredAt DESC, id DESC")?;
        let rows = stmt.query_map([], row_to_record)?;
        rows.collect()
    }

    pub fn add(conn: &Connection, input: &AngleRangeInput) -> rusqlite::Result<AngleRangeRecord> {
        conn.execute(
            "INSERT INTO angle_range_records (comfortAngle, limitAngle, note) VALUES (?1, ?2, ?3)",
            params![input.comfort_angle, input.limit_angle, input.note],
        )?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT * FROM angle_range_records WHERE id = ?1",
            [id],
            row_to_record,
        )
    }

    pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
        conn.execute("DELETE FROM angle_range_records WHERE id = ?1", [id])?;
        Ok(())
    }
}

pub mod mobility_repo {
    use super::*;
    use crate::types::{MobilityRecordInput, MobilityRecordRow};

    fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<MobilityRecordRow> {
        Ok(MobilityRecordRow {
            id: row.get("id")?,
            measured_at: row.get("measuredAt")?,
            movement_set: row.get("movementSet")?,
            total_deg: row.get("totalDeg")?,
            detail: row.get("detail")?,
        })
    }

    /// Newest first.
    pub fn list(conn: &Connection) -> rusqlite::Result<Vec<MobilityRecordRow>> {
        let mut stmt =
            conn.prepare("SELECT * FROM mobility_records ORDER BY measuredAt DESC, id DESC")?;
        let rows = stmt.query_map([], row_to_record)?;
        rows.collect()
    }

    pub fn add(
        conn: &Connection,
        input: &MobilityRecordInput,
    ) -> rusqlite::Result<MobilityRecordRow> {
        conn.execute(
            "INSERT INTO mobility_records (movementSet, totalDeg, detail) VALUES (?1, ?2, ?3)",
            params![input.movement_set, input.total_deg, input.detail],
        )?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT * FROM mobility_records WHERE id = ?1",
            [id],
            row_to_record,
        )
    }

    pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
        conn.execute("DELETE FROM mobility_records WHERE id = ?1", [id])?;
        Ok(())
    }
}

pub mod sessions_repo {
    use super::*;

    pub fn start(conn: &Connection, input: &SessionStartInput) -> rusqlite::Result<i64> {
        let calibration_json =
            serde_json::to_string(&input.calibration).unwrap_or_else(|_| "null".to_string());
        conn.execute(
            "INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, actionId, actionName, protocol, triggerType, safetyLimit, calibration, source, comfortAngle, limitAngle)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
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
                input.source,
                input.comfort_angle,
                input.limit_angle
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Called once per completed rep so a killed/closed session still shows real progress
    /// instead of the stale "0 reps" repsCompleted would otherwise freeze at (see end()).
    pub fn update_reps(
        conn: &Connection,
        session_id: i64,
        reps_completed: i64,
    ) -> rusqlite::Result<()> {
        conn.execute(
            "UPDATE sessions SET repsCompleted = ?1 WHERE id = ?2",
            params![reps_completed, session_id],
        )?;
        Ok(())
    }

    /// Deletes completed demo-sourced sessions (sensor_data cascades via the FK). Demo rows are
    /// intentionally visible in History rather than hidden — a hidden row still exists in any DB
    /// copy, just harder to notice — so this exists to make "is there fake data in here" an
    /// answerable question.
    pub fn purge_demo(conn: &Connection) -> rusqlite::Result<usize> {
        // 尚未結束的示範療程可能仍有待回補資料，不能由歷史清除操作刪掉。
        let n = conn.execute(
            "DELETE FROM sessions WHERE source = 'demo' AND endTime IS NOT NULL",
            [],
        )?;
        Ok(n)
    }

    pub fn end(conn: &Connection, session_id: i64, reps_completed: i64) -> rusqlite::Result<()> {
        let changed = conn.execute(
            "UPDATE sessions
             SET endTime = COALESCE(endTime, strftime('%Y-%m-%dT%H:%M:%fZ','now')), repsCompleted = ?1
             WHERE id = ?2",
            params![reps_completed, session_id],
        )?;
        // 不存在的療程不能回報已儲存；重試則保留首次成功結束的時間。
        if changed != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
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
        let rows: Vec<StoredReading> = stmt
            .query_map([session_id], row_to_reading)?
            .collect::<rusqlite::Result<_>>()?;

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

        // lttb keeps input order, so walk forward with a cursor: matching on (x, y) alone would
        // resolve two same-millisecond, same-angle rows to the first one twice.
        let mut out = Vec::with_capacity(sampled.len());
        let mut cursor = 0;
        for p in &sampled {
            if let Some(offset) = points[cursor..]
                .iter()
                .position(|pt| pt.x == p.x && pt.y == p.y)
            {
                out.push(rows[cursor + offset].clone());
                cursor += offset + 1;
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
    pub fn append_batch(
        conn: &mut Connection,
        session_id: i64,
        readings: &[SensorReading],
    ) -> rusqlite::Result<usize> {
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

    /// 手動 file-backed WAL 基準；使用暫存合成資料，不接觸應用程式 DB。
    #[test]
    #[ignore = "manual offline performance baseline"]
    fn readiness_benchmark_database() {
        use crate::readiness_benchmark::summary;
        use std::time::Instant;
        let mut results = Vec::new();
        for batch_size in [25, 1000] {
            let db_path =
                std::env::temp_dir().join(format!("irms_bench_{}.sqlite", uuid::Uuid::new_v4()));
            let mut conn = init_database(&db_path).unwrap();
            let session = sessions_repo::start(&conn, &sample_session_input()).unwrap();
            let rows: Vec<SensorReading> = (0..15000)
                .map(|i| SensorReading {
                    timestamp: chrono::DateTime::from_timestamp_millis(1790647200000 + i * 40)
                        .unwrap()
                        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
                    knee_angle: (i as f64 / 10.0).sin() * 90.0,
                    thigh_angle: 0.0,
                    shin_angle: 0.0,
                    knee_roll: 0.0,
                    thigh_roll: 0.0,
                    shin_roll: 0.0,
                })
                .collect();
            // 獨立暖機療程，避免暖機資料污染被量測療程的列數。
            let warm_session = sessions_repo::start(&conn, &sample_session_input()).unwrap();
            for _ in 0..3 {
                data_repo::append_batch(&mut conn, warm_session, &rows[..batch_size]).unwrap();
            }
            sessions_repo::delete(&conn, warm_session).unwrap();
            let mut append_ms = Vec::new();
            for chunk in rows.chunks(batch_size) {
                let start = Instant::now();
                assert_eq!(
                    data_repo::append_batch(&mut conn, session, chunk).unwrap(),
                    chunk.len()
                );
                append_ms.push(start.elapsed().as_secs_f64() * 1000.0);
            }
            let count: usize = conn
                .query_row(
                    "SELECT COUNT(*) FROM sensor_data WHERE sessionId=?1",
                    [session],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(count, rows.len());
            let mut queries = Vec::new();
            for run in 0..13 {
                let start = Instant::now();
                let data = sessions_repo::get_data(&conn, session, Some(100)).unwrap();
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                assert_eq!(data.len(), 100);
                if run >= 3 {
                    queries.push(elapsed);
                }
            }
            results.push(serde_json::json!({"batchSize": batch_size, "rows": count,
                "appendBatch": summary(append_ms), "query15000To100": summary(queries),
                "queryScope": "loads all rows, parses timestamps, then LTTB; not bounded-memory query"}));
            drop(conn);
            std::fs::remove_file(&db_path).unwrap();
        }
        println!(
            "IRMS_BENCH:{}",
            serde_json::json!({"kind": "database", "mode": "debug file-backed WAL, accelerated inserts", "results": results})
        );
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
            comfort_angle: None,
            limit_angle: None,
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
    fn session_end_rejects_missing_record_and_preserves_first_end_time() {
        let conn = fresh_db();
        assert!(sessions_repo::end(&conn, 9999, 2).is_err());
        let id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        sessions_repo::end(&conn, id, 2).unwrap();
        conn.execute(
            "UPDATE sessions SET endTime = '2026-10-21T00:00:00.000Z' WHERE id = ?1",
            [id],
        )
        .unwrap();
        sessions_repo::end(&conn, id, 2).unwrap();
        let saved = sessions_repo::list(&conn).unwrap();
        assert_eq!(
            saved[0].end_time.as_deref(),
            Some("2026-10-21T00:00:00.000Z")
        );
        assert_eq!(saved[0].reps_completed, 2);
        sessions_repo::delete(&conn, id).unwrap();
        assert!(sessions_repo::end(&conn, id, 2).is_err());
    }

    #[test]
    fn purge_demo_only_deletes_demo_sessions() {
        let conn = fresh_db();
        let mut real_input = sample_session_input();
        real_input.source = "device".to_string();
        let mut demo_input = sample_session_input();
        demo_input.source = "demo".to_string();

        sessions_repo::start(&conn, &real_input).unwrap();
        let completed = sessions_repo::start(&conn, &demo_input).unwrap();
        sessions_repo::end(&conn, completed, 0).unwrap();
        let pending = sessions_repo::start(&conn, &demo_input).unwrap();
        assert_eq!(sessions_repo::list(&conn).unwrap().len(), 3);

        let deleted = sessions_repo::purge_demo(&conn).unwrap();
        assert_eq!(deleted, 1);
        let remaining = sessions_repo::list(&conn).unwrap();
        assert_eq!(remaining.len(), 2);
        assert!(remaining.iter().any(|s| s.source == "device"));
        assert!(remaining
            .iter()
            .any(|s| s.id == pending && s.end_time.is_none()));
    }

    #[test]
    fn failed_batch_rolls_back_all_readings_before_retry() {
        let mut conn = fresh_db();
        let id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        let readings: Vec<SensorReading> = [1.0, 99.0]
            .into_iter()
            .map(|angle| SensorReading {
                knee_angle: angle,
                thigh_angle: 0.0,
                shin_angle: 0.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: "2026-10-21T00:00:00.000Z".to_string(),
            })
            .collect();
        conn.execute_batch(
            "CREATE TEMP TRIGGER reject_second_reading BEFORE INSERT ON sensor_data
            WHEN NEW.kneeAngle = 99 BEGIN SELECT RAISE(ABORT, 'injected failure'); END;",
        )
        .unwrap();
        assert!(data_repo::append_batch(&mut conn, id, &readings).is_err());
        assert!(sessions_repo::get_data(&conn, id, None).unwrap().is_empty());
        conn.execute_batch("DROP TRIGGER reject_second_reading;")
            .unwrap();
        assert_eq!(
            data_repo::append_batch(&mut conn, id, &readings).unwrap(),
            2
        );
        assert_eq!(sessions_repo::get_data(&conn, id, None).unwrap().len(), 2);
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
    fn mobility_roundtrip_and_constraints() {
        let db = fresh_db();
        let a = mobility_repo::add(
            &db,
            &crate::types::MobilityRecordInput {
                movement_set: "kneeFlexion".into(),
                total_deg: 130.5,
                detail: "{\"peaks\":{\"kneeFlexion\":130.5}}".into(),
            },
        )
        .unwrap();
        assert_eq!(a.total_deg, 130.5);
        assert!(a.detail.contains("kneeFlexion"));
        assert_eq!(mobility_repo::list(&db).unwrap().len(), 1);
        for bad in [("", 10.0), ("kneeFlexion", -1.0), ("kneeFlexion", 5000.0)] {
            assert!(mobility_repo::add(
                &db,
                &crate::types::MobilityRecordInput {
                    movement_set: bad.0.into(),
                    total_deg: bad.1,
                    detail: "{}".into(),
                },
            )
            .is_err());
        }
        mobility_repo::delete(&db, a.id).unwrap();
        assert!(mobility_repo::list(&db).unwrap().is_empty());
    }

    #[test]
    fn downsampling_never_returns_the_same_row_twice() {
        let mut conn = fresh_db();
        let session_id = sessions_repo::start(&conn, &sample_session_input()).unwrap();
        // Same timestamp and knee angle on every row; only thigh_angle tells them apart.
        let readings: Vec<SensorReading> = (0..50)
            .map(|i| SensorReading {
                knee_angle: 30.0,
                thigh_angle: i as f64,
                shin_angle: 0.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: "2026-09-07T10:00:00.000Z".to_string(),
            })
            .collect();
        data_repo::append_batch(&mut conn, session_id, &readings).unwrap();

        let sampled = sessions_repo::get_data(&conn, session_id, Some(10)).unwrap();
        let mut thighs: Vec<i64> = sampled.iter().map(|r| r.thigh_angle as i64).collect();
        let total = thighs.len();
        thighs.sort_unstable();
        thighs.dedup();
        assert_eq!(thighs.len(), total, "duplicate rows returned");
    }

    #[test]
    fn angle_ranges_roundtrip_and_constraints() {
        let db = fresh_db();
        let a = angle_ranges_repo::add(
            &db,
            &AngleRangeInput {
                comfort_angle: 95.0,
                limit_angle: None,
                note: None,
            },
        )
        .unwrap();
        let b = angle_ranges_repo::add(
            &db,
            &AngleRangeInput {
                comfort_angle: 100.0,
                limit_angle: Some(120.0),
                note: Some("x".into()),
            },
        )
        .unwrap();
        let list = angle_ranges_repo::list(&db).unwrap();
        assert_eq!(
            list.iter().map(|r| r.id).collect::<Vec<_>>(),
            vec![b.id, a.id]
        );
        assert_eq!(list[0].metric, "kneeAngle");
        // limit below comfort and out-of-range angles are rejected by the schema
        assert!(angle_ranges_repo::add(
            &db,
            &AngleRangeInput {
                comfort_angle: 100.0,
                limit_angle: Some(90.0),
                note: None
            }
        )
        .is_err());
        assert!(angle_ranges_repo::add(
            &db,
            &AngleRangeInput {
                comfort_angle: 200.0,
                limit_angle: None,
                note: None
            }
        )
        .is_err());
        angle_ranges_repo::delete(&db, a.id).unwrap();
        assert_eq!(angle_ranges_repo::list(&db).unwrap().len(), 1);
    }

    #[test]
    fn sessions_snapshot_comfort_and_limit() {
        let db = fresh_db();
        let mut input = sample_session_input();
        input.comfort_angle = Some(95.0);
        input.limit_angle = Some(118.0);
        let id = sessions_repo::start(&db, &input).unwrap();
        let s = sessions_repo::list(&db)
            .unwrap()
            .into_iter()
            .find(|s| s.id == id)
            .unwrap();
        assert_eq!((s.comfort_angle, s.limit_angle), (Some(95.0), Some(118.0)));
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
