//! Independently updatable content packs for the native app (phase 1 of the module plan).
//!
//! Trust model: the same as the Tauri module system. `index.json` is accepted only with a valid
//! Ed25519 signature (`index.json.sig`, base64) from the compiled-in IRMS-Modules key; each package
//! file only if its size and SHA-256 match the verified index; the download location must be the
//! official release page. Packs are plain data (no code): a bad pack can never do more than show a
//! wrong tip, and every failure falls back to the previous version or to the built-in content.
//!
//! Index format: the Tauri index is `{ "schema": 1, "modules": [...] }`. Native packs ride in an
//! additional top-level `"native": [...]` array of the same signed file. Tauri's parser ignores
//! unknown fields, so the Tauri app keeps working on the same index (see
//! doc/plans/2026-11-22-module-packages-publishing.md).
//!
//! Layout under the modules root:
//! ```text
//! <root>/<id>/<version>/index.json(.sig)  the signed index that vouched for this version
//! <root>/<id>/<version>/<file path>       package files
//! <root>/<id>/active.json                 { version, previous, disabled, lastError }
//! <root>/index.cache.json(.sig)           last verified index, for "available" while offline
//! ```
//! Every load re-verifies the stored signed index and the file hashes, so editing files (or any
//! unsigned metadata) on disk makes the version fall back. Nothing here panics: every failure is a
//! value (the release profile aborts on panic).

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::Engine;
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::firmware_update::app_compatible;

/// Raw 32-byte Ed25519 public key (base64) matching IRMS_secrets/irms_modules_ed25519.pem.
pub const MODULES_PUBKEY_B64: &str = "rmTFnYTSMzLCrqDW0Hv3e6gKKXFODYhxd1zkvmWceG0=";
pub const RELEASES: &str = "https://github.com/yuhina0515/IRMS-Modules/releases";
pub const SESSION_TIPS_ID: &str = "session-tips";
pub const TIPS_FILE: &str = "tips.json";
/// Newest pack content schema this build understands, per kind of pack.
pub const TIPS_SCHEMA: u32 = 1;

const MAX_INDEX_BYTES: usize = 128 * 1024;
const MAX_FILE_BYTES: u64 = 256 * 1024;
const MAX_FILES: usize = 8;
pub const MAX_TIPS: usize = 20;
const MAX_TIP_CHARS: usize = 300;
const TIMEOUT: Duration = Duration::from_secs(30);
const INDEX_FILE: &str = "index.json";
const INDEX_SIG_FILE: &str = "index.json.sig";

/// Content packs this build knows how to use: (id, display name).
pub const KNOWN_PACKS: [(&str, &str); 1] = [(SESSION_TIPS_ID, "使用提示")];

// ---------------------------------------------------------------------------------------------
// Index types
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageFile {
    /// File name of the release asset (flat namespace on a GitHub release).
    pub name: String,
    /// Install-relative file name inside `<id>/<version>/`.
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEntry {
    pub id: String,
    pub version: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    /// "content" is the only kind in phase 1; other kinds are skipped by this build.
    pub kind: String,
    /// Schema of the pack's own content (e.g. tips.json), checked against what this build reads.
    pub schema_version: u32,
    /// Oldest app version that may use the pack.
    #[serde(default)]
    pub min_app: Option<String>,
    /// SHA-256 over the files' bytes in the listed order.
    pub sha256: String,
    /// Base URL of the release the files are served from, ending in `/`.
    pub url: String,
    pub files: Vec<PackageFile>,
}

#[derive(Debug, Deserialize)]
struct IndexDoc {
    schema: u32,
    #[serde(default)]
    native: Vec<serde_json::Value>,
}

/// The validated native part of a signed index, with the exact signed bytes it came from.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Index {
    pub entries: Vec<NativeEntry>,
    /// Entries that were present but invalid, one line each; they are skipped, not fatal.
    pub skipped: Vec<String>,
    /// The signed index file and its signature, kept so an install can store them as provenance.
    pub raw: Vec<u8>,
    pub sig: String,
}

fn hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn valid_id(id: &str) -> bool {
    let b = id.as_bytes();
    (2..=41).contains(&b.len())
        && b.first().is_some_and(u8::is_ascii_lowercase)
        && b.iter()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

fn valid_version(v: &str) -> bool {
    semver::Version::parse(v).is_ok()
        && v.len() <= 40
        && v.bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'+'))
}

/// Windows device names, which cannot be file names with or without an extension.
fn is_reserved_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") {
        return true;
    }
    stem.strip_prefix("COM")
        .or_else(|| stem.strip_prefix("LPT"))
        .is_some_and(|d| d.len() == 1 && d.bytes().all(|c| (b'1'..=b'9').contains(&c)))
}

fn valid_file_name(n: &str) -> bool {
    (1..=80).contains(&n.len())
        && !n.starts_with('.')
        && !n.ends_with('.')
        && !n.contains("..")
        && !is_reserved_name(n)
        && n.bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_'))
}

/// Names the installer itself writes into a version folder (compared case-insensitively, as NTFS does).
fn is_installer_file(path: &str) -> bool {
    [INDEX_FILE, INDEX_SIG_FILE, "meta.json", "active.json"]
        .iter()
        .any(|r| path.eq_ignore_ascii_case(r))
}

fn valid_sha(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|c| c.is_ascii_hexdigit())
}

/// The only accepted download location: a single release folder of the official repository.
pub fn url_is_official(url: &str) -> bool {
    let prefix = format!("{RELEASES}/download/");
    let Some(rest) = url.strip_prefix(&prefix) else {
        return false;
    };
    let Some(tag) = rest.strip_suffix('/') else {
        return false;
    };
    !tag.is_empty()
        && tag.len() <= 40
        && tag
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-' | b'_'))
        && !tag.contains("..")
}

fn package_digest(files: &[(&str, &[u8])]) -> String {
    let mut h = Sha256::new();
    for (_, data) in files {
        h.update(data);
    }
    format!("{:x}", h.finalize())
}

