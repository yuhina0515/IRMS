// Port of IRMS_App_Tauri/src-tauri/src/telemetry.rs without Tauri types (plan phase 3). The Tauri
// copy stays in place and keeps shipping; the two must follow the same wire format.
// telemetry.rs — opt-in live telemetry upload to the IRMS telemetry collector
// (IRMS_Telemetry/, deployed behind https://hina-tw.ddns.net/irms-api/).
//
// Purpose: any app user may choose to stream raw BLE packets, connection transitions, OTA status
// and Session events to the developer, so real-device behaviour can be analysed without anyone
// copying log files around. Design rules:
// - Default OFF; the user turns it on in Settings. There is no ingest secret — the app and repo
//   are public, so one could not stay secret. The collector bounds abuse (rate limits, size cap,
//   retention) and keeps reading behind its own token.
// - Recording is a cheap in-memory push; network I/O happens on a separate task. An unreachable
//   server, a rejected request or a slow network must never block BLE handling, Session logic or
//   the local SQLite store, which stays the source of truth.
// - The queue is bounded. When the server is unreachable for long, the oldest events are dropped
//   and the drop count is reported, instead of growing memory without limit.
// - Every event carries a per-launch run id and a monotonic seq, so a retried batch is
//   de-duplicated server-side by (runId, seq).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

const FLUSH_INTERVAL: Duration = Duration::from_secs(2);
const MAX_BATCH: usize = 2000;
const MAX_QUEUE: usize = 200_000;
/// RISK-FIX (2026-10-10): largest serialized `data` a frontend event may carry; bigger payloads
/// are counted as dropped so one oversized event cannot bloat the queue or its upload batch.
const MAX_EVENT_DATA_BYTES: usize = 64 * 1024;
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
    pub enabled: bool,
    pub run_id: String,
    pub pending: usize,
    pub sent: u64,
    pub dropped: u64,
    pub last_error: Option<String>,
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

    pub fn status(&self) -> TelemetryStatus {
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

pub fn normalize_endpoint(endpoint: &str) -> Result<String, String> {
    let trimmed = endpoint.trim().trim_end_matches('/');
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("無效的伺服器網址:{e}"))?;
    match parsed.scheme() {
        "https" => Ok(trimmed.to_string()),
        // Plain HTTP only for a collector on this machine (development); sensor data must not
        // cross a network in clear text.
        "http" if matches!(parsed.host_str(), Some("localhost" | "127.0.0.1")) => {
            Ok(trimmed.to_string())
        }
        _ => Err("伺服器網址必須使用 https".to_string()),
    }
}

impl TelemetryState {
    /// Turns upload on or off. Turning it off discards what has not been sent: the user asked for no
    /// upload, so nothing queued before that decision may leave the machine later.
    pub fn configure(
        &self,
        enabled: bool,
        endpoint: &str,
        app_version: &str,
    ) -> Result<TelemetryStatus, String> {
        let endpoint = if enabled {
            normalize_endpoint(endpoint)?
        } else {
            String::new()
        };
        let turned_on = {
            let mut inner = self.lock();
            let turned_on = enabled && !inner.enabled;
            inner.enabled = enabled;
            inner.endpoint = endpoint;
            inner.last_error = None;
            if !enabled {
                inner.queue.clear();
            }
            turned_on
        };
        if turned_on {
            self.record(
                "app_start",
                json!({ "appVersion": app_version, "os": std::env::consts::OS, "arch": std::env::consts::ARCH }),
            );
        }
        Ok(self.status())
    }

    /// Events from the app itself (session lifecycle, calibration, trigger state).
    pub fn log(&self, kind: &str, data: Value) {
        if kind.is_empty() || kind.len() > 40 {
            return;
        }
        if !data_within_limit(&data) {
            self.lock().dropped += 1;
            return;
        }
        self.record(kind, data);
    }

    pub fn enabled(&self) -> bool {
        self.lock().enabled
    }

    pub fn run_id(&self) -> &str {
        &self.run_id
    }
}

fn data_within_limit(data: &Value) -> bool {
    serde_json::to_vec(data).is_ok_and(|b| b.len() <= MAX_EVENT_DATA_BYTES)
}

