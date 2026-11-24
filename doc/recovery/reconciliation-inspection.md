# Read-only startup reconciliation inspection prototype

The [39-case report](reconciliation-probe-20261030.json) extends the earlier
[29-case actual native oracle](native-journal-oracle.md) with10 inspection cases. This is a cfg(test)
prototype with no production IPC, startup UI or acquisition integration. It does not implement
recovery, timestamp repair or authorization to delete a journal entry.

The oracle dispatches `reconcile` before `init_database`, opens only an existing database with
`SQLITE_OPEN_READ_ONLY`, enables query-only and asserts unchanged connection total_changes. Thus
inspection does not initialize, migrate, seed, finalize or create a missing database. Other oracle
operations deliberately retain their previous init behavior. Read-only here refers to logical
schema/data operations, not a filesystem immutability guarantee.

`inspect_recovery_batch` validates the shared command's reading budgets, positive session ID,
nonempty batch, canonical batch UUID and storage binding. It reuses the append payload-v1 digest
including signed-zero normalization. One SELECT inside a single read transaction gets association,
receipt and session state; it returns a receipt result only after association matches.

| Result | Meaning at this snapshot | Required caller behavior |
| --- | --- | --- |
| associationRejected | Missing session or a different DB/session binding | Keep original journal; do not create or rebind |
| receiptConflict | Existing receipt differs in payload digest or count | Keep original journal; do not mutate payload or regenerate batch ID |
| needsDecision, abandoned, ended | No receipt exists for this original batch | Keep journal; absence is not permission to append |
| receiptMatched, count, abandoned, ended | Original digest and full count match the receipt | Keep journal until independent reconciliation authority is established |
| missingDatabase (oracle envelope) | Fixed target DB is absent | Keep journal; never create it from inspection |
| error | Invalid input, missing schema or DB access failure | Preserve failure; never convert it to needsDecision or matched |

Successful inspection envelopes include `automaticReplayAuthorized:false` and
`journalAcknowledgementAuthorized:false`. No raw readings, calibration, stored hashes or private
paths appear in results. Malformed requests/errors use the fixed infrastructure failure boundary.
Status is an observation, not a lock/reservation valid after the read transaction ends. Later actual
append still requires original binding/hash verification in its own transaction. An existing receipt
is not an integrity scan of all stored readings, authentication or proof that a DB is latest history.

The actual browser probe checks journal equality before/after each inspection: open unseen batch,
abandoned committed receipt, changed payload, missing DB/session, foreign/deleted/recreated
association, backup unseen and backup matched. Open session returns abandoned=false/ended=false;
inspection never silently closes it. Backup matched/unseen both remain nonauthorizing and retain
journal. The preexisting synthetic append/delete cases remain deliberate test operations, not
actions triggered by inspection statuses.

Six ordinary Rust tests additionally exercise query-only/no-mutation, exact session preservation,
normal ended and abandoned states, every payload field and row-count conflict, signed zero,
association precedence, invalid budgets and missing schema without migration. This is synthetic
software evidence; not actual Tauri IPC/WebView, power-loss, metrology or clinical acceptance.

To reproduce, follow the fresh-build command in [native oracle](native-journal-oracle.md), selecting
`--output ../doc/recovery/reconciliation-probe-20261030.json`. Do not overwrite historical19/29-case
reports. Hashes identify tested source/executable bytes; source-to-binary association relies on that
fresh build, not an attestation. Ordinary CI does not launch the ignored helper or Chrome.

Remaining gate: design and test explicit cross-store deletion intent/restore history policy and
startup recovery decisions before acquisition hookup. Preserve abandoned/incomplete status rather
than deriving a repaired end time from arbitrary renderer timestamps. No automatic resume, silent
discard, session recreation, binding refresh or universal demographic/institutional claims.
