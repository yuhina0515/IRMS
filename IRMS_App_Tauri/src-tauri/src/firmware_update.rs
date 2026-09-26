// firmware_update.rs — automatic firmware delivery from the IRMS-Firmware repo.
//
// Trust model (doc/AUTO_PUSH_PLAN.md): the release manifest is signed with an Ed25519 key whose
// public half is compiled in below; the private half lives only in IRMS_secrets and the
// IRMS-Firmware repo's Actions secrets. Transport (GitHub/HTTPS) is not trusted on its own —
// the binary is accepted only if its size, SHA-256 and MD5 match a manifest that verified.
//
// The download URL is derived from the verified version, never taken from the renderer, so a
// compromised WebView cannot point the OTA pipeline at an arbitrary file.

use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::time::Duration;

use crate::firmware::FirmwareBinary;

/// Raw 32-byte Ed25519 public key (base64) matching IRMS_secrets/irms_firmware_ed25519.pem.
const FIRMWARE_PUBKEY_B64: &str = "9inYbAyGpSC4KbNtu1+tT/I5B/jrMDuwmfH3SsS1u/8=";
const RELEASES: &str = "https://github.com/yuhina0515/IRMS-Firmware/releases";
const MAX_FIRMWARE_BYTES: u64 = 4 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareManifest {
    pub version: String,
    pub file: String,
    pub size: u64,
    pub sha256: String,
    pub md5: String,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub notes: String,
}

/// What the renderer needs to decide and to show; deliberately excludes URLs and hashes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmwareRelease {
    pub version: String,
    pub size: u64,
    pub notes: String,
    /// False when this app build is older than the firmware's minAppVersion.
    pub app_compatible: bool,
}

fn decode_pubkey(b64: &str) -> Result<Vec<u8>, String> {
    let key = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("bad public key: {e}"))?;
    if key.len() != 32 {
        return Err("bad public key length".into());
    }
    Ok(key)
}

/// Verifies `signature_b64` over the exact manifest bytes, then parses them.
pub fn verify_manifest(
    bytes: &[u8],
    signature_b64: &str,
    pubkey: &[u8],
) -> Result<FirmwareManifest, String> {
    let sig = base64::engine::general_purpose::STANDARD
        .decode(signature_b64.trim())
        .map_err(|_| "韌體清單簽章格式錯誤".to_string())?;
    UnparsedPublicKey::new(&ED25519, pubkey)
        .verify(bytes, &sig)
        .map_err(|_| "韌體清單簽章驗證失敗,拒絕更新".to_string())?;
    let manifest: FirmwareManifest =
        serde_json::from_slice(bytes).map_err(|e| format!("韌體清單格式錯誤: {e}"))?;
    semver::Version::parse(&manifest.version).map_err(|_| "韌體清單版本號格式錯誤".to_string())?;
    if manifest.size == 0 || manifest.size > MAX_FIRMWARE_BYTES {
        return Err("韌體清單大小不合理".into());
    }
    Ok(manifest)
}

