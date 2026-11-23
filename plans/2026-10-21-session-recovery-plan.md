# Session persistence recovery follow-up

## Goal
Continue PR #4 by protecting unsaved sessions when final persistence fails and auditing the paused/finishing lifecycle across consumers. Preserve the beta.25 behavior and separate unified-calibration bench gate. No merge, release, deployment, device access or unrelated project work.

## Baseline
- Public repo yuhina0515/IRMS; PR #4 is OPEN/draft with successful remote tauri-app CI at f2e25ef2c3c478ce939e9330b2ba1ee590bd63a9.
- PR #3 remains open at cd4fd66. Task worktree is clean before this plan.
- Snapshot: C:/Users/Yuhina/AppData/Local/Temp/irms-squad-20261021-f2e25ef (tracked selected sources/fixtures/config only).
- Prior work explicitly deferred persistent final-write failure recovery. Re-check all claims; only the lead edits.

## Team
| ID | model | scope | focus |
|---|---|---|---|
| W1 | inherited, no override | sessionController.ts and tests | final write/end failures, retry and truthful completion |
| W2 | inherited, no override | store and UI/service session consumers, excluding controller | locks, update/demo/calibration controls during paused persistence |
| W3 | inherited, no override | Rust commands.rs/db.rs/migrations and IPC adapter/types | persistence transaction semantics and safe recovery contract |

Workers are read-only: no edits, deploys, restarts, commits or messages to other chats. Report at most 400 words: snapshot file:line | BUG/RISK/NIT | issue | concrete failing scenario | proposed fix; distinguish verified facts and uncertainty.

## Done criteria
Verify actionable claims; implement bounded recovery that retains unsaved data and prevents false saved notifications, with retry without resuming acquisition. Run focused failure/retry tests, frontend CI and relevant Rust checks. Obtain independent diff review, log accepted/rejected/deferred findings and environment failures in a new Obsidian coding log, update HOME, then task-scoped commit/push to existing draft PR #4. Hardware/native behavior remains unverified.
