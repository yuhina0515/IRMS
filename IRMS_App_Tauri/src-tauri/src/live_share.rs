// live_share.rs — HTTP bridge for the live-share runtime module.
//
// The WebView CSP only allows IPC, so the live-share module cannot reach the collector itself.
// This command forwards its requests, restricted to the collector's `/v1/share` API on an
// https (or localhost) endpoint. It does not add any capability the collector does not already
// expose publicly; share codes and host/viewer tokens are enforced server-side.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(10);
/// Long polls wait up to 20 s server-side; leave headroom for the network.
const MAX_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_BODY_BYTES: usize = 32 * 1024;
// 收集器 state 限 16K UTF-16 單位；64 KiB 可容納其 UTF-8 展開與回應封裝。
// 回應與請求分別限額，不信任遠端 Content-Length，也不依它預先配置記憶體。
const MAX_RESPONSE_BYTES: usize = 64 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareRequest {
    endpoint: String,
    method: String,
    path: String,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ShareResponse {
    status: u16,
    body: Value,
}

/// Only `/v1/share` and its sub-paths, with URL-safe characters and no traversal.
fn validate_path(path: &str) -> Result<(), String> {
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    let allowed_route = route == "/v1/share" || route.starts_with("/v1/share/");
    let safe = |s: &str, extra: &str| {
        s.chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_/".contains(c) || extra.contains(c))
    };
    if !allowed_route || route.contains("//") || route.contains("..") || !safe(route, "") {
        return Err("live share: path not allowed".into());
    }
    if !safe(query, "=&") {
        return Err("live share: query not allowed".into());
    }
    Ok(())
}

fn build_url(req: &ShareRequest) -> Result<String, String> {
    validate_path(&req.path)?;
    let base = crate::telemetry::normalize_endpoint(&req.endpoint)?;
    Ok(format!("{base}{}", req.path))
}

#[tauri::command]
pub async fn live_share_request(
    request: ShareRequest,
    state: tauri::State<'_, crate::telemetry::TelemetryState>,
) -> Result<ShareResponse, String> {
    execute_share_request(request, &state).await
}

// command 與本機 HTTP 測試共用完整流程；私密證明只在原生層加入，不經模組或 IPC 回傳。
async fn execute_share_request(
    request: ShareRequest,
    state: &crate::telemetry::TelemetryState,
) -> Result<ShareResponse, String> {
    let url = build_url(&request)?;
    let timeout = request
        .timeout_ms
        .map(Duration::from_millis)
        .unwrap_or(DEFAULT_TIMEOUT)
        .min(MAX_TIMEOUT);
    let client = crate::telemetry::http_client().ok_or("HTTP client unavailable")?;
    let mut builder = match request.method.as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "DELETE" => client.delete(&url),
        _ => return Err("live share: method not allowed".into()),
    }
    .timeout(timeout);
    if let Some(token) = request.token.as_deref().filter(|t| !t.is_empty()) {
        builder = builder.bearer_auth(token);
    }
    if let Some(body) = &request.body {
        let bytes = serde_json::to_vec(body).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_BODY_BYTES {
            return Err("live share: body too large".into());
        }
        builder = builder
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(bytes);
    }
    let creating = request.method == "POST" && request.path.split('?').next() == Some("/v1/share");
    // preflight 與建立共用整體 timeout，避免新增握手讓呼叫時間翻倍。
    tokio::time::timeout(timeout, async {
        let owner = if creating {
            let run_id = request
                .body
                .as_ref()
                .and_then(|body| body.get("runId"))
                .and_then(Value::as_str)
                .ok_or("live share: current telemetry runId required")?;
            let owner = state.share_owner(&request.endpoint, run_id)?;
            let base = crate::telemetry::normalize_endpoint(&request.endpoint)?;
            let capabilities = read_response(
                client
                    .get(format!("{base}/v1/share/capabilities"))
                    .timeout(timeout)
                    .send()
                    .await
                    .map_err(|e| format!("live share: {e}"))?,
            )
            .await?;
            if capabilities.status != 200
                || capabilities
                    .body
                    .get("ownershipVersion")
                    .and_then(Value::as_u64)
                    != Some(1)
            {
                return Err(
                    "live share: collector requires ownership-v1 upgrade; no share created".into(),
                );
            }
            state.check_share_owner(&owner)?;
            builder = builder.header(crate::telemetry::RUN_OWNER_HEADER, owner.header.clone());
            Some(owner)
        } else {
            None
        };
        let response = read_response(
            builder
                .send()
                .await
                .map_err(|e| format!("live share: {e}"))?,
        )
        .await?;
        if let Some(owner) = owner {
            state.check_share_owner(&owner)?;
            if (200..300).contains(&response.status)
                && response
                    .body
                    .get("ownershipVersion")
                    .and_then(Value::as_u64)
                    != Some(1)
            {
                return Err("live share: collector ownership confirmation missing".into());
            }
        }
        Ok(response)
    })
    .await
    .map_err(|_| "live share: request timed out".to_string())?
}

