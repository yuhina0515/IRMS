# History review single-read projection protocol

Candidate sources and exact serialized fixture are hashed in
[history-review-projection-20261029.json](history-review-projection-20261029.json).
Baseline commit 05a223f. This comparison uses the same synthetic file-backed WAL database and
existing knee-based LTTB implementation; no operator database, device or network is involved.

Run from IRMS_App_Tauri (normal Rust toolchain):

```powershell
$env:CARGO_BUILD_JOBS='1'
cargo test --manifest-path src-tauri/Cargo.toml history_review_projection_benchmark -- --ignored --nocapture
```

One JSON line starts with IRMS_HISTORY_REVIEW_BENCH. It hashes the exact serialized SensorReading
fixture before insertion. The committed wrapper records OS/toolchain and relevant source/Cargo hashes;
source hashes cover working-file bytes including line endings. Use a fresh report after source changes.
The older readiness script selects only its two readiness_benchmark tests; this third manual test is
separate and deliberately ignored by regular test runs. Three live tests remain independently ignored.

Workload: 15,000 synthetic rows at 40ms intervals (10 minutes at25Hz), fixed1,200-point chart.
Two warmups then five repeated old/new comparisons. Old path materializes/chart-samples once, reads
full rows again, and serializes both returns. New path reads once and serializes chart plus complete
analysis projection (timestamp/kneeAngle/proximalAngle). Timings include query, LTTB/projection and
JSON serialization; exclude IPC framing/transport, WebView rendering, analyzer, exports and memory.

| Observation | Previous two-read path | New one-read path |
| --- | ---: | ---: |
| Combined serialized return bytes | 3,311,285 | 1,912,413 |
| Query + serialization p50, ms (debug, local only) | 170.1933 | 85.9436 |
| Measured repeats | 5 | 5 |

Return JSON is about42.2% smaller for this fixture. This is not a portable latency guarantee or
native FPS/heap result. Ordering is warm old/new pairs, not randomized cross-machine experimentation.
Native paced UI/IPC/memory measurements remain open under R05.

Contract: sessions.getReview(sessionId) invokes sessions_get_review and returns chart plus analysis.
The chart is capped at1,200 with original timestamp/id order, knee LTTB and duplicate-row cursor.
Every analysis row is retained, including original timestamp strings; Date.parse, metric sign mapping,
individual knee limits and extension analyzer inputs stay in the renderer. New native code first
releases LTTB points, then moves timestamps into projection. This reduces avoidable overlapping
allocations but is not a measured peak-heap claim. Full analysis remains O(n), with no total response
byte ceiling. CSV and old getData/maxPoints behavior remain unchanged/full fidelity.

Renderer keeps one snapshot per review session/mount, catches failures and ignores obsolete success/
errors. Locale redraw does not refetch/reanalyze that snapshot. Returning/reopening refreshes it;
active-session data is a point-in-time view, not auto-refresh. StrictMode may issue a development
replay request; obsolete results are discarded but already-issued native queries are not cancelled.
Invalid timestamp analysis behavior is preserved for parity, not certified as a valid measurement.
