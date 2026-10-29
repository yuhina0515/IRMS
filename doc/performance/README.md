# Offline readiness performance protocol

Run from `IRMS_App_Tauri` with installed lockfile dependencies and the normal Rust toolchain:

```powershell
$env:CARGO_BUILD_JOBS='1'
# Optional: CARGO_TARGET_DIR may reuse a generated cache; do not run another Cargo process concurrently.
node scripts/benchmark-readiness.mjs --native --output ../doc/performance/readiness-20261029.json
```

Omitting `--native` produces an engine-only report (`native: []`); it does not reproduce the full
baseline. Normal tests deliberately skip the two manual benchmarks. They are safe synthetic tests,
not the three separately ignored live tests. The command runs only names containing
`readiness_benchmark` and requires exactly two native JSON records.

The committed JSON is one machine's observation, not a portable latency guarantee. It records CPU
model, logical CPUs, physical RAM, platform/architecture and Node/Rust versions, source revision and
dirty state, per-file SHA-256 of source/manifest/lockfiles, plus fixture seed/hash. Source hashes are
working-file bytes (line endings included). Files are identified by repository-relative paths;
hostname, username, environment values, arbitrary Node arguments and actual telemetry are excluded.
The benchmark uses a blank in-memory preferences adapter, not the operator's settings.

## Workloads and timing boundaries

| Path | Fixture / warmup / observations | Fail conditions and meaning |
| --- | --- | --- |
| Production `computeMetricSample`, `computeMetricZone`, `TriggerEngine.handle` | Seeded LCG32, 15,000 samples, 200 cycles of 40 in-target + 35 rest samples. Three warmups and ten complete replays per receiver timeline. | Normal virtual 40 ms intervals must yield 200 reps. Dropout adds 1,000 ms midway through each unfinished hold; catch-up delivers 25 samples at each 1,000 ms receiver tick. Both must yield zero reps. These are accelerated receiver timelines, not source timestamps or wall-paced IO. |
| Production SQLite `init_database`, `append_batch`, `get_data` | Fresh temporary file-backed WAL DB for 25-row normal-equivalent and 1,000-row recovery batches. Three warmup inserts in a separate deleted session. 15,000 measured rows; 600/15 batch observations; three warmup and ten measured 15,000 -> 100 query calls. | Exact inserted row count and exactly 100 sampled rows. Timed append includes transaction/commit; query includes full row load, timestamp parse and LTTB. Initialization/fixture generation/cleanup excluded. SQLite still loads all rows before downsampling; this is not a bounded-memory query. |
| Production `TelemetryState::record` | No uploader. 25,000 events per run, raw strings 64 or 2,048 bytes; three warmups, ten measured replays using a fresh state per replay. | Pending <=20,000; serialized queue <=8 MiB; queued + dropped =25,000; stored-byte accounting equals queue sum. Small events must hit count cap, large events byte cap. Payload cloning/validation/serialization are timed; final assertions excluded. |

Nearest-rank p50/p95/max describe whole engine/telemetry replays, DB batches or queries as named.
Ten repeats make p95 equal the maximum; they do not estimate a stable population tail. Mean
microseconds/sample is total replay mean divided by samples, not individual sample tail latency.
Native test mode is unoptimized debug, not release. No arbitrary timing assertion is imposed in CI;
all correctness/resource invariants fail the benchmark command. Repeat on the same intended machine
and build mode before diagnosing a regression; preserve the new result as a separate artifact.

Node memory is a pair of process snapshots including Vite SSR overhead. It is neither native RSS,
peak heap, steady-state trend nor a leak test. Telemetry serialized bytes are wire-size accounting,
not retained heap. DB OS cache/WAL checkpoint state, background load, power plan and timer/JIT
variation can affect results; there was no controlled isolated performance laboratory.

## Observations and remaining gates

The JSON contains exact measured values. The initial run shows engine replay is small compared
with native debug history-query work, and telemetry serialized queue limits retain accounting under
offline bursts. These observations identify where to measure further; they do not imply UI FPS or
25 Hz end-to-end deadlines were satisfied.

R05 remains partial until paced hardware/IPC/render instrumentation, UI latency/FPS, native process
memory trend, real DB contention/disk pressure and uploader/network outage/recovery measurements
are captured on the intended client. Record firmware, mounting/calibration, source timestamps,
network conditions and loss counters for those runs. Keep participant data out of public artifacts.
See [threat model](../THREAT_MODEL.md) for security follow-ups and [research readiness](../RESEARCH_READINESS.md)
for institution, accessibility and population evidence gates.
