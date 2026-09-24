// telemetry.rs — opt-in upload of test telemetry to the IRMS telemetry collector
// (IRMS_Telemetry/, deployed behind https://hina-tw.ddns.net/irms-api/).
//
// Purpose: real-device acceptance runs are done by teammates holding the hardware, so raw BLE
// packets, connection transitions and OTA status need to reach the developer without anyone
// copying log files around. Design rules:
// - Default OFF. The endpoint and ingest token come from Settings at runtime, never from source —
//   the repository is public.
// - Recording is a cheap in-memory push; network I/O happens on a separate task. An unreachable
//   server, a bad token or a slow network must never block BLE handling, Session logic or the
//   local SQLite store, which stays the source of truth.
// - The queue is bounded. When the server is unreachable for long, the oldest events are dropped
//   and the drop count is reported, instead of growing memory without limit.
// - Every event carries a per-launch run id and a monotonic seq, so a retried batch is
//   de-duplicated server-side by (runId, seq).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const FLUSH_INTERVAL: Duration = Duration::from_secs(2);
const MAX_BATCH: usize = 2000;
const MAX_QUEUE: usize = 200_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// Longest wait between retries after consecutive failures.
const MAX_BACKOFF: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
struct Event {
    seq: u64,
    t: String,
    kind: String,
    #[serde(skip_serializing_if = "Value::is_null")]
    data: Value,
}

#[derive(Default)]
struct Inner {
    enabled: bool,
    endpoint: String,
    token: String,
    next_seq: u64,
    queue: VecDeque<Event>,
    sent: u64,
    dropped: u64,
    last_error: Option<String>,
}

pub struct TelemetryState {
    run_id: String,
    inner: Mutex<Inner>,
}

impl Default for TelemetryState {
    fn default() -> Self {
        Self {
            run_id: uuid::Uuid::new_v4().to_string(),
            inner: Mutex::new(Inner {
                next_seq: 1,
                ..Inner::default()
            }),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetryStatus {
    enabled: bool,
    run_id: String,
    pending: usize,
    sent: u64,
    dropped: u64,
    last_error: Option<String>,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

impl TelemetryState {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        // A panic while holding this lock cannot leave the queue logically inconsistent (every
        // mutation is a single push/drain), so recover instead of propagating the poison.
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn record(&self, kind: &str, data: Value) {
        let mut inner = self.lock();
        if !inner.enabled {
            return;
        }
        let seq = inner.next_seq;
        inner.next_seq += 1;
        inner.queue.push_back(Event {
            seq,
            t: now_iso(),
            kind: kind.to_string(),
            data,
        });
        while inner.queue.len() > MAX_QUEUE {
            inner.queue.pop_front();
            inner.dropped += 1;
        }
    }

    fn status(&self) -> TelemetryStatus {
        let inner = self.lock();
        TelemetryStatus {
            enabled: inner.enabled,
            run_id: self.run_id.clone(),
            pending: inner.queue.len(),
            sent: inner.sent,
            dropped: inner.dropped,
            last_error: inner.last_error.clone(),
        }
    }
}

/// Records one event if telemetry is enabled. Safe to call from any thread or task.
pub fn record(app: &AppHandle, kind: &str, data: Value) {
    if let Some(state) = app.try_state::<TelemetryState>() {
        state.record(kind, data);
    }
}

fn normalize_endpoint(endpoint: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("無效的伺服器網址:{e}"))?;
    match parsed.scheme() {
        "https" => Ok(trimmed.to_string()),
        // Plain HTTP only for a collector on this machine (development); the token must not
        // cross a network in clear text.
        "http" if matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")) => {
            Ok(trimmed.to_string())
        }
        _ => Err("伺服器網址必須使用 https".to_string()),
    }
}

#[tauri::command]
pub fn telemetry_configure(
    app: AppHandle,
    state: tauri::State<'_, TelemetryState>,
    enabled: bool,
    endpoint: String,
    token: String,
) -> Result<TelemetryStatus, String> {
    let endpoint = if enabled {
        if token.trim().is_empty() {
            return Err("請先填入上傳金鑰".to_string());
        }
        normalize_endpoint(&endpoint)?
    } else {
        String::new()
    };
    let turned_on = {
        let mut inner = state.lock();
        let turned_on = enabled && !inner.enabled;
        inner.enabled = enabled;
        inner.endpoint = endpoint;
        inner.token = token.trim().to_string();
        inner.last_error = None;
        if !enabled {
            // Turning upload off discards what has not been sent — the user asked for no
            // upload, so nothing queued before that decision should leave the machine later.
            inner.queue.clear();
        }
        turned_on
    };
    if turned_on {
        state.record(
            "app_start",
            json!({
                "appVersion": app.package_info().version.to_string(),
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
            }),
        );
    }
    Ok(state.status())
}

/// Frontend-originated events (Session lifecycle, calibration snapshot, trigger state).
#[tauri::command]
pub fn telemetry_log(state: tauri::State<'_, TelemetryState>, kind: String, data: Value) {
    if kind.is_empty() || kind.len() > 40 {
        return;
    }
    state.record(&kind, data);
}

#[tauri::command]
pub fn telemetry_status(state: tauri::State<'_, TelemetryState>) -> TelemetryStatus {
    state.status()
}

fn build_client() -> Option<reqwest::Client> {
    // reqwest is built with rustls-no-provider (shared with tauri-plugin-updater); install the
    // ring provider the same way the updater does if nothing has installed one yet.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| eprintln!("[telemetry] HTTP client init failed: {e}"))
        .ok()
}

/// Starts the background uploader. Runs for the lifetime of the app.
pub fn spawn_uploader(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Some(client) = build_client() else {
            return;
        };
        let version = app.package_info().version.to_string();
        let host = std::env::var("COMPUTERNAME").unwrap_or_default();
        let mut backoff = FLUSH_INTERVAL;
        loop {
            tokio::time::sleep(backoff).await;
            let state = app.state::<TelemetryState>();
            backoff = match flush_once(&client, &state, &version, &host).await {
                Ok(_) => FLUSH_INTERVAL,
                Err(()) => (backoff * 2).min(MAX_BACKOFF),
            };
        }
    });
}