pub(crate) fn build_client() -> Option<reqwest::Client> {
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

/// Starts the background uploader on `runtime`; it runs until the process exits.
pub fn spawn_uploader(
    state: Arc<TelemetryState>,
    runtime: &tokio::runtime::Handle,
    version: String,
) {
    runtime.spawn(async move {
        let Some(client) = build_client() else {
            return;
        };
        let mut backoff = FLUSH_INTERVAL;
        loop {
            tokio::time::sleep(backoff).await;
            backoff = match flush_once(&client, &state, &version).await {
                Ok(_) => FLUSH_INTERVAL,
                Err(()) => (backoff * 2).min(MAX_BACKOFF),
            };
        }
    });
}

/// Sends at most one batch. Ok(n) = n events delivered (0 when disabled or idle);
/// Err(()) = the request failed (error kept in `last_error`); the batch stays queued unless the
/// server rejected it as permanently invalid (400/413/422), in which case it is dropped.
pub(crate) async fn flush_once(
    client: &reqwest::Client,
    state: &TelemetryState,
    version: &str,
) -> Result<usize, ()> {
    let (url, batch, dropped) = {
        let inner = state.lock();
        if !inner.enabled || inner.queue.is_empty() {
            return Ok(0);
        }
        let batch: Vec<Event> = inner.queue.iter().take(MAX_BATCH).cloned().collect();
        (
            format!("{}/v1/ingest", inner.endpoint),
            batch,
            inner.dropped,
        )
    };
    let last_seq = batch.last().map(|e| e.seq).unwrap_or(0);
    // No machine name or other host identifier: any user may enable this, and Windows computer
    // names often contain the owner's real name.
    let body = json!({
        "runId": state.run_id,
        "appVersion": version,
        "dropped": dropped,
        "events": batch,
    });
    let result = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| (e.to_string(), false))
        .and_then(|res| {
            let code = res.status().as_u16();
            if res.status().is_success() {
                Ok(())
            } else {
                // 400/413/422 mean this exact batch is rejected; retrying it would block every
                // later event forever. Other failures (404, 5xx, 429, network) may heal.
                Err((
                    format!("伺服器回應 HTTP {code}"),
                    matches!(code, 400 | 413 | 422),
                ))
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
        Err((err, permanent)) => {
            if permanent {
                let before = inner.queue.len();
                inner.queue.retain(|e| e.seq > last_seq);
                inner.dropped += (before - inner.queue.len()) as u64;
            }
            inner.last_error = Some(err);
            Err(())
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn enabled_state() -> TelemetryState {
        let state = TelemetryState::default();
        state.lock().enabled = true;
        state
    }

    #[test]
    fn oversized_event_data_is_rejected_but_normal_data_passes() {
        assert!(data_within_limit(&json!({ "n": 1 })));
        assert!(data_within_limit(&Value::Null));
        let big = json!({ "blob": "x".repeat(MAX_EVENT_DATA_BYTES) });
        assert!(!data_within_limit(&big));
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

    /// One-shot local HTTP server: answers the next request with `status` and returns the raw request.
    pub(crate) async fn serve_once(
        status: u16,
        body: &'static str,
    ) -> (String, tokio::task::JoinHandle<String>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut buf = Vec::new();
            let mut chunk = [0u8; 4096];
            loop {
                let n = sock.read(&mut chunk).await.unwrap();
                buf.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&buf).to_string();
                if let Some(split) = text.find("\r\n\r\n") {
                    let len = text[..split]
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                        })
                        .unwrap_or(0);
                    if buf.len() >= split + 4 + len {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            let reply = format!("HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
            sock.write_all(reply.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&buf).to_string()
        });
        (url, handle)
    }

    #[tokio::test]
    async fn a_delivered_batch_is_removed_and_carries_the_run_id_and_no_host_name() {
        let (url, request) = serve_once(200, "{}").await;
        let state = state_pointing_at(&url);
        state.record("packet", json!({ "raw": "K:1" }));
        state.record("packet", json!({ "raw": "K:2" }));
        let client = build_client().unwrap();
        assert_eq!(flush_once(&client, &state, "9.9.9").await, Ok(2));
        let status = state.status();
        assert_eq!((status.pending, status.sent), (0, 2));
        let raw = request.await.unwrap();
        assert!(raw.starts_with("POST /v1/ingest "));
        assert!(raw.contains(&state.run_id));
        assert!(raw.contains("\"appVersion\":\"9.9.9\""));
        assert!(
            !raw.to_lowercase().contains("hostname")
                && !raw.to_lowercase().contains("computername")
        );
    }

    #[tokio::test]
    async fn a_permanently_rejected_batch_is_dropped_but_a_server_error_is_kept() {
        let (url, _r) = serve_once(422, "{}").await;
        let state = state_pointing_at(&url);
        state.record("packet", Value::Null);
        let client = build_client().unwrap();
        assert!(flush_once(&client, &state, "t").await.is_err());
        let s = state.status();
        assert_eq!((s.pending, s.dropped), (0, 1));
        let (url, _r) = serve_once(503, "{}").await;
        let state = state_pointing_at(&url);
        state.record("packet", Value::Null);
        assert!(flush_once(&client, &state, "t").await.is_err());
        assert_eq!(state.status().pending, 1);
    }

    #[test]
    fn turning_telemetry_off_discards_the_queue_and_configure_validates_the_endpoint() {
        let state = TelemetryState::default();
        assert!(state.configure(true, "http://example.com", "1").is_err());
        let on = state.configure(true, "http://127.0.0.1:1/", "1").unwrap();
        assert!(on.enabled && on.pending == 1, "app_start is queued once");
        state.log("packet", json!({}));
        assert_eq!(state.status().pending, 2);
        let off = state.configure(false, "", "1").unwrap();
        assert!(!off.enabled && off.pending == 0);
        state.log("packet", json!({}));
        assert_eq!(state.status().pending, 0, "disabled records nothing");
        state.configure(true, "http://127.0.0.1:1", "1").unwrap();
        state.log("", json!({}));
        state.log(&"k".repeat(41), json!({}));
        state.log("big", json!({ "b": "x".repeat(MAX_EVENT_DATA_BYTES) }));
        let s = state.status();
        assert_eq!(
            (s.pending, s.dropped),
            (1, 1),
            "empty and long kinds ignored, oversized counted"
        );
    }

    fn state_pointing_at(endpoint: &str) -> TelemetryState {
        let state = enabled_state();
        state.lock().endpoint = endpoint.to_string();
        state
    }

    #[tokio::test]
    async fn failed_upload_keeps_the_batch_queued() {
        // Nothing listens on port 9 (discard) locally; the connection is refused.
        let state = state_pointing_at("http://127.0.0.1:9");
        state.record("packet", json!({ "raw": "K:1" }));
        let client = build_client().unwrap();
        assert!(flush_once(&client, &state, "test").await.is_err());
        let status = state.status();
        assert_eq!((status.pending, status.sent), (1, 0));
        assert!(status.last_error.is_some());
    }

    /// Live round trip against a real collector. Run manually:
    /// IRMS_TELEMETRY_LIVE_ENDPOINT=... cargo test -- --ignored live
    #[tokio::test]
    #[ignore]
    async fn live_upload_round_trip() {
        let endpoint = std::env::var("IRMS_TELEMETRY_LIVE_ENDPOINT").unwrap();
        let state = state_pointing_at(&endpoint);
        state.record("app_log", json!({ "message": "live_upload_round_trip" }));
        state.record("packet", json!({ "raw": "K:12.5" }));
        let client = build_client().unwrap();
        assert_eq!(flush_once(&client, &state, "test").await, Ok(2));
        println!("run id: {}", state.run_id);

        // A rejected request (here: wrong path → 404) must leave the event queued.
        state.lock().endpoint = format!("{endpoint}/no-such-route");
        state.record("packet", json!({ "raw": "K:13.0" }));
        assert!(flush_once(&client, &state, "test").await.is_err());
        assert_eq!(state.status().pending, 1);
        assert!(state.status().last_error.unwrap().contains("404"));
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
