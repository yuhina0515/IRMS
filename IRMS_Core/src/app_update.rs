//! Self-update of the native app: the signed installer published on the beta channel.
//!
//! The channel is the `beta-latest` release's `latest.json` (the same manifest the Tauri updater reads,
//! signed with the Tauri updater key). The installer is only trusted after its minisign signature
//! verifies against the compiled-in public key, so a tampered download or manifest is refused. The
//! installer URL must be exactly the release asset for the version the manifest names.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde::Deserialize;

pub const MANIFEST_URL: &str =
    "https://github.com/yuhina0515/IRMS/releases/download/beta-latest/latest.json";
const ASSET_BASE: &str = "https://github.com/yuhina0515/IRMS/releases/download";
/// Same key as `plugins.updater.pubkey` in the Tauri app's tauri.conf.json.
const UPDATER_PUBKEY_B64: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDkzNjhBNDUzNjQ0NjA3QTkKUldTcEIwWmtVNlJvazJUTndWYytIWFNNanJHT0xWYXloRkNtSExhL2pMbnVIV0twdU9ndU1nNnQK";
const PLATFORM: &str = "windows-x86_64";
const MAX_MANIFEST_BYTES: usize = 64 * 1024;
const MAX_INSTALLER_BYTES: u64 = 120 * 1024 * 1024;
const MANIFEST_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: String,
    platforms: HashMap<String, PlatformEntry>,
}

#[derive(Debug, Deserialize)]
struct PlatformEntry {
    signature: String,
    url: String,
}

/// A newer installer the channel offers (not yet downloaded).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub url: String,
    pub signature: String,
}

/// A downloaded, signature-verified installer on disk.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedInstaller {
    pub version: String,
    pub path: PathBuf,
}

/// True when `latest` is a strictly newer semantic version than `current` (both must parse).
pub fn is_newer(current: &str, latest: &str) -> bool {
    match (
        semver::Version::parse(current),
        semver::Version::parse(latest),
    ) {
        (Ok(c), Ok(l)) => l > c,
        _ => false,
    }
}

/// The only installer URL accepted for a version: the matching asset of the matching release.
pub fn expected_url(version: &str) -> String {
    format!("{ASSET_BASE}/v{version}/IRMS_{version}_x64-setup.exe")
}

/// Parses the manifest; `Ok(None)` when it offers nothing newer than `current`.
pub fn parse_manifest(bytes: &[u8], current: &str) -> Result<Option<UpdateInfo>, String> {
    if bytes.len() > MAX_MANIFEST_BYTES {
        return Err("更新清單過大,拒絕處理".into());
    }
    let manifest: Manifest =
        serde_json::from_slice(bytes).map_err(|e| format!("更新清單格式錯誤: {e}"))?;
    if semver::Version::parse(&manifest.version).is_err() {
        return Err("更新清單的版本號無效".into());
    }
    if !is_newer(current, &manifest.version) {
        return Ok(None);
    }
    let entry = manifest
        .platforms
        .get(PLATFORM)
        .ok_or_else(|| "更新清單沒有 Windows x64 的安裝程式".to_string())?;
    if entry.url != expected_url(&manifest.version) {
        return Err("更新清單的下載位置不是官方發布頁面,拒絕更新".into());
    }
    Ok(Some(UpdateInfo {
        version: manifest.version,
        notes: manifest.notes,
        url: entry.url.clone(),
        signature: entry.signature.clone(),
    }))
}

fn decode_text(b64: &str) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("簽章編碼錯誤: {e}"))?;
    String::from_utf8(bytes).map_err(|_| "簽章內容不是文字".to_string())
}

/// Checks the minisign signature (as the Tauri updater writes it: base64 of the .sig text).
pub fn verify_installer(data: &[u8], signature_b64: &str) -> Result<(), String> {
    verify_with_key(data, signature_b64, UPDATER_PUBKEY_B64)
}

