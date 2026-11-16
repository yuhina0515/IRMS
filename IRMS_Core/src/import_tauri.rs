//! One-way import of the Tauri app's records into another database (the native app's).
//!
//! Both apps use the same schema and migrations, so the records are copied table by table with their
//! ids kept (sessions point at prescriptions and readings point at sessions). The source file is never
//! opened in place: it is copied (with its WAL) to a scratch folder, migrated there to the current
//! schema, read, and the scratch copy is deleted. The Tauri database is not modified.
//!
//! The target must be fresh (no sessions, readings, personal ranges, mobility records or
//! calibrations); its seeded default prescriptions are replaced by the source's. Everything happens in
//! one transaction: a failure leaves the target as it was.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use crate::db::init_database;
use crate::migrations::MIGRATIONS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Report {
    pub actions: i64,
    pub sessions: i64,
    pub readings: i64,
    pub ranges: i64,
    pub mobility: i64,
    pub profiles: i64,
}

const USER_TABLES: [&str; 5] = [
    "sessions",
    "sensor_data",
    "angle_range_records",
    "mobility_records",
    "calibration_profiles",
];

/// No user data yet: the only rows are the seeded prescriptions.
pub fn is_fresh(conn: &Connection) -> rusqlite::Result<bool> {
    for t in USER_TABLES {
        let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0))?;
        if n > 0 {
            return Ok(false);
        }
    }
    Ok(true)
}

fn count(conn: &Connection, schema: &str, table: &str) -> rusqlite::Result<i64> {
    conn.query_row(&format!("SELECT COUNT(*) FROM {schema}.{table}"), [], |r| {
        r.get(0)
    })
}