fn validate_entry(e: &NativeEntry) -> Result<(), String> {
    let bad = |why: &str| Err(format!("模組清單項目不合法({}): {why}", e.id));
    if !valid_id(&e.id) {
        return bad("id");
    }
    if !valid_version(&e.version) {
        return bad("version");
    }
    if e.schema_version == 0 {
        return bad("schemaVersion");
    }
    if e.min_app
        .as_deref()
        .is_some_and(|m| semver::Version::parse(m).is_err())
    {
        return bad("minApp");
    }
    if !valid_sha(&e.sha256) || e.name.trim().is_empty() || e.name.len() > 80 {
        return bad("sha256 or name");
    }
    if !url_is_official(&e.url) {
        return Err(format!("模組 {} 的下載位置不是官方發布頁面,拒絕採用", e.id));
    }
    if e.files.is_empty() || e.files.len() > MAX_FILES {
        return bad("files");
    }
    for f in &e.files {
        if !valid_file_name(&f.name)
            || !valid_file_name(&f.path)
            || is_installer_file(&f.path)
            || f.size == 0
            || f.size > MAX_FILE_BYTES
            || !valid_sha(&f.sha256)
        {
            return bad("file entry");
        }
    }
    let mut paths: Vec<String> = e.files.iter().map(|f| f.path.to_lowercase()).collect();
    paths.sort_unstable();
    paths.dedup();
    if paths.len() != e.files.len() {
        return bad("duplicate path");
    }
    Ok(())
}

/// Verifies the signature over the exact index bytes, then parses and validates the native entries.
/// Invalid entries are skipped and reported in `skipped`; a bad signature or schema rejects the file.
pub fn verify_index(bytes: &[u8], signature_b64: &str, pubkey: &[u8]) -> Result<Index, String> {
    if bytes.len() > MAX_INDEX_BYTES {
        return Err("模組清單過大,拒絕處理".into());
    }
    let sig = base64::engine::general_purpose::STANDARD
        .decode(signature_b64.trim())
        .map_err(|_| "模組清單簽章格式錯誤".to_string())?;
    UnparsedPublicKey::new(&ED25519, pubkey)
        .verify(bytes, &sig)
        .map_err(|_| "模組清單簽章驗證失敗,拒絕採用".to_string())?;
    let doc: IndexDoc =
        serde_json::from_slice(bytes).map_err(|e| format!("模組清單格式錯誤: {e}"))?;
    if doc.schema != 1 {
        return Err(format!("不支援的模組清單版本 {}", doc.schema));
    }
    let mut index = Index {
        raw: bytes.to_vec(),
        sig: signature_b64.trim().to_string(),
        ..Index::default()
    };
    for raw in doc.native {
        if raw.get("kind").and_then(|k| k.as_str()) != Some("content") {
            continue; // a kind from a newer release: not ours to interpret
        }
        let label = raw
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("?")
            .chars()
            .take(41)
            .collect::<String>();
        match serde_json::from_value::<NativeEntry>(raw) {
            Ok(mut entry) => {
                // Hashes compare as lowercase hex everywhere.
                entry.sha256 = entry.sha256.to_ascii_lowercase();
                for f in &mut entry.files {
                    f.sha256 = f.sha256.to_ascii_lowercase();
                }
                match validate_entry(&entry) {
                    Ok(()) => index.entries.push(entry),
                    Err(e) => index.skipped.push(e),
                }
            }
            Err(e) => index.skipped.push(format!("{label}: 格式錯誤 {e}")),
        }
    }
    Ok(index)
}

/// The first id whose version in `fresh` is older than in `cached`: a validly signed old index
/// replayed as "latest" would otherwise downgrade packs.
pub fn index_regresses(cached: &Index, fresh: &Index) -> Option<String> {
    fresh.entries.iter().find_map(|f| {
        let old = cached.entries.iter().find(|c| c.id == f.id)?;
        let (old_v, new_v) = (
            semver::Version::parse(&old.version).ok()?,
            semver::Version::parse(&f.version).ok()?,
        );
        (new_v < old_v).then(|| f.id.clone())
    })
}

fn official_key() -> Vec<u8> {
    base64::engine::general_purpose::STANDARD
        .decode(MODULES_PUBKEY_B64)
        .unwrap_or_default()
}

