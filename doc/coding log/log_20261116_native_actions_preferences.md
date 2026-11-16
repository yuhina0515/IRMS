---
tags: [irms, rust, slint, squad, actions, preferences]
date: 2026-11-16
summary: "Implemented native prescription CRUD, confirmations and persistent isolated preferences; stopped expansion when the owner reported low usage and cleared the goal."
---

# Native prescriptions and preferences

Plan: [[2026-11-16-native-actions-preferences-plan]]. Clean baseline `d869da1`.
Read-only reviewers: `native_ui` (actions), `mobility` (preferences), `controller`
(confirmation/lifecycle), inherited model with no override/fallback. Lead alone edited.

Implemented validated CRUD/default restore, stable string IDs, filtered five-row
paging, confirmations and active/retained/closing/disconnecting/calibration guards.
Hidden legacy fields and old session snapshots are preserved. History deletion and
preference reset require confirmation. New-action defaults match Tauri.

Review identified duplicate-create retries after post-write query failure. Writes
now materialize their replacement models inside the same transaction before commit;
injected read failures roll back create/delete/reset/history changes. Shared default
restore also reads before committing. Later source reviews found no concrete
remaining bugs in their scopes; reviewers did not independently execute tests.

Preferences use bounded version-1 database-specific sidecars, no file for :memory:,
atomic replacement, run-local CLI overrides, debounce and close snapshots. Corrupt,
future and missing-version files inhibit writes until confirmed reset. Review fixes
retain reset errors and clear ordinary errors after reverting dirty changes.
Preference write failure deliberately does not trap clinical shutdown: pending
display changes may be lost, but the prior file remains intact. Reviewers accepted
this explicit decision.

Validation: **15 native / 136 core tests passed**, both Clippy checks passed. Tests
exercise actual UI callbacks, CRUD/cancel/confirm/paging, transaction rollback/retry,
retained-session guards, file-backed session snapshot preservation, hidden fields,
seeding semantics, preference restart/isolation and Windows replacement failure.
The release executable rendered the editor at **1024x680**, with Save/Cancel visible,
exited normally and created a version-1 sidecar with stable action ID. The temporary
`--no-voice` override did not persist. Snapshot:
`C:\Users\Yuhina\AppData\Local\Temp\irms-actions-final-bb8ad504233e4680be5a273269007661\editor-min.png`.
The previous build handle had expired; no replacement build was started. Actual
keyboard/IME and full minimum-size history/error layouts remain unverified.
Initial Slint spacing, direct serde dependency and type inference errors were fixed.

The owner reported 5% remaining five-hour usage and cleared the goal. Expansion
stopped; published beta.1 assets remain unchanged. Remaining migration: unified
mobility/profile/trend flow, history export, translations, platform/module services
and physical acceptance. The overall migration is not claimed complete.