struct Scratch(PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn copy_to_scratch(source: &Path) -> Result<(Scratch, PathBuf), String> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    let dir = std::env::temp_dir().join(format!("irms-import-{}-{nanos}", std::process::id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let scratch = Scratch(dir.clone());
    let target = dir.join("source.sqlite");
    std::fs::copy(source, &target).map_err(|e| format!("無法讀取 Tauri 版資料庫:{e}"))?;
    // The newest rows may only be in the WAL; copy it so the scratch copy sees them.
    for ext in ["-wal", "-shm"] {
        let mut from = source.as_os_str().to_owned();
        from.push(ext);
        let mut to = target.as_os_str().to_owned();
        to.push(ext);
        if Path::new(&from).exists() {
            std::fs::copy(&from, &to).map_err(|e| format!("無法讀取 Tauri 版資料庫:{e}"))?;
        }
    }
    Ok((scratch, target))
}

pub fn import_from(conn: &mut Connection, source: &Path) -> Result<Report, String> {
    if !is_fresh(conn).map_err(|e| e.to_string())? {
        return Err("原生版資料庫已有資料,不匯入".into());
    }
    let (_scratch, copy) = copy_to_scratch(source)?;
    // A database from a newer app than this one cannot be read safely.
    {
        let probe = Connection::open(&copy).map_err(|e| e.to_string())?;
        let version: i32 = probe
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > MIGRATIONS.last().map_or(0, |m| m.version) {
            return Err("Tauri 版資料庫比這個版本新,不匯入".into());
        }
    }
    // Bring the scratch copy to the current schema so the columns line up.
    drop(init_database(&copy).map_err(|e| format!("無法升級 Tauri 版資料庫副本:{e}"))?);

    conn.execute(
        "ATTACH DATABASE ?1 AS src",
        [copy.to_string_lossy().as_ref()],
    )
    .map_err(|e| e.to_string())?;
    let result = (|| -> Result<Report, String> {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        // Seeds go first so the source's prescriptions keep their ids.
        tx.execute("DELETE FROM main.custom_actions", [])
            .map_err(|e| e.to_string())?;
        for table in [
            "custom_actions",
            "sessions",
            "sensor_data",
            "angle_range_records",
            "mobility_records",
            "calibration_profiles",
        ] {
            tx.execute(
                &format!("INSERT INTO main.{table} SELECT * FROM src.{table}"),
                [],
            )
            .map_err(|e| format!("{table}:{e}"))?;
            let (from, to) = (
                count(&tx, "src", table).map_err(|e| e.to_string())?,
                count(&tx, "main", table).map_err(|e| e.to_string())?,
            );
            if from != to {
                return Err(format!("{table}:匯入筆數不符({from} → {to})"));
            }
        }
        let report = Report {
            actions: count(&tx, "main", "custom_actions").map_err(|e| e.to_string())?,
            sessions: count(&tx, "main", "sessions").map_err(|e| e.to_string())?,
            readings: count(&tx, "main", "sensor_data").map_err(|e| e.to_string())?,
            ranges: count(&tx, "main", "angle_range_records").map_err(|e| e.to_string())?,
            mobility: count(&tx, "main", "mobility_records").map_err(|e| e.to_string())?,
            profiles: count(&tx, "main", "calibration_profiles").map_err(|e| e.to_string())?,
        };
        tx.commit().map_err(|e| e.to_string())?;
        Ok(report)
    })();
    let _ = conn.execute("DETACH DATABASE src", []);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{
        actions_repo, angle_ranges_repo, calibration_repo, data_repo, mobility_repo, sessions_repo,
    };
    use crate::types::{
        AngleRangeInput, CalibrationProfileInput, CustomActionInput, MobilityRecordInput,
        SensorReading, SessionStartInput,
    };

    fn dir(name: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("irms-import-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn source_with_data(path: &Path) {
        let mut conn = init_database(path).unwrap();
        let action = actions_repo::create(
            &conn,
            &CustomActionInput {
                name: "我的深蹲".into(),
                description: Some("d".into()),
                protocol: "knee".into(),
                target_angle: 70.0,
                tolerance: 6.0,
                hold_time_ms: 2500,
                trigger_type: "joint_angle".into(),
                safety_limit: Some(120.0),
            },
        )
        .unwrap();
        let id = sessions_repo::start(
            &conn,
            &SessionStartInput {
                target_angle: 70.0,
                tolerance: 6.0,
                hold_time_ms: 2500,
                action_id: Some(action.id),
                action_name: Some(action.name.clone()),
                protocol: Some("knee".into()),
                trigger_type: Some("joint_angle".into()),
                safety_limit: Some(120.0),
                comfort_angle: Some(90.0),
                limit_angle: None,
                calibration: serde_json::json!({ "k": 1 }),
                source: "device".into(),
            },
        )
        .unwrap();
        let readings: Vec<SensorReading> = (0..30)
            .map(|i| SensorReading {
                knee_angle: i as f64,
                thigh_angle: 1.0,
                shin_angle: 2.0,
                knee_roll: 0.0,
                thigh_roll: 0.0,
                shin_roll: 0.0,
                timestamp: format!("2026-11-01T00:00:{i:02}.000Z"),
            })
            .collect();
        data_repo::append_batch(&mut conn, id, &readings).unwrap();
        sessions_repo::end(&conn, id, 4).unwrap();
        angle_ranges_repo::add(
            &conn,
            &AngleRangeInput {
                comfort_angle: 88.0,
                limit_angle: Some(110.0),
                note: None,
            },
        )
        .unwrap();
        mobility_repo::add(
            &conn,
            &MobilityRecordInput {
                movement_set: "kneeFlexion".into(),
                total_deg: 130.0,
                detail: "{}".into(),
                schema: Some(2),
                side: Some("left".into()),
                reference_kind: Some("straight".into()),
                posture: Some("standing".into()),
                calibration_id: Some("cal-1".into()),
            },
        )
        .unwrap();
        calibration_repo::add(
            &mut conn,
            &CalibrationProfileInput {
                id: "cal-1".into(),
                side: "left".into(),
                profile: "{}".into(),
                active: true,
            },
        )
        .unwrap();
    }

    #[test]
    fn every_record_arrives_with_its_ids_and_the_source_is_untouched() {
        let d = dir("full");
        let src = d.join("tauri.sqlite");
        source_with_data(&src);
        let before = (
            std::fs::metadata(&src).unwrap().len(),
            std::fs::read(&src).unwrap(),
        );
        let mut target = init_database(&d.join("native.sqlite")).unwrap();
        assert!(is_fresh(&target).unwrap());
        let report = import_from(&mut target, &src).unwrap();
        assert_eq!(
            (
                report.sessions,
                report.readings,
                report.ranges,
                report.mobility,
                report.profiles
            ),
            (1, 30, 1, 1, 1)
        );
        let actions = actions_repo::list(&target).unwrap();
        assert!(actions
            .iter()
            .any(|a| a.name == "我的深蹲" && a.hold_time_ms == 2500));
        let session = sessions_repo::list(&target).unwrap().remove(0);
        assert_eq!(session.action_name.as_deref(), Some("我的深蹲"));
        assert_eq!(session.reps_completed, 4);
        assert!(
            actions.iter().any(|a| Some(a.id) == session.action_id),
            "the session still points at its prescription"
        );
        assert_eq!(
            sessions_repo::get_data(&target, session.id, None)
                .unwrap()
                .len(),
            30
        );
        assert_eq!(
            angle_ranges_repo::list(&target).unwrap()[0].comfort_angle,
            88.0
        );
        assert_eq!(
            mobility_repo::list(&target).unwrap()[0].side.as_deref(),
            Some("left")
        );
        assert!(calibration_repo::list(&target).unwrap()[0].active);
        drop(target);
        assert_eq!(before.0, std::fs::metadata(&src).unwrap().len());
        assert_eq!(
            before.1,
            std::fs::read(&src).unwrap(),
            "the Tauri database was not modified"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_database_that_already_has_user_data_is_refused_and_left_alone() {
        let d = dir("used");
        let src = d.join("tauri.sqlite");
        source_with_data(&src);
        let mut target = init_database(&d.join("native.sqlite")).unwrap();
        angle_ranges_repo::add(
            &target,
            &AngleRangeInput {
                comfort_angle: 50.0,
                limit_angle: None,
                note: None,
            },
        )
        .unwrap();
        assert!(!is_fresh(&target).unwrap());
        assert!(import_from(&mut target, &src).is_err());
        assert_eq!(sessions_repo::list(&target).unwrap().len(), 0);
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn a_newer_source_and_a_missing_source_change_nothing() {
        let d = dir("newer");
        let src = d.join("tauri.sqlite");
        source_with_data(&src);
        Connection::open(&src)
            .unwrap()
            .execute_batch("PRAGMA user_version = 999")
            .unwrap();
        let mut target = init_database(&d.join("native.sqlite")).unwrap();
        let seeded = actions_repo::list(&target).unwrap().len();
        assert!(import_from(&mut target, &src).unwrap_err().contains("新"));
        assert!(import_from(&mut target, &d.join("absent.sqlite")).is_err());
        assert_eq!(
            actions_repo::list(&target).unwrap().len(),
            seeded,
            "seeds are still there"
        );
        std::fs::remove_dir_all(&d).ok();
    }

    /// Against a real Tauri database (read through a scratch copy; the file is not modified):
    /// IRMS_TAURI_DB=<path> cargo test -- --ignored real_database --nocapture
    #[test]
    #[ignore]
    fn real_database_imports_with_matching_counts() {
        let src = PathBuf::from(std::env::var("IRMS_TAURI_DB").unwrap());
        let d = dir("real");
        let before = std::fs::read(&src).unwrap();
        let mut target = init_database(&d.join("native.sqlite")).unwrap();
        let report = import_from(&mut target, &src).unwrap();
        println!("{report:?}");
        assert_eq!(before, std::fs::read(&src).unwrap(), "source untouched");
        assert!(report.actions > 0);
        std::fs::remove_dir_all(&d).ok();
    }
}
