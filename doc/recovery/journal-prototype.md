# Isolated recovery journal evidence prototype

2026-10-30; source baseline8ff7662 plus this batch. Production acquisition does **not** import
`src/services/recoveryJournalPrototype.ts`. This is the first independent pre-IPC storage experiment,
not a completed crash-recovery feature. All data is synthetic.

From `IRMS_App_Tauri`, with lockfile dependencies and an installed Chrome executable:

```powershell
node scripts/probe-recovery-journal.mjs 'C:/Program Files/Google/Chrome/Application/chrome.exe' --output ../doc/recovery/journal-probe-20261030.json
```

No browser download/package is needed. The harness transpiles the isolated TypeScript with the
installed compiler, serves only a minimal page and module over127.0.0.1, and launches a new headless
Chrome with a task-specific temporary profile. It connects only to that child's loopback CDP endpoint.
It never attaches to a user's browser session or uses their existing profile. Background networking
features are disabled; no claim is made that every possible browser background request was observed.
Forced termination targets only the spawned child PID tree. Recursive cleanup first verifies the
resolved temporary path and task prefix. Errors during setup, tests, cleanup or report output return
nonzero with fixed messages; no raw payload or private input/profile/output paths appear in reports.

The [recorded result](journal-probe-20261030.json) identifies exact prototype/harness UTF-8 source
hashes, Node24.22.1, TypeScript5.9.3, Chrome156.0.8078.79 and Windows. Source hashes identify tested
working bytes; Git line-ending conversion can change them. Preserve an old result and rerun to obtain
new evidence rather than editing hashes to match. This is not a performance/heap/native acceptance
benchmark or source authenticity proof.

## Prototype contract

Entries retain original `{sessionId, storageIdentity, batchId, readings}`. Binding format is the
[native65-byte DB/session association](../storage-identity.md), batchId canonical UUIDv4. Each row has
exactly timestamp plus six finite angle/roll fields. Empty batches, extra fields, invalid identities,
lone surrogate timestamp text and timestamps over128UTF-8 bytes reject. Payload is copied into fixed
canonical field order before the transaction; original arrays cannot mutate an in-flight entry.

IndexedDB entries have an increasing order key and unique `(storageIdentity,batchId)` index. Same
identity and canonical payload returns existing order; a changed sessionId or content conflicts.
No data/timestamp-based deduplication is performed. Global budgets are2000readings,128batches and
512KiB canonical payload bytes, with1..1000readings per batch. These are input/queue payload budgets,
not complete database disk/clone/heap limits. A corrupt preexisting value can be allocated by the
browser before validation; this is not a hostile-browser/OS memory sandbox.

Every operation audits entries and counters in its transaction. Writers use the same entries/meta
readwrite scope for audit, capacity decision, data and counter changes. Metadata has exactly one
totals row. Cursor inspection is bounded by count/bytes; malformed records or inconsistent counters
reject without clearing the store. A complete transaction is the enqueue success point; request
success alone is insufficient. Callback work does not await timers/promises. Writers request strict
durability and reject if the returned hint differs. These choices follow the transaction lifecycle
and durability-hint sections of the [IndexedDB editor draft](https://w3c.github.io/IndexedDB/)
(29Oct2026 draft, inspected30Oct; not a conformance certification).

Acknowledgement includes original sessionId, storageIdentity, batchId and full count of the oldest
entry. Unknown owner/key, partial/excess count or out-of-order acknowledgement cannot delete data.
Deletion and totals decrement commit atomically. The API provides no automatic discard/repair or
native-session creation. Local acknowledgement is not native authentication: the caller must later
prove successful native receipt handling before invoking it.

## Observed evidence and remaining gates

The19 browser cases include committed entry followed by forced owned-browser termination, same
profile and exact same HTTP origin/port restart, identical batch retention and simulated lost-ack
replay. Other cases cover close/reopen, changed-content conflict, owner/key/order/count rejection,
concurrent row/batch capacity, byte capacity, request-success followed by abort, immutable inputs,
invalid payloads, corrupt records/counters and unexpected metadata without erasure. Browser reports
strict as the requested hint. This does not prove power-loss, eviction or every precommit kill point.

The native sink in this probe is explicitly a simulated acknowledgement map. Actual Rust append,
Tauri transport, WebView origin/persistence, browser quota exhaustion/eviction, double-store native
deletion, backup/restore ambiguity and startup reconciliation are **unverified**. Forced termination
occurs after enqueue complete and a later read, not at every commit boundary. Ordinary API abort and
corrupt-store tests are not operating-system or browser corruption/eviction experiments.

Three normal CLI subprocess tests cover filesystem setup/output/cleanup failures through the outer
redaction boundary. Manual full-CLI missing executable and invalid output-directory checks also
returned nonzero and fixed stderr with no stdout. No browser is launched by those normal unit tests.
The full browser probe is a separately invoked reproducibility check.

Next: bridge the isolated journal to an actual synthetic native receipt oracle and define explicit
deletion/restore outcomes and startup gating before connecting collection. Do not recreate missing
native sessions, refresh a failed binding, resume exercise feedback or label an interrupted session
complete. Same-lineage backups retain native identities, so identity matching alone cannot authorize
all restored histories. The pending memory tail before journal commit remains outside durability.
