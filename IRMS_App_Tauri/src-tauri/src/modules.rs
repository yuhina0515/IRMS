// modules.rs — first-party runtime modules from the IRMS-Modules repo (doc/AUTO_PUSH_PLAN.md).
//
// index.json is accepted only with a valid Ed25519 signature from the compiled-in key; each
// module file only if its SHA-256 matches the verified index. Files live in
// <app data>/modules/, the only directory the asset protocol may serve (tauri.conf.json), and
// are re-hashed on every sync before their paths are handed to the renderer for import().
// When the network is unavailable the last verified index on disk is re-verified and used.

use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::firmware_update::{client, get_bytes};

/// Raw 32-byte Ed25519 public key (base64) matching IRMS_secrets/irms_modules_ed25519.pem.
const MODULES_PUBKEY_B64: &str = "rmTFnYTSMzLCrqDW0Hv3e6gKKXFODYhxd1zkvmWceG0=";
const RELEASES: &str = "https://github.com/yuhina0515/IRMS-Modules/releases";
const MAX_MODULE_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModuleEntry {
    pub id: String,
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub file: String,
    pub size: u64,
    pub sha256: String,
    #[serde(default)]
    pub min_app_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModuleIndex {
    schema: u32,
    modules: Vec<ModuleEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModule {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    /// Absolute path of the verified file; the renderer turns it into an asset: URL.
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleSyncResult {
    pub modules: Vec<InstalledModule>,
    /// True when the network fetch failed and the cached, re-verified index was used.
    pub offline: bool,
    /// Per-module problems (skipped, not fatal).
    pub warnings: Vec<String>,
}

fn valid_id(id: &str) -> bool {
    let b = id.as_bytes();
    (2..=41).contains(&b.len())
        && b[0].is_ascii_lowercase()
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

fn verify_index(
    bytes: &[u8],
    signature_b64: &str,
    pubkey: &[u8],
) -> Result<Vec<ModuleEntry>, String> {
    let sig = base64::engine::general_purpose::STANDARD
        .decode(signature_b64.trim())
        .map_err(|_| "模組清單簽章格式錯誤".to_string())?;
    UnparsedPublicKey::new(&ED25519, pubkey)
        .verify(bytes, &sig)
        .map_err(|_| "模組清單簽章驗證失敗".to_string())?;
    let index: ModuleIndex =
        serde_json::from_slice(bytes).map_err(|e| format!("模組清單格式錯誤: {e}"))?;
    if index.schema != 1 {
        return Err(format!("不支援的模組清單版本 {}", index.schema));
    }
    for m in &index.modules {
        // The file name is derived, never trusted: it is the only path component we write.
        if !valid_id(&m.id)
            || semver::Version::parse(&m.version).is_err()
            || m.file != format!("{}-{}.js", m.id, m.version)
            || m.size == 0
            || m.size > MAX_MODULE_BYTES
        {
            return Err(format!("模組清單項目不合法: {}", m.id));
        }
    }
    Ok(index.modules)
}

fn sha256_hex(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

fn app_compatible(app_version: &str, min: Option<&str>) -> bool {
    match (
        semver::Version::parse(app_version),
        min.map(semver::Version::parse),
    ) {
        (_, None) => true,
        (Ok(app), Some(Ok(min))) => app >= min,
        _ => false,
    }
}

fn pubkey() -> Result<Vec<u8>, String> {
    base64::engine::general_purpose::STANDARD
        .decode(MODULES_PUBKEY_B64)
        .map_err(|e| e.to_string())
}

/// Keeps only files named in `keep`; stray or superseded module files are removed so the
/// asset scope never serves something no verified index vouches for.
fn prune(dir: &Path, keep: &[String]) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let is_cache = name == "index.json" || name == "index.json.sig";
            if !is_cache && !keep.contains(&name) {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
}

async fn sync(dir: PathBuf, app_version: String) -> Result<ModuleSyncResult, String> {
    std::fs::create_dir_all(&dir).map_err(|e| format!("無法建立模組資料夾: {e}"))?;
    let key = pubkey()?;
    let http = client()?;
    let mut warnings = Vec::new();

    let remote = async {
        let idx = get_bytes(&http, &format!("{RELEASES}/latest/download/index.json")).await?;
        let sig = get_bytes(&http, &format!("{RELEASES}/latest/download/index.json.sig")).await?;
        let entries = verify_index(&idx, &String::from_utf8_lossy(&sig), &key)?;
        Ok::<_, String>((idx, sig, entries))
    }
    .await;

    let (entries, offline) = match remote {
        Ok((idx, sig, entries)) => {
            let _ = std::fs::write(dir.join("index.json"), &idx);
            let _ = std::fs::write(dir.join("index.json.sig"), &sig);
            (entries, false)
        }
        Err(remote_err) => {
            let idx = std::fs::read(dir.join("index.json")).map_err(|_| remote_err.clone())?;
            let sig = std::fs::read_to_string(dir.join("index.json.sig"))
                .map_err(|_| remote_err.clone())?;
            warnings.push(format!(
                "無法取得最新模組清單,使用本機已驗證的版本({remote_err})"
            ));
            (verify_index(&idx, &sig, &key)?, true)
        }
    };

    let mut modules = Vec::new();
    for m in &entries {
        if !app_compatible(&app_version, m.min_app_version.as_deref()) {
            warnings.push(format!("{} 需要較新的 App,略過", m.id));
            continue;
        }
        let path = dir.join(&m.file);
        let ok_on_disk = std::fs::read(&path)
            .map(|d| sha256_hex(&d) == m.sha256)
            .unwrap_or(false);
        if !ok_on_disk {
            if offline {
                warnings.push(format!("{} 本機檔案缺失或不符,離線無法重新下載", m.id));
                continue;
            }
            let data =
                match get_bytes(&http, &format!("{RELEASES}/latest/download/{}", m.file)).await {
                    Ok(d) => d,
                    Err(e) => {
                        warnings.push(format!("{} 下載失敗: {e}", m.id));
                        continue;
                    }
                };
            if data.len() as u64 != m.size || sha256_hex(&data) != m.sha256 {
                warnings.push(format!("{} 雜湊與清單不符,拒絕載入", m.id));
                continue;
            }
            std::fs::write(&path, &data).map_err(|e| format!("無法寫入模組: {e}"))?;
        }
        modules.push(InstalledModule {
            id: m.id.clone(),
            version: m.version.clone(),
            name: m.name.clone(),
            description: m.description.clone(),
            path: path.to_string_lossy().to_string(),
        });
    }
    prune(
        &dir,
        &modules
            .iter()
            .map(|m| format!("{}-{}.js", m.id, m.version))
            .collect::<Vec<_>>(),
    );
    Ok(ModuleSyncResult {
        modules,
        offline,
        warnings,
    })
}

#[tauri::command]
pub async fn modules_sync(app: tauri::AppHandle) -> Result<ModuleSyncResult, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("modules");
    sync(dir, app.package_info().version.to_string()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    fn keypair() -> Ed25519KeyPair {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap()
    }

    fn index(file: &str) -> Vec<u8> {
        format!(
            r#"{{"schema":1,"modules":[{{"id":"session-tips","version":"1.0.0","name":"t","file":"{file}","size":10,"sha256":"00"}}]}}"#
        )
        .into_bytes()
    }

    fn sign(kp: &Ed25519KeyPair, b: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(kp.sign(b).as_ref())
    }

    #[test]
    fn verifies_signed_index() {
        let kp = keypair();
        let b = index("session-tips-1.0.0.js");
        assert_eq!(
            verify_index(&b, &sign(&kp, &b), kp.public_key().as_ref())
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn rejects_foreign_signature_and_tampering() {
        let kp = keypair();
        let b = index("session-tips-1.0.0.js");
        let sig = sign(&kp, &b);
        assert!(verify_index(&b, &sig, keypair().public_key().as_ref()).is_err());
        let mut t = b.clone();
        t[20] ^= 1;
        assert!(verify_index(&t, &sig, kp.public_key().as_ref()).is_err());
    }

    #[test]
    fn rejects_path_traversal_even_when_signed() {
        let kp = keypair();
        let b = index("../../evil.js");
        assert!(verify_index(&b, &sign(&kp, &b), kp.public_key().as_ref()).is_err());
    }

    #[test]
    fn id_rules() {
        assert!(valid_id("session-tips"));
        assert!(!valid_id("Session"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("x"));
    }

    #[test]
    fn prune_keeps_only_listed_files_and_cache() {
        let dir = std::env::temp_dir().join(format!("irms-mod-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for f in ["a-1.0.0.js", "old-0.9.0.js", "index.json", "index.json.sig"] {
            std::fs::write(dir.join(f), b"x").unwrap();
        }
        prune(&dir, &["a-1.0.0.js".to_string()]);
        let mut left: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        left.sort();
        assert_eq!(left, ["a-1.0.0.js", "index.json", "index.json.sig"]);
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// `cargo test live_modules -- --ignored`: syncs the real IRMS-Modules release into a temp dir.
    #[tokio::test]
    #[ignore]
    async fn live_modules_sync() {
        let dir = std::env::temp_dir().join(format!("irms-mod-live-{}", uuid::Uuid::new_v4()));
        let r = sync(dir.clone(), "1.2.0-beta.13".into()).await.unwrap();
        println!(
            "{} module(s), offline={}, warnings={:?}",
            r.modules.len(),
            r.offline,
            r.warnings
        );
        assert!(!r.modules.is_empty());
        let code = std::fs::read_to_string(&r.modules[0].path).unwrap();
        assert!(code.contains("activate"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
