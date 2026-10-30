# Bound native deletion precondition prototype

`sessions_repo::delete_bound` is cfg(test)-only, not connected to production IPC or the manual oracle.
It validates canonical original storage identity and positive session ID, then compares the current
DB/session identity inside the same SQLite transaction as deletion. Exactly one deleted session is
required. Missing/mismatched/recreated association errors never refresh a binding or recreate data.
Normal foreign-key cascades remove readings and retry receipts atomically with the selected session.

Four actual SQLite tests cover matching cascade with unrelated data preserved, foreign database
same numeric ID rejected, deleted/recreated/invalid identities rejected, and AFTER DELETE abort
restoring session/readings/receipt followed by successful retry. These are synthetic in-memory DB
tests, not disk-failure, power-loss or participant-data acceptance. Full native172passed/7ignored,
fmt/Clippy passed. The four cases are included in172, not an extra total.

Existing production numeric delete, command signatures, schema and manual oracle are unchanged.
The historical78 browser/native report does not exercise this new helper and was not rerun. Matching
identity proves lineage only: backups preserve it. It does not authorize deletion, prove current
restore generation, coordinate in-flight native work or erase the independent retained journal.

Next bounded task after quota permits: integrate this precondition into the isolated oracle, testing
foreign/recreated targets and rollback with retained fence/journal before production or resolution UX.
Do not silently clear journals, rebind/recreate, resume exercises or claim complete user-data erasure.
