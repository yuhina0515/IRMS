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
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const FLUSH_INTERVAL: Duration = Duration::from_secs(2);
const MAX_BATCH: usize = 2000;
const MAX_QUEUE: usize = 20_000;
// 同時限制序列化大小與事件數，避免離線時大量合法事件耗盡記憶體。
const MAX_QUEUE_BYTES: usize = 8 * 1024 * 1024;
const MAX_BATCH_BYTES: usize = 512 * 1024;
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
    #[serde(skip)]
    serialized_bytes: usize,
}

#[derive(Default)]
struct Inner {
    enabled: bool,
    endpoint: String,
    next_seq: u64,
    queue: VecDeque<Event>,
    queued_bytes: usize,
    generation: u64,
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
        // Rust 與前端來源共用限制，避免原生呼叫繞過 IPC 的大小檢查。
        if kind.is_empty() || kind.len() > 40 || !data_within_limit(&data) {
            inner.dropped += 1;
            return;
        }
        let seq = inner.next_seq;
        inner.next_seq += 1;
        let mut event = Event {
            seq,
            t: now_iso(),
            kind: kind.to_string(),
            data,
            serialized_bytes: 0,
        };
        event.serialized_bytes = serde_json::to_vec(&event)
            .expect("serializable event")
            .len();
        inner.queued_bytes += event.serialized_bytes;
        inner.queue.push_back(event);
        while inner.queue.len() > MAX_QUEUE || inner.queued_bytes > MAX_QUEUE_BYTES {
            if let Some(evicted) = inner.queue.pop_front() {
                inner.queued_bytes -= evicted.serialized_bytes;
            }
            inner.dropped += 1;
        }
    }

    // 目的地／啟用狀態改變即建立新世代；舊收集器資料不得轉送到新目的地。
    fn configure(&self, enabled: bool, endpoint: String) -> bool {
        let mut inner = self.lock();
        let turned_on = enabled && !inner.enabled;
        if inner.enabled != enabled || inner.endpoint != endpoint {
            inner.generation += 1;
            inner.dropped += inner.queue.len() as u64;
            inner.queue.clear();
            inner.queued_bytes = 0;
        }
        inner.enabled = enabled;
        inner.endpoint = endpoint;
        inner.last_error = None;
        turned_on
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

pub(crate) fn normalize_endpoint(endpoint: &str) -> Result<String, String> {
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

#[tauri::command]
pub fn telemetry_configure(
    app: AppHandle,
    state: tauri::State<'_, TelemetryState>,
    enabled: bool,
    endpoint: String,
) -> Result<TelemetryStatus, String> {
    let endpoint = if enabled {
        normalize_endpoint(&endpoint)?
    } else {
        String::new()
    };
    let turned_on = state.configure(enabled, endpoint);
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
    state.record(&kind, data);
}

fn data_within_limit(data: &Value) -> bool {
    serde_json::to_vec(data).is_ok_and(|b| b.len() <= MAX_EVENT_DATA_BYTES)
}

#[tauri::command]
pub fn telemetry_status(state: tauri::State<'_, TelemetryState>) -> TelemetryStatus {
    state.status()
}

/// Android: trust the bundled Mozilla roots; elsewhere: keep reqwest's platform verifier.
pub(crate) fn with_platform_roots(builder: reqwest::ClientBuilder) -> reqwest::ClientBuilder {
    #[cfg(target_os = "android")]
    {
        let roots = webpki_root_certs::TLS_SERVER_ROOT_CERTS
            .iter()
            .filter_map(|c| reqwest::Certificate::from_der(c.as_ref()).ok());
        builder.tls_certs_only(roots)
    }
    #[cfg(not(target_os = "android"))]
    builder
}

fn build_client() -> Option<reqwest::Client> {
    // reqwest is built with rustls-no-provider (shared with tauri-plugin-updater); install the
    // ring provider the same way the updater does if nothing has installed one yet.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    with_platform_roots(reqwest::Client::builder())
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| eprintln!("[telemetry] HTTP client init failed: {e}"))
        .ok()
}

/// Shared client for other collector calls (live share), built once on first use.
pub(crate) fn http_client() -> Option<reqwest::Client> {
    static CLIENT: std::sync::OnceLock<Option<reqwest::Client>> = std::sync::OnceLock::new();
    CLIENT.get_or_init(build_client).clone()
}

/// Starts the background uploader. Runs for the lifetime of the app.
pub fn spawn_uploader(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let Some(client) = build_client() else {
            return;
        };
        let version = app.package_info().version.to_string();
        let mut backoff = FLUSH_INTERVAL;
        loop {
            tokio::time::sleep(backoff).await;
            let state = app.state::<TelemetryState>();
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
async fn flush_once(
    client: &reqwest::Client,
    state: &TelemetryState,
    version: &str,
) -> Result<usize, ()> {
    let (url, batch, dropped, generation) = {
        let inner = state.lock();
        if !inner.enabled || inner.queue.is_empty() {
            return Ok(0);
        }
        let batch = bounded_batch(&inner);
        (
            format!("{}/v1/ingest", inner.endpoint),
            batch,
            inner.dropped,
            inner.generation,
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

    apply_flush_result(state, generation, last_seq, result)
}

// 在複製事件前先限制批次大小；額外一 byte 涵蓋 JSON 陣列分隔符號。
fn bounded_batch(inner: &Inner) -> Vec<Event> {
    let mut bytes = 0;
    inner
        .queue
        .iter()
        .take(MAX_BATCH)
        .take_while(|event| {
            bytes += event.serialized_bytes + 1;
            bytes <= MAX_BATCH_BYTES
        })
        .cloned()
        .collect()
}

// 舊請求完成時不可移除新世代資料，也不可覆寫新目的地的錯誤狀態。
fn apply_flush_result(
    state: &TelemetryState,
    generation: u64,
    last_seq: u64,
    result: Result<(), (String, bool)>,
) -> Result<usize, ()> {
    let mut inner = state.lock();
    if inner.generation != generation {
        return Ok(0);
    }
    match result {
        Ok(()) => {
            // Remove only what was sent: new events may have been queued meanwhile, and the
            // queue may have been cleared or trimmed while the request was in flight.
            let before = inner.queue.len();
            remove_through(&mut inner, last_seq);
            let delivered = before - inner.queue.len();
            inner.sent += delivered as u64;
            inner.last_error = None;
            Ok(delivered)
        }
        Err((err, permanent)) => {
            if permanent {
                let before = inner.queue.len();
                remove_through(&mut inner, last_seq);
                inner.dropped += (before - inner.queue.len()) as u64;
            }
            inner.last_error = Some(err);
            Err(())
        }
    }
}

// 每次淘汰或完成上傳都同步扣除 byte 計數，維持佇列預算不變式。
fn remove_through(inner: &mut Inner, last_seq: u64) {
    while inner
        .queue
        .front()
        .is_some_and(|event| event.seq <= last_seq)
    {
        let event = inner.queue.pop_front().expect("front exists");
        inner.queued_bytes -= event.serialized_bytes;
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

    /// 手動離線壓力基準；完全不啟動 uploader，驗證溢位後的事件與位元組上限。
    #[test]
    #[ignore = "manual offline performance baseline"]
    fn readiness_benchmark_telemetry() {
        use crate::readiness_benchmark::summary;
        use std::time::Instant;
        let mut results = Vec::new();
        // 小封包觸發數量上限，大封包觸發位元組上限。
        for payload_bytes in [64, 2048] {
            let mut timings = Vec::new();
            let mut observation = Value::Null;
            for run in 0..13 {
                let state = enabled_state();
                let payload = json!({"raw": "x".repeat(payload_bytes)});
                let start = Instant::now();
                for _ in 0..25000 {
                    state.record("ble-packet", payload.clone());
                }
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                let inner = state.lock();
                assert!(inner.queue.len() <= MAX_QUEUE);
                assert!(inner.queued_bytes <= MAX_QUEUE_BYTES);
                assert_eq!(inner.queue.len() as u64 + inner.dropped, 25000);
                assert_eq!(
                    inner.queued_bytes,
                    inner
                        .queue
                        .iter()
                        .map(|e| e.serialized_bytes)
                        .sum::<usize>()
                );
                if payload_bytes == 64 {
                    assert_eq!(inner.queue.len(), MAX_QUEUE);
                } else {
                    assert!(inner.queue.len() < MAX_QUEUE);
                }
                observation = json!({"pending": inner.queue.len(), "serializedBytes": inner.queued_bytes, "dropped": inner.dropped});
                if run >= 3 {
                    timings.push(elapsed);
                }
            }
            results.push(json!({"payloadBytes": payload_bytes, "eventsPerRun": 25000,
                "replay": summary(timings), "finalQueue": observation}));
        }
        println!(
            "IRMS_BENCH:{}",
            json!({"kind": "telemetry", "mode": "debug offline queue, no uploader", "results": results})
        );
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
    fn native_events_share_the_payload_limit() {
        let state = enabled_state();
        state.record("packet", json!({ "blob": "x".repeat(64 * 1024) }));
        assert_eq!(state.status().pending, 0);
        assert_eq!(state.status().dropped, 1);
    }

    #[test]
    fn large_legal_events_are_evicted_by_bytes_and_batches_stay_small() {
        let state = enabled_state();
        for _ in 0..200 {
            state.record("packet", json!({ "blob": "x".repeat(60 * 1024) }));
        }
        let inner = state.lock();
        assert!(inner.queued_bytes <= 8 * 1024 * 1024);
        assert!(inner.dropped > 0);
        assert_eq!(inner.queue.len() as u64 + inner.dropped, 200);
        assert_eq!(
            inner.queued_bytes,
            inner
                .queue
                .iter()
                .map(|e| e.serialized_bytes)
                .sum::<usize>()
        );
        let batch = bounded_batch(&inner);
        assert!(!batch.is_empty());
        assert!(serde_json::to_vec(&batch).unwrap().len() <= 512 * 1024);
    }

    #[test]
    fn changing_collectors_discards_old_data_and_ignores_old_results() {
        let state = TelemetryState::default();
        assert!(state.configure(true, "https://a.example".into()));
        state.record("packet", json!({ "raw": "old" }));
        let generation = state.lock().generation;
        let old_seq = state.lock().queue.back().unwrap().seq;
        assert!(!state.configure(true, "https://b.example".into()));
        assert_eq!(state.status().pending, 0);
        assert_eq!(state.status().dropped, 1);
        assert_eq!(state.lock().queued_bytes, 0);
        state.record("packet", json!({ "raw": "new" }));
        assert_eq!(
            apply_flush_result(
                &state,
                generation,
                old_seq,
                Err(("old failure".into(), true))
            ),
            Ok(0)
        );
        assert_eq!(
            apply_flush_result(&state, generation, old_seq, Ok(())),
            Ok(0)
        );
        assert_eq!(state.status().pending, 1);
        assert!(state.status().last_error.is_none());
        let current_generation = state.lock().generation;
        let current_seq = state.lock().queue.back().unwrap().seq;
        assert_eq!(
            apply_flush_result(&state, current_generation, current_seq, Ok(())),
            Ok(1)
        );
        assert_eq!(state.lock().queued_bytes, 0);
        assert_eq!(state.status().sent, 1);
    }

    #[test]
    fn identical_configuration_preserves_queue_but_disabling_clears_it() {
        let state = TelemetryState::default();
        state.configure(true, "https://a.example".into());
        state.record("packet", Value::Null);
        let generation = state.lock().generation;
        state.configure(true, "https://a.example".into());
        assert_eq!(state.status().pending, 1);
        assert_eq!(state.lock().generation, generation);
        state.configure(false, String::new());
        assert_eq!(state.status().pending, 0);
        assert_eq!(state.lock().queued_bytes, 0);
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
