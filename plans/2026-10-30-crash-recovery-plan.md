# R05 crash recovery architecture and first verified implementation

Baseline4dc9895 clean, previous CI41002659505 in progress initially; do not push until successful.
Quota83%/46% remaining. No physical devices. Snapshot %TEMP%/irms-crash-recovery-snapshot (six files).
Previous goal turn was progress: native transactional receipts + stable renderer retry identity delivered.

Goal: make unacknowledged readings recoverable after process interruption without false complete-session
claims. Keep session/calibration association, stable identities, bounds, privacy/deletion and honest
durability boundary. Existing startup finalizes orphaned sessions as abandoned using committed rows.
Current renderer buffers until configurable interval or1000 rows, so in-memory readings are lost on kill.

Before implementing a duplicate queue, compare durability boundaries of (a) immediate idempotent native
append using existing WAL/receipts, (b) native staged queue in the same DB then final table, (c) browser
IndexedDB journal before native IPC. A same-DB queue does not protect data that never reached SQLite;
a browser journal introduces independent-origin/DB identity, deletion/reconciliation and quota issues.
No option can claim receiver callback data durable before its storage transaction commits. Async
storage must not delay engine/feedback into obsolete session states or silently resume exercises.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | independent design recommendation | failure boundaries, ordering, I/O/latency and testable acceptance |
| Security | inherited/backend unknown | independent design recommendation | DB/session binding, retention, deletion, quota/corruption, honest claims |
| Lead | current | reproduce/pin kill behavior and implement chosen bounded slice | true SQLite/subprocess evidence, meaningful next action |

Workers read-only/no edits/deploy/commit/network/heavy tests/other chats; <=300word verified risks,
explicit uncertainty. Run a bounded isolated process-kill experiment if needed to compare acceptance
points and inform implementation, not repeat full audits. Reviewers challenge proposed architecture.
Record accepted/rejected alternatives and stable contract. Make concrete testable progress toward
the durable recovery objective; a design alone is not a completion claim. Implementation may span
sequential bounded batches; do not substitute a narrower claim as final full recovery success.

Verification per chosen runtime change: pre-fix failure, synthetic controller/SQLite termination tests,
typecheck/build, Rust fmt/tests/Clippy when native changes. No deployment/device/participant action.
New English coding log, checkpoint/spec/cheat sheet updates and scoped Git/draft PR after prior CI
success. Stop expensive work <=20% any quota, resume only all>=30%, no reset/purchase/auth changes.

Decision after independent positions and cross-critique: true pre-IPC recovery needs an independent
journal; immediate append only reduces a volatile window. Both reject same-DB duplicate staging.
Before any journal can be connected safely, implement persistent database/session identities and
require expected identity on native append. This is the necessary first runtime foundation, not a
substitute completion claim for durable unsent recovery. Migration12 creates one32hex database key
and backfills unique32hex session keys; new sessions receive keys automatically. Existing snapshots
and numeric IDs preserved. Atomic sessions_start returns sessionId plus fixed65byte db/session key; no additional identity
command is introduced. Append requires it, validates format before lock and compares inside the
receipt/data transaction. Controller retains the creation identity through retries and each flush
snapshot, rather than re-querying on first write. Never transparently refresh a
failed identity into a new database/session. No raw calibration or participant fields in identity.

Isolated native tests cover old IDs/data migration, fresh/reopened DB stability, independent DBs with
same numeric sessionId, session deletion/recreation mismatch and receipt/data invariance on rejection.
Controller tests pin identity across retries/session changes; adapter wire tests. Journal prototype,
cross-store deletion/restore policy, startup barrier and actual WebView storage persistence remain
subsequent subplans. Do not start a parallel sensitive-data store without these acceptance checks.

Resumed2026-10-30T15:42+08:00: livequota98%/42%, hold released for this bounded WIP completion.
Prior CI41002659505 confirmed SUCCESS. Focused52controller/adapter cases and TypeScript pass.
Engineering narrow re-review confirms snapshot-owner correction. Final full checks in progress.

Final validation:732frontend/70files,TypeScript/Vite;161Rust/6ignored,fmt/Clippy. Initial full730/2 legacy updater DTO fixtures corrected; final full green. Engineering snapshot-owner correction re-reviewed. Latestquota93%/41%; see append-only meeting log completion and current checkpoint. Foundation complete, unsent journal remains unimplemented.
