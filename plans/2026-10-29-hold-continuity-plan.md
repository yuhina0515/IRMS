# R01: continuous evidence for repetition holds

Baseline: a6fea6a, clean `codex/irms-readiness-20261029`, draft PR #5. Prior batch is progress: implementation, automated checks and Git delivery changed authoritative state. PR CI was confirmed IN_PROGRESS at this run's start, not assumed complete. Quota remaining 79% five-hour / 93% weekly; continue under existing 20% stop / 30% resume policy.

Goal: a sensor-stream pause must not count as demonstrated hold time, irrespective of whether an out-of-zone sample preceded the pause. Keep strict entry, hysteresis, short out-of-zone grace, per-person angle warnings and rest gating intact. Use monotonic arrival timing; a 250 ms inter-sample limit is an engineering continuity guard, not a clinical threshold or source-clock synchronization claim.

Prior independent finding verified by the lead from current control flow: TriggerEngine only expires graceStartedAt; in-zone t=0 then in-zone t=3000 can complete holdTimeMs=1000 without intervening evidence. Original read-only snapshot from the readiness plan remains available. New scoped reviewer `/root/engineering` uses the current baseline and tests read-only, inherited model; no edit/deploy/commit/other-chat messages. Lead alone changes code.

Sequence: reproduce failure with a focused regression; implement timing validation; explicitly update sparse success fixtures to continuous samples; verify stalled and continuous streams, threshold boundaries, backwards/nonfinite clocks, hysteresis/rest/reset, and SessionController integration. Run frontend typecheck/full tests/build; Rust unchanged. Record findings, tradeoffs and exact results in a new coding log and HOME. Update existing draft PR #5 without merging. Next task remains R02 download caps.

Review output <=250 words, concrete verified behavior and pitfalls; no repeated broad audit. Done for this batch requires passing regressions, unchanged public IPC/DB/BLE interfaces, scoped pushed commit, refreshed checkpoint, and explicit native timing acceptance gap. The broader university/inclusion objective remains active.
