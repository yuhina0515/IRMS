# Bound native deletion precondition prototype

`sessions_repo::delete_bound` is `cfg(test)`-only. The isolated native oracle calls this helper for
deletion using the original session ID and storage identity. The helper validates both fields and compares the current
DB/session identity inside the same SQLite transaction as deletion. Exactly one deleted session is
required. Missing/mismatched/recreated association errors never refresh a binding or recreate data.
Normal foreign-key cascades remove readings and retry receipts atomically with the selected session.

Four actual SQLite tests cover matching cascade with unrelated data preserved, foreign database
same numeric ID rejected, deleted/recreated/invalid identities rejected, and AFTER DELETE abort
restoring session/readings/receipt followed by successful retry. These are synthetic in-memory DB
tests, not disk-failure, power-loss or participant-data acceptance. Full native172passed/7ignored,
fmt/Clippy passed. The four cases are included in172, not an extra total.

The oracle opens an existing database for deletion and enables foreign keys. It skips migrations and
orphan finalization before checking the binding. The file-backed oracle test checks a missing DB,
foreign DB, reused numeric ID, trigger-induced rollback and successful cascade. Read-only inspection
checks that rejection leaves open sessions open. The rollback fixture uses a temporary SQLite trigger
and reports a distinct outcome when SQLite returns `SQLITE_CONSTRAINT_TRIGGER`.

The browser probe supplies the original binding from the persisted fence. It checks the full fence
and pending payload after foreign, recreated and rollback outcomes and after browser restart. The
historical 78-case report predates this integration. The current run's browser evidence status is
recorded in the [coding log](../coding%20log/log_20261124_bound_delete_oracle.md).

Backups can carry the same binding. Restore-generation checks, authorization and deletion across the
native database and independent retained journal remain open. Production commands still use the
existing numeric delete contract.
