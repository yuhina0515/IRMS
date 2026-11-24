//! 離線手動基準共用統計；僅於測試編譯，不影響應用程式路徑。
use serde_json::{json, Value};

/// 最近秩分位數；每筆數值代表呼叫端指定的批次／查詢範圍。
pub(crate) fn summary(mut durations_ms: Vec<f64>) -> Value {
    assert!(!durations_ms.is_empty());
    durations_ms.sort_by(f64::total_cmp);
    let n = durations_ms.len();
    json!({"count": n, "p50Ms": durations_ms[(n as f64 * 0.5).ceil() as usize - 1],
        "p95Ms": durations_ms[(n as f64 * 0.95).ceil() as usize - 1],
        "maxMs": durations_ms[n - 1], "meanMs": durations_ms.iter().sum::<f64>() / n as f64})
}