/// Sends at most one batch. Ok(n) = n events delivered (0 when disabled or idle);
/// Err(()) = the request failed and the batch stays queued (error kept in `last_error`).
async fn flush_once(
    client: &reqwest::Client,
    state: &TelemetryState,
    version: &str,
    host: &str,
) -> Result<usize, ()> {
    let (url, token, batch, dropped) = {
        let inner = state.lock();
        if !inner.enabled || inner.queue.is_empty() {
            return Ok(0);
        }
        let batch: Vec<Event> = inner.queue.iter().take(MAX_BATCH).cloned().collect();
        (
            format!("{}/v1/ingest", inner.endpoint),
            inner.token.clone(),
            batch,
            inner.dropped,
        )
    };
    let last_seq = batch.last().map(|e| e.seq).unwrap_or(0);
    let body = json!({
        "runId": state.run_id,
        "appVersion": version,
        "host": host,
        "dropped": dropped,
        "events": batch,
    });
    let result = client
        .post(&url)
        .bearer_auth(&token)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())
        .and_then(|res| {
            if res.status().is_success() {
                Ok(())
            } else {
                Err(format!("伺服器回應 HTTP {}", res.status().as_u16()))
            }
        });

    let mut inner = state.lock();
    match result {
        Ok(()) => {
            // Remove only what was sent: new events may have been queued meanwhile, and the
            // queue may have been cleared or trimmed while the request was in flight.
            let before = inner.queue.len();
            inner.queue.retain(|e| e.seq > last_seq);
            let delivered = before - inner.queue.len();
            inner.sent += delivered as u64;
            inner.last_error = None;
            Ok(delivered)
        }
        Err(err) => {
            inner.last_error = Some(err);
            Err(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enabled_state() -> TelemetryState {
        let state = TelemetryState::default();
        state.lock().enabled = true;
        state
    }

    #[test]
    fn disabled_state_records_nothing() {
        let state = TelemetryState::default();
        state.record("packet", json!({ "raw": "x" }));
        assert_eq!(state.status().pending, 0);
    }

    #[test]
    fn seq_is_monotonic_and_queue_is_bounded() {
        let state = enabled_state();
        for _ in 0..(MAX_QUEUE + 5) {
            state.record("packet", Value::Null);
        }
        let inner = state.lock();
        assert_eq!(inner.queue.len(), MAX_QUEUE);
        assert_eq!(inner.dropped, 5);
        assert_eq!(inner.queue.front().map(|e| e.seq), Some(6));
        assert_eq!(
            inner.queue.back().map(|e| e.seq),
            Some(MAX_QUEUE as u64 + 5)
        );
    }

    fn state_pointing_at(endpoint: &str, token: &str) -> TelemetryState {
        let state = enabled_state();
        {
            let mut inner = state.lock();
            inner.endpoint = endpoint.to_string();
            inner.token = token.to_string();
        }
        state
    }

    #[tokio::test]
    async fn failed_upload_keeps_the_batch_queued() {
        // Nothing listens on port 9 (discard) locally; the connection is refused.
        let state = state_pointing_at("http://127.0.0.1:9", "token");
        state.record("packet", json!({ "raw": "K:1" }));
        let client = build_client().unwrap();
        assert!(flush_once(&client, &state, "test", "host").await.is_err());
        let status = state.status();
        assert_eq!((status.pending, status.sent), (1, 0));
        assert!(status.last_error.is_some());
    }

    /// Live round trip against a real collector. Run manually:
    /// IRMS_TELEMETRY_LIVE_ENDPOINT=... IRMS_TELEMETRY_LIVE_TOKEN=... cargo test -- --ignored live
    #[tokio::test]
    #[ignore]
    async fn live_upload_round_trip() {
        let endpoint = std::env::var("IRMS_TELEMETRY_LIVE_ENDPOINT").unwrap();
        let token = std::env::var("IRMS_TELEMETRY_LIVE_TOKEN").unwrap();
        let state = state_pointing_at(&endpoint, &token);
        state.record("app_log", json!({ "message": "live_upload_round_trip" }));
        state.record("packet", json!({ "raw": "K:12.5" }));
        let client = build_client().unwrap();
        assert_eq!(
            flush_once(&client, &state, "test", "cargo-test").await,
            Ok(2)
        );
        println!("run id: {}", state.run_id);

        // A wrong token must be rejected and leave the event queued.
        state.lock().token = "wrong-token".to_string();
        state.record("packet", json!({ "raw": "K:13.0" }));
        assert!(flush_once(&client, &state, "test", "cargo-test")
            .await
            .is_err());
        assert_eq!(state.status().pending, 1);
        assert!(state.status().last_error.unwrap().contains("401"));
    }

    #[test]
    fn endpoint_must_be_https_except_localhost() {
        assert_eq!(
            normalize_endpoint("https://hina-tw.ddns.net/irms-api/").unwrap(),
            "https://hina-tw.ddns.net/irms-api"
        );
        assert!(normalize_endpoint("http://localhost:8120").is_ok());
        assert!(normalize_endpoint("http://hina-tw.ddns.net/irms-api").is_err());
        assert!(normalize_endpoint("not a url").is_err());
    }
}
