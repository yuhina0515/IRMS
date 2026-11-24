// 僅供手動合成測試的原生收據 oracle；正式應用程式不編譯此模組。
use crate::{commands::validate_append_readings, db, types::SensorReading};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, io::Read, path::PathBuf};

// 不用 exists()：dangling symlink 的目標不存在，仍必須在開檔之前拒絕。
fn regular_or_missing(path: &std::path::Path) -> Result<bool, ()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_file() => Ok(true),
        Ok(_) => Err(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Batch {
    session_id: i64,
    storage_identity: String,
    batch_id: String,
    readings: Vec<SensorReading>,
}

// 刪除只使用原始場次關聯，不接收批次內容。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteBinding {
    session_id: i64,
    storage_identity: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    op: String,
    database: String,
    batch: Option<Batch>,
    #[serde(rename = "deleteBinding")]
    delete_binding: Option<DeleteBinding>,
}

// 所有路徑固定在本次已存在的 temp 子目錄；不接受任意 DB 路徑或刪除根目錄。
fn root() -> Result<PathBuf, ()> {
    let requested = PathBuf::from(std::env::var_os("IRMS_RECOVERY_ORACLE_ROOT").ok_or(())?);
    if !fs::symlink_metadata(&requested)
        .map_err(|_| ())?
        .file_type()
        .is_dir()
    {
        return Err(());
    }
    let path = fs::canonicalize(requested).map_err(|_| ())?;
    let temp = fs::canonicalize(std::env::temp_dir()).map_err(|_| ())?;
    let name = path.file_name().and_then(|s| s.to_str()).ok_or(())?;
    if path.parent() != Some(temp.as_path())
        || !name.starts_with("irms-journal-probe-")
        || fs::symlink_metadata(&path)
            .map_err(|_| ())?
            .file_type()
            .is_symlink()
    {
        return Err(());
    }
    Ok(path)
}

fn execute() -> Result<Value, ()> {
    execute_at(&root()?)
}

