# Singleton unresolved history-change fence prototype

The [53-case actual browser/native report](history-fence-probe-20261030.json) extends the previous
[39-case inspection evidence](reconciliation-inspection.md) with14 history-fence cases. The journal
remains unconnected to production acquisition. This is a bounded prerequisite, not complete crash
recovery, coordinated deletion/restore or a usable unlock/deletion flow.

## Decision and fixed contract

Engineering/security debate and one cross-critique selected one unresolved global intent instead of
per-session tombstones. Tombstones would need an independent retention/eviction budget; deleting old
ones could revive data from backups. A singleton is bounded and conservative, but blocks all journal
enqueue/acknowledgement indefinitely, including after failed/cancelled native history changes.

`markHistoryChange({kind,operationId,sessionId,storageIdentity})` validates and copies a fixed payload
before opening a strict-durability transaction. operationId is canonical UUIDv4. Delete requires a
positive safe session ID and original65-character storage binding; restore requires both binding
fields null, because its scope is global. Stored form adds only `key:'historyFence'`.

The existing version1 meta store has exactly one totals record plus at most one valid historyFence.
No version upgrade or native schema/IPC change is needed. Every operation validates the full marker
and rejects unknown additional metadata or corruption without erasure. Older prototype code expects
one metadata record and therefore fails closed if a marker is present; this compatibility statement
is from code inspection, not a separately launched historical client.

Fence creation, capacity/audit, enqueue and acknowledgement use the same entries/meta transaction
scope. Enqueue/full acknowledgement check the fence inside their transactions and reject after it
commits. A writer serialized before the fence may finish and its data remains queued. A following
concurrent acknowledgement sees the fence and cannot delete. Same complete canonical intent is
idempotent; a different operation ID, kind, session or binding cannot overwrite the unresolved intent.

Success resolves only on transaction complete, never request success. Peek/stats remain available
for evidence inspection and expose the fence. There is no automatic clear, overwrite, discard or
unlock API. Native failure, a missing session or matching backup identity/receipt does not clear it.
The bounded marker is association/intent metadata, not authentication or tamper/rollback detection.

## Observed evidence and required future ordering

The14 new cases cover malformed intent, request-success followed by abort, strict commit preserving
queue, same-intent retry/conflicts, enqueue/full-ack refusal, matching-backup/native-rejection
retention, actual native delete after fence commit with discarded reply and owned-browser kill/reopen,
earlier enqueue retention, following concurrent ack refusal, restore null-binding close/reopen,
unknown third metadata and corrupt fence retained/rejected. The actual native deletion is in an owned
synthetic backup database only. A native deletion does not erase the retained journal; it is **not**
complete user-data deletion or privacy-erasure acceptance.

Before production integration, one exclusive history-transition owner must freeze acquisition/start
and settle every already-submitted native append. If native completion is ambiguous, do not mutate
history. Only after durable fence completion may the targeted native deletion/restore begin. Keep the
fence and original journal on native success, failure or lost reply until a separate explicit
resolution/data-retention policy is implemented. This prototype tests the durable marker boundary,
not the full owner/quiescence protocol or caller enforcement.

Critical counterexample: append sent before fence, then restore installs a same-identity backup,
then old append commits. Blocking new journal enqueue/ack alone cannot prevent that native write.
No in-flight cancellation/quiescence, release UX, external DB replacement detection, journal eviction,
or rollback of both stores is implemented. Do not connect acquisition or claim complete tails,
timestamp repair, automatic resume or safe global recovery from these tests.

Reproduce with the fresh-build procedure in [native oracle](native-journal-oracle.md), selecting
`--output ../doc/recovery/history-fence-probe-20261030.json`. Reports preserve older19/29/39-case
snapshots; source/executable/runtime hashes identify tested bytes, not attestation. Native helper
processes exit normally; only the owned Chrome process tree is force-killed. WebView, power loss,
quota/eviction, physical metrology and clinical/population/institutional acceptance remain unverified.
