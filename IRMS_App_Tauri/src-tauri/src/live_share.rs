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
pub async fn live_share_request(request: ShareRequest) -> Result<ShareResponse, String> {
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
    let response = builder
        .send()
        .await
        .map_err(|e| format!("live share: {e}"))?;
    let status = response.status().as_u16();
    let text = response
        .text()
        .await
        .map_err(|e| format!("live share: {e}"))?;
    let body = serde_json::from_str(&text).unwrap_or(Value::Null);
    Ok(ShareResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;

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
