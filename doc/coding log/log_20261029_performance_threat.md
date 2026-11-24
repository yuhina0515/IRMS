# R05 offline performance baseline and threat model

Date: 2026-10-29. Baseline b3012f0, clean isolated readiness worktree. Plan:
`plans/2026-10-29-performance-threat-plan.md`; immutable source subset:
`%TEMP%/irms-readiness-r05-snapshot`. No credentials or production data copied.

Lead implemented a standalone Vite SSR benchmark against actual production metric/engine code,
deterministic synthetic receiver timelines and repetition invariants. Optional native execution runs
two manually ignored debug benchmarks through production SQLite WAL insert/query and telemetry
recording paths. Per-file source/manifest/lock hashes and fixture SHA-256, safe environment metadata,
warmup/repeated distributions and queue/drop accounting are in the JSON artifact. Protocol and
precise timing/memory limits are in `doc/performance/README.md`.

Independent read-only reviewers: `/root/security` and `/root/engineering`, inherited model, exact
backend ID not exposed. Security supplied source locations for three verified controls and three
residual gaps; lead reread actual call paths. Accepted S01 unbounded share response, S02 removed
viewer pending poll disclosure, S03 runId-only share ownership; exploit regression and fixes deferred
to the next bounded security batch, not claimed resolved. No production exploitation. Engineering
accepted workloads/invariants and flagged incomplete indirect-source hashing plus arbitrary Node
argument metadata. Fixed by hashing source trees/manifests (including LTTB/migrations) and allowing
only known boolean performance flags. No findings dismissed as false positives.

Threat model records actual BLE/IPC/SQLite/update/module/collector/share trust boundaries, assets,
source controls and unverified deployment assumptions. Signed modules execute in the renderer realm;
they are not a hostile-code sandbox. Public ingest is not device provenance. Source retention/proxy
defaults are not deployed-state verification. No architecture, IPC, DB schema or runtime behavior change.

Validation: engine and two native manual benchmarks passed all correctness/bounds assertions;
Cargo fmt and Clippy all-targets/all-features with warnings denied passed. Regular Cargo suite:
123 passed, 5 ignored (3 live plus 2 manual benchmarks), main/doc targets passed. Frontend code
unchanged; last full frontend checks remain 553 tests / 57 files, typecheck and Vite build from R03.
Initial engine-only artifact was superseded by full run; a subsequent capture overlapped a regular
Cargo test run and was discarded. Final capture reran with no competing lead test process and all
assertions passed. Final DB 25-row append p95 0.4925 ms; 15,000 -> 100 query p95 46.2536 ms;
1,000-row append p95 2.847 ms. Offline small events retained 20,000 / dropped 5,000; large events
retained 3,938 / 8,387,940 serialized bytes and dropped 21,062. Ten-repeat engine full-replay p95
normal/dropout/catch-up: 1.305 / 1.4338 / 0.6542 ms. Environment: i5-14600K, 20 logical CPUs,
about 32 GiB RAM, Windows x64, Node v24.22.1, rustc 1.93.1. Exact values/hashes in JSON.
Engineering follow-up accepted corrections with no remaining blocker in its narrow source scope;
it did not execute the benchmark. R08 remote CI run 40812227724 confirmed success before R05 push.

No native BLE/OTA, assistive-technology, paced UI/IPC/network or participant acceptance. Node
snapshots are not native memory or leak evidence; serialized bytes are not heap. Debug synthetic
timings are machine-specific and cannot establish universal institutional or demographic suitability.
R05 remains partial. Source-driven high-priority security work takes precedence over expanding claims.