/// True when `latest` should replace what the device reports. A device that reports nothing
/// or an unparseable string predates versioning and is always eligible.
pub fn is_newer(device: Option<&str>, latest: &str) -> bool {
    let Ok(latest) = semver::Version::parse(latest) else {
        return false;
    };
    match device.map(|d| semver::Version::parse(d.trim())) {
        Some(Ok(current)) => latest > current,
        _ => true,
    }
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

pub fn verify_binary(data: &[u8], manifest: &FirmwareManifest) -> Result<(), String> {
    if data.len() as u64 != manifest.size {
        return Err("下載的韌體大小與清單不符,拒絕更新".into());
    }
    let sha = format!("{:x}", Sha256::digest(data));
    if !sha.eq_ignore_ascii_case(&manifest.sha256) {
        return Err("下載的韌體 SHA-256 與清單不符,拒絕更新".into());
    }
    let md5 = format!("{:x}", md5::compute(data));
    if !md5.eq_ignore_ascii_case(&manifest.md5) {
        return Err("下載的韌體 MD5 與清單不符,拒絕更新".into());
    }
    Ok(())
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
}

pub(crate) async fn get_bytes(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("無法連線到韌體發布站: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("韌體發布站回應 {}", resp.status()));
    }
    Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
}

/// Where the channel's manifest lives. Stable = GitHub's "latest" release (prereleases are
/// skipped by GitHub itself); beta = the fixed `beta-latest` pointer release that the
/// IRMS-Firmware workflow refreshes on every tag. Same rule as the app's own update channel.
fn manifest_base(beta: bool) -> String {
    if beta {
        format!("{RELEASES}/download/beta-latest")
    } else {
        format!("{RELEASES}/latest/download")
    }
}

/// A stable-channel app never installs a pre-release, even if a mislabelled release
/// became GitHub's "latest".
fn channel_allows(version: &str, beta: bool) -> bool {
    beta || semver::Version::parse(version).is_ok_and(|v| v.pre.is_empty())
}

async fn fetch_verified_manifest(
    client: &reqwest::Client,
    beta: bool,
) -> Result<FirmwareManifest, String> {
    let base = manifest_base(beta);
    let bytes = get_bytes(client, &format!("{base}/manifest.json")).await?;
    let sig = get_bytes(client, &format!("{base}/manifest.json.sig")).await?;
    let manifest = verify_manifest(
        &bytes,
        &String::from_utf8_lossy(&sig),
        &decode_pubkey(FIRMWARE_PUBKEY_B64)?,
    )?;
    if !channel_allows(&manifest.version, beta) {
        return Err("正式版頻道收到測試版韌體,拒絕更新".into());
    }
    Ok(manifest)
}

#[tauri::command]
pub async fn firmware_check_latest(
    app: tauri::AppHandle,
    beta: bool,
) -> Result<FirmwareRelease, String> {
    let manifest = fetch_verified_manifest(&client()?, beta).await?;
    Ok(FirmwareRelease {
        app_compatible: app_compatible(
            &app.package_info().version.to_string(),
            manifest.min_app_version.as_deref(),
        ),
        version: manifest.version,
        size: manifest.size,
        notes: manifest.notes,
    })
}

#[tauri::command]
pub fn firmware_is_newer(device: Option<String>, latest: String) -> bool {
    is_newer(device.as_deref(), &latest)
}

/// Re-fetches and re-verifies the manifest (the renderer only names the version it decided
/// on), then downloads and verifies the binary it describes.
#[tauri::command]
pub async fn firmware_download_latest(
    expected_version: String,
    beta: bool,
) -> Result<FirmwareBinary, String> {
    let client = client()?;
    let manifest = fetch_verified_manifest(&client, beta).await?;
    if manifest.version != expected_version {
        return Err("最新韌體版本在下載前已變更,請重新檢查".into());
    }
    let url = format!(
        "{RELEASES}/download/v{}/{}",
        manifest.version, manifest.file
    );
    let data = get_bytes(&client, &url).await?;
    verify_binary(&data, &manifest)?;
    Ok(FirmwareBinary::new(
        format!("IRMS-Firmware v{}", manifest.version),
        data,
        manifest.md5,
    ))
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

    fn manifest_for(data: &[u8]) -> Vec<u8> {
        serde_json::to_vec(&FirmwareManifest {
            version: "1.1.0".into(),
            file: "IRMS_Sensor.bin".into(),
            size: data.len() as u64,
            sha256: format!("{:x}", Sha256::digest(data)),
            md5: format!("{:x}", md5::compute(data)),
            min_app_version: Some("1.2.0-beta.13".into()),
            notes: "test".into(),
        })
        .unwrap()
    }

    fn sign(kp: &Ed25519KeyPair, bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(kp.sign(bytes).as_ref())
    }

    #[test]
    fn accepts_a_manifest_signed_by_the_key() {
        let kp = keypair();
        let bytes = manifest_for(b"firmware");
        let m = verify_manifest(&bytes, &sign(&kp, &bytes), kp.public_key().as_ref()).unwrap();
        assert_eq!(m.version, "1.1.0");
    }

    #[test]
    fn rejects_a_tampered_manifest() {
        let kp = keypair();
        let bytes = manifest_for(b"firmware");
        let sig = sign(&kp, &bytes);
        let tampered = String::from_utf8(bytes).unwrap().replace("1.1.0", "9.9.9");
        assert!(verify_manifest(tampered.as_bytes(), &sig, kp.public_key().as_ref()).is_err());
    }

    #[test]
    fn rejects_a_signature_from_another_key() {
        let bytes = manifest_for(b"firmware");
        let sig = sign(&keypair(), &bytes);
        assert!(verify_manifest(&bytes, &sig, keypair().public_key().as_ref()).is_err());
    }

    #[test]
    fn stable_channel_rejects_prereleases() {
        assert!(channel_allows("1.0.1", false));
        assert!(!channel_allows("1.0.1-beta.1", false));
        assert!(channel_allows("1.0.1-beta.1", true));
        // beta firmware on a device is still superseded by the matching stable release
        assert!(is_newer(Some("1.0.1-beta.1"), "1.0.1"));
        assert!(is_newer(Some("1.0.0"), "1.0.1-beta.1"));
    }

    #[test]
    fn embedded_public_key_decodes() {
        assert_eq!(decode_pubkey(FIRMWARE_PUBKEY_B64).unwrap().len(), 32);
    }

    #[test]
    fn binary_must_match_every_manifest_hash() {
        let data = b"firmware-image";
        let m: FirmwareManifest = serde_json::from_slice(&manifest_for(data)).unwrap();
        assert!(verify_binary(data, &m).is_ok());
        assert!(verify_binary(b"firmware-imagf", &m).is_err());
        assert!(verify_binary(b"short", &m).is_err());
    }

    #[test]
    fn version_comparison() {
        assert!(is_newer(Some("1.0.0"), "1.1.0"));
        assert!(!is_newer(Some("1.1.0"), "1.1.0"));
        assert!(!is_newer(Some("1.2.0"), "1.1.0"));
        assert!(
            is_newer(None, "1.1.0"),
            "pre-versioning firmware is always eligible"
        );
        assert!(is_newer(Some("garbage"), "1.1.0"));
        assert!(!is_newer(Some("1.0.0"), "not-a-version"));
    }

    #[test]
    fn min_app_version_gate() {
        assert!(app_compatible("1.2.0-beta.13", Some("1.2.0-beta.13")));
        assert!(!app_compatible("1.2.0-beta.12", Some("1.2.0-beta.13")));
        assert!(app_compatible("1.2.0-beta.12", None));
    }
}

#[cfg(test)]
mod release_key_tests {
    use super::*;

    /// Signed with the real release key by the same Node `crypto.sign(null, …)` call the
    /// IRMS-Firmware workflow uses — proves CI signatures verify against the embedded key.
    #[test]
    fn node_signed_fixture_verifies_with_embedded_key() {
        let bytes = include_bytes!("../fixtures/firmware_manifest_sample.json");
        let sig = include_str!("../fixtures/firmware_manifest_sample.json.sig");
        let m = verify_manifest(bytes, sig, &decode_pubkey(FIRMWARE_PUBKEY_B64).unwrap()).unwrap();
        assert!(verify_binary(b"hello", &m).is_ok());
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;

    /// Network test against the real IRMS-Firmware release: `cargo test live_release -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn live_release_manifest_and_binary_verify() {
        let client = client().unwrap();
        for beta in [false, true] {
            let manifest = fetch_verified_manifest(&client, beta).await.unwrap();
            let url = format!(
                "{RELEASES}/download/v{}/{}",
                manifest.version, manifest.file
            );
            let data = get_bytes(&client, &url).await.unwrap();
            verify_binary(&data, &manifest).unwrap();
            println!(
                "channel beta={beta}: verified IRMS-Firmware v{} ({} bytes)",
                manifest.version,
                data.len()
            );
        }
    }
}
