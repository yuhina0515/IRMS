---
tags: [irms, rust, slint, sqlite, session, audit]
date: 2026-11-16
summary: "Completed the interrupted native SQLite slice and verified session save retries and Windows history reopen using isolated databases."
---

# Native session storage and recovery

Follows [[log_20261116_rust_native_prototype_real_pipeline]]. Baseline 62cf7f7 plus Fable's uncommitted native database and UI changes. The [audit plan](../../plans/2026-11-16-native-sqlite-plan.md) identifies the source snapshot. Three independent read-only workers used the inherited Codex model with no override or model fallback. The lead implemented and verified the changes.

| Worker | Verified findings and disposition |
|---|---|
| store | A failed batch discarded readings, a failed end discarded the ID, and starting over could replace pending data. The store now retains the failed batch, ID, count and stop time until retry succeeds. Read and write failures reach callers. Range clearing uses one statement. The prototype takes a lifetime lock before orphan recovery and checks the shipping database's file identity. |
| ble | UI ticks reused the last notification and collapsed bursts. Each incoming angle packet now carries its own receipt times, passes through calibration, judging and storage once, and preserves both sensor roll values. Faults and missing gravity vectors interrupt judging. The core handles sample gaps. Device mode rejects simulator connection, calibration and run flags. |
| ui | Failed creation previously left the timer running. Normal close could lose the final batch. A history refresh could expose the active row or mismatch a title and summary. Creation now precedes the running state, failed close permits retry, and history reload excludes unfinished rows, clears the selected review and clamps pagination. Session configuration is captured once and incompatible controls are disabled. |

**Scope decisions.** The 64-bit row ID risk is resolved by carrying decimal strings through Slint. Missing-row deletes remain idempotent in the shared repository. An external SQL client editing an active row is outside the native single-writer contract. The retained failed batch lives in process memory. A forced kill or power cut can still lose it. Completed batches survive and the core's orphan recovery marks an interrupted session on reopen.

**Validation.** Four native regression tests cover creation failure, batch rollback followed by end failure, exclusive open/reopen and calibrated samples with gaps, faults and missing vectors. The 127 core tests and 43 Tauri Rust library tests passed. Three Tauri integration-dependent tests were ignored. Native Clippy passed with warnings denied. The initial compile caught a misplaced close callback and missing display clock binding, both corrected. A broad offline metadata query requested an uncached dependency for another target. The Windows-filtered locked query succeeded.

Windows acceptance ran the release executable with the software renderer against temporary databases. Normal window close finalized a simulated squat session. A separate launch reopened the same database. The [review panel](../plans/assets/2026-11-16-native-prototype/p6-history-reopen.png) showed one rep and 372 readings, matching SQLite. All 372 rows preserved both sensor rolls. An injected insert failure kept the window open and retained 50 readings. After removing the failing trigger, closing again saved exactly 50 readings and finalized the session. A refused session insert left the database unchanged. An isolated surrogate of the shipping database and a hard link to it both retained their original single-table schema after attempted opens.

**Next work.** Physical BLE stream, disconnect/reconnect, calibration under actual movement and owner acceptance remain open. The rest of the Phase 4 controller, legacy calibration methods, mobility measurement and translations remain on the migration plan.