// 固定格式的請求可由原生測試直接使用，不必修改程序環境變數。
fn execute_at(root: &std::path::Path) -> Result<Value, ()> {
    let request_path = root.join("native-request.json");
    if !regular_or_missing(&request_path)? {
        return Err(());
    }
    let mut bytes = Vec::new();
    fs::File::open(request_path)
        .map_err(|_| ())?
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    if bytes.len() > 1024 * 1024 {
        return Err(());
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|_| ())?;
    let filename = match request.database.as_str() {
        "native" => "native.sqlite",
        "foreign" => "foreign.sqlite",
        "backup" => "backup.sqlite",
        _ => return Err(()),
    };
    let path = root.join(filename);
    let exists = regular_or_missing(&path)?;
    for suffix in ["-wal", "-shm", "-journal"] {
        regular_or_missing(&root.join(format!("{filename}{suffix}")))?;
    }
    // 只有明確 init 能建立資料庫；append/inspect/delete 絕不重建遺失的 DB。
    if request.op != "init" && !exists {
        return Ok(json!({"status":"missingDatabase"}));
    }
    // 核對與綁定刪除都跳過初始化，避免遷移或提前結束其他場次。
    let conn = match request.op.as_str() {
        "inspect" | "reconcile" => {
            Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        }
        "delete" | "deleteWithRollbackFixture" => {
            Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_WRITE)
        }
        _ => db::init_database(&path),
    };
    let mut conn = conn.map_err(|_| ())?;
    match request.op.as_str() {
        "init" => {
            if !db::sessions_repo::list(&conn).map_err(|_| ())?.is_empty() {
                return Err(());
            }
            let input = serde_json::from_value(json!({"targetAngle":90,"tolerance":10,
                "holdTimeMs":3000,"actionName":"Synthetic oracle","protocol":"knee",
                "triggerType":"joint_angle","safetyLimit":135,"calibration":null,"source":"demo"}))
            .map_err(|_| ())?;
            let started = db::sessions_repo::start_bound(&mut conn, &input).map_err(|_| ())?;
            Ok(json!({"status":"started","started":started}))
        }
        "append" | "reconcile" => {
            let batch = request.batch.ok_or(())?;
            validate_append_readings(&batch.readings).map_err(|_| ())?;
            if batch.session_id <= 0 || batch.readings.is_empty() {
                return Err(());
            }
            if request.op == "reconcile" {
                // 不啟動孤兒收尾；核對本身只允許 SELECT，且不得改任何計數。
                conn.pragma_update(None, "query_only", true)
                    .map_err(|_| ())?;
                let before = conn.total_changes();
                let result = db::data_repo::inspect_recovery_batch(
                    &mut conn,
                    batch.session_id,
                    &batch.batch_id,
                    &batch.readings,
                    &batch.storage_identity,
                )
                .map_err(|_| ())?;
                if conn.total_changes() != before {
                    return Err(());
                }
                return Ok(json!({"status":"inspectedRecovery","inspection":result,
                    "automaticReplayAuthorized":false,"journalAcknowledgementAuthorized":false}));
            }
            match db::data_repo::append_bound_batch(
                &mut conn,
                batch.session_id,
                &batch.batch_id,
                &batch.readings,
                &batch.storage_identity,
            ) {
                Ok(count) => Ok(json!({"status":"committed","count":count})),
                Err(_) => Ok(json!({"status":"rejected"})),
            }
        }
        "inspect" => {
            // 不輸出合成讀值與隨機身份，只回傳可核對的 DB 計數與結束狀態。
            let rows: i64 = conn
                .query_row("SELECT COUNT(*) FROM sensor_data", [], |r| r.get(0))
                .map_err(|_| ())?;
            let receipts: i64 = conn
                .query_row("SELECT COUNT(*) FROM reading_batch_receipts", [], |r| {
                    r.get(0)
                })
                .map_err(|_| ())?;
            let sessions: i64 = conn
                .query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0))
                .map_err(|_| ())?;
            let ended: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sessions WHERE endTime IS NOT NULL",
                    [],
                    |r| r.get(0),
                )
                .map_err(|_| ())?;
            let abandoned: i64 = conn
                .query_row("SELECT COUNT(*) FROM sessions WHERE abandoned=1", [], |r| {
                    r.get(0)
                })
                .map_err(|_| ())?;
            let stale_end: i64 = conn.query_row("SELECT COUNT(*) FROM sessions s WHERE s.endTime IS NOT NULL AND EXISTS(SELECT 1 FROM sensor_data d WHERE d.sessionId=s.id AND d.timestamp>s.endTime)", [], |r| r.get(0)).map_err(|_| ())?;
            Ok(
                json!({"status":"inspected","rows":rows,"receipts":receipts,"sessions":sessions,"ended":ended,"abandoned":abandoned,"staleEnd":stale_end}),
            )
        }
        "delete" | "deleteWithRollbackFixture" => {
            let binding = request.delete_binding.ok_or(())?;
            conn.pragma_update(None, "foreign_keys", true)
                .map_err(|_| ())?;
            if request.op == "deleteWithRollbackFixture" {
                // 暫存觸發器在刪除與級聯後使交易失敗，不改動磁碟上的 schema。
                conn.execute_batch(
                    "CREATE TEMP TRIGGER oracle_abort_delete AFTER DELETE ON main.sessions
                     BEGIN SELECT RAISE(ABORT, 'synthetic delete rollback'); END;",
                )
                .map_err(|_| ())?;
            }
            match db::sessions_repo::delete_bound(
                &mut conn,
                binding.session_id,
                &binding.storage_identity,
            ) {
                Ok(()) => Ok(json!({"status":"deleted"})),
                Err(rusqlite::Error::SqliteFailure(error, _))
                    if request.op == "deleteWithRollbackFixture"
                        && error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_TRIGGER =>
                {
                    Ok(json!({"status":"rolledBack"}))
                }
                Err(_) => Ok(json!({"status":"rejected"})),
            }
        }
        "backup" if request.database == "native" => {
            let target = root.join("backup.sqlite");
            if regular_or_missing(&target)? {
                return Err(());
            }
            for suffix in ["-wal", "-shm", "-journal"] {
                if regular_or_missing(&root.join(format!("backup.sqlite{suffix}")))? {
                    return Err(());
                }
            }
            conn.execute("VACUUM INTO ?1", [target.to_str().ok_or(())?])
                .map_err(|_| ())?;
            Ok(json!({"status":"backedUp"}))
        }
        "recreate" => {
            let batch = request.batch.ok_or(())?;
            let input = serde_json::from_value(json!({"targetAngle":90,"tolerance":10,
                "holdTimeMs":3000,"calibration":null,"source":"demo"}))
            .map_err(|_| ())?;
            let created = db::sessions_repo::start_bound(&mut conn, &input).map_err(|_| ())?;
            // 人為固定數字 ID 的測試 fixture；正式流程絕不修改療程 ID。
            conn.execute(
                "UPDATE sessions SET id=?1 WHERE id=?2",
                [batch.session_id, created.session_id],
            )
            .map_err(|_| ())?;
            Ok(json!({"status":"recreated"}))
        }
        _ => Err(()),
    }
}

