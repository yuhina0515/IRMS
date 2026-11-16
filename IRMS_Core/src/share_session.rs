//! Live-share sessions: the host and the viewer side of the collector's `/v1/share` API.
//!
//! Port of the state machines in `IRMS-Modules/modules/live-share/index.js` (createHost,
//! createViewer) with the same paths, payloads and timings. The DOM half of that module is the
//! native window's job; this file only holds protocol and state, so it is testable without a UI.
//!
//! Host: only possible while telemetry upload is on (the collector refuses a share for a run that
//! is not ingesting). A snapshot is pushed a few times per second and answers carry the viewer
//! list and queued setting changes. Viewer: join with a code, then long-poll for new state; no
//! telemetry is needed to watch.
//!
//! Remote setting changes are answered "not supported" in the native app: the native prescription
//! parameters live in the database, and a remote viewer must not rewrite them.

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};

use crate::live_share::{live_share_request, ShareRequest};

pub const PUSH_MIN_INTERVAL: Duration = Duration::from_millis(250);
pub const HEARTBEAT: Duration = Duration::from_millis(2000);
pub const VIEWER_RETRY: Duration = Duration::from_millis(2000);
pub const LONG_POLL_TIMEOUT_MS: u64 = 25_000;
/// Every command a host cannot apply is answered with this, so the viewer sees why.
pub const COMMAND_REFUSED: &str = "原生版不支援遠端調整參數";

/// Share codes are 8 characters of the collector's alphabet (no I, L, O, U).
pub fn normalize_code(raw: &str) -> Option<String> {
    let code: String = raw
        .to_uppercase()
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect();
    let ok = code.len() == 8
        && code.chars().all(
            |c| matches!(c, '0'..='9' | 'A'..='H' | 'J' | 'K' | 'M' | 'N' | 'P'..='T' | 'V'..='Z'),
        );
    ok.then_some(code)
}

pub fn format_code(code: &str) -> String {
    if code.len() == 8 {
        format!("{}-{}", &code[..4], &code[4..])
    } else {
        code.to_string()
    }
}

fn error_text(body: &Value, fallback: String) -> String {
    body.get("error")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or(fallback)
}

async fn call(
    endpoint: &str,
    method: &str,
    path: String,
    token: Option<String>,
    body: Option<Value>,
    timeout_ms: Option<u64>,
) -> Result<(u16, Value), String> {
    live_share_request(ShareRequest {
        endpoint: endpoint.to_string(),
        method: method.to_string(),
        path,
        token,
        body,
        timeout_ms,
    })
    .await
    .map(|r| (r.status, r.body))
}

