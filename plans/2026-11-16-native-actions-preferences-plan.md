# Native prescription and preferences parity

Goal: continue the complete Windows migration, making prescription controls operate
against the isolated database and retaining user preferences across restarts. Add
ID-bound destructive confirmation instead of immediate history deletion. Mobility,
platform services and other remaining parity gates stay in the overall goal.

Baseline `d869da1c094cd9e43e27562884a3dc7c0b748e99`, clean worktree.
Snapshot: `C:\Users\Yuhina\AppData\Local\Temp\irms-native-actions-20261116-d869da1`.
Tracked native/core source and relevant Tauri source/fixtures/instructions only;
no dependencies, generated builds or secrets. Previous turn made progress: native
feedback was committed/pushed as PR #10; its specific CI job remains in progress.

| ID | Model | Scope | Focus |
|---|---|---|---|
| actions | inherited current model, no override | actions_repo, native action models, Tauri ActionsView/validation | Complete CRUD/default restore, effective parameters, ID selection and snapshot preservation |
| preferences | inherited current model, no override | native startup/close/settings; persistence contract | Atomic isolated sidecar preferences, CLI override semantics, save failure and corrupt/future file behavior |
| confirmations | inherited current model, no override | native pages/history/overlays and lifecycle | ID-bound confirmations, paging/search consistency, session/close guards and actual UI reachability |

Workers are independent read-only reviewers. They must not edit, deploy, restart,
commit or message other chats. Lead alone changes source. Reports <=400 words:
`snapshot file:line | BUG/RISK/NIT | issue | concrete scenario | proposed fix`.
Treat findings as claims and verify them before editing. No Smart App/signing work.

Implementation: validated prescription editor with real create/edit/delete/reset
and stable string IDs; paged search; mutation guards for active/retained sessions;
confirmation of deletion/reset tied to selected IDs; bounded versioned preferences
beside the isolated database (no file for :memory:), atomic replacement, explicit
CLI overrides and visible failures. Preserve old session snapshots and data paths.

Done for this slice: create/edit/select/use/restart/delete/reset work; cancellation
does not mutate; settings survive restart; failures preserve prior settings/editor
state and retained sessions; meaningful Rust/native tests, Clippy, release build
and actual rendered/runtime checks pass. Record accepted/rejected/deferred findings
and validation in a new coding log/HOME entry, then scoped commit/push/stacked PR.
Do not overwrite beta.1 artifacts or mark the overall migration complete.