#[test]
#[ignore = "manual synthetic browser/SQLite oracle; requires owned temporary request root"]
fn manual_recovery_oracle() {
    // 即使設定錯誤，也只回固定錯誤，避免 Rust panic 展開私有檔案路徑。
    let result = std::panic::catch_unwind(execute).ok().and_then(Result::ok);
    println!(
        "IRMS_RECOVERY_ORACLE {}",
        result.unwrap_or_else(|| json!({"status":"infrastructureFailure"}))
    );
}

#[test]
fn file_guard_accepts_only_regular_files_or_absence() {
    // 獨立暫存 fixture，不使用應用程式資料庫；刪除僅限已知檔案與空目錄。
    let root = std::env::temp_dir().join(format!("irms-oracle-guard-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let file = root.join("file");
    assert_eq!(regular_or_missing(&file), Ok(false));
    fs::write(&file, b"synthetic").unwrap();
    assert_eq!(regular_or_missing(&file), Ok(true));
    assert!(regular_or_missing(&root).is_err());
    fs::remove_file(file).unwrap();
    fs::remove_dir(root).unwrap();
}

#[test]
fn bound_delete_requests_preserve_foreign_recreated_and_rolled_back_rows() {
    // 用獨立磁碟 fixture 測試實際請求分派與重新開檔，包含未結束場次的狀態。
    let root = std::env::temp_dir().join(format!("irms-journal-probe-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let request_path = root.join("native-request.json");
    let request = |body: Value| {
        fs::write(&request_path, serde_json::to_vec(&body).unwrap()).unwrap();
        execute_at(&root).unwrap()
    };
    let inspect = |database: &str| request(json!({"op":"inspect","database":database}));
    let started = request(json!({"op":"init","database":"native"}));
    let binding = &started["started"];
    let delete = |op: &str, database: &str| {
        request(json!({"op":op,"database":database,"deleteBinding":binding}))
    };
    assert_eq!(delete("delete", "backup")["status"], "missingDatabase");
    assert!(!root.join("backup.sqlite").exists());

    let foreign = request(json!({"op":"init","database":"foreign"}));
    assert_eq!(foreign["started"]["sessionId"], binding["sessionId"]);
    let foreign_before = inspect("foreign");
    assert_eq!(foreign_before["ended"], 0);
    assert_eq!(delete("delete", "foreign")["status"], "rejected");
    assert_eq!(inspect("foreign"), foreign_before);

    let mut batch = (*binding).clone();
    batch["batchId"] = json!("22222222-2222-4222-8222-222222222222");
    batch["readings"] = json!([{"timestamp":"synthetic","kneeAngle":1,"proximalAngle":2,
        "distalAngle":3,"kneeRoll":4,"proximalRoll":5,"distalRoll":6}]);
    let append = request(json!({"op":"append","database":"native","batch":batch}));
    assert_eq!(append, json!({"status":"committed","count":1}));
    let before = inspect("native");
    assert_eq!(before["rows"], 1);
    assert_eq!(before["receipts"], 1);
    assert_eq!(
        delete("deleteWithRollbackFixture", "native")["status"],
        "rolledBack"
    );
    assert_eq!(inspect("native"), before);
    assert_eq!(delete("delete", "native")["status"], "deleted");
    let after = inspect("native");
    for key in ["sessions", "rows", "receipts"] {
        assert_eq!(after[key], 0);
    }

    assert_eq!(
        request(json!({"op":"recreate","database":"native","batch":batch}))["status"],
        "recreated"
    );
    let recreated = inspect("native");
    assert_eq!(recreated["sessions"], 1);
    assert_eq!(recreated["ended"], 0);
    assert_eq!(delete("delete", "native")["status"], "rejected");
    assert_eq!(inspect("native"), recreated);

    for filename in ["native.sqlite", "foreign.sqlite", "native-request.json"] {
        fs::remove_file(root.join(filename)).unwrap();
    }
    // 唯讀 WAL 開啟後可能留下 SQLite 側檔，清理只限這兩個已知 fixture。
    for filename in ["native.sqlite", "foreign.sqlite"] {
        for suffix in ["-wal", "-shm", "-journal"] {
            match fs::remove_file(root.join(format!("{filename}{suffix}"))) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => panic!("fixture cleanup failed: {error}"),
            }
        }
    }
    fs::remove_dir(root).unwrap();
}

#[cfg(unix)]
#[test]
fn file_guard_rejects_dangling_symlink() {
    let root = std::env::temp_dir().join(format!("irms-oracle-guard-{}", uuid::Uuid::new_v4()));
    fs::create_dir(&root).unwrap();
    let link = root.join("link");
    std::os::unix::fs::symlink(root.join("missing"), &link).unwrap();
    assert!(regular_or_missing(&link).is_err());
    fs::remove_file(link).unwrap();
    fs::remove_dir(root).unwrap();
}
