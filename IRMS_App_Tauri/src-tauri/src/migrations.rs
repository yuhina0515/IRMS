// migrations.rs — port of main/migrations.ts (ROADMAP decision D4). Same versioned
// PRAGMA user_version scheme, same per-version transaction/rollback discipline, same migration
// history (1-7) — this must produce byte-identical schema to the TS version at every version,
// not just the latest, since real installs upgrade from whatever version they're already at.
//
// Unlike ble.rs, this is fully testable without hardware: every test below runs against an
// in-memory rusqlite connection, mirroring main/migrations.test.ts case-for-case.

use rusqlite::Connection;

pub struct Migration {
    pub version: i32,
    pub name: &'static str,
    pub up: fn(&Connection) -> rusqlite::Result<()>,
}

// Same bounds as shared/validation.ts's input-side clamp — this is the DB-layer last line of
// defense so no code path (old data, a future import feature) can write a value that degrades
// the trigger engine's target zone.
const TARGET_MIN: f64 = 10.0;
const TARGET_MAX: f64 = 170.0;
const TOLERANCE_MIN: f64 = 1.0;
const TOLERANCE_MAX: f64 = 30.0;
const HOLD_MIN: i64 = 500;
const HOLD_MAX: i64 = 20_000;

fn migration_1(conn: &Connection) -> rusqlite::Result<()> {
    // Fully idempotent (IF NOT EXISTS): an existing v1.0.1 install runs this as a no-op and just
    // gets user_version stamped to 1.
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS custom_actions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          protocol    TEXT    NOT NULL,
          targetAngle REAL    NOT NULL,
          tolerance   REAL    NOT NULL,
          holdTimeMs  INTEGER NOT NULL,
          triggerType TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          startTime     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          endTime       TEXT,
          targetAngle   REAL,
          tolerance     REAL,
          holdTimeMs    INTEGER,
          actionId      INTEGER,
          actionName    TEXT,
          protocol      TEXT,
          repsCompleted INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sensor_data (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sessionId  INTEGER NOT NULL,
          timestamp  TEXT    NOT NULL,
          kneeAngle  REAL,
          thighAngle REAL,
          shinAngle  REAL,
          kneeRoll   REAL,
          thighRoll  REAL,
          shinRoll   REAL,
          FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sensor_data_sessionId ON sensor_data(sessionId);
        ",
    )
}

fn migration_2(conn: &Connection) -> rusqlite::Result<()> {
    // SQLite can't add a CHECK constraint to an existing table — rebuild. Existing rows are
    // clamped back into range during the copy, since the rebuild would otherwise fail on exactly
    // the rows that are already broken.
    let sql = format!(
        "
        CREATE TABLE custom_actions_v2 (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          protocol    TEXT    NOT NULL,
          targetAngle REAL    NOT NULL,
          tolerance   REAL    NOT NULL,
          holdTimeMs  INTEGER NOT NULL,
          triggerType TEXT    NOT NULL,
          CHECK (targetAngle >= {TARGET_MIN} AND targetAngle <= {TARGET_MAX}),
          CHECK (tolerance   >= {TOLERANCE_MIN} AND tolerance <= {TOLERANCE_MAX}),
          CHECK (holdTimeMs  >= {HOLD_MIN} AND holdTimeMs <= {HOLD_MAX})
        );

        INSERT INTO custom_actions_v2
          (id, name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
        SELECT
          id, name, description, protocol,
          min({TARGET_MAX},    max({TARGET_MIN},    targetAngle)),
          min({TOLERANCE_MAX}, max({TOLERANCE_MIN}, tolerance)),
          CAST(min({HOLD_MAX}, max({HOLD_MIN}, holdTimeMs)) AS INTEGER),
          triggerType
        FROM custom_actions;

        DROP TABLE custom_actions;
        ALTER TABLE custom_actions_v2 RENAME TO custom_actions;
        "
    );
    conn.execute_batch(&sql)
}

fn migration_3(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("ALTER TABLE sessions ADD COLUMN abandoned INTEGER NOT NULL DEFAULT 0;")
}

fn migration_4(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("ALTER TABLE sessions ADD COLUMN triggerType TEXT;")
}

fn migration_5(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "
        ALTER TABLE custom_actions ADD COLUMN safetyLimit REAL;
        ALTER TABLE sessions       ADD COLUMN safetyLimit REAL;
        ",
    )
}

