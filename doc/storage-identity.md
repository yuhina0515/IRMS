# Persistent database/session association

Migration12,2026-10-30. This is a prerequisite for a future independent recovery journal, not a
durable unsent queue or completed crash-recovery implementation. No physical devices were used.

Migration12 adds one `storage_identity` row (singleton1) with a32-character lowercase hexadecimal
database identifier. It adds nullable `sessions.storageKey`, backfills existing sessions with unique
32-character lowercase hexadecimal keys, and creates a unique index. An AFTER INSERT trigger assigns
a key to new sessions with NULL storageKey before the insert completes. Keys use SQLite randomblob16;
they identify associations, not authenticated devices or participants. Existing IDs, rows, snapshots,
receipt hashes and reading values are preserved. Previous migrations remain unchanged.

`sessions_start` now returns `{sessionId, storageIdentity}` instead of a bare numeric ID. Session
creation, its calibration/source snapshot and identity lookup commit in one transaction; a failed
identity lookup rolls back the session. Identity is exactly `<databaseId>/<sessionKey>`:65ASCII bytes,
lowercase hexadecimal components32bytes each. The adapter rejects legacy or malformed replies with
a fixed error. A committed start with a lost reply may still leave an abandoned session; start itself
does not have an idempotent request token.

`irms.data.appendBatch(sessionId, readings, batchId, storageIdentity)` carries the original identity.
The native `data_append_batch` command requires the same field. Canonical identity and existing
batch/reading budgets are validated before database lock. Inside the receipt/data transaction the
current database/session association must match BEFORE receipt acknowledgement, empty-batch return
or insertion. A mismatched or missing association fails without inserting readings or receipts.
The controller retains the creation identity through retries and fixes each flush snapshot to that
identity across awaits. Both numeric owner ID and identity must still match before another chunk
or failed suffix can be restored. It does not silently refresh a failed binding to the current DB.

Renderer/native must ship together because start reply and append arguments both changed. There is
no new IPC command, public service or browser journal store. Storage keys are not added to existing
Session/CSV output; native DB deletion removes the session key with its row. Foreign database with
the same numeric session ID or deleted/recreated session gets a different binding. Reopen of the
same DB retains it. Receipt retry identity remains independently required; see [batch retry](storage-batch-retry.md).

Limits:

- A backup/clone/point-in-time restore preserves identifiers already present. They cannot distinguish
  divergent histories of the same copied DB, authenticate a physical file, or detect every rollback.
  No restore generation, deletion tombstone, cross-store deletion protocol or signature is provided.
- Native SQL remains authoritative for calibration/source association; these IDs do not hash or
  authenticate snapshot content. Local-account DB modification is outside this association guarantee.
- Current buffered readings and retry identities are still process-local. Native startup continues
  to finalize orphaned sessions as abandoned. No exercise or engine feedback is replayed here.
- No original-source measurement timing, physical accuracy, universal institutional acceptance or
  suitability for untested populations follows from the association check.

Verification uses synthetic two-database same-ID rejection, deleted/recreated ID rejection, old
receipt preservation, migration data/snapshot fidelity, reopen stability, atomic creation failure,
malformed-input redaction and deferred multi-chunk owner replacement. These are SQLite/controller
checks, not actual Tauri transport, WebView persistence, power-loss or hardware acceptance.

Architecture decision: duplicating staging in the same SQLite DB does not protect data that has not
reached that DB. Immediate append only reduces the volatile tail. An independent pre-IPC journal can
cover its own committed-but-unsent entries, but must first demonstrate storage origin/quota/eviction,
stable binding, deletion/restore reconciliation, explicit incomplete sessions and startup gating.
Journal replay must never create missing native sessions, resume exercises or imply missing-tail
completeness. Those acceptance gates remain the next separate software-only subplan.

The subsequent [isolated journal probe](recovery/journal-prototype.md) now provides synthetic Chrome
IDB evidence. It does not activate collection, native replay, double-store deletion or restore policy.
