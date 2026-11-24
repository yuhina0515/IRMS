# R05 idempotent reading batches, software-only continuation

Plan: `plans/2026-10-30-idempotent-append-plan.md`. Baseline54fa0a5 clean, CI40960899608 SUCCESS.
Quota initial98%/48%, latest85%/46% remaining. No device/hardware, production deployment or participant
operations. Prior external-evidence-only waiting scope was too broad; software reliability is actionable.
Long-term plan now orders retry deduplication, durable unsent queue/restart recovery, then remaining
software accessibility/privacy/reproducibility work, with actual measurement evidence separate.

Snapshot: %TEMP%/irms-idempotent-append-snapshot, six relevant baseline files. Lead owns all changes.
Engineering/security workers read-only, inherited models/backend unknown; design and final reviews.
No inclusion reviewer needed for this storage-only batch, no UI/locale/demographic threshold change.

Meeting decisions: accepted both reviewers' lost-reply and changed-chunk findings. Reproduced missing
identity with controller synthetic3-row pending write plus5new arrivals. First reproduction assertion
left its promise pending, causing cleanup timeout; moved assertion after settlement, baseline then
failed on missing identity as intended. Renderer now retains canonical UUIDv4 and original chunk
count until full acknowledgement, including error/short ack and retry before new buffered readings.
Native command requires identity, validates before DB lock and atomically checks/inserts receipt plus
readings. Migration11 adds session-scoped WITHOUT ROWID receipt table with cascade deletion; existing
migrations/rows preserved. Payload-v1 hashes domain/count/length-delimited timestamp and ordered six
little-endian finite f64 fields, normalized signed zero. No value/timestamp deduplication.

Security final finding accepted: early empty-batch success could bypass existing identity conflict.
Moved new-empty return after receipt check; added nonempty A->empty A conflict case; reviewer confirmed.
Engineering final no blocker; historical append benchmark excludes new receipt cost, so performance
README explicitly disallows treating old numbers as current production append throughput/latency.

Verification:
- Full frontend722/722 cases across70 files, TypeScript noEmit and Vite build passed. Includes40
  existing bundle CLI cases plus new controller/adapter identity cases. Existing injected ErrorBoundary
  stack traces and Vite ToolsView/chunk-size warnings do not indicate failed tests.
- Added explicit second-chunk/short-ack identity assertions after full run; focused39 controller
  cases and TypeScript passed again. No subsequent production-source changes.
-7 new actual SQLite receipt tests passed: commit/drop reply/reopen, everyfield/count/order conflicts,
  session/batch scope, row/receipt-trigger rollback, ordinary delete/demo purge, empty/signed zero,
  and upgrade from v10 preserving readings. Full Rust155passed/6ignored, fmt --check and Clippy
  all-targets/all-features -D warnings passed.1 build job; reused generated target cache only.
- Added independent Python struct/SHA256 payload-v1 golden vector assertion after full run;7receipt
  tests and Clippy passed again. This pins encoding across future changes.
- No native Tauri transport/hardware/power-loss fault injection claimed; collector unchanged/not rerun.

Limits: idempotency requires same retained identity+payload. Unsent readings/identities are still
process-local; crash can lose them and retrying with a new identity can duplicate content. Hung RPC
has no completion deadline. Receipts grow with retained nonempty batches; no database/heap capacity
claim or at-rest privacy guarantee. Fingerprints are not signatures or measurement authenticity.
Renderer/native ship together because omitted batchId now rejects. See doc/storage-batch-retry.md.

Next bounded task: durable pending-queue/restart recovery design and implementation with independent
engineering/security review, synthetic subprocess termination and SQLite evidence only. Preserve
session/calibration identity, batch identity, ordering, no false saved status, deletion/retention/privacy
and bounded disk/memory work. Do not resume exercises or infer clinical completeness after crash.
Inspect this new head CI before next push. Keep broad goal active and no physical devices in session.
