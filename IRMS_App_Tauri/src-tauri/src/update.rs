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
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Manager, ResourceId, Runtime};
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

#[tauri::command]
pub async fn update_check<R: Runtime>(
    app: AppHandle<R>,
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

    let updater = app
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
        rid: app.resources_table().add(update),
    }))
}
