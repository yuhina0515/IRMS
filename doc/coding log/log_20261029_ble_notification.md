---
tags: [irms, squad, ble, concurrency, tests]
date: 2026-10-29
summary: "Serialized native BLE notification dispatch with connection retirement; 114 Rust tests passed, 3 live tests ignored, fmt/Clippy passed."
---

# R04: native BLE notification retirement

Plan: `plans/2026-10-29-ble-notification-plan.md`. Native baseline `10b2fd0`; R03 was separately delivered as `759047d`. Existing draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5), same worktree. Current quota observed before final checks: 53% five-hour / 89% weekly remaining. Broader objective stays active.

## Decision and implementation
Prior ENG finding accepted: notification generation was checked only after stream end. Lead extracted the existing synchronous production dispatch into a testable seam without adding a guard; a stale/current callback regression then failed, demonstrating stale delivery. A plain atomic check before emit would still race with invalidation. Read-only `/root/engineering` (inherited model, no override; exact backend ID unavailable) reviewed lock ordering, meaningful test design and final diff. No new blocker found; lead alone edited/tested/delivered.

Replace atomic generation with a short epoch mutex shared by begin, invalidate and synchronous dispatch. Angle/raw/OTA emit/broadcast and telemetry execute under one checked callback; invalidation waits for a callback already running. Stream-acquisition errors use the gate too. Stream-end uses the actual `with_current_peripheral` helper to await the peripheral lock before checking the epoch, clearing and publishing disconnect. Required ordering is peripheral -> epoch; no await, recursive epoch call or peripheral acquisition inside a gated callback. Poison recovery leaves connection retirement usable after callback panic. Opt-in trace stderr stays outside the short gate and describes accepted notifications.

## Evidence
- Stale normal-angle, raw G: and OTA notifications never reach the production dispatch callback; current notifications do. Original extracted unguarded behavior failed before fix.
- Barrier/try-lock test verifies the callback actually holds the epoch gate, invalidation returns only after it completes, and later old callbacks are rejected. No timing sleeps infer ordering.
- Delayed teardown test uses the same async peripheral/epoch helper as production: while it waits for peripheral, a newer generation is installed; the old callback must not execute.
- Callback panic poisons the mutex in a caught fixture; retirement and a new valid OTA dispatch remain usable.
- Focused BLE suite: 17 passed. Full Rust: 114 passed / 3 live ignored; main/doc tests, fmt and Clippy all-targets/all-features `-D warnings` passed. Frontend unchanged since R03's 57 files / 553 tests, typecheck and build.
- `git diff --check` passed. Existing ble.rs test fixtures contain literal NUL bytes; use `rg -a` or text diff when reviewing. No source encoding/protocol/IPC changes were made to those fixtures.

## Residual risks and next decisions
Native btleplug/OS scheduling and hardware acceptance remain open. Already-enqueued frontend events are not recalled or epoch-tagged by this change. Source timestamps/sequence numbers remain separate measurement work. Concurrent native connect/scan/setup cancellation is not solved: connect currently spawns its listener before installing the handle/reporting connected, so an immediately ending stream can teardown before installation and then be overwritten by the late install. R08 explicitly tracks this lifecycle race and disconnect-during-scan cancellation; address it before broad performance baselining of the final lifecycle. No universal university, country, clinical or demographic acceptance claim.

R03 remote run 40810520029 was confirmed in_progress; earlier R01/R02 runs were cancelled by push concurrency, not product failures. Check the latest head's actual run independently. No deployment, firmware upload, participant work, external messages or quota/reset consumption.