// ---------------------------------------------------------------- host

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum HostStatus {
    Idle,
    Starting,
    Sharing,
    Ended,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostState {
    pub status: HostStatus,
    pub code: Option<String>,
    pub error: Option<String>,
    pub viewers: Vec<Value>,
    pub last_command: Option<Value>,
    pub warning: Option<String>,
}

struct HostInner {
    state: HostState,
    token: Option<String>,
    snapshot: Option<Value>,
    dirty: bool,
    /// Bumped on every start and end so a stale push loop stops.
    generation: u64,
}

#[derive(Clone)]
pub struct Host {
    inner: Arc<Mutex<HostInner>>,
    runtime: tokio::runtime::Handle,
}

fn without_time(v: &Value) -> Value {
    let mut v = v.clone();
    if let Some(o) = v.as_object_mut() {
        o.remove("t");
    }
    v
}

impl Host {
    pub fn new(runtime: tokio::runtime::Handle) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HostInner {
                state: HostState {
                    status: HostStatus::Idle,
                    code: None,
                    error: None,
                    viewers: Vec::new(),
                    last_command: None,
                    warning: None,
                },
                token: None,
                snapshot: None,
                dirty: false,
                generation: 0,
            })),
            runtime,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HostInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn state(&self) -> HostState {
        self.lock().state.clone()
    }

    /// The latest compact snapshot. Only a real change (ignoring the timestamp) schedules a push; the
    /// heartbeat covers the rest.
    pub fn set_snapshot(&self, snapshot: Value) {
        let mut inner = self.lock();
        if inner.snapshot.as_ref().map(without_time) != Some(without_time(&snapshot)) {
            inner.dirty = true;
        }
        inner.snapshot = Some(snapshot);
    }

    /// Creates a share for the telemetry run `run_id`. `telemetry_enabled` is what the collector
    /// needs: it refuses a share for a run that is not ingesting.
    pub fn start(&self, endpoint: String, run_id: String, telemetry_enabled: bool) {
        {
            let mut inner = self.lock();
            if matches!(
                inner.state.status,
                HostStatus::Starting | HostStatus::Sharing
            ) {
                return;
            }
            if !telemetry_enabled {
                inner.state.status = HostStatus::Idle;
                inner.state.error = Some(
                    "需先在「設定 → 資料與隱私」開啟即時遙測上傳,並等待資料開始上傳後再分享。"
                        .into(),
                );
                return;
            }
            inner.state.status = HostStatus::Starting;
            inner.state.error = None;
            inner.generation += 1;
        }
        let this = self.clone();
        let generation = self.lock().generation;
        self.runtime.spawn(async move {
            let result = call(
                &endpoint,
                "POST",
                "/v1/share".into(),
                None,
                Some(json!({ "runId": run_id })),
                None,
            )
            .await;
            {
                let mut inner = this.lock();
                if inner.generation != generation {
                    return;
                }
                match result {
                    Ok((200, body)) => {
                        inner.token = body
                            .get("hostToken")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        inner.state.code =
                            body.get("code").and_then(Value::as_str).map(str::to_string);
                        if inner.token.is_none() || inner.state.code.is_none() {
                            inner.state.status = HostStatus::Idle;
                            inner.state.error = Some("無法建立分享:伺服器回應不完整".into());
                            return;
                        }
                        inner.state.status = HostStatus::Sharing;
                        inner.state.last_command = None;
                        inner.dirty = true;
                    }
                    Ok((status, body)) => {
                        inner.state.status = HostStatus::Idle;
                        inner.state.error =
                            Some(error_text(&body, format!("無法建立分享({status})")));
                        return;
                    }
                    Err(e) => {
                        inner.state.status = HostStatus::Idle;
                        inner.state.error = Some(format!("無法建立分享:{e}"));
                        return;
                    }
                }
            }
            this.push_loop(endpoint, generation).await;
        });
    }

    fn end(inner: &mut HostInner, reason: Option<String>) {
        inner.generation += 1;
        inner.token = None;
        inner.state.status = HostStatus::Ended;
        inner.state.error = reason;
        inner.state.viewers.clear();
    }

    async fn push_loop(&self, endpoint: String, generation: u64) {
        let mut last_push: Option<Instant> = None;
        loop {
            tokio::time::sleep(PUSH_MIN_INTERVAL).await;
            let (code, token, state, due) = {
                let mut inner = self.lock();
                if inner.generation != generation || inner.state.status != HostStatus::Sharing {
                    return;
                }
                let since = last_push.map_or(Duration::MAX, |t| t.elapsed());
                let due = (inner.dirty && since >= PUSH_MIN_INTERVAL) || since >= HEARTBEAT;
                let mut state = inner.snapshot.clone().unwrap_or_else(|| json!({}));
                if let Some(o) = state.as_object_mut() {
                    o.insert(
                        "lastCommand".into(),
                        inner.state.last_command.clone().unwrap_or(Value::Null),
                    );
                }
                if due {
                    inner.dirty = false;
                }
                (
                    inner.state.code.clone().unwrap_or_default(),
                    inner.token.clone(),
                    state,
                    due,
                )
            };
            if !due {
                continue;
            }
            last_push = Some(Instant::now());
            let result = call(
                &endpoint,
                "POST",
                format!("/v1/share/{code}/state"),
                token,
                Some(json!({ "state": state })),
                None,
            )
            .await;
            let mut inner = self.lock();
            if inner.generation != generation || inner.state.status != HostStatus::Sharing {
                return;
            }
            match result {
                Ok((200, body)) => {
                    inner.state.warning = None;
                    inner.state.viewers = body
                        .get("viewers")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    for cmd in body
                        .get("commands")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default()
                    {
                        inner.state.last_command = Some(json!({
                            "id": cmd.get("id").cloned().unwrap_or(Value::Null),
                            "viewerName": cmd.get("viewerName").cloned().unwrap_or(Value::Null),
                            "ok": false,
                            "error": COMMAND_REFUSED,
                            "at": cmd.get("at").cloned().unwrap_or(Value::Null),
                        }));
                        inner.dirty = true; // tell viewers the outcome on the next push
                    }
                }
                Ok((status, body)) => {
                    Self::end(
                        &mut inner,
                        Some(error_text(&body, format!("分享已結束({status})"))),
                    );
                    return;
                }
                Err(e) => inner.state.warning = Some(format!("網路暫時無法連線:{e}")),
            }
        }
    }

    /// Allows or forbids setting changes for one viewer (the answers are refused anyway; the flag is
    /// kept so the viewer list matches what the other apps show).
    pub fn set_can_edit(&self, endpoint: String, viewer_id: String, can_edit: bool) {
        self.viewer_call(
            endpoint,
            "POST",
            viewer_id,
            Some(json!({ "canEdit": can_edit })),
        );
    }

    pub fn kick(&self, endpoint: String, viewer_id: String) {
        self.viewer_call(endpoint, "DELETE", viewer_id, None);
    }

    fn viewer_call(
        &self,
        endpoint: String,
        method: &'static str,
        viewer_id: String,
        body: Option<Value>,
    ) {
        let (code, token) = {
            let inner = self.lock();
            if inner.state.status != HostStatus::Sharing {
                return;
            }
            (
                inner.state.code.clone().unwrap_or_default(),
                inner.token.clone(),
            )
        };
        let this = self.clone();
        self.runtime.spawn(async move {
            if let Ok((200, body)) = call(
                &endpoint,
                method,
                format!("/v1/share/{code}/viewers/{viewer_id}"),
                token,
                body,
                None,
            )
            .await
            {
                if let Some(v) = body.get("viewers").and_then(Value::as_array) {
                    this.lock().state.viewers = v.clone();
                }
            }
        });
    }

    pub fn stop(&self, endpoint: String) {
        let (code, token) = {
            let mut inner = self.lock();
            if inner.state.status != HostStatus::Sharing {
                return;
            }
            let (code, token) = (
                inner.state.code.clone().unwrap_or_default(),
                inner.token.clone(),
            );
            Self::end(&mut inner, None);
            inner.state.status = HostStatus::Idle;
            (code, token)
        };
        // The server also closes the share once the host stops pushing.
        self.runtime.spawn(async move {
            let _ = call(
                &endpoint,
                "DELETE",
                format!("/v1/share/{code}"),
                token,
                None,
                None,
            )
            .await;
        });
    }
}

