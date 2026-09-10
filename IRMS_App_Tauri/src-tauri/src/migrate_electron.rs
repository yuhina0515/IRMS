// migrate_electron.rs — one-time data migration from the Electron app (`irms-app`'s userData
// folder) into this Tauri app's own data directory. Runs once, on first launch after a fresh
// Tauri install: every launch after that is a no-op because this app's own database already
// exists by then.
//
// Design: copy the Electron SQLite file into place BEFORE db::init_database() runs in lib.rs's
// setup(), then let the existing migration runner (migrations.rs) bring whatever schema version
// it's at up to current — this reuses all the already-tested migration logic instead of writing
// a second, parallel import path. Only after the copy is verified to be a real, openable IRMS
// database does this delete the source Electron userData folder; if anything fails before that
// point, the Electron folder — and its data — is left completely untouched.
//
// Known, accepted gap (informed tradeoff, not an oversight — see doc/coding log/
// log_20260910_tauri_phase3_phase4.md): Settings (theme/calibration/beta-update preference) live
// in the Electron app's Local Storage, which is Chromium's leveldb format — WebView2 cannot read
// it. Only irms.sqlite's contents (sessions/actions/readings/calibration snapshots) transfer;
// Settings reset to Tauri's defaults after migration.

use std::fs;
use std::path::{Path, PathBuf};

/// `package.json`'s `"name"` field — NOT `productName` ("IRMS Dashboard"). Electron's
/// `app.getPath('userData')` is keyed off `app.getName()`, which defaults to the former, so the
/// real folder on Windows is `%APPDATA%\irms-app`, confirmed empirically on this machine
/// (`%APPDATA%\IRMS Dashboard` does not exist).
const ELECTRON_APP_NAME: &str = "irms-app";
const DB_FILENAME: &str = "irms.sqlite";

fn electron_user_data_dir() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join(ELECTRON_APP_NAME))
}

/// Copies `irms.sqlite` and its `-wal`/`-shm` sidecars (if present — WAL mode may not have been
/// checkpointed if Electron didn't exit cleanly last time) into the Tauri DB's directory.
fn copy_database(electron_dir: &Path, tauri_db_path: &Path) -> std::io::Result<()> {
    let dest_dir = tauri_db_path
        .parent()
        .expect("tauri_db_path must have a parent directory");
    fs::create_dir_all(dest_dir)?;
    for suffix in ["", "-wal", "-shm"] {
        let src = electron_dir.join(format!("{DB_FILENAME}{suffix}"));
        if src.exists() {
            fs::copy(&src, dest_dir.join(format!("{DB_FILENAME}{suffix}")))?;
        }
    }
    Ok(())
}

/// A corrupt/partial copy must never lead to deleting the only remaining copy of the source
/// data — this opens the freshly copied file and confirms it's a real, readable IRMS database
/// (checks the `sessions` table, present since schema v1) before migration is allowed to proceed
/// to the delete step.
fn verify_migrated_database(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let conn = rusqlite::Connection::open(path)?;
    conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get::<_, i64>(0))?;
    Ok(())
}

/// Returns `Ok(true)` if a migration was actually performed (caller logs it), `Ok(false)` if
/// there was nothing to migrate (this app's DB already exists, or no Electron install/data was
/// found on this machine — both are the normal, expected case on every run after the first).
pub fn migrate_if_needed(tauri_db_path: &Path) -> Result<bool, Box<dyn std::error::Error>> {
    if tauri_db_path.exists() {
        return Ok(false);
    }
    let Some(electron_dir) = electron_user_data_dir() else {
        return Ok(false);
    };
    migrate_from(&electron_dir, tauri_db_path)
}

/// Parameterized core of `migrate_if_needed`, split out so tests can point it at a throwaway
/// directory instead of the real `%APPDATA%\irms-app` — this function deletes its `source_dir`
/// argument on success, so it must never be handed a real user-data path in a test.
fn migrate_from(source_dir: &Path, tauri_db_path: &Path) -> Result<bool, Box<dyn std::error::Error>> {
    if !source_dir.join(DB_FILENAME).exists() {
        return Ok(false);
    }
    copy_database(source_dir, tauri_db_path)?;
    verify_migrated_database(tauri_db_path)?;
    fs::remove_dir_all(source_dir)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique-enough throwaway dir under the OS temp folder — avoids pulling in a `tempfile`
    /// dependency just for this. Cleaned up at the end of each test.
    fn temp_dir(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("irms_migrate_test_{tag}_{}", std::process::id()))
    }

    fn make_valid_source_db(dir: &Path) {
        fs::create_dir_all(dir).unwrap();
        let conn = rusqlite::Connection::open(dir.join(DB_FILENAME)).unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (id INTEGER PRIMARY KEY, note TEXT);
             INSERT INTO sessions (note) VALUES ('from electron');",
        )
        .unwrap();
    }

    #[test]
    fn migrates_and_deletes_source_on_success() {
        let source = temp_dir("source_ok");
        let dest_root = temp_dir("dest_ok");
        let _ = fs::remove_dir_all(&source);
        let _ = fs::remove_dir_all(&dest_root);
        make_valid_source_db(&source);
        let dest_db = dest_root.join(DB_FILENAME);

        let migrated = migrate_from(&source, &dest_db).unwrap();

        assert!(migrated, "should report a migration happened");
        assert!(dest_db.exists(), "destination DB must exist after migration");
        assert!(!source.exists(), "source dir must be gone after a verified-successful migration");

        let conn = rusqlite::Connection::open(&dest_db).unwrap();
        let note: String = conn
            .query_row("SELECT note FROM sessions LIMIT 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(note, "from electron", "migrated data must be the real copied rows, not fresh/empty");

        fs::remove_dir_all(&dest_root).ok();
    }

    #[test]
    fn no_source_db_is_a_clean_noop() {
        let source = temp_dir("source_missing");
        let dest_root = temp_dir("dest_missing");
        let _ = fs::remove_dir_all(&source);
        let _ = fs::remove_dir_all(&dest_root);
        fs::create_dir_all(&source).unwrap(); // dir exists, but no irms.sqlite inside it
        let dest_db = dest_root.join(DB_FILENAME);

        let migrated = migrate_from(&source, &dest_db).unwrap();

        assert!(!migrated, "nothing to migrate when the source has no database file");
        assert!(!dest_db.exists(), "must not create a destination file when there's nothing to copy");
        assert!(source.exists(), "must not touch a source dir it didn't actually migrate from");

        fs::remove_dir_all(&source).ok();
    }

    /// The safety property this whole module exists for: if the copied file is corrupt/invalid,
    /// the source must survive so no data is lost. Simulated by pointing the "source" at a
    /// directory whose `irms.sqlite` is garbage bytes, not a real database.
    #[test]
    fn corrupt_copy_is_not_deleted() {
        let source = temp_dir("source_corrupt");
        let dest_root = temp_dir("dest_corrupt");
        let _ = fs::remove_dir_all(&source);
        let _ = fs::remove_dir_all(&dest_root);
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join(DB_FILENAME), b"not a real sqlite file").unwrap();
        let dest_db = dest_root.join(DB_FILENAME);

        let result = migrate_from(&source, &dest_db);

        assert!(result.is_err(), "a corrupt copy must surface as an error, not silent success");
        assert!(source.exists(), "source must survive when verification fails — this is the whole safety point");

        fs::remove_dir_all(&source).ok();
        fs::remove_dir_all(&dest_root).ok();
    }
}