// 能力查詢與正式回應都沿用同一讀取限額，不能藉握手回應繞過 S01。
async fn read_response(mut response: reqwest::Response) -> Result<ShareResponse, String> {
    let status = response.status().as_u16();
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return Err("live share: response too large (65536 bytes maximum)".into());
    }
    let mut bytes = Vec::new();
    // 錯誤狀態也可能攜帶巨量內容；每塊先檢查剩餘額度才加入緩衝區。
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("live share: {e}"))?
    {
        if chunk.len() > MAX_RESPONSE_BYTES - bytes.len() {
            return Err("live share: response too large (65536 bytes maximum)".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    // 保留原本 text() 的 UTF-8 替代與非 JSON -> null 行為，以及非成功 HTTP 狀態。
    let text = String::from_utf8_lossy(&bytes);
    let body = serde_json::from_str(&text).unwrap_or(Value::Null);
    Ok(ShareResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    async fn live_share_request(request: ShareRequest) -> Result<ShareResponse, String> {
        execute_share_request(request, &crate::telemetry::TelemetryState::default()).await
    }

    // 僅監聽本機暫存埠，回傳可控制分塊與標頭的單次 HTTP 回應。
    fn serve_once(
        response: Vec<u8>,
        wait_for_close: bool,
    ) -> (String, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let endpoint = format!("http://localhost:{}", listener.local_addr().unwrap().port());
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            socket
                .set_write_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut incoming = [0; 1024];
            let _ = socket.read(&mut incoming);
            let _ = socket.write_all(&response);
            if wait_for_close {
                let _ = socket.read(&mut incoming);
            }
        });
        (endpoint, server)
    }

    #[tokio::test]
    async fn cumulative_chunked_share_response_is_bounded() {
        let chunk = "x".repeat(32 * 1024);
        let wire = format!("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n8000\r\n{chunk}\r\n8000\r\n{chunk}\r\n1\r\nx\r\n0\r\n\r\n");
        let (endpoint, server) = serve_once(wire.into_bytes(), false);
        let result = live_share_request(req(&endpoint, "/v1/share/ABCD1234/state")).await;
        server.join().unwrap();
        assert!(result.err().unwrap().contains("response too large"));
    }

    #[tokio::test]
    async fn excessive_declared_length_fails_before_body_or_timeout() {
        let (endpoint, server) = serve_once(
            b"HTTP/1.1 200 OK\r\nContent-Length: 65537\r\nConnection: close\r\n\r\n".to_vec(),
            true,
        );
        let result = live_share_request(req(&endpoint, "/v1/share")).await;
        server.join().unwrap();
        assert!(result.err().unwrap().contains("response too large"));
    }

    #[tokio::test]
    async fn oversized_error_response_single_chunk_is_bounded() {
        let body = "x".repeat(MAX_RESPONSE_BYTES + 1);
        let wire = format!("HTTP/1.1 503 Unavailable\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n10001\r\n{body}\r\n0\r\n\r\n");
        let (endpoint, server) = serve_once(wire.into_bytes(), false);
        let result = live_share_request(req(&endpoint, "/v1/share")).await;
        server.join().unwrap();
        assert!(result.err().unwrap().contains("response too large"));
    }

    #[tokio::test]
    async fn unknown_length_response_is_bounded_and_truncation_still_fails() {
        let wire = format!(
            "HTTP/1.0 200 OK\r\n\r\n{}",
            "x".repeat(MAX_RESPONSE_BYTES + 1)
        );
        let (endpoint, server) = serve_once(wire.into_bytes(), false);
        let result = live_share_request(req(&endpoint, "/v1/share")).await;
        server.join().unwrap();
        assert!(result.err().unwrap().contains("response too large"));
        let (endpoint, server) = serve_once(
            b"HTTP/1.1 200 OK\r\nContent-Length: 20\r\nConnection: close\r\n\r\n{\"a\":1}".to_vec(),
            false,
        );
        let result = live_share_request(req(&endpoint, "/v1/share")).await;
        server.join().unwrap();
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn exact_limit_error_json_and_multibyte_state_remain_supported() {
        // 等於限額的 JSON 與 collector 允許的多位元組 state 皆不應被拒絕。
        for (status, body) in [
            (
                401,
                serde_json::to_vec(&Value::String("x".repeat(MAX_RESPONSE_BYTES - 2))).unwrap(),
            ),
            (
                200,
                serde_json::to_vec(&serde_json::json!({"state": "測".repeat(16_000)})).unwrap(),
            ),
        ] {
            let mut wire = format!(
                "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .into_bytes();
            wire.extend_from_slice(&body);
            let (endpoint, server) = serve_once(wire, false);
            let response = live_share_request(req(&endpoint, "/v1/share/ABCD1234/state"))
                .await
                .unwrap();
            server.join().unwrap();
            assert_eq!(response.status, status);
            assert_eq!(
                response.body,
                serde_json::from_slice::<Value>(&body).unwrap()
            );
        }
    }

    #[tokio::test]
    async fn small_non_json_empty_and_lossy_utf8_keep_response_contract() {
        for (status, body, expected) in [
            (502, b"not json".to_vec(), Value::Null),
            (204, Vec::new(), Value::Null),
            (200, vec![b'"', 0xff, b'"'], Value::String("�".into())),
        ] {
            let mut wire = format!(
                "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            )
            .into_bytes();
            wire.extend_from_slice(&body);
            let (endpoint, server) = serve_once(wire, false);
            let response = live_share_request(req(&endpoint, "/v1/share"))
                .await
                .unwrap();
            server.join().unwrap();
            assert_eq!(response.status, status);
            assert_eq!(response.body, expected);
        }
    }

    fn req(endpoint: &str, path: &str) -> ShareRequest {
        ShareRequest {
            endpoint: endpoint.into(),
            method: "GET".into(),
            path: path.into(),
            token: None,
            body: None,
            timeout_ms: None,
        }
    }

    // 實際 loopback 交換，完整讀取 header/body；額外短暫監聽以偵測不該發出的 POST／redirect。
    fn exchange(
        responses: Vec<Vec<u8>>,
        hook: impl Fn(usize) + Send + 'static,
    ) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://localhost:{}", listener.local_addr().unwrap().port());
        let server = std::thread::spawn(move || {
            let start = std::time::Instant::now();
            let mut last = start;
            let mut requests = Vec::new();
            while start.elapsed() < Duration::from_secs(3) {
                match listener.accept() {
                    Ok((mut socket, _)) => {
                        // Windows accept 可能繼承非阻塞模式；讀取完整 POST 前先還原阻塞 socket。
                        socket.set_nonblocking(false).unwrap();
                        socket
                            .set_read_timeout(Some(Duration::from_secs(1)))
                            .unwrap();
                        let mut bytes = Vec::new();
                        loop {
                            let mut chunk = [0; 2048];
                            let n = socket.read(&mut chunk).unwrap_or(0);
                            if n == 0 {
                                break;
                            }
                            bytes.extend_from_slice(&chunk[..n]);
                            if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                                let headers =
                                    String::from_utf8_lossy(&bytes[..end]).to_ascii_lowercase();
                                let length = headers
                                    .lines()
                                    .find_map(|line| {
                                        line.strip_prefix("content-length:")
                                            .and_then(|s| s.trim().parse::<usize>().ok())
                                    })
                                    .unwrap_or(0);
                                if bytes.len() >= end + 4 + length {
                                    break;
                                }
                            }
                        }
                        let index = requests.len();
                        requests.push(String::from_utf8_lossy(&bytes).into_owned());
                        hook(index);
                        let fallback = b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        let _ = socket
                            .write_all(responses.get(index).map(Vec::as_slice).unwrap_or(fallback));
                        last = std::time::Instant::now();
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        if !responses.is_empty()
                            && requests.len() >= responses.len()
                            && last.elapsed() > Duration::from_millis(150)
                        {
                            break;
                        }
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(e) => panic!("loopback accept failed: {e}"),
                }
            }
            requests
        });
        (endpoint, server)
    }

    fn json_response(status: u16, body: Value) -> Vec<u8> {
        let body = serde_json::to_vec(&body).unwrap();
        let mut wire = format!(
            "HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        wire.extend_from_slice(&body);
        wire
    }

    fn create_req(endpoint: &str, state: &crate::telemetry::TelemetryState) -> ShareRequest {
        let mut request = req(endpoint, "/v1/share");
        request.method = "POST".into();
        request.body = Some(serde_json::json!({"runId": state.test_run_id()}));
        request
    }

    #[tokio::test]
    async fn creation_keeps_module_shape_and_proof_only_in_native_post_header() {
        let (endpoint, server) = exchange(
            vec![
                json_response(200, serde_json::json!({"ownershipVersion": 1})),
                json_response(
                    200,
                    serde_json::json!({"ownershipVersion": 1, "code": "FIXTURE1", "hostToken": "fixture"}),
                ),
            ],
            |_| {},
        );
        let state = crate::telemetry::TelemetryState::default();
        state.test_configure(true, &endpoint);
        let response = execute_share_request(create_req(&endpoint, &state), &state)
            .await
            .unwrap();
        let requests = server.join().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests[0].starts_with("GET /v1/share/capabilities "));
        assert!(!requests[0]
            .to_lowercase()
            .contains(crate::telemetry::RUN_OWNER_HEADER));
        assert!(requests[1].starts_with("POST /v1/share "));
        let (headers, body) = requests[1].split_once("\r\n\r\n").unwrap();
        let owner = state.share_owner(&endpoint, state.test_run_id()).unwrap();
        assert!(headers.contains(owner.header.to_str().unwrap()));
        assert!(!body.contains(owner.header.to_str().unwrap()));
        assert!(!serde_json::to_string(&response)
            .unwrap()
            .contains(owner.header.to_str().unwrap()));
        assert_eq!(response.body["code"], "FIXTURE1");
    }

    #[tokio::test]
    async fn old_collector_or_missing_confirmation_never_returns_share_code() {
        for supports_capability in [false, true] {
            let mut responses = vec![json_response(
                if supports_capability { 200 } else { 404 },
                if supports_capability {
                    serde_json::json!({"ownershipVersion": 1})
                } else {
                    Value::Null
                },
            )];
            if supports_capability {
                responses.push(json_response(
                    200,
                    serde_json::json!({"code": "UNSAFE", "hostToken": "fixture"}),
                ));
            }
            let (endpoint, server) = exchange(responses, |_| {});
            let state = crate::telemetry::TelemetryState::default();
            state.test_configure(true, &endpoint);
            assert!(execute_share_request(create_req(&endpoint, &state), &state)
                .await
                .is_err());
            assert_eq!(
                server.join().unwrap().len(),
                if supports_capability { 2 } else { 1 }
            );
        }
    }

    #[tokio::test]
    async fn config_change_during_preflight_or_creation_suppresses_code() {
        for change_at in [0, 1] {
            let state = std::sync::Arc::new(crate::telemetry::TelemetryState::default());
            let changing = state.clone();
            let responses = if change_at == 0 {
                vec![json_response(
                    200,
                    serde_json::json!({"ownershipVersion": 1}),
                )]
            } else {
                vec![
                    json_response(200, serde_json::json!({"ownershipVersion": 1})),
                    json_response(
                        200,
                        serde_json::json!({"ownershipVersion": 1, "code": "STALE"}),
                    ),
                ]
            };
            let (endpoint, server) = exchange(responses, move |i| {
                if i == change_at {
                    changing.test_configure(false, "");
                }
            });
            state.test_configure(true, &endpoint);
            let result = execute_share_request(create_req(&endpoint, &state), &state).await;
            assert!(result.err().unwrap().contains("configuration changed"));
            assert_eq!(server.join().unwrap().len(), change_at + 1);
        }
    }

    #[tokio::test]
    async fn ownership_creation_rejects_wrong_run_or_disabled_telemetry_before_network() {
        let state = crate::telemetry::TelemetryState::default();
        let endpoint = "http://localhost:9";
        assert!(execute_share_request(create_req(endpoint, &state), &state)
            .await
            .err()
            .unwrap()
            .contains("enable telemetry"));
        state.test_configure(true, endpoint);
        let mut request = create_req(endpoint, &state);
        request.body = Some(serde_json::json!({"runId": "another-run"}));
        assert!(execute_share_request(request, &state)
            .await
            .err()
            .unwrap()
            .contains("enable telemetry"));
    }

    #[tokio::test]
    async fn preflight_and_creation_share_one_timeout_budget() {
        let (endpoint, server) = exchange(
            vec![
                json_response(200, serde_json::json!({"ownershipVersion": 1})),
                json_response(
                    200,
                    serde_json::json!({"ownershipVersion": 1, "code": "LATE"}),
                ),
            ],
            |_| {
                std::thread::sleep(Duration::from_millis(500));
            },
        );
        // 明確使用 fixture 的 IPv4 位址，讓短限額測兩階段延遲而非 localhost 的解析／fallback。
        let endpoint = endpoint.replace("localhost", "127.0.0.1");
        let state = crate::telemetry::TelemetryState::default();
        state.test_configure(true, &endpoint);
        let mut request = create_req(&endpoint, &state);
        request.timeout_ms = Some(750);
        let result = execute_share_request(request, &state).await;
        // 兩階段各延遲 500ms，整體 750ms 限額應在第二階段終止，不交出遲到的分享碼。
        let error = result.err().unwrap();
        assert!(
            error == "live share: request timed out",
            "unexpected budget error: {error}"
        );
        assert_eq!(server.join().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn ownership_header_is_not_forwarded_on_redirect() {
        let (target, target_server) = exchange(Vec::new(), |_| {});
        let redirect = format!("HTTP/1.1 307 Redirect\r\nLocation: {target}/v1/share\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").into_bytes();
        let (endpoint, server) = exchange(
            vec![
                json_response(200, serde_json::json!({"ownershipVersion": 1})),
                redirect,
            ],
            |_| {},
        );
        let state = crate::telemetry::TelemetryState::default();
        state.test_configure(true, &endpoint);
        let response = execute_share_request(create_req(&endpoint, &state), &state)
            .await
            .unwrap();
        assert_eq!(response.status, 307);
        assert!(
            !target_server.is_finished(),
            "redirect target fixture expired before completion"
        );
        assert_eq!(server.join().unwrap().len(), 2);
        assert!(target_server.join().unwrap().is_empty());
    }

    #[test]
    fn only_share_paths_are_forwarded() {
        let ok = |p| build_url(&req("https://hina-tw.ddns.net/irms-api/", p));
        assert_eq!(
            ok("/v1/share/ABCD1234/state?after=3").unwrap(),
            "https://hina-tw.ddns.net/irms-api/v1/share/ABCD1234/state?after=3"
        );
        assert!(ok("/v1/share").is_ok());
        assert!(ok("/v1/runs").is_err());
        assert!(ok("/v1/shareX").is_err());
        assert!(ok("/v1/share/../runs").is_err());
        assert!(ok("/v1/share//x").is_err());
        assert!(ok("/v1/share/x?a=b#frag").is_err());
        assert!(ok("/v1/share/x%2F..").is_err());
    }

    #[test]
    fn endpoint_rules_match_telemetry() {
        assert!(build_url(&req("http://hina-tw.ddns.net/irms-api", "/v1/share")).is_err());
        assert!(build_url(&req("http://localhost:8120", "/v1/share")).is_ok());
    }
}