fn migration_6(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("ALTER TABLE sessions ADD COLUMN calibration TEXT;")
}

fn migration_7(conn: &Connection) -> rusqlite::Result<()> {
    // NOT NULL DEFAULT, not NULL-means-unknown like migrations 4/5/6 — demo mode didn't exist
    // when pre-migration rows were written, so every existing row is unambiguously a real device
    // session, not an unknown one. The CHECK is what makes a third value structurally impossible;
    // a nullable column's failure mode here would be silently rendering as real data, exactly
    // what this column exists to prevent.
    conn.execute_batch(
        "ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'device'
           CHECK (source IN ('device','demo'));",
    )
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "base schema (v1.0.1 shape)",
        up: migration_1,
    },
    Migration {
        version: 2,
        name: "custom_actions: clamp existing rows and add CHECK constraints",
        up: migration_2,
    },
    Migration {
        version: 3,
        name: "sessions: abandoned flag for sessions never properly ended",
        up: migration_3,
    },
    Migration {
        version: 4,
        name: "sessions: triggerType snapshot for history analysis",
        up: migration_4,
    },
    Migration {
        version: 5,
        name: "independent safety limit on actions and sessions",
        up: migration_5,
    },
    Migration {
        version: 6,
        name: "sessions: calibration snapshot in force at session start",
        up: migration_6,
    },
    Migration {
        version: 7,
        name: "sessions: source (device / demo) so simulated data cannot pass as clinical",
        up: migration_7,
    },
];

pub fn latest_version() -> i32 {
    MIGRATIONS.last().map(|m| m.version).unwrap_or(0)
}

pub fn get_schema_version(conn: &Connection) -> rusqlite::Result<i32> {
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
}

/// Reapplies every migration newer than the current schema version, one transaction per version
/// — a mid-version failure rolls back just that version, user_version stays on the last good one,
/// and the next startup retries from there instead of leaving a half-applied schema.
pub fn apply_migrations(
    conn: &Connection,
    migrations: &[Migration],
    mut log: impl FnMut(&str),
) -> rusqlite::Result<Vec<i32>> {
    let current = get_schema_version(conn)?;
    let mut pending: Vec<&Migration> = migrations.iter().filter(|m| m.version > current).collect();
    pending.sort_by_key(|m| m.version);

    let mut applied = Vec::new();
    for m in pending {
        conn.execute_batch("BEGIN")?;
        match (m.up)(conn) {
            Ok(()) => {
                // PRAGMA user_version doesn't take bound parameters, only string interpolation —
                // m.version comes from this file's own constant list, not external input.
                if let Err(e) = conn.execute_batch(&format!("PRAGMA user_version = {}", m.version)) {
                    conn.execute_batch("ROLLBACK").ok();
                    return Err(e);
                }
                conn.execute_batch("COMMIT")?;
                applied.push(m.version);
                log(&format!("[db] migration {} applied: {}", m.version, m.name));
            }
            Err(e) => {
                conn.execute_batch("ROLLBACK").ok();
                return Err(e);
            }
        }
    }
    Ok(applied)
}

