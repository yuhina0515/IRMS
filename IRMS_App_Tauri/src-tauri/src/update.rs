// update.rs — Phase 4: replaces main/updater.ts's electron-updater integration.
//
// Only the channel selection needs custom Rust: `@tauri-apps/plugin-updater`'s JS `check()`
// (CheckOptions) has no per-call endpoint override, only the Rust `UpdaterBuilder::endpoints()`
// does. Everything downstream of a successful check — download progress, install, the resource
// lifecycle — stays on the plugin's own built-in `download`/`install`/`download_and_install`
// commands: this command returns the same `{ rid, currentVersion, version, date, body, rawJson }`
// shape the plugin's own `check` command does, so the frontend can hand it straight to
// `new Update(metadata)` (exported by `@tauri-apps/plugin-updater`) and use the plugin's normal
// JS API from there. See irmsApi.ts's `updates` implementation for that wiring.
//
// Channel URLs: `.../releases/latest/download/latest.json` is GitHub's own "latest non-prerelease"
// alias, which is exactly the stable channel. GitHub has no equivalent alias for "latest
// prerelease" — the beta endpoint below assumes the release process publishes/replaces a
// `latest.json` asset under a fixed `beta-latest` tag on every beta release. That publishing step
// is NOT set up as part of this change (see the Phase 4 coding log) — this command is only the
// App-side half of the channel toggle.
const STABLE_ENDPOINT: &str =
    "https://github.com/yuhina0515/IRMS/releases/latest/download/latest.json";
const BETA_ENDPOINT: &str =
    "https://github.com/yuhina0515/IRMS/releases/download/beta-latest/latest.json";

// `UpdaterBuilder::timeout` defaults to `None` (see tauri-plugin-updater's updater.rs), which
// means reqwest applies no request-level timeout at all — a connection that never receives a
// response (a firewall/EDR that silently drops the packets of an unsigned, unrecognized .exe
// instead of actively rejecting them, unlike a browser's traffic) hangs forever instead of
// erroring. 2026-09-13: a real user hit exactly this — the same GitHub URL loaded fine in their
// browser but the in-app check produced no result at all, not even an eventual error, confirming
// this app's HTTP client (not GitHub or the network path itself) never got a response. 30s is
// generous enough to cover the ~4MB installer download over a slow connection while still turning
// an indefinite hang into a bounded, visible `state:'error'` the user can actually report back.
#[cfg(desktop)]
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

use serde::Serialize;
#[cfg(desktop)]
use std::time::Duration;
#[cfg(desktop)]
use tauri::Manager;
use tauri::{ResourceId, Runtime, Webview};
#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
    rid: ResourceId,
    current_version: String,
    version: String,
    date: Option<String>,
    body: Option<String>,
    raw_json: serde_json::Value,
}

#[cfg(desktop)]
#[tauri::command]
pub async fn update_check<R: Runtime>(
    webview: Webview<R>,
    allow_beta: bool,
) -> Result<Option<UpdateMetadata>, String> {
    let endpoint = if allow_beta {
        BETA_ENDPOINT
    } else {
        STABLE_ENDPOINT
    };
    let url = endpoint
        .parse()
        .map_err(|e: url::ParseError| e.to_string())?;

    let updater = webview
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| e.to_string())?;

    let update = updater.check().await.map_err(|e| e.to_string())?;

    let Some(update) = update else {
        return Ok(None);
    };

    let formatted_date = match update.date {
        Some(date) => Some(
            date.format(&time::format_description::well_known::Rfc3339)
                .map_err(|e| e.to_string())?,
        ),
        None => None,
    };

    Ok(Some(UpdateMetadata {
        current_version: update.current_version.clone(),
        version: update.version.clone(),
        date: formatted_date,
        body: update.body.clone(),
        raw_json: update.raw_json.clone(),
        // The updater plugin's download/install commands resolve resource IDs from the calling
        // WebView's table. Storing this in AppHandle's global table produces a valid-looking ID
        // that download cannot resolve (`The resource id ... is invalid`). Match the plugin's
        // own `check` command and keep the Update in this WebView's table.
        rid: webview.resources_table().add(update),
    }))
}

#[cfg(mobile)]
#[tauri::command]
pub async fn update_check<R: Runtime>(
    _webview: Webview<R>,
    _allow_beta: bool,
) -> Result<Option<UpdateMetadata>, String> {
    // Mobile builds cannot self-install; android_update_check below handles the manual APK path.
    Ok(None)
}

/// A newer APK exists; the app cannot install it itself, so the user opens the download.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApkUpdate {
    version: String,
    url: String,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn android_update_check(_allow_beta: bool) -> Result<Option<ApkUpdate>, String> {
    Ok(None)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub async fn android_update_check(allow_beta: bool) -> Result<Option<ApkUpdate>, String> {
    #[derive(serde::Deserialize)]
    struct Manifest {
        version: String,
    }
    let endpoint = if allow_beta {
        BETA_ENDPOINT
    } else {
        STABLE_ENDPOINT
    };
    let client = crate::telemetry::with_platform_roots(reqwest::Client::builder())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let manifest: Manifest = client
        .get(endpoint)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let latest = semver::Version::parse(&manifest.version).map_err(|e| e.to_string())?;
    let current = semver::Version::parse(env!("CARGO_PKG_VERSION")).map_err(|e| e.to_string())?;
    if latest <= current {
        return Ok(None);
    }
    // The URL is derived from the version here, never taken from the renderer. Android itself
    // refuses an APK signed with a different key, so a wrong file cannot replace the app.
    let url = format!(
        "https://github.com/yuhina0515/IRMS/releases/download/v{0}/IRMS_{0}_android_arm64.apk",
        manifest.version
    );
    let exists = client
        .head(&url)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    Ok(exists.then_some(ApkUpdate {
        version: manifest.version,
        url,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    // CON-01 (2026-09-17): pins the wire shape irmsApi.ts's `performCheck` depends on
    // (`invoke<UpdateMetadata | null>('update_check', ...)` fed straight into
    // `@tauri-apps/plugin-updater`'s `Update` constructor) — see that file's `UpdateMetadata`
    // interface. No generated bridge between this struct and the TS interface, so a field
    // rename here would only surface at runtime without this test.
    #[test]
    fn update_metadata_wire_shape_matches_irms_api_ts() {
        let metadata = UpdateMetadata::default();
        let json = serde_json::to_value(&metadata).unwrap();
        let obj = json.as_object().unwrap();
        let mut keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        keys.sort();
        assert_eq!(
            keys,
            vec![
                "body",
                "currentVersion",
                "date",
                "rawJson",
                "rid",
                "version"
            ]
        );
    }
}
