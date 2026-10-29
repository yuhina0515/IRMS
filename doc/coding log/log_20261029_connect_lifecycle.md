---
tags: [irms, squad, ble, lifecycle, tests]
date: 2026-10-29
summary: "Fenced pending native connections and installation with shared, fake-tested orchestration; retained backend errors alongside cancellation."
---

# R08: native connect ownership

Plan: `plans/2026-10-29-connect-lifecycle-plan.md`; baseline `35bb677`, clean readiness worktree; existing draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5). Prior turn is progress. R04 remote run 40811071058 confirmed SUCCESS. Quota remaining changed from 50%/88% to 40%/87% (five-hour/weekly); these are account windows, not measured task tokens.

Lead implemented a shared `ble_lifecycle.rs` coordinator/transport sequence used by actual native commands and deterministic fake transports. Reserve epoch before await, serialize attempts through cleanup, recheck ownership after waits and install -> connected -> listener under peripheral/epoch protection. Disconnect checks ownership after waiting and after OS cleanup, suppressing stale removals/events. Native adapter, scan and setup check their internal await boundaries; scan always attempts stop_scan and reports failures. No wire/IPC/schema changes. Frontend manualDisconnect guard inspected; no renderer/source epoch tagging added.

Read-only `/root/engineering` (inherited model, no override; exact backend ID unavailable) accepted lock ordering but found cancellation could hide simultaneous scan-stop/connect/setup errors. Lead fixed with `owned_result`, preserving both causes; added regression cases and blocked fake cleanup to prove replacement cannot start early. Final focused re-review accepted the correction. Workers did not edit/deploy/commit/message other chats.

Evidence: nine shared-orchestration tests cover six cancellation stages, partial connect/setup failure and cleanup errors, queued obsolete attempts, installation/disconnect lock waits, cleanup-before-replacement and immediate listener completion. Mutation removing the post-connect ownership check failed specifically because cancelled work proceeded into discover; source restored. R04's existing dispatch/teardown/poison tests remain. Full Cargo result, fmt and Clippy recorded in checkpoint; frontend unchanged since 553-test R03 validation. Native scan epilogue is source-inspection evidence, not a fake-scan end-to-end test.

Limits: in-flight OS calls finish before cleanup; no instantaneous physical-cancel or arbitrary future-abort cleanup guarantee. Cleanup failure reports unknown physical state. Already-enqueued renderer events, native BLE timing, actual GPIO/OTA, clinical/demographic/general institutional suitability remain unverified. No deployment, real-device operation or external messages. Next: R05 reproducible performance/threat-model evidence, then R06/R07 inclusive and institution-specific acceptance work. Overall goal remains active.