// ---------------------------------------------------------------- viewer

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ViewerStatus {
    Idle,
    Joining,
    Watching,
    Ended,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerState {
    pub status: ViewerStatus,
    pub code: Option<String>,
    pub error: Option<String>,
    pub live: Option<Value>,
    pub updated_at: Option<String>,
    pub can_edit: bool,
    pub notice: Option<String>,
}

struct ViewerInner {
    state: ViewerState,
    token: Option<String>,
    version: i64,
    generation: u64,
}

#[derive(Clone)]
pub struct Viewer {
    inner: Arc<Mutex<ViewerInner>>,
    runtime: tokio::runtime::Handle,
}

impl Viewer {
    pub fn new(runtime: tokio::runtime::Handle) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ViewerInner {
                state: ViewerState {
                    status: ViewerStatus::Idle,
                    code: None,
                    error: None,
                    live: None,
                    updated_at: None,
                    can_edit: false,
                    notice: None,
                },
                token: None,
                version: 0,
                generation: 0,
            })),
            runtime,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, ViewerInner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn state(&self) -> ViewerState {
        self.lock().state.clone()
    }

    pub fn join(&self, endpoint: String, raw_code: &str, name: String) {
        let Some(code) = normalize_code(raw_code) else {
            self.lock().state.error = Some("分享碼應為 8 個英數字(例如 AB12-CD34)。".into());
            return;
        };
        let generation = {
            let mut inner = self.lock();
            if matches!(
                inner.state.status,
                ViewerStatus::Joining | ViewerStatus::Watching
            ) {
                return;
            }
            inner.state.status = ViewerStatus::Joining;
            inner.state.error = None;
            inner.generation += 1;
            inner.generation
        };
        let this = self.clone();
        self.runtime.spawn(async move {
            let result = call(
                &endpoint,
                "POST",
                format!("/v1/share/{code}/join"),
                None,
                Some(json!({ "name": name })),
                None,
            )
            .await;
            {
                let mut inner = this.lock();
                if inner.generation != generation {
                    return;
                }
                match result {
                    Ok((200, body)) => {
                        inner.token = body
                            .get("viewerToken")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        inner.state.code = Some(code.clone());
                        inner.state.can_edit = false;
                        inner.state.live = None;
                        inner.state.status = ViewerStatus::Watching;
                        inner.version = 0;
                    }
                    Ok((status, body)) => {
                        inner.state.status = ViewerStatus::Idle;
                        inner.state.error = Some(error_text(&body, format!("無法加入({status})")));
                        return;
                    }
                    Err(e) => {
                        inner.state.status = ViewerStatus::Idle;
                        inner.state.error = Some(format!("無法加入:{e}"));
                        return;
                    }
                }
            }
            this.poll(endpoint, code, generation).await;
        });
    }

    async fn poll(&self, endpoint: String, code: String, generation: u64) {
        loop {
            let (token, version) = {
                let inner = self.lock();
                if inner.generation != generation {
                    return;
                }
                (inner.token.clone(), inner.version)
            };
            let result = call(
                &endpoint,
                "GET",
                format!("/v1/share/{code}/state?after={version}"),
                token,
                None,
                Some(LONG_POLL_TIMEOUT_MS),
            )
            .await;
            let retry = {
                let mut inner = self.lock();
                if inner.generation != generation {
                    return;
                }
                match result {
                    Ok((200, body)) => {
                        inner.version = body
                            .get("version")
                            .and_then(Value::as_i64)
                            .unwrap_or(inner.version);
                        inner.state.can_edit = body
                            .get("canEdit")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        if let Some(state) = body.get("state").filter(|s| !s.is_null()) {
                            inner.state.live = Some(state.clone());
                        }
                        inner.state.updated_at = body
                            .get("updatedAt")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        inner.state.error = None;
                        false
                    }
                    Ok((status, body)) => {
                        inner.generation += 1;
                        inner.token = None;
                        inner.state.status = ViewerStatus::Ended;
                        inner.state.error = Some(if status == 401 {
                            "主機已將你移出此分享。".into()
                        } else {
                            error_text(&body, "分享已結束。".into())
                        });
                        return;
                    }
                    Err(e) => {
                        inner.state.error = Some(format!("網路暫時無法連線,重試中:{e}"));
                        true
                    }
                }
            };
            if retry {
                tokio::time::sleep(VIEWER_RETRY).await;
            }
        }
    }

    pub fn leave(&self, endpoint: String) {
        let (code, token) = {
            let mut inner = self.lock();
            if inner.state.status != ViewerStatus::Watching {
                return;
            }
            let (code, token) = (
                inner.state.code.clone().unwrap_or_default(),
                inner.token.take(),
            );
            inner.generation += 1;
            inner.state.status = ViewerStatus::Idle;
            inner.state.live = None;
            inner.state.error = None;
            (code, token)
        };
        self.runtime.spawn(async move {
            let _ = call(
                &endpoint,
                "POST",
                format!("/v1/share/{code}/leave"),
                token,
                None,
                None,
            )
            .await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    /// Local collector stand-in: answers each connection from `script` by (method, path prefix) and
    /// records every request line plus body.
    struct Mock {
        url: String,
        seen: Arc<Mutex<Vec<String>>>,
    }

    async fn mock(script: Vec<(&'static str, &'static str, u16, Value)>) -> Mock {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        let script = Arc::new(Mutex::new(VecDeque::from(script)));
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    return;
                };
                let log = log.clone();
                let script = script.clone();
                tokio::spawn(async move {
                    let mut buf = Vec::new();
                    let mut chunk = [0u8; 8192];
                    loop {
                        let n = sock.read(&mut chunk).await.unwrap_or(0);
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
                    let text = String::from_utf8_lossy(&buf).to_string();
                    let line = text.lines().next().unwrap_or("").to_string();
                    let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
                    log.lock().unwrap().push(format!("{line} {body}"));
                    let (status, reply) = {
                        let mut s = script.lock().unwrap();
                        let pos = s
                            .iter()
                            .position(|(m, p, _, _)| line.starts_with(&format!("{m} {p}")));
                        match pos {
                            Some(i) => {
                                let (_, _, st, v) = s[i].clone();
                                // Keep repeating entries marked by status >= 1000 (long-lived routes).
                                if st >= 1000 {
                                    (st - 1000, v)
                                } else {
                                    s.remove(i);
                                    (st, v)
                                }
                            }
                            None => (404, json!({ "error": "no route" })),
                        }
                    };
                    let body = reply.to_string();
                    let head = format!("HTTP/1.1 {status} X\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len());
                    let _ = sock.write_all(head.as_bytes()).await;
                });
            }
        });
        Mock { url, seen }
    }

    async fn until(mut f: impl FnMut() -> bool) -> bool {
        for _ in 0..100 {
            if f() {
                return true;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        false
    }

    #[test]
    fn codes_use_the_collector_alphabet() {
        assert_eq!(normalize_code("ab12-cd34").as_deref(), Some("AB12CD34"));
        assert_eq!(normalize_code(" ab12 cd34 ").as_deref(), Some("AB12CD34"));
        assert_eq!(normalize_code("AB12CD3"), None);
        assert_eq!(normalize_code("AB12CD3I"), None, "I is not in the alphabet");
        assert_eq!(normalize_code("AB12CD3U"), None, "U is not in the alphabet");
        assert_eq!(format_code("AB12CD34"), "AB12-CD34");
    }

    #[tokio::test]
    async fn a_host_needs_telemetry_before_it_asks_the_collector() {
        let m = mock(vec![]).await;
        let host = Host::new(tokio::runtime::Handle::current());
        host.start(m.url.clone(), "run".into(), false);
        let s = host.state();
        assert_eq!(s.status, HostStatus::Idle);
        assert!(s.error.unwrap().contains("遙測"));
        assert!(m.seen.lock().unwrap().is_empty(), "nothing was sent");
    }

    #[tokio::test]
    async fn a_host_creates_a_share_pushes_snapshots_and_refuses_remote_changes() {
        let m = mock(vec![
            ("POST", "/v1/share ", 200, json!({ "code": "AB12CD34", "hostToken": "ht" })),
            (
                "POST",
                "/v1/share/AB12CD34/state",
                1200,
                json!({ "viewers": [{ "id": "v1", "name": "A", "canEdit": false }], "commands": [{ "id": 7, "type": "setParams", "params": { "targetAngle": 90 }, "viewerName": "A", "at": "t" }] }),
            ),
            ("DELETE", "/v1/share/AB12CD34", 200, json!({})),
        ])
        .await;
        let host = Host::new(tokio::runtime::Handle::current());
        host.set_snapshot(json!({ "t": "1", "connected": true, "metric": { "value": 42 } }));
        host.start(m.url.clone(), "run-1".into(), true);
        assert!(
            until(|| host.state().last_command.is_some()).await,
            "{:?}",
            host.state()
        );
        let s = host.state();
        assert_eq!(s.status, HostStatus::Sharing);
        assert_eq!(s.code.as_deref(), Some("AB12CD34"));
        assert_eq!(s.viewers.len(), 1);
        let cmd = s.last_command.unwrap();
        assert_eq!(cmd["ok"], false);
        assert_eq!(cmd["error"], COMMAND_REFUSED);
        assert_eq!(cmd["id"], 7);
        host.stop(m.url.clone());
        assert_eq!(host.state().status, HostStatus::Idle);
        assert!(
            until(|| m
                .seen
                .lock()
                .unwrap()
                .iter()
                .any(|l| l.starts_with("DELETE /v1/share/AB12CD34")))
            .await
        );
        let seen = m.seen.lock().unwrap().clone();
        assert!(seen[0].starts_with("POST /v1/share ") && seen[0].contains("\"runId\":\"run-1\""));
        assert!(seen
            .iter()
            .any(|l| l.starts_with("POST /v1/share/AB12CD34/state")
                && l.contains("\"connected\":true")));
        assert!(
            !seen.iter().any(|l| l.to_lowercase().contains("action")),
            "no prescription names leave the machine"
        );
    }

    #[tokio::test]
    async fn a_rejected_push_ends_the_share_with_the_servers_reason() {
        let m = mock(vec![
            (
                "POST",
                "/v1/share ",
                200,
                json!({ "code": "AB12CD34", "hostToken": "ht" }),
            ),
            (
                "POST",
                "/v1/share/AB12CD34/state",
                404,
                json!({ "error": "share closed" }),
            ),
        ])
        .await;
        let host = Host::new(tokio::runtime::Handle::current());
        host.start(m.url.clone(), "run".into(), true);
        assert!(
            until(|| host.state().status == HostStatus::Ended).await,
            "{:?}",
            host.state()
        );
        assert_eq!(host.state().error.as_deref(), Some("share closed"));
    }

    #[tokio::test]
    async fn a_viewer_joins_follows_state_and_is_told_when_removed() {
        let m = mock(vec![
            ("POST", "/v1/share/AB12CD34/join", 200, json!({ "viewerToken": "vt" })),
            ("GET", "/v1/share/AB12CD34/state?after=0", 200, json!({ "version": 1, "canEdit": true, "state": { "metric": { "value": 33 } }, "updatedAt": "2026-11-17T00:00:00Z" })),
            ("GET", "/v1/share/AB12CD34/state?after=1", 401, json!({})),
            ("POST", "/v1/share/AB12CD34/leave", 200, json!({})),
        ])
        .await;
        let viewer = Viewer::new(tokio::runtime::Handle::current());
        viewer.join(m.url.clone(), "bad", "me".into());
        assert!(viewer.state().error.unwrap().contains("8"));
        viewer.join(m.url.clone(), "ab12-cd34", "me".into());
        assert!(
            until(|| viewer.state().status == ViewerStatus::Ended).await,
            "{:?}",
            viewer.state()
        );
        let s = viewer.state();
        assert_eq!(
            s.live.as_ref().unwrap()["metric"]["value"],
            33,
            "the state received before removal is kept"
        );
        assert!(s.can_edit);
        assert_eq!(s.error.as_deref(), Some("主機已將你移出此分享。"));
        let seen = m.seen.lock().unwrap().clone();
        assert!(seen[0].contains("\"name\":\"me\""));
    }

    #[tokio::test]
    async fn leaving_stops_polling_and_tells_the_server() {
        let m = mock(vec![
            (
                "POST",
                "/v1/share/AB12CD34/join",
                200,
                json!({ "viewerToken": "vt" }),
            ),
            (
                "GET",
                "/v1/share/AB12CD34/state",
                1200,
                json!({ "version": 1, "canEdit": false, "state": null, "updatedAt": "t" }),
            ),
            ("POST", "/v1/share/AB12CD34/leave", 200, json!({})),
        ])
        .await;
        let viewer = Viewer::new(tokio::runtime::Handle::current());
        viewer.join(m.url.clone(), "AB12CD34", "me".into());
        assert!(until(|| viewer.state().status == ViewerStatus::Watching).await);
        viewer.leave(m.url.clone());
        assert_eq!(viewer.state().status, ViewerStatus::Idle);
        assert!(
            until(|| m
                .seen
                .lock()
                .unwrap()
                .iter()
                .any(|l| l.starts_with("POST /v1/share/AB12CD34/leave")))
            .await
        );
    }

    /// Against a real collector: IRMS_TELEMETRY_LIVE_ENDPOINT=http://127.0.0.1:8199 cargo test -- --ignored live
    #[tokio::test]
    #[ignore]
    async fn live_host_and_viewer_round_trip_through_the_real_collector() {
        let endpoint = std::env::var("IRMS_TELEMETRY_LIVE_ENDPOINT").unwrap();
        // The collector only shares a run that is ingesting.
        let telemetry = Arc::new(crate::telemetry::TelemetryState::default());
        telemetry.configure(true, &endpoint, "live-test").unwrap();
        telemetry.record("packet", json!({ "raw": "K:1" }));
        crate::telemetry::spawn_uploader(
            telemetry.clone(),
            &tokio::runtime::Handle::current(),
            "live-test".into(),
        );
        assert!(
            until(|| telemetry.status().sent >= 2).await,
            "{:?}",
            telemetry.status()
        );

        let host = Host::new(tokio::runtime::Handle::current());
        host.set_snapshot(json!({ "t": "1", "connected": true, "metric": { "label": "knee", "value": 41.5, "unit": "deg" } }));
        host.start(
            endpoint.clone(),
            telemetry.run_id().to_string(),
            telemetry.enabled(),
        );
        assert!(
            until(|| host.state().status == HostStatus::Sharing).await,
            "{:?}",
            host.state()
        );
        let code = host.state().code.unwrap();
        println!("share code {code}");

        let viewer = Viewer::new(tokio::runtime::Handle::current());
        viewer.join(
            endpoint.clone(),
            &format_code(&code),
            "live-test viewer".into(),
        );
        assert!(
            until(|| viewer.state().live.is_some()).await,
            "{:?}",
            viewer.state()
        );
        assert_eq!(viewer.state().live.unwrap()["metric"]["value"], 41.5);
        assert!(
            until(|| !host.state().viewers.is_empty()).await,
            "host sees the viewer"
        );

        host.set_snapshot(json!({ "t": "2", "connected": true, "metric": { "label": "knee", "value": 77.0, "unit": "deg" } }));
        assert!(
            until(|| viewer
                .state()
                .live
                .as_ref()
                .is_some_and(|l| l["metric"]["value"] == 77.0))
            .await,
            "an update reaches the viewer"
        );

        let id = host.state().viewers[0]["id"].as_str().unwrap().to_string();
        host.kick(endpoint.clone(), id);
        assert!(
            until(|| viewer.state().status == ViewerStatus::Ended).await,
            "{:?}",
            viewer.state()
        );
        host.stop(endpoint);
        assert_eq!(host.state().status, HostStatus::Idle);
    }
}
