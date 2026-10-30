# Reading batch retry contract

2026-10-30; migration11, current Tauri renderer/native pair. No sensor/hardware required.

`irms.data.appendBatch(sessionId, readings, batchId)` invokes `data_append_batch` with all three
arguments. A batch identity is a canonical lowercase UUIDv4 generated before first invoke. An old
caller omitting it is rejected by the new command; renderer/native must ship together. No IPC
command name or reading wire fields changed. Runtime modules do not own this controller path.

The controller snapshots buffered readings and sends sequential chunks of at most1000. On reject
or incomplete acknowledgement it restores the entire unacknowledged suffix before newly received
data and preserves the current batch identity AND chunk count. The next attempt sends exactly that
original chunk before creating identities for newer data. Only full count acknowledgement retires
the batch. New sessions clear retry identity; obsolete replies cannot clear another identity.
New data acquisition still stops before exceeding the existing2000 pending-reading budget.

Native validation rejects noncanonical IDs before database lock. Existing1000-reading,128UTF-8
timestamp-byte and six finite numeric field budgets remain before lock, after IPC deserialization.
These are transaction-work budgets, not preparse memory or database capacity bounds.

`reading_batch_receipts` stores `(sessionId,batchId,payloadHash,rowCount)`, composite PK WITHOUT ROWID,
foreign key to sessions ON DELETE CASCADE. Counts1..1000. Migration11 only adds this table; versions
1..10 and existing rows remain intact. Session delete and completed-demo purge remove receipts too.
An empty batch with a new identity returns0 without a receipt. An empty retry of a previously nonempty
identity conflicts. There is no timestamp/value-based deduplication: identical data with another
identity is a distinct batch, and the same identity is independent across sessions.

One SQLite transaction queries the receipt, checks existing payload/count, or inserts readings and
receipt together. Same identity/payload returns original count; different payload fails with a
generic conflict. Row failure or receipt failure rolls back both. Receipts persist across DB reopen.
The command does not catch a DB conflict and fall back to an unprotected append.

Fingerprint payload-v1 is SHA256 of these concatenated bytes, in order:

1. ASCII `IRMS-reading-batch-payload-v1` followed by one zero byte.
2. Row count as unsigned64 little-endian.
3. For each ordered row: timestamp UTF-8 byte length as unsigned64 little-endian, timestamp bytes,
   then knee/proximal/distal angle and knee/proximal/distal roll as six IEEE754 binary64 little-endian
   values. Signed zero is normalized to positive zero. No locale/JSON numeric formatting is involved.

The fingerprint is not a signature, participant anonymization or source proof. It prevents accidental
reuse of an identity with changed content; a compromised renderer/local DB is outside this guarantee.
Receipt overhead scales with retained nonempty batches; it duplicates no raw reading payload but
has no separate whole-database size bound. Old manual append benchmark numbers exclude this cost.

Validation uses actual SQLite file reopen, row/receipt trigger failures, every numeric field,
timestamp/count/order conflicts, signed zero, session scope, deletion/purge and v10 upgrade. Controller
tests cover an ambiguous small batch followed by new arrivals; adapter tests preserve caller identity.
These checks do not exercise a real Tauri IPC transport or power loss.

Unacknowledged payloads/identities are still held in process memory. A killed renderer can lose them;
receipts alone cannot reconstruct unsent data. A caller using a new identity after a crash can still
append duplicate content. A hung invoke has no completion deadline. Durable queue/restart recovery
and end-to-end exactly-once acquisition are not claimed and require the next separate design.
