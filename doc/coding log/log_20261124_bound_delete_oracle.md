# Integrate bound deletion into the isolated recovery oracle

## Scope

Continued draft PR #5 from `3d7807b` on `codex/irms-readiness-20261029`. Preserved the October 31
quota checkpoint, home entry and log. This local run followed the requested software-only scope.

The ignored native oracle now accepts a delete binding containing the session ID and storage identity.
It opens an existing fixture database without running migration or orphan finalization, enables
foreign keys and delegates to `sessions_repo::delete_bound`. Read-only inspection compares state
before and after the operation. A temporary SQLite trigger exercises rollback after deletion and
cascades. The browser probe passes the stored fence binding for fenced deletes and checks the exact
fence and pending payload after rejection, rollback and browser restart. Production delete, IPC,
schema, renderer, firmware and collector behavior stay unchanged.

## Local verification

- `cargo test --manifest-path IRMS_App_Tauri/src-tauri/Cargo.toml --lib bound_delete` passed all 5
  tests. The new file-backed test covers missing DB, foreign DB, rollback, matching cascade and
  recreated ID using fresh connections. The first run exposed leftover WAL sidecars during fixture
  cleanup. The rerun passed after removing those fixed fixture files.
- `cargo test --manifest-path IRMS_App_Tauri/src-tauri/Cargo.toml --lib recovery_oracle::file_guard`
  passed the Windows file-guard test.
- `cargo fmt --manifest-path IRMS_App_Tauri/src-tauri/Cargo.toml -- --check`, `cargo clippy
  --manifest-path IRMS_App_Tauri/src-tauri/Cargo.toml --tests -- -D warnings`, `node --check` on the
  probe, and `git diff --check` passed.
- Vitest passed 22 tests in 2 files (`probe-recovery-journal.test.mjs` and
  `historyTransitionPrototype.test.ts`). The successful invocation used the native config loader,
  one worker in the threads pool and a temporary file-backed stdio adapter for child output. The
  default Windows invocation failed because the shell denied anonymous child pipes.

## Blocked evidence and delivery

- The full browser/SQLite probe could not run to completion. Chrome and the installed Chromium
  headless shell hit Windows access-denied errors during browser process startup or IPC. The
  historical 78-case report was preserved. This run generated no new browser evidence report.
- Physical BLE timing, reference-instrument measurement, fit and repeated placement, native
  accessibility with assistive technology, and human or institution-specific acceptance require
  devices or people. Restore-generation detection and cross-store deletion and retention policy
  remain separate software work.
- The original linked worktree's Git metadata is read-only in this session. Its `index.lock`
  creation failed. The scoped local commit is exported in a Git bundle from a writable temporary
  repository based on the same branch tip. The worktree retains the edited files. No push, release
  or deployment was performed.