/// Cleans up orphaned sessions left by a previous run that never called sessions.end() —
/// closed/killed/crashed mid-session. The app can't be starting up with a session genuinely still
/// in progress, so any endTime IS NULL row is one of these: backfill its end time from the last
/// sensor_data row (or startTime if there's none) and mark abandoned=1, honestly flagging that
/// repsCompleted isn't trustworthy rather than silently presenting it as 0.
pub fn finalize_orphaned_sessions(
    conn: &Connection,
    mut log: impl FnMut(&str),
) -> rusqlite::Result<usize> {
    let orphan_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE endTime IS NULL",
        [],
        |row| row.get(0),
    )?;
    if orphan_count == 0 {
        return Ok(0);
    }

    conn.execute_batch(
        "
        UPDATE sessions
           SET endTime = COALESCE(
                 (SELECT max(timestamp) FROM sensor_data WHERE sensor_data.sessionId = sessions.id),
                 startTime
               ),
               abandoned = 1
         WHERE endTime IS NULL;
        ",
    )?;
    log(&format!(
        "[db] finalized {orphan_count} orphaned session(s) from a previous run"
    ));
    Ok(orphan_count as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Connection {
        Connection::open_in_memory().unwrap()
    }

    /// Builds a v1.0.1-shaped DB: tables exist, but user_version is still 0.
    fn legacy_v101() -> Connection {
        let db = fresh();
        db.execute_batch(
            "
            CREATE TABLE custom_actions (
              id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
              protocol TEXT NOT NULL, targetAngle REAL NOT NULL, tolerance REAL NOT NULL,
              holdTimeMs INTEGER NOT NULL, triggerType TEXT NOT NULL
            );
            CREATE TABLE sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              startTime TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              endTime TEXT, targetAngle REAL, tolerance REAL, holdTimeMs INTEGER,
              actionId INTEGER, actionName TEXT, protocol TEXT,
              repsCompleted INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE sensor_data (
              id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId INTEGER NOT NULL, timestamp TEXT NOT NULL,
              kneeAngle REAL, thighAngle REAL, shinAngle REAL, kneeRoll REAL, thighRoll REAL, shinRoll REAL,
              FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
            );
            ",
        )
        .unwrap();
        db
    }

    fn noop_log(_: &str) {}

    mod fresh_install {
        use super::*;

        #[test]
        fn applies_zero_to_latest_in_order() {
            let db = fresh();
            assert_eq!(get_schema_version(&db).unwrap(), 0);
            let applied = apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let expected: Vec<i32> = MIGRATIONS.iter().map(|m| m.version).collect();
            assert_eq!(applied, expected);
            assert_eq!(get_schema_version(&db).unwrap(), latest_version());
        }

        #[test]
        fn reapplying_is_a_noop() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            assert_eq!(apply_migrations(&db, MIGRATIONS, noop_log).unwrap(), Vec::<i32>::new());
            assert_eq!(get_schema_version(&db).unwrap(), latest_version());
        }
    }

    mod v101_upgrade_path {
        use super::*;

        #[test]
        fn existing_tables_survive_migration_1_with_data_intact() {
            let db = legacy_v101();
            db.execute(
                "INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params!["既有動作", "desc", "knee", 90.0, 10.0, 3000, "joint_angle"],
            )
            .unwrap();
            db.execute(
                "INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, actionName, protocol, repsCompleted, endTime)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![90.0, 10.0, 3000, "既有 Session", "knee", 12, "2026-07-20T10:00:00.000Z"],
            )
            .unwrap();

            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();

            assert_eq!(get_schema_version(&db).unwrap(), latest_version());
            let name: String = db
                .query_row("SELECT name FROM custom_actions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(name, "既有動作");
            let target: f64 = db
                .query_row("SELECT targetAngle FROM custom_actions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(target, 90.0);
            let reps: i64 = db
                .query_row("SELECT repsCompleted FROM sessions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(reps, 12, "existing reps must not be touched");
        }

        #[test]
        fn new_columns_exist_after_upgrade() {
            let db = legacy_v101();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let mut stmt = db.prepare("PRAGMA table_info(sessions)").unwrap();
            let cols: Vec<String> = stmt
                .query_map([], |row| row.get::<_, String>(1))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
            assert!(cols.contains(&"abandoned".to_string()));
            assert!(cols.contains(&"triggerType".to_string()));
            assert!(cols.contains(&"calibration".to_string()));
        }

        #[test]
        fn migration_6_leaves_existing_session_calibration_null() {
            let db = legacy_v101();
            db.execute(
                "INSERT INTO sessions (targetAngle, tolerance, holdTimeMs) VALUES (?1, ?2, ?3)",
                rusqlite::params![90.0, 5.0, 2000],
            )
            .unwrap();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let calibration: Option<String> = db
                .query_row("SELECT calibration FROM sessions", [], |r| r.get(0))
                .unwrap();
            assert!(calibration.is_none());
        }

        #[test]
        fn calibration_snapshot_json_roundtrips_after_migration_6() {
            let db = legacy_v101();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let snapshot = r#"{"thighInvert":true,"thighZeroRaw":-12.5}"#;
            db.execute(
                "INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, calibration) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![90.0, 5.0, 2000, snapshot],
            )
            .unwrap();
            let stored: String = db
                .query_row("SELECT calibration FROM sessions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(stored, snapshot);
        }

        #[test]
        fn illegal_existing_params_are_clamped_not_rejected_on_upgrade() {
            let db = legacy_v101();
            db.execute(
                "INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params!["壞掉的動作", "", "knee", 5.0, -3.0, 0, "joint_angle"],
            )
            .unwrap();

            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();

            let (target, tolerance, hold): (f64, f64, i64) = db
                .query_row(
                    "SELECT targetAngle, tolerance, holdTimeMs FROM custom_actions WHERE name = '壞掉的動作'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .unwrap();
            assert_eq!(target, 10.0);
            assert_eq!(tolerance, 1.0);
            assert_eq!(hold, 500);
        }
    }

    mod check_constraints_are_the_last_line_of_defense {
        use super::*;

        #[test]
        fn rejects_negative_tolerance_and_zero_hold_time() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let insert_sql = "INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";

            assert!(db
                .execute(insert_sql, rusqlite::params!["x", "", "knee", 90.0, -5.0, 2000, "joint_angle"])
                .is_err());
            assert!(db
                .execute(insert_sql, rusqlite::params!["x", "", "knee", 90.0, 10.0, 0, "joint_angle"])
                .is_err());
            assert!(db
                .execute(insert_sql, rusqlite::params!["x", "", "knee", 300.0, 10.0, 2000, "joint_angle"])
                .is_err());
            assert!(db
                .execute(insert_sql, rusqlite::params!["ok", "", "knee", 90.0, 10.0, 2000, "joint_angle"])
                .is_ok());
        }
    }

    mod migration_7_sessions_source {
        use super::*;

        fn at_version_6() -> Connection {
            let db = fresh();
            let v6: Vec<&Migration> = MIGRATIONS.iter().filter(|m| m.version <= 6).collect();
            let owned: Vec<Migration> = v6
                .into_iter()
                .map(|m| Migration {
                    version: m.version,
                    name: m.name,
                    up: m.up,
                })
                .collect();
            apply_migrations(&db, &owned, noop_log).unwrap();
            assert_eq!(get_schema_version(&db).unwrap(), 6);
            db
        }

        #[test]
        fn fresh_install_defaults_unspecified_source_to_device() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            db.execute("INSERT INTO sessions (actionName) VALUES (?1)", ["全新"])
                .unwrap();
            let source: String = db
                .query_row("SELECT source FROM sessions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(source, "device");
        }

        #[test]
        fn upgrading_from_v6_backfills_existing_rows_to_device_not_null() {
            let db = at_version_6();
            db.execute("INSERT INTO sessions (actionName) VALUES (?1)", ["升級前就存在"])
                .unwrap();
            db.execute("INSERT INTO sessions (actionName) VALUES (?1)", ["升級前就存在2"])
                .unwrap();

            assert_eq!(apply_migrations(&db, MIGRATIONS, noop_log).unwrap(), vec![7]);

            let mut stmt = db.prepare("SELECT source FROM sessions").unwrap();
            let sources: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
            assert_eq!(sources.len(), 2);
            assert!(sources.iter().all(|s| s == "device"));
        }

        #[test]
        fn demo_is_a_legal_value() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            assert!(db
                .execute(
                    "INSERT INTO sessions (actionName, source) VALUES (?1, ?2)",
                    ["示範", "demo"]
                )
                .is_ok());
        }

        #[test]
        fn check_constraint_makes_a_third_value_structurally_impossible() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            assert!(db
                .execute(
                    "INSERT INTO sessions (actionName, source) VALUES (?1, ?2)",
                    ["壞的", "whatever"]
                )
                .is_err());
        }

        #[test]
        fn purge_demo_delete_only_hits_demo_rows_cascade_removes_sensor_data() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            db.execute_batch("PRAGMA foreign_keys = ON").unwrap();
            db.execute(
                "INSERT INTO sessions (actionName, source) VALUES (?1, ?2)",
                ["真實", "device"],
            )
            .unwrap();
            db.execute(
                "INSERT INTO sessions (actionName, source) VALUES (?1, ?2)",
                ["示範", "demo"],
            )
            .unwrap();
            let demo_id: i64 = db
                .query_row("SELECT id FROM sessions WHERE source='demo'", [], |r| r.get(0))
                .unwrap();
            db.execute(
                "INSERT INTO sensor_data (sessionId, timestamp, kneeAngle) VALUES (?1, ?2, ?3)",
                rusqlite::params![demo_id, "2026-08-27T10:00:00.000Z", 90.0],
            )
            .unwrap();

            db.execute_batch("DELETE FROM sessions WHERE source = 'demo'").unwrap();

            let mut stmt = db.prepare("SELECT source FROM sessions").unwrap();
            let remaining: Vec<String> = stmt
                .query_map([], |r| r.get(0))
                .unwrap()
                .map(|r| r.unwrap())
                .collect();
            assert_eq!(remaining, vec!["device".to_string()]);
            let sensor_count: i64 = db
                .query_row("SELECT COUNT(*) FROM sensor_data", [], |r| r.get(0))
                .unwrap();
            assert_eq!(sensor_count, 0);
        }
    }

    mod apply_migrations_rolls_back_on_failure {
        use super::*;

        #[test]
        fn a_broken_migration_does_not_advance_user_version() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            let before = get_schema_version(&db).unwrap();
            let bad = [Migration {
                version: 99,
                name: "broken",
                up: |conn| conn.execute_batch("THIS IS NOT SQL"),
            }];
            assert!(apply_migrations(&db, &bad, noop_log).is_err());
            assert_eq!(get_schema_version(&db).unwrap(), before);
        }
    }

    mod finalize_orphaned_sessions_tests {
        use super::*;

        #[test]
        fn backfills_end_time_and_marks_abandoned() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            db.execute(
                "INSERT INTO sessions (actionName, repsCompleted) VALUES (?1, ?2)",
                rusqlite::params!["被中斷的", 0],
            )
            .unwrap();
            let id: i64 = db.query_row("SELECT id FROM sessions", [], |r| r.get(0)).unwrap();
            db.execute(
                "INSERT INTO sensor_data (sessionId, timestamp, kneeAngle) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, "2026-08-01T10:05:00.000Z", 90.0],
            )
            .unwrap();
            db.execute(
                "INSERT INTO sensor_data (sessionId, timestamp, kneeAngle) VALUES (?1, ?2, ?3)",
                rusqlite::params![id, "2026-08-01T10:09:30.000Z", 45.0],
            )
            .unwrap();

            assert_eq!(finalize_orphaned_sessions(&db, noop_log).unwrap(), 1);

            let (end_time, abandoned): (String, i64) = db
                .query_row(
                    "SELECT endTime, abandoned FROM sessions WHERE id = ?1",
                    [id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(end_time, "2026-08-01T10:09:30.000Z");
            assert_eq!(abandoned, 1);
        }

        #[test]
        fn falls_back_to_start_time_with_no_sensor_data() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            db.execute(
                "INSERT INTO sessions (startTime, actionName) VALUES (?1, ?2)",
                ["2026-08-01T09:00:00.000Z", "空的"],
            )
            .unwrap();
            finalize_orphaned_sessions(&db, noop_log).unwrap();
            let end_time: String = db
                .query_row("SELECT endTime FROM sessions", [], |r| r.get(0))
                .unwrap();
            assert_eq!(end_time, "2026-08-01T09:00:00.000Z");
        }

        #[test]
        fn does_not_touch_a_properly_ended_session() {
            let db = fresh();
            apply_migrations(&db, MIGRATIONS, noop_log).unwrap();
            db.execute(
                "INSERT INTO sessions (endTime, repsCompleted) VALUES (?1, ?2)",
                rusqlite::params!["2026-07-20T10:00:00.000Z", 12],
            )
            .unwrap();
            assert_eq!(finalize_orphaned_sessions(&db, noop_log).unwrap(), 0);
            let (abandoned, reps): (i64, i64) = db
                .query_row("SELECT abandoned, repsCompleted FROM sessions", [], |r| {
                    Ok((r.get(0)?, r.get(1)?))
                })
                .unwrap();
            assert_eq!(abandoned, 0);
            assert_eq!(reps, 12);
        }
    }
}
