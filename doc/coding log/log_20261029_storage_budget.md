# R05 bounded storage writes and complete failure retention

Baseline157a4f7, clean before task except this plan/regression; snapshot %TEMP%/irms-storage-budget-snapshot.
Plan plans/2026-10-29-storage-budget-plan.md. Prior CI40872203346 confirmed SUCCESS before delivery.
Lead implements/tests/Git; engineering/security workers read-only, inherited models, backend IDs unknown.
Initial turn quota35%/62%, validation32%/61%; no paid credits/reset/credential changes.

Verified old flush sent1001 rows as one transaction (new regression failed), and failure restored
only the last2000, discarding older accepted readings. Shared JSON now bounds command batches1000,
timestamp128 UTF-8 bytes and controller pending2000. Native rejects all invalid rows before DB lock,
after Tauri Vec deserialization; all six angles/rolls finite, repository atomic transaction unchanged.
No migration/clinical range/physiological timestamp validity change.

Controller auto-flushes at1000 even with long timer settings, serializes a finite snapshot into chunks,
retires only full-count acknowledgements and restores the whole failed suffix before newly arriving
readings. Pending includes in-flight unacknowledged suffix. At capacity, the next frame stops collection
through existing end/save/retry before engine/rep acceptance, with localized ordinary UI error toast.
Failure does not recursively restart flushing. In-flight owner checks and same-owner restoration retained.

Meeting: accepted engineering ack-prefix/pending/owner/no-tight-retry findings and security shared-source/
UTF-8/all-six-finite guard findings. Both final reviews found no blocker. Engineering noted the pressure
test uses REST, so its zero-reps assertion alone cannot establish an exactly-on-boundary GOAL case;
source places the guard before engine, existing freeze/GOAL regressions remain. That more specific
mutation fixture is deferred. No reviewer ran tests; verification below is lead evidence.

35 focused controller tests pass, including long-interval1001 split, failed suffix-only retry,
held-write capacity stop, full2000 retention/order, no tight retry and uncertain short acknowledgement.
Existing periodic-write success mock now returns the real count acknowledgement; flush interval resets
per test. Native tests cover0/1000/1001, ASCII128/129, Unicode128/129 and last-row NaN/+Inf/-Inf for
each of six fields. Full Rust148 passed/6 ignored (3 live+3 manual), Clippy warnings-denied passed.

Final frontend616/616 across63 files, typecheck and Vite build passed. Existing large-chunk/ToolsView
warnings unchanged. Cargo fmt applied and full tests/Clippy passed; no manual benchmarks rerun.

Residual: commit succeeded but reply lost/short ack may duplicate on retry; no idempotency/durable
queue claim. Process crash recovery and hung native RPC remain open. No actual hardware, production
DB/service/deployment, participant or native UI/IPC/memory evidence gathered. Broader readiness remains
partial; next work must respect quota and latest-head CI gate, not repeat a broad audit.
