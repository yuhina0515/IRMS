---
tags: [irms, squad, timing, reliability, tests]
date: 2026-10-29
summary: "Reproduced and fixed repetition holds counting sensor silence; 542 frontend tests, typecheck and production build passed. Native timing remains unverified."
---

# R01: repetition-hold continuity

Plan: `plans/2026-10-29-hold-continuity-plan.md`. Baseline `a6fea6a`, clean worktree `E:/Monitoring-and-IoT/IRMS-wt/readiness-20261029`, existing draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5), stacked on #4/#3. Previous goal turn is progress: verified code and Git delivery. Existing remote CI run 40808318776 was observed IN_PROGRESS and later confirmed SUCCESS before this batch was pushed; it does not cover the new commit.

## Evidence and recorded decision
The lead first added a regression for in-zone t=0 then in-zone t=3000 with holdTimeMs=1000. Baseline failed: actual events were `enter, rep`, proving silence could satisfy a hold without an explicit disconnect/out-of-zone sample. Prior independent audit's claim is accepted and reproduced.

Read-only worker `/root/engineering` (inherited model, no override; exact backend ID not exposed) independently reviewed timing policy and post-fix diff. The written decision was to invalidate only an unfinished hold: clearing the whole engine would incorrectly remove the requirement to return to rest and could toggle personal-angle warnings. Use the existing mobility engineering gap budget of 250 ms, without calling it a clinical threshold. Worker found no blocking regression after implementation; an additional direct warning-preservation test was suggested as optional, while code ordering and existing warning tests remain intact. Lead alone edited, tested and delivered; no worker edits, deployments, commits or other-chat messages.

## Implementation
- Default clock is `performance.now()`, captured once per sample. Track nullable previous arrival time.
- A >250 ms gap or backwards time cancels holding, emits zero progress and zone exit, then evaluates the current sample through strict entry again. Nonfinite time cancels holding and contributes no timing/progression for that sample.
- Cancelling holding leaves restPending and personal-angle warnings intact; reset clears timing history across sessions. Equal timestamps add no elapsed time.
- Short out-of-zone grace and relaxed hysteresis are unchanged. Success fixtures explicitly feed 25 Hz samples rather than treating a silent jump as a continuous hold; `tick()` still means time with no input.
- SessionController integration passes through actual encoded BLE ingestion/calibration/smoothing: after a silent gap, no disconnect is required to clear hold progress or suppress GOAL; a new continuous hold then completes once.
- No IPC, database, BLE packet, demographic rules or measurement-angle changes.

## Validation and limitations
- Baseline reproduction failed before implementation, then passed.
- Focused engine/controller/scenario suite: 88 tests passed, including 250/251 ms boundary, continuous 25 Hz, backwards/nonfinite/equal clocks, single clock read, rest gating and no-disconnect UI/GOAL integration.
- TypeScript, all 56 frontend files / 542 tests, Vite production build passed via direct Node entry points documented in the checkpoint. Expected crash-recovery fixture emits `view crashed`; no test failure. Existing large Leg3D/ToolsView split warnings remain.
- Rust code was unchanged; do not claim the prior 104-test Rust run was repeated for this batch. Remote CI will rerun after push.
- Receiver timing cannot detect old payloads delivered at normal cadence without source timestamps/sequence numbers. This guard evaluates when a sample arrives; UI freshness during total silence remains unchanged. Native BLE scheduling, hardware and clinical/representative-population validation remain open.

## Next work
R02: cap firmware/module/index/signature downloads before complete buffering, including unknown Content-Length/chunked response regression coverage. R03 modal focus and R04 per-notification BLE generation follow. Overall university/international/inclusion objective remains active; no completion or compliance claim.