fn verify_with_key(data: &[u8], signature_b64: &str, pubkey_b64: &str) -> Result<(), String> {
    let key = PublicKey::decode(&decode_text(pubkey_b64)?).map_err(|e| format!("公鑰無效: {e}"))?;
    let signature =
        Signature::decode(&decode_text(signature_b64)?).map_err(|e| format!("簽章無效: {e}"))?;
    key.verify(data, &signature, true)
        .map_err(|_| "安裝程式的簽章驗證失敗,拒絕安裝".to_string())
}

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
}

/// Fetches the channel manifest; `Ok(None)` when already up to date.
pub async fn check(current: &str) -> Result<Option<UpdateInfo>, String> {
    let resp = client(MANIFEST_TIMEOUT)?
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("無法連線到更新伺服器: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("更新伺服器回應 {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    parse_manifest(&bytes, current)
}

/// Downloads the installer for `info`, verifies its signature, and stores it in a fresh folder under
/// the temp directory. Nothing unverified is ever written to the returned path.
pub async fn download(info: &UpdateInfo) -> Result<VerifiedInstaller, String> {
    if info.url != expected_url(&info.version) {
        return Err("下載位置不是官方發布頁面,拒絕更新".into());
    }
    let mut resp = client(DOWNLOAD_TIMEOUT)?
        .get(&info.url)
        .send()
        .await
        .map_err(|e| format!("下載失敗: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下載失敗,伺服器回應 {}", resp.status()));
    }
    if resp
        .content_length()
        .is_some_and(|n| n > MAX_INSTALLER_BYTES)
    {
        return Err("安裝程式大小異常,拒絕下載".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("下載中斷: {e}"))? {
        data.extend_from_slice(&chunk);
        if data.len() as u64 > MAX_INSTALLER_BYTES {
            return Err("安裝程式大小異常,拒絕下載".into());
        }
    }
    verify_installer(&data, &info.signature)?;
    // A fresh folder per download: an installer from an earlier attempt may still be running and holding
    // its file open. Old folders are removed when possible.
    let temp = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&temp) {
        for entry in entries.flatten() {
            if entry
                .file_name()
                .to_string_lossy()
                .starts_with("IRMS-update-")
            {
                let _ = std::fs::remove_dir_all(entry.path());
            }
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let dir = temp.join(format!("IRMS-update-{}-{stamp}", info.version));
    std::fs::create_dir_all(&dir).map_err(|e| format!("無法建立暫存資料夾: {e}"))?;
    let path = dir.join(format!("IRMS_{}_x64-setup.exe", info.version));
    std::fs::write(&path, &data).map_err(|e| format!("無法儲存安裝程式: {e}"))?;
    Ok(VerifiedInstaller {
        version: info.version.clone(),
        path,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAYLOAD: &[u8] = b"irms-update-test-payload";
    /// Signed with the real updater key (`tauri signer sign`), payload above.
    const SIGNATURE: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVTcEIwWmtVNlJva3l2eGRWY2V6TGVhQml5andUY0xPZlY3elJGaUlrRWM4V0Z3OG9qOHpZNUwzNGk3cmQ4dHRwK2hFRjZXRzRUYTlqZVZkTTlBajJwanFVS3ZIcDZnWUFJPQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzk0ODk2ODA1CWZpbGU6cGF5bG9hZC5iaW4KSVlQZElRbmlsSnMvaStSQUVJeUthQWNCS3pOQWppOTUxSnJ4by9leTdPS1lYUFBTc256OGR1UFNjYXhXejNuUEM1NmVQSEdyMWNVZFJRUktVK0RjQkE9PQo=";

    fn manifest(version: &str, url: &str) -> String {
        format!(
            r#"{{"version":"{version}","notes":"n","pub_date":"2026-11-17T00:00:00Z","platforms":{{"windows-x86_64":{{"signature":"{SIGNATURE}","url":"{url}"}}}}}}"#
        )
    }

    #[test]
    fn newer_means_a_strictly_higher_semantic_version() {
        assert!(is_newer("1.3.0-beta.8", "1.3.0-beta.9"));
        assert!(is_newer("1.3.0-beta.9", "1.3.0-beta.10"));
        assert!(is_newer("1.3.0-beta.9", "1.3.0"));
        assert!(!is_newer("1.3.0-beta.8", "1.3.0-beta.8"));
        assert!(!is_newer("1.3.0-beta.9", "1.3.0-beta.8"));
        assert!(!is_newer("1.3.0", "1.3.0-beta.9"));
        assert!(!is_newer("1.3.0-beta.8", "garbage"));
        assert!(!is_newer("garbage", "1.3.0-beta.9"));
    }

    #[test]
    fn a_newer_manifest_with_the_official_url_is_offered() {
        let v = "1.3.0-beta.9";
        let m = manifest(v, &expected_url(v));
        let info = parse_manifest(m.as_bytes(), "1.3.0-beta.8")
            .unwrap()
            .expect("an update");
        assert_eq!(info.version, v);
        assert_eq!(info.url, expected_url(v));
    }

    #[test]
    fn nothing_is_offered_when_already_current_or_ahead() {
        let m = manifest("1.3.0-beta.8", &expected_url("1.3.0-beta.8"));
        assert_eq!(parse_manifest(m.as_bytes(), "1.3.0-beta.8").unwrap(), None);
        assert_eq!(parse_manifest(m.as_bytes(), "1.3.0-beta.9").unwrap(), None);
    }

    #[test]
    fn a_manifest_pointing_anywhere_else_is_refused() {
        for url in [
            "https://evil.example/IRMS_1.3.0-beta.9_x64-setup.exe",
            "http://github.com/yuhina0515/IRMS/releases/download/v1.3.0-beta.9/IRMS_1.3.0-beta.9_x64-setup.exe",
            "https://github.com/someone-else/IRMS/releases/download/v1.3.0-beta.9/IRMS_1.3.0-beta.9_x64-setup.exe",
            "https://github.com/yuhina0515/IRMS/releases/download/v1.3.0-beta.8/IRMS_1.3.0-beta.8_x64-setup.exe",
        ] {
            let m = manifest("1.3.0-beta.9", url);
            assert!(
                parse_manifest(m.as_bytes(), "1.3.0-beta.8").is_err(),
                "{url}"
            );
        }
    }

    #[test]
    fn broken_or_oversized_manifests_are_refused() {
        assert!(parse_manifest(b"not json", "1.0.0").is_err());
        assert!(parse_manifest(&vec![b' '; MAX_MANIFEST_BYTES + 1], "1.0.0").is_err());
        let no_platform = r#"{"version":"1.3.0-beta.9","platforms":{}}"#;
        assert!(parse_manifest(no_platform.as_bytes(), "1.3.0-beta.8").is_err());
    }

    #[test]
    fn the_real_key_verifies_its_own_signature_and_nothing_else() {
        verify_installer(PAYLOAD, SIGNATURE).expect("genuine signature");
        assert!(verify_installer(b"irms-update-test-payloaD", SIGNATURE).is_err());
        assert!(verify_installer(PAYLOAD, "bm90IGEgc2lnbmF0dXJl").is_err());
        assert!(verify_installer(PAYLOAD, "%%%").is_err());
    }

    /// Network: the real beta channel, the real installer and the compiled-in key.
    /// `cargo test -p irms_core app_update -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live_the_published_installer_verifies() {
        // Pretend to be an old build so the newest published installer counts as an update.
        let info = check("1.3.0-beta.1").await.unwrap().expect("an update");
        println!("offered {}", info.version);
        let installer = download(&info).await.unwrap();
        println!("verified and stored at {}", installer.path.display());
        assert!(installer.path.exists());
        let _ = std::fs::remove_dir_all(installer.path.parent().unwrap());
    }
}
