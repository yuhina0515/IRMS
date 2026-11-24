# R05 acknowledged-write ambiguity: idempotent reading batches

Baseline54fa0a5 clean; CI40960899608 SUCCESS. Quota98%/48% remaining. No hardware in this
session. Previous status-only goal turn was no progress: fresh inspection confirms software-only
storage reliability remains actionable. Supersede the earlier external-evidence-only waiting scope.
Snapshot: %TEMP%/irms-idempotent-append-snapshot, six scoped controller/API/type/native files.

Long-term sequence: (1) native transactional batch receipts and stable retry identity; (2) durable
unacknowledged queue/restart recovery, separately designed/tested; (3) remaining full software
accessibility/privacy journeys and reproducible academic artifacts. Native measurement remains an
explicit external evidence gate, not a reason to stop independent software work. No universal
institution/country/population acceptance or demographic treatment thresholds.

This bounded task: renderer generates a random batch identity before first invoke and preserves
both identity and chunk boundary across ambiguous errors/short acknowledgements and new readings.
Native append command requires identity; migration11 adds receipts keyed by sessionId/batchId,
payload fingerprint/count, cascading with session deletion. Readings and receipt commit in one
SQLite transaction. Identical retries acknowledge original count; changed payload for same identity
fails closed. Different batches remain distinct even with equal timestamps/values. No dedup by data
or time, no global unbounded in-memory receipt cache. Existing rows/migrations unchanged.

Fingerprint v1 uses ordered finite reading fields and length-delimited UTF-8 timestamp with a fixed
binary encoding, normalized signed zero. Identity bounded ASCII32hex/UUID syntax selected during
implementation. Command validation before lock retains1000-row/128-byte/finite budgets. No queue
durability or end-to-end exactly-once/source freshness claim. Receipt overhead retained with session;
no recording, deployment, device/participants, authentication changes or people messages.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | controller retry boundary/API/native transaction | lost reply, chunk mixing, existing data preservation |
| Security | inherited/backend unknown | identity/fingerprint/receipt persistence | conflict/bounds/rollback/deletion, no sensitive logs |
| Lead | current | implementation/tests/docs/Git | real SQLite reopen/failure injection plus controller regressions |

Workers read-only, no edits/commits/deploy/network/heavy tests/other chats; <=250words verified
findings with exact file:line, uncertainties explicit. Final review after fixes. Acceptance: failing
baseline reproduction, controller/adapter and SQLite replay/conflict/rollback/delete/reopen tests;
frontend full suite/typecheck/build; Rust fmt/tests/Clippy if available with1 build job. Record any
environment failure honestly. Update spec/cheat sheet/checkpoint/HOME and new English coding log,
then scoped commit/push/draft PR; prior CI must be terminal success first. Stop expensive work at
<=20% any known quota, preserve checkpoint; resume only all>=30%. No purchases/reset/credentials.

Completed validation:722 frontend cases70files/typecheck/build;155Rust passed6ignored,fmt/Clippy; final assertion additions focused39controller/typecheck passed.7new SQLite receipt tests. Design/final reviewers accepted; empty-payload conflict fixed and re-reviewed. Latest quota85%/46%. See new coding log and checkpoint; broad goal remains active.