/// Builds an entry for a pack from its files (`(install path, bytes)`), hashing them.
/// The release asset name is `<id>-<version>-<path>`. Used by tests and by publishing tooling.
pub fn build_content_entry(
    id: &str,
    version: &str,
    name: &str,
    schema_version: u32,
    release_tag: &str,
    files: &[(&str, &[u8])],
) -> NativeEntry {
    NativeEntry {
        id: id.into(),
        version: version.into(),
        name: name.into(),
        description: String::new(),
        kind: "content".into(),
        schema_version,
        min_app: None,
        sha256: package_digest(files),
        url: format!("{RELEASES}/download/{release_tag}/"),
        files: files
            .iter()
            .map(|(path, data)| PackageFile {
                name: format!("{id}-{version}-{path}"),
                path: (*path).into(),
                size: data.len() as u64,
                sha256: hex(data),
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------------------------
// Content: session tips
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct TipsPack {
    pub schema_version: u32,
    pub tips: Vec<String>,
}

pub fn parse_tips(bytes: &[u8]) -> Result<TipsPack, String> {
    let pack: TipsPack =
        serde_json::from_slice(bytes).map_err(|e| format!("tips.json 格式錯誤: {e}"))?;
    if pack.schema_version != TIPS_SCHEMA {
        return Err(format!(
            "tips.json 的 schema {} 不支援",
            pack.schema_version
        ));
    }
    if pack.tips.is_empty() || pack.tips.len() > MAX_TIPS {
        return Err("tips.json 的提示數量不合理".into());
    }
    if pack
        .tips
        .iter()
        .any(|t| t.trim().is_empty() || t.chars().count() > MAX_TIP_CHARS)
    {
        return Err("tips.json 含有空白或過長的提示".into());
    }
    Ok(pack)
}

/// Content check per pack id; unknown ids are refused so only packs this build can use get installed.
fn validate_content(id: &str, files: &HashMap<String, Vec<u8>>) -> Result<(), String> {
    match id {
        SESSION_TIPS_ID => {
            let bytes = files
                .get(TIPS_FILE)
                .ok_or_else(|| format!("套件缺少 {TIPS_FILE}"))?;
            parse_tips(bytes).map(|_| ())
        }
        _ => Err(format!("這個版本不認得模組 {id}")),
    }
}

fn supported_schema(id: &str) -> u32 {
    match id {
        SESSION_TIPS_ID => TIPS_SCHEMA,
        _ => 0,
    }
}

// ---------------------------------------------------------------------------------------------
// Installed state
// ---------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ActiveState {
    pub version: Option<String>,
    pub previous: Option<String>,
    pub disabled: bool,
    /// Set when the active version failed verification and was replaced; cleared by the next install.
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    /// Nothing installed and nothing offered: the compiled-in content is in use.
    Builtin,
    UpToDate,
    UpdateAvailable,
    /// Reserved for packs that apply on the next launch (phase 2 logic modules); content packs apply at once.
    Pending,
    Disabled,
    /// The installed version failed verification and was rolled back (or dropped).
    RolledBack,
    NeedsNewerApp,
}

impl Status {
    pub fn label(self) -> &'static str {
        match self {
            Status::Builtin => "內建",
            Status::UpToDate => "最新",
            Status::UpdateAvailable => "有更新",
            Status::Pending => "待套用",
            Status::Disabled => "已停用",
            Status::RolledBack => "驗證失敗(已退回)",
            Status::NeedsNewerApp => "需要較新程式",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleRow {
    pub id: String,
    pub name: String,
    pub installed: Option<String>,
    pub available: Option<String>,
    pub status: Status,
    pub can_update: bool,
    pub can_toggle: bool,
    pub disabled: bool,
    pub can_rollback: bool,
    pub last_error: Option<String>,
}

/// A package read back from disk and fully re-verified.
struct Loaded {
    files: HashMap<String, Vec<u8>>,
}

/// Why an installed version could not be used. `incompatible` means "healthy, but not for this
/// build": it must never be treated as corruption (an older build must not delete a newer pack).
struct LoadError {
    incompatible: bool,
    message: String,
}

impl LoadError {
    fn corrupt(message: impl Into<String>) -> Self {
        Self {
            incompatible: false,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Registry {
    root: Option<PathBuf>,
    app_version: String,
    pubkey: Vec<u8>,
}

fn write_atomic(path: &Path, data: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|e| format!("寫入失敗: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("寫入失敗: {e}")
    })
}

impl Registry {
    /// `root = None` keeps nothing (tests, in-memory runs): only built-in content is ever used.
    pub fn new(root: Option<PathBuf>, app_version: &str) -> Self {
        Self {
            root,
            app_version: app_version.to_string(),
            pubkey: official_key(),
        }
    }

    /// Replaces the trusted key (tests only; the app always uses the compiled-in key).
    pub fn with_pubkey(mut self, pubkey: Vec<u8>) -> Self {
        self.pubkey = pubkey;
        self
    }

    pub fn pubkey(&self) -> &[u8] {
        &self.pubkey
    }

    fn pack_dir(&self, id: &str) -> Option<PathBuf> {
        if !valid_id(id) {
            return None;
        }
        self.root.as_ref().map(|r| r.join(id))
    }

    /// `<root>/<id>/<version>`, only for a syntactically valid id and version, so no stored string can
    /// ever point outside the pack folder.
    fn version_dir(&self, id: &str, version: &str) -> Option<PathBuf> {
        if !valid_version(version) {
            return None;
        }
        self.pack_dir(id).map(|d| d.join(version))
    }

    pub fn state(&self, id: &str) -> ActiveState {
        let Some(dir) = self.pack_dir(id) else {
            return ActiveState::default();
        };
        let Ok(bytes) = std::fs::read(dir.join("active.json")) else {
            return ActiveState::default();
        };
        let damaged = || ActiveState {
            last_error: Some("active.json 損毀,改用內建內容".into()),
            ..ActiveState::default()
        };
        match serde_json::from_slice::<ActiveState>(&bytes) {
            Ok(s)
                if s.version
                    .iter()
                    .chain(s.previous.iter())
                    .all(|v| valid_version(v)) =>
            {
                s
            }
            _ => damaged(),
        }
    }

    fn save_state(&self, id: &str, state: &ActiveState) -> Result<(), String> {
        let dir = self.pack_dir(id).ok_or("沒有模組資料夾")?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("無法建立模組資料夾: {e}"))?;
        let json = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
        write_atomic(&dir.join("active.json"), &json)
    }

    /// Reads and fully re-verifies one installed version: the stored signed index, compatibility,
    /// file hashes and content. Unsigned files on disk are never believed.
    fn load_version(&self, id: &str, version: &str) -> Result<(NativeEntry, Loaded), LoadError> {
        let dir = self
            .version_dir(id, version)
            .ok_or_else(|| LoadError::corrupt("版本號不合法"))?;
        let bytes = std::fs::read(dir.join(INDEX_FILE))
            .map_err(|e| LoadError::corrupt(format!("缺少簽章清單: {e}")))?;
        let sig = std::fs::read_to_string(dir.join(INDEX_SIG_FILE))
            .map_err(|e| LoadError::corrupt(format!("缺少清單簽章: {e}")))?;
        let index = verify_index(&bytes, &sig, &self.pubkey).map_err(LoadError::corrupt)?;
        let entry = index
            .entries
            .into_iter()
            .find(|e| e.id == id && e.version == version)
            .ok_or_else(|| LoadError::corrupt("簽章清單沒有這個版本"))?;
        self.check_compatible(&entry).map_err(|message| LoadError {
            incompatible: true,
            message,
        })?;
        let mut ordered = Vec::new();
        for f in &entry.files {
            let data = std::fs::read(dir.join(&f.path))
                .map_err(|e| LoadError::corrupt(format!("缺少檔案 {}: {e}", f.path)))?;
            if data.len() as u64 != f.size || hex(&data) != f.sha256 {
                return Err(LoadError::corrupt(format!(
                    "檔案 {} 的雜湊與清單不符",
                    f.path
                )));
            }
            ordered.push(data);
        }
        let refs: Vec<(&str, &[u8])> = ordered.iter().map(|d| ("", d.as_slice())).collect();
        if package_digest(&refs) != entry.sha256 {
            return Err(LoadError::corrupt("套件整體雜湊與清單不符"));
        }
        let files: HashMap<String, Vec<u8>> = entry
            .files
            .iter()
            .map(|f| f.path.clone())
            .zip(ordered)
            .collect();
        validate_content(id, &files).map_err(LoadError::corrupt)?;
        Ok((entry, Loaded { files }))
    }

    fn check_compatible(&self, entry: &NativeEntry) -> Result<(), String> {
        if !app_compatible(&self.app_version, entry.min_app.as_deref()) {
            return Err("需要較新的程式版本".into());
        }
        if entry.schema_version > supported_schema(&entry.id) {
            return Err("套件格式比這個程式支援的更新".into());
        }
        Ok(())
    }

    /// The verified active package, if any.
    ///
    /// - Corruption (hash, signature, content): the version is replaced by the previous one, persisted
    ///   with the reason, and the bad folder is removed.
    /// - Incompatibility (needs a newer app): nothing on disk changes; the previous version (or the
    ///   built-in content) is used for display only, so a newer build still finds its pack intact.
    fn resolve(&self, id: &str) -> Option<(String, Loaded)> {
        let mut state = self.state(id);
        if state.disabled {
            return None;
        }
        let version = state.version.clone()?;
        let err = match self.load_version(id, &version) {
            Ok((_, loaded)) => return Some((version, loaded)),
            Err(e) => e,
        };
        let fallback = state
            .previous
            .clone()
            .and_then(|p| self.load_version(id, &p).ok().map(|(_, l)| (p, l)));
        if err.incompatible {
            return fallback;
        }
        let bad = self.version_dir(id, &version);
        state.last_error = Some(format!("{version}: {}", err.message));
        state.previous = None;
        state.version = fallback.as_ref().map(|(v, _)| v.clone());
        let _ = self.save_state(id, &state);
        if let Some(bad) = bad {
            let _ = std::fs::remove_dir_all(bad);
        }
        fallback
    }

    /// Tips of the active pack, or `None` to use the built-in list.
    pub fn active_tips(&self) -> Option<Vec<String>> {
        let (_, loaded) = self.resolve(SESSION_TIPS_ID)?;
        parse_tips(loaded.files.get(TIPS_FILE)?)
            .ok()
            .map(|p| p.tips)
    }

    /// Installs a package from a verified `index` (its signature is checked again here) and the
    /// downloaded `files` (`(asset name, bytes)`). Everything is checked before the active pointer
    /// moves; on any error nothing changes. A lower version than the active one is refused (use
    /// `rollback` to go back deliberately).
    pub fn install(
        &self,
        index: &Index,
        id: &str,
        files: &[(String, Vec<u8>)],
    ) -> Result<(), String> {
        let verified = verify_index(&index.raw, &index.sig, &self.pubkey)?;
        let entry = verified
            .entries
            .iter()
            .find(|e| e.id == id)
            .ok_or_else(|| format!("清單中沒有可用的 {id}"))?;
        if !KNOWN_PACKS.iter().any(|(k, _)| *k == entry.id) {
            return Err(format!("這個版本不認得模組 {}", entry.id));
        }
        self.check_compatible(entry)
            .map_err(|e| format!("{}: {e}", entry.id))?;
        let id_dir = self.pack_dir(&entry.id).ok_or("沒有模組資料夾")?;
        let mut state = self.state(&entry.id);
        if let (Some(cur), Ok(new)) = (
            state.version.as_deref().map(semver::Version::parse),
            semver::Version::parse(&entry.version),
        ) {
            match cur {
                Ok(cur) if new < cur => {
                    return Err(format!(
                        "拒絕降級:{} v{} 比已安裝的 v{cur} 舊",
                        entry.id, entry.version
                    ));
                }
                Ok(cur) if new == cur => {
                    return Err(format!("{} v{} 已經安裝", entry.id, entry.version));
                }
                _ => {}
            }
        }
        // Match every listed file to a download and verify size and hash.
        let mut ordered: Vec<(&PackageFile, &[u8])> = Vec::new();
        for f in &entry.files {
            let data = files
                .iter()
                .find(|(n, _)| *n == f.name)
                .map(|(_, d)| d.as_slice())
                .ok_or_else(|| format!("缺少下載檔案 {}", f.name))?;
            if data.len() as u64 != f.size || hex(data) != f.sha256 {
                return Err(format!("{} 的雜湊與清單不符,拒絕安裝", f.name));
            }
            ordered.push((f, data));
        }
        let refs: Vec<(&str, &[u8])> = ordered.iter().map(|(f, d)| (f.path.as_str(), *d)).collect();
        if package_digest(&refs) != entry.sha256 {
            return Err("套件整體雜湊與清單不符,拒絕安裝".into());
        }
        let content: HashMap<String, Vec<u8>> = ordered
            .iter()
            .map(|(f, d)| (f.path.clone(), d.to_vec()))
            .collect();
        validate_content(&entry.id, &content)?;

        // Stage next to the final folder, then rename: a half-written version never exists.
        std::fs::create_dir_all(&id_dir).map_err(|e| format!("無法建立模組資料夾: {e}"))?;
        let stage = id_dir.join(format!("{}.staging", entry.version));
        let target = id_dir.join(&entry.version);
        let _ = std::fs::remove_dir_all(&stage);
        let staged = (|| -> Result<(), String> {
            std::fs::create_dir_all(&stage).map_err(|e| e.to_string())?;
            for (f, data) in &ordered {
                std::fs::write(stage.join(&f.path), data).map_err(|e| e.to_string())?;
            }
            std::fs::write(stage.join(INDEX_FILE), &index.raw).map_err(|e| e.to_string())?;
            std::fs::write(stage.join(INDEX_SIG_FILE), &index.sig).map_err(|e| e.to_string())?;
            if target.exists() {
                std::fs::remove_dir_all(&target).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&stage, &target).map_err(|e| e.to_string())
        })();
        if let Err(e) = staged {
            let _ = std::fs::remove_dir_all(&stage);
            return Err(format!("無法寫入模組: {e}"));
        }
        let old_active = state.version.clone().filter(|v| *v != entry.version);
        state.previous = old_active.or(state.previous.clone());
        state.version = Some(entry.version.clone());
        state.last_error = None;
        if let Err(e) = self.save_state(&entry.id, &state) {
            let _ = std::fs::remove_dir_all(&target);
            return Err(e);
        }
        // Keep the active and the previous version only.
        if let Ok(rd) = std::fs::read_dir(&id_dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let keep = name == "active.json"
                    || Some(&name) == state.version.as_ref()
                    || Some(&name) == state.previous.as_ref();
                if !keep && e.path().is_dir() {
                    let _ = std::fs::remove_dir_all(e.path());
                }
            }
        }
        Ok(())
    }

    pub fn set_disabled(&self, id: &str, disabled: bool) -> Result<(), String> {
        let mut state = self.state(id);
        if state.version.is_none() {
            return Err("沒有已安裝的版本可以停用".into());
        }
        state.disabled = disabled;
        self.save_state(id, &state)
    }

    /// Switches back to the previous version (after checking that it still verifies) and drops the
    /// version it replaces.
    pub fn rollback(&self, id: &str) -> Result<String, String> {
        let mut state = self.state(id);
        let prev = state.previous.clone().ok_or("沒有上一版可以退回")?;
        self.load_version(id, &prev)
            .map_err(|e| format!("上一版也無法通過驗證: {}", e.message))?;
        let dropped = state.version.replace(prev.clone());
        state.previous = None;
        state.last_error = None;
        self.save_state(id, &state)?;
        if let Some(old) = dropped.filter(|old| *old != prev) {
            if let Some(dir) = self.version_dir(id, &old) {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
        Ok(prev)
    }

    /// Removes every installed pack so only built-in content remains.
    pub fn reset_all(&self) -> Result<(), String> {
        for (id, _) in KNOWN_PACKS {
            if let Some(dir) = self.pack_dir(id) {
                if dir.exists() {
                    std::fs::remove_dir_all(&dir).map_err(|e| format!("無法清除 {id}: {e}"))?;
                }
            }
        }
        Ok(())
    }

    /// One row per known pack for the management page.
    pub fn rows(&self, available: &[NativeEntry]) -> Vec<ModuleRow> {
        // Resolve first: a failed verification rewrites the pointer that the row reports.
        for (id, _) in KNOWN_PACKS {
            let _ = self.resolve(id);
        }
        KNOWN_PACKS
            .iter()
            .map(|(id, name)| self.row(id, name, available.iter().find(|e| e.id == *id)))
            .collect()
    }

    fn row(&self, id: &str, name: &str, offer: Option<&NativeEntry>) -> ModuleRow {
        let state = self.state(id);
        let newer = offer.filter(|o| match state.version.as_deref() {
            None => true,
            Some(v) => matches!(
                (semver::Version::parse(v), semver::Version::parse(&o.version)),
                (Ok(cur), Ok(new)) if new > cur
            ),
        });
        let usable = newer.is_some_and(|o| self.check_compatible(o).is_ok());
        let blocked = newer.is_some() && !usable;
        let installed_too_new = state
            .version
            .as_deref()
            .and_then(|v| self.load_version(id, v).err())
            .is_some_and(|e| e.incompatible);
        let status = if state.last_error.is_some() {
            Status::RolledBack
        } else if state.disabled && state.version.is_some() {
            Status::Disabled
        } else if installed_too_new || blocked {
            Status::NeedsNewerApp
        } else if usable {
            Status::UpdateAvailable
        } else if state.version.is_some() {
            Status::UpToDate
        } else {
            Status::Builtin
        };
        ModuleRow {
            id: id.into(),
            name: name.into(),
            installed: state.version.clone(),
            available: offer.map(|o| o.version.clone()),
            status,
            can_update: usable,
            can_toggle: state.version.is_some(),
            disabled: state.disabled,
            can_rollback: state.previous.is_some(),
            last_error: state.last_error,
        }
    }

    // ---- offline index cache ----

    /// Verifies a freshly fetched index, refuses one that would move any pack backwards compared with
    /// the cached (already verified) one, and caches it.
    pub fn accept_index(&self, bytes: &[u8], sig: &str) -> Result<Index, String> {
        let fresh = verify_index(bytes, sig, &self.pubkey)?;
        if let Some(id) = index_regresses(&self.cached_index(), &fresh) {
            return Err(format!(
                "遠端模組清單中的 {id} 版本比本機已驗證的更舊,拒絕採用"
            ));
        }
        self.save_index_cache(bytes, sig);
        Ok(fresh)
    }

    fn save_index_cache(&self, index_bytes: &[u8], sig: &str) {
        if let Some(root) = &self.root {
            if std::fs::create_dir_all(root).is_ok() {
                let _ = write_atomic(&root.join("index.cache.json"), index_bytes);
                let _ = write_atomic(&root.join("index.cache.json.sig"), sig.as_bytes());
            }
        }
    }

    /// The last verified index, re-verified now; empty when none is cached or it no longer verifies.
    pub fn cached_index(&self) -> Index {
        let Some(root) = &self.root else {
            return Index::default();
        };
        let (Ok(bytes), Ok(sig)) = (
            std::fs::read(root.join("index.cache.json")),
            std::fs::read_to_string(root.join("index.cache.json.sig")),
        ) else {
            return Index::default();
        };
        verify_index(&bytes, &sig, &self.pubkey).unwrap_or_default()
    }
}

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------

fn client() -> Result<reqwest::Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.url().scheme() == "https" && attempt.previous().len() < 5 {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|e| format!("HTTP client init failed: {e}"))
}

async fn get_bytes(client: &reqwest::Client, url: &str, limit: u64) -> Result<Vec<u8>, String> {
    let mut resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("無法連線到模組發布站: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("模組發布站回應 {}", resp.status()));
    }
    let mut data = Vec::new();
    while let Some(chunk) = resp.chunk().await.map_err(|e| format!("下載中斷: {e}"))? {
        data.extend_from_slice(&chunk);
        if data.len() as u64 > limit {
            return Err("下載內容大小異常,拒絕處理".into());
        }
    }
    Ok(data)
}

/// Fetches the signed index, verifies it, refuses a replayed older one and caches it.
pub async fn fetch_index(registry: &Registry) -> Result<Index, String> {
    let http = client()?;
    let bytes = get_bytes(
        &http,
        &format!("{RELEASES}/latest/download/{INDEX_FILE}"),
        MAX_INDEX_BYTES as u64,
    )
    .await?;
    let sig = get_bytes(
        &http,
        &format!("{RELEASES}/latest/download/{INDEX_SIG_FILE}"),
        4096,
    )
    .await?;
    registry.accept_index(&bytes, &String::from_utf8_lossy(&sig))
}

/// Downloads every file of pack `id` from its (re-checked) official URL, then installs it.
pub async fn download_and_install(
    registry: &Registry,
    index: &Index,
    id: &str,
) -> Result<(), String> {
    let verified = verify_index(&index.raw, &index.sig, registry.pubkey())?;
    let entry = verified
        .entries
        .iter()
        .find(|e| e.id == id)
        .ok_or_else(|| format!("清單中沒有可用的 {id}"))?;
    let http = client()?;
    let mut files = Vec::new();
    for f in &entry.files {
        let data = get_bytes(&http, &format!("{}{}", entry.url, f.name), f.size).await?;
        files.push((f.name.clone(), data));
    }
    registry.install(index, id, &files)
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use ring::rand::SystemRandom;
    use ring::signature::{Ed25519KeyPair, KeyPair};

    fn keypair() -> Ed25519KeyPair {
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).unwrap();
        Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap()
    }

    fn sign(kp: &Ed25519KeyPair, bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(kp.sign(bytes).as_ref())
    }

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "irms-modules-test-{tag}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |d| d.as_nanos())
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn tips_json(n: usize) -> Vec<u8> {
        let tips: Vec<String> = (0..n).map(|i| format!("tip {i}")).collect();
        serde_json::to_vec(&serde_json::json!({"schema_version": 1, "tips": tips})).unwrap()
    }

    fn pack(version: &str, tips: &[u8]) -> (NativeEntry, Vec<(String, Vec<u8>)>) {
        let entry = build_content_entry(
            SESSION_TIPS_ID,
            version,
            "使用提示",
            1,
            "v2026.11.22",
            &[(TIPS_FILE, tips)],
        );
        let files = vec![(entry.files[0].name.clone(), tips.to_vec())];
        (entry, files)
    }

    fn index_bytes(entries: &[NativeEntry]) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "schema": 1,
            "modules": [{"id": "angle-range", "version": "1.0.0", "file": "x.js"}],
            "native": entries
        }))
        .unwrap()
    }

    fn signed(kp: &Ed25519KeyPair, entries: &[NativeEntry]) -> Index {
        let b = index_bytes(entries);
        verify_index(&b, &sign(kp, &b), kp.public_key().as_ref()).unwrap()
    }

    struct Env {
        reg: Registry,
        root: PathBuf,
        kp: Ed25519KeyPair,
    }

    impl Env {
        fn new(tag: &str, app: &str) -> Self {
            let kp = keypair();
            let root = temp_root(tag);
            let reg = Registry::new(Some(root.clone()), app)
                .with_pubkey(kp.public_key().as_ref().to_vec());
            Self { reg, root, kp }
        }
        fn install(&self, version: &str, tips: &[u8]) -> Result<(), String> {
            let (entry, files) = pack(version, tips);
            self.install_entry(&entry, &files)
        }
        fn install_entry(
            &self,
            entry: &NativeEntry,
            files: &[(String, Vec<u8>)],
        ) -> Result<(), String> {
            let b = index_bytes(std::slice::from_ref(entry));
            let idx = Index {
                raw: b.clone(),
                sig: sign(&self.kp, &b),
                ..Index::default()
            };
            self.reg.install(&idx, SESSION_TIPS_ID, files)
        }
        fn dir(&self) -> PathBuf {
            self.root.join(SESSION_TIPS_ID)
        }
    }

    impl Drop for Env {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn a_good_signature_gives_the_native_entries_and_ignores_the_tauri_part() {
        let kp = keypair();
        let (entry, _) = pack("1.0.0", &tips_json(2));
        let idx = signed(&kp, std::slice::from_ref(&entry));
        assert_eq!(idx.entries, vec![entry]);
        assert!(idx.skipped.is_empty());
    }

    #[test]
    fn a_bad_signature_or_tampered_index_is_refused() {
        let kp = keypair();
        let (entry, _) = pack("1.0.0", &tips_json(2));
        let b = index_bytes(&[entry]);
        let sig = sign(&kp, &b);
        assert!(verify_index(&b, &sig, keypair().public_key().as_ref()).is_err());
        let mut t = b.clone();
        let pos = t.iter().position(|c| *c == b'1').unwrap();
        t[pos] = b'2';
        assert!(verify_index(&t, &sig, kp.public_key().as_ref()).is_err());
        assert!(verify_index(&b, "not base64!!", kp.public_key().as_ref()).is_err());
    }

    #[test]
    fn an_entry_with_a_foreign_host_is_skipped_even_when_signed() {
        let kp = keypair();
        let (mut entry, _) = pack("1.0.0", &tips_json(2));
        for bad in [
            "https://evil.example/yuhina0515/IRMS-Modules/releases/download/v1/",
            "https://github.com/yuhina0515/Other/releases/download/v1/",
            "http://github.com/yuhina0515/IRMS-Modules/releases/download/v1/",
            "https://github.com/yuhina0515/IRMS-Modules/releases/download/v1/../x/",
            "https://github.com/yuhina0515/IRMS-Modules/releases/download/v1",
        ] {
            entry.url = bad.into();
            let idx = signed(&kp, std::slice::from_ref(&entry));
            assert!(idx.entries.is_empty(), "{bad}");
            assert_eq!(idx.skipped.len(), 1, "{bad}");
        }
    }

    #[test]
    fn one_invalid_entry_does_not_reject_the_valid_ones() {
        let kp = keypair();
        let (good, _) = pack("1.0.0", &tips_json(2));
        let mut bad = good.clone();
        bad.id = "other-pack".into();
        bad.version = "not-a-version".into();
        let b = serde_json::to_vec(&serde_json::json!({
            "schema": 1,
            "native": [bad, {"kind": "content", "id": "broken"}, good]
        }))
        .unwrap();
        let idx = verify_index(&b, &sign(&kp, &b), kp.public_key().as_ref()).unwrap();
        assert_eq!(idx.entries.len(), 1);
        assert_eq!(idx.skipped.len(), 2);
    }

    #[test]
    fn unknown_kinds_are_skipped_and_path_tricks_are_skipped() {
        let kp = keypair();
        let doc = serde_json::json!({"schema": 1, "native": [{"kind": "wasm", "id": "x"}]});
        let b = serde_json::to_vec(&doc).unwrap();
        let idx = verify_index(&b, &sign(&kp, &b), kp.public_key().as_ref()).unwrap();
        assert!(idx.entries.is_empty() && idx.skipped.is_empty());
        let (mut entry, _) = pack("1.0.0", &tips_json(2));
        entry.files[0].path = "../evil.json".into();
        assert!(signed(&kp, &[entry]).entries.is_empty());
    }

    #[test]
    fn file_names_that_clash_on_windows_are_refused() {
        let kp = keypair();
        let (entry, _) = pack("1.0.0", &tips_json(2));
        for bad in [
            "Meta.json",
            "INDEX.JSON",
            "index.json.sig",
            "CON",
            "con.json",
            "Nul.txt",
            "aux",
            "COM1.json",
            "lpt9.json",
            "tips.",
            "tips.json.",
            "a:b.json",
            "a b.json",
        ] {
            let mut e = entry.clone();
            e.files[0].path = bad.into();
            assert!(signed(&kp, &[e.clone()]).entries.is_empty(), "path {bad}");
            if !is_installer_file(bad) {
                let mut e = entry.clone();
                e.files[0].name = bad.into();
                assert!(signed(&kp, &[e]).entries.is_empty(), "name {bad}");
            }
        }
        for ok in ["tips.json", "com10.json", "lpt.json", "console.json"] {
            let mut e = entry.clone();
            e.files[0].path = ok.into();
            assert_eq!(signed(&kp, &[e]).entries.len(), 1, "{ok}");
        }
    }

    #[test]
    fn uppercase_hashes_are_normalised_so_they_match() {
        let kp = keypair();
        let (mut entry, _) = pack("1.0.0", &tips_json(2));
        entry.sha256 = entry.sha256.to_uppercase();
        entry.files[0].sha256 = entry.files[0].sha256.to_uppercase();
        let idx = signed(&kp, &[entry]);
        assert_eq!(idx.entries.len(), 1);
        assert_eq!(idx.entries[0].sha256, idx.entries[0].sha256.to_lowercase());
        let env = Env::new("upper", "1.3.0");
        let (mut e, files) = pack("1.0.0", &tips_json(2));
        e.sha256 = e.sha256.to_uppercase();
        e.files[0].sha256 = e.files[0].sha256.to_uppercase();
        env.install_entry(&e, &files).unwrap();
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
    }

    #[test]
    fn install_activates_the_pack_and_serves_its_tips() {
        let env = Env::new("install", "1.3.0-beta.12");
        assert_eq!(env.reg.active_tips(), None, "nothing installed: built-in");
        env.install("1.0.0", &tips_json(3)).unwrap();
        assert_eq!(env.reg.active_tips().unwrap().len(), 3);
        assert_eq!(
            env.reg.state(SESSION_TIPS_ID).version.as_deref(),
            Some("1.0.0")
        );
        assert!(env.install("1.0.0", &tips_json(3)).is_err(), "same version");
    }

    #[test]
    fn a_hash_mismatch_installs_nothing_and_keeps_the_active_version() {
        let env = Env::new("hash", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        let (e2, mut f2) = pack("1.1.0", &tips_json(4));
        f2[0].1[0] ^= 1;
        let err = env.install_entry(&e2, &f2).unwrap_err();
        assert!(err.contains("雜湊"), "{err}");
        assert_eq!(
            env.reg.state(SESSION_TIPS_ID).version.as_deref(),
            Some("1.0.0")
        );
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
        assert!(!env.dir().join("1.1.0").exists());
        assert!(!env.dir().join("1.1.0.staging").exists());
    }

    #[test]
    fn an_index_signed_by_another_key_cannot_install() {
        let env = Env::new("foreignkey", "1.3.0");
        let (entry, files) = pack("1.0.0", &tips_json(2));
        let other = keypair();
        let b = index_bytes(&[entry]);
        let idx = Index {
            raw: b.clone(),
            sig: sign(&other, &b),
            ..Index::default()
        };
        assert!(env.reg.install(&idx, SESSION_TIPS_ID, &files).is_err());
        assert_eq!(env.reg.state(SESSION_TIPS_ID).version, None);
    }

    #[test]
    fn a_pack_needing_a_newer_app_or_schema_is_refused() {
        let env = Env::new("minapp", "1.3.0-beta.12");
        let (mut entry, files) = pack("1.0.0", &tips_json(2));
        entry.min_app = Some("1.4.0".into());
        assert!(env.install_entry(&entry, &files).is_err());
        entry.min_app = None;
        entry.schema_version = 2;
        assert!(env.install_entry(&entry, &files).is_err());
        assert_eq!(env.reg.state(SESSION_TIPS_ID).version, None);
        // The row tells the owner why an offered pack cannot be used.
        let mut offer = entry.clone();
        offer.schema_version = 1;
        offer.min_app = Some("1.4.0".into());
        let rows = env.reg.rows(&[offer]);
        assert_eq!(rows[0].status, Status::NeedsNewerApp);
        assert!(!rows[0].can_update);
    }

    #[test]
    fn invalid_content_is_refused_before_anything_is_written() {
        let env = Env::new("badcontent", "1.3.0");
        let too_many = tips_json(MAX_TIPS + 1);
        for bad in [
            b"not json".to_vec(),
            br#"{"schema_version":1,"tips":[]}"#.to_vec(),
            br#"{"schema_version":9,"tips":["a"]}"#.to_vec(),
            br#"{"schema_version":1,"tips":["  "]}"#.to_vec(),
            too_many,
        ] {
            assert!(env.install("1.0.0", &bad).is_err());
        }
        assert!(!env.dir().join("1.0.0").exists());
    }

    #[test]
    fn a_corrupted_active_pack_rolls_back_to_the_previous_version() {
        let env = Env::new("corrupt", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        env.install("1.1.0", &tips_json(5)).unwrap();
        assert_eq!(env.reg.active_tips().unwrap().len(), 5);
        std::fs::write(env.dir().join("1.1.0").join(TIPS_FILE), b"{ broken").unwrap();
        assert_eq!(
            env.reg.active_tips().unwrap().len(),
            2,
            "previous version serves"
        );
        let state = env.reg.state(SESSION_TIPS_ID);
        assert_eq!(state.version.as_deref(), Some("1.0.0"));
        assert!(state.last_error.unwrap().contains("1.1.0"));
        assert_eq!(env.reg.rows(&[])[0].status, Status::RolledBack);
    }

    #[test]
    fn editing_the_files_and_the_unsigned_metadata_together_still_falls_back() {
        let env = Env::new("tamper", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        env.install("1.1.0", &tips_json(5)).unwrap();
        let dir = env.dir().join("1.1.0");
        // The attacker rewrites tips.json and every unsigned file that could vouch for it.
        let evil = tips_json(7);
        std::fs::write(dir.join(TIPS_FILE), &evil).unwrap();
        let (mut forged, _) = pack("1.1.0", &evil);
        forged.files[0].size = evil.len() as u64;
        std::fs::write(dir.join("meta.json"), serde_json::to_vec(&forged).unwrap()).unwrap();
        // ... and even the index, but without the private key the signature cannot match.
        let forged_index = index_bytes(&[forged]);
        std::fs::write(dir.join(INDEX_FILE), forged_index).unwrap();
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
        assert_eq!(
            env.reg.state(SESSION_TIPS_ID).version.as_deref(),
            Some("1.0.0")
        );
    }

    #[test]
    fn with_no_valid_version_left_the_built_in_content_is_used() {
        let env = Env::new("fallback", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        std::fs::write(env.dir().join("1.0.0").join(TIPS_FILE), tips_json(9)).unwrap();
        assert_eq!(env.reg.active_tips(), None);
        assert_eq!(env.reg.state(SESSION_TIPS_ID).version, None);
        // A damaged pointer file is survivable too.
        std::fs::write(env.dir().join("active.json"), b"\x00junk").unwrap();
        assert_eq!(env.reg.active_tips(), None);
        assert_eq!(env.reg.rows(&[])[0].status, Status::RolledBack);
    }

    #[test]
    fn a_hostile_active_json_never_deletes_or_reads_outside_the_pack_folder() {
        let env = Env::new("traversal", "1.3.0");
        let victim = env.root.join("victim");
        std::fs::create_dir_all(&victim).unwrap();
        std::fs::write(victim.join("keep.txt"), b"x").unwrap();
        let abs = victim.to_string_lossy().replace('\\', "\\\\");
        for version in ["../../victim", "..", &abs, "..\\\\victim"] {
            std::fs::create_dir_all(env.dir()).unwrap();
            let json = format!(r#"{{"version":"{version}","previous":"{version}"}}"#);
            std::fs::write(env.dir().join("active.json"), json).unwrap();
            assert_eq!(env.reg.active_tips(), None, "{version}");
            assert!(victim.join("keep.txt").exists(), "{version}");
            // The rollback path takes the same stored strings.
            assert!(env.reg.rollback(SESSION_TIPS_ID).is_err(), "{version}");
            assert!(victim.join("keep.txt").exists(), "{version}");
        }
    }

    #[test]
    fn a_pack_that_needs_a_newer_build_is_left_untouched_by_an_older_one() {
        let env = Env::new("newer", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        // A newer build installed 1.1.0, which needs app 1.4.0.
        let newer_env = Registry::new(Some(env.root.clone()), "1.4.0")
            .with_pubkey(env.kp.public_key().as_ref().to_vec());
        let (mut e, files) = pack("1.1.0", &tips_json(6));
        e.min_app = Some("1.4.0".into());
        let b = index_bytes(std::slice::from_ref(&e));
        let idx = Index {
            raw: b.clone(),
            sig: sign(&env.kp, &b),
            ..Index::default()
        };
        newer_env.install(&idx, SESSION_TIPS_ID, &files).unwrap();
        let before = std::fs::read(env.dir().join("active.json")).unwrap();
        // The older build shows the previous version but deletes and rewrites nothing.
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
        assert_eq!(env.reg.rows(&[])[0].status, Status::NeedsNewerApp);
        assert_eq!(
            std::fs::read(env.dir().join("active.json")).unwrap(),
            before
        );
        assert!(env.dir().join("1.1.0").join(TIPS_FILE).exists());
        let state = env.reg.state(SESSION_TIPS_ID);
        assert_eq!(state.version.as_deref(), Some("1.1.0"));
        assert_eq!(state.previous.as_deref(), Some("1.0.0"));
        // The newer build still finds its pack intact.
        assert_eq!(newer_env.active_tips().unwrap().len(), 6);
    }

    #[test]
    fn a_lower_version_is_refused_but_rollback_still_works() {
        let env = Env::new("downgrade", "1.3.0");
        env.install("1.1.0", &tips_json(3)).unwrap();
        let err = env.install("1.0.0", &tips_json(2)).unwrap_err();
        assert!(err.contains("降級"), "{err}");
        assert_eq!(
            env.reg.state(SESSION_TIPS_ID).version.as_deref(),
            Some("1.1.0")
        );
        env.install("1.2.0", &tips_json(4)).unwrap();
        assert_eq!(env.reg.rollback(SESSION_TIPS_ID).unwrap(), "1.1.0");
    }

    #[test]
    fn an_older_signed_index_cannot_replace_the_cached_one() {
        let env = Env::new("replay", "1.3.0");
        let (e2, _) = pack("1.2.0", &tips_json(2));
        let (e1, _) = pack("1.0.0", &tips_json(2));
        let new_b = index_bytes(&[e2]);
        let old_b = index_bytes(&[e1]);
        env.reg
            .accept_index(&new_b, &sign(&env.kp, &new_b))
            .unwrap();
        let err = env
            .reg
            .accept_index(&old_b, &sign(&env.kp, &old_b))
            .unwrap_err();
        assert!(err.contains("更舊"), "{err}");
        assert_eq!(env.reg.cached_index().entries[0].version, "1.2.0");
        // The same or a newer index is fine.
        env.reg
            .accept_index(&new_b, &sign(&env.kp, &new_b))
            .unwrap();
    }

    #[test]
    fn rollback_moves_the_pointer_to_the_previous_version_and_drops_the_bad_one() {
        let env = Env::new("rollback", "1.3.0");
        assert!(env.reg.rollback(SESSION_TIPS_ID).is_err(), "nothing yet");
        env.install("1.0.0", &tips_json(2)).unwrap();
        env.install("1.1.0", &tips_json(5)).unwrap();
        assert!(env.reg.rows(&[])[0].can_rollback);
        assert_eq!(env.reg.rollback(SESSION_TIPS_ID).unwrap(), "1.0.0");
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
        assert!(!env.reg.rows(&[])[0].can_rollback);
        assert!(!env.dir().join("1.1.0").exists());
    }

    #[test]
    fn disabling_uses_the_built_in_tips_and_enabling_brings_the_pack_back() {
        let env = Env::new("disable", "1.3.0");
        assert!(env.reg.set_disabled(SESSION_TIPS_ID, true).is_err());
        env.install("1.0.0", &tips_json(2)).unwrap();
        env.reg.set_disabled(SESSION_TIPS_ID, true).unwrap();
        assert_eq!(env.reg.active_tips(), None);
        assert_eq!(env.reg.rows(&[])[0].status, Status::Disabled);
        env.reg.set_disabled(SESSION_TIPS_ID, false).unwrap();
        assert_eq!(env.reg.active_tips().unwrap().len(), 2);
        assert_eq!(env.reg.rows(&[])[0].status, Status::UpToDate);
    }

    #[test]
    fn restore_built_in_removes_every_pack() {
        let env = Env::new("reset", "1.3.0");
        env.install("1.0.0", &tips_json(2)).unwrap();
        env.reg.reset_all().unwrap();
        assert_eq!(env.reg.active_tips(), None);
        assert_eq!(env.reg.rows(&[])[0].status, Status::Builtin);
    }

    #[test]
    fn row_status_follows_the_offered_version() {
        let env = Env::new("status", "1.3.0");
        let (e1, _) = pack("1.0.0", &tips_json(2));
        let (e2, _) = pack("1.1.0", &tips_json(3));
        assert_eq!(env.reg.rows(&[])[0].status, Status::Builtin);
        let r = env.reg.rows(std::slice::from_ref(&e1));
        assert_eq!(
            (r[0].status, r[0].can_update),
            (Status::UpdateAvailable, true)
        );
        env.install("1.0.0", &tips_json(2)).unwrap();
        assert_eq!(
            env.reg.rows(std::slice::from_ref(&e1))[0].status,
            Status::UpToDate
        );
        let r = env.reg.rows(&[e2]);
        assert_eq!(
            (r[0].status, r[0].can_update),
            (Status::UpdateAvailable, true)
        );
        assert_eq!(r[0].available.as_deref(), Some("1.1.0"));
    }

    #[test]
    fn the_cached_index_serves_offline_only_while_it_verifies() {
        let env = Env::new("cache", "1.3.0");
        let (entry, _) = pack("1.0.0", &tips_json(2));
        let b = index_bytes(std::slice::from_ref(&entry));
        env.reg.accept_index(&b, &sign(&env.kp, &b)).unwrap();
        assert_eq!(env.reg.cached_index().entries, vec![entry]);
        std::fs::write(env.root.join("index.cache.json"), b"{}").unwrap();
        assert!(env.reg.cached_index().entries.is_empty());
    }

    #[test]
    fn a_registry_without_storage_never_fails() {
        let reg = Registry::new(None, "1.3.0");
        assert_eq!(reg.active_tips(), None);
        assert!(reg
            .install(&Index::default(), SESSION_TIPS_ID, &[])
            .is_err());
        assert_eq!(reg.rows(&[])[0].status, Status::Builtin);
        assert!(reg.reset_all().is_ok());
    }
}
