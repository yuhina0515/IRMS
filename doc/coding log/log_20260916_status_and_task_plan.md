---
tags: [coding-log, planning]
summary: Verified current Tauri CI and prioritized calibration redesign, contract coverage, hardware gates, and documentation reconciliation.
date: 2026-09-16
---

# IRMS status assessment and task plan

## Scope and evidence

Local repository assessment requested by the user; no application or firmware implementation changes. Baseline: branch `main`, HEAD `dfa4eca`. Package and Cargo versions are `1.2.0-beta.10`; release publication is recorded in the September 15 release log, not independently checked against GitHub in this assessment.

Before this assessment there were 22 modified tracked files and one untracked live-calibration log. These changes span firmware, TS/Rust packet parsing, calibration, smoothing, store, and tests. Preserve this work and distinguish it from the released baseline. No commits, flashing, publishing, or remote issue changes were performed.

Reviewed README, HOME, PROJECT_STATUS, ROADMAP, TAURI_MIGRATION_PLAN, OPTIMIZATION, AI_CODING_RULES, recent release/audit/live-calibration logs, CI configuration, package manifests, and relevant working-tree diffs.

## Current assessment

- Tauri is the active desktop implementation. Electron remains in the repository; migration exit gates must be reconciled before declaring cutover complete.
- Existing foundations include native BLE, SQLite migrations, simulation, updater integration, and Windows CI. Earlier audit gaps for firmware selection, CSP, and CI were subsequently addressed; do not reopen them as missing implementations.
- The current uncommitted work adds normalized acceleration vectors in a final `V:` packet extension and corrects physical thigh/shin I2C mapping. Both parsers, downstream state, calibration, and smoothing are affected.
- The latest supervised-session log reports improved pitch and knee flexion, but shin Roll reaching approximately +/-180 degrees during deep flexion. This session did not repeat hardware validation.
- Code inspection confirms `projectOntoHingeFrame` still computes both angles against the baseline projection: pitch `atan2(y,z)` and roll `atan2(x,z)`. The live log records a user decision to redesign both the calibration model and capture instructions. Preserve the useful pitch improvement while establishing its replacement.
- Root README and the headline of PROJECT_STATUS describe older Electron releases. TAURI_MIGRATION_PLAN also contains historical statements that conflict with newer CI/updater work. Current state is expensive to reconstruct and needs a concise reconciliation.

## Verification performed

`npm run ci` completed successfully against the current working tree:

- TypeScript check passed.
- Vitest: 27 files, 303 tests passed.
- Vite production build passed.
- Rustfmt passed; Rust: 61 tests passed; Clippy with warnings denied passed.
- Initial sandbox run stopped at Vitest startup with `spawn EPERM`; the authorized rerun outside the sandbox succeeded.
- Non-blocking build warning: Leg3D chunk is approximately 548 kB minified. Profile before scheduling optimization.

Not verified here: firmware compilation/flash, actual BLE/OTA performance, complete hardware session lifecycle, installed-client updater journey, or current remote release/issue/CI state. Passing unit tests do not establish measurement accuracy.

## Ordered tasks

| ID | Priority | Task and deliverable | Dependency | Completion criteria |
|---|---|---|---|---|
| CAL-01 | P0 | Preserve reproducible calibration evidence and define measurement semantics | None | Locate the previously captured trace and matching settings; if unavailable, arrange recapture. Create replay fixtures for standing, forward raise, flexion beyond 90 degrees, and return. Define what pitch, knee angle, and Roll mean, their valid ranges, and invalid-data behavior. Show that the current implementation reproduces the reported failure. |
| CAL-02 | P0 | Write a calibration model and capture-flow design decision | CAL-01 | Evaluate candidate models against the same fixtures; assess whether available telemetry supports each claimed measurement. Specify mounting assumptions, repeated/multi-sample capture, quality rejection, optional movement accessibility, independent limb recalibration, and behavior when confidence is insufficient. Set explicit quantitative acceptance thresholds before implementation; do not invent accuracy claims from visual plausibility. |
| CAL-03 | P0 | Implement the chosen model and wizard behavior as one bounded change | CAL-02 | Replay regression passes for deep flexion and return, invalid/degenerate captures are rejected, existing pitch behavior is preserved, old firmware/settings have explicit compatibility or recalibration handling, and full CI passes. Include versioned calibration snapshots if interpretation changes. Visual choices follow existing Gemini authority; engineering flow and validation remain implementation work. |
| CON-01 | P1 | Add shared TS/Rust BLE and IPC contract fixtures | Can start with CAL-01 | Identical expectations for legacy packets, complete vectors, missing/empty/non-finite fields, partial extensions, and truncation. Verify firmware payload sizing against negotiated MTU and ensure incomplete vectors cannot silently become valid calibration input. |
| E2E-01 | P1 | Add cross-layer application journey coverage | Current baseline; update with CAL-03 | Cover connect/start/ERR/disconnect/finalize/reconnect, orphaned session recovery, OTA selection/progress/failure, and updater resource lifetime. Assert persisted outcomes and dispatched commands rather than only UI rendering. |
| DOC-01 | P1 | Reconcile active project status and release checklist | Can start now; finalize after calibration decision | README points to Tauri startup and current architecture; PROJECT_STATUS separates release baseline from WIP; migration/backlog distinguish completed work from hardware gates. Preserve historical logs and decisions. |
| REL-01 | P1 | Consolidate the next candidate after hardware gates | CAL-03, CON-01, E2E-01 and issue evidence | Review the pre-existing changes as a coherent app/firmware combination; record exact commit/build/firmware identifiers, migration and rollback instructions, green CI, and real-device results before publishing. |

Recommended first work package: CAL-01 plus CON-01, followed by CAL-02. Do not immediately start another formula patch. These tasks can progress without a connected device if the recorded trace is available.

## Hardware acceptance gates (issue handoff)

Per OPTIMIZATION's project rule, hardware execution belongs in GitHub issues, not a new hardware backlog in ROADMAP/OPTIMIZATION. The following is handoff scope for the existing issue #3 and OTA issues; their current remote status must be read before updating or creating issues. This assessment did not post externally.

- Calibration gate: rerun supervised standing/raise/deep-flexion/return and selected mounting conditions against the exact candidate; compare repeatability and errors to CAL-02's accepted criteria, including Roll validity behavior.
- Session gate (existing issue #3): sustained stream, target LED/buzzer, limit alarm and mute, ERR:1, disconnect/finalization, reconnect/rearming, and abandoned recovery.
- OTA gate: successful update and reboot, interrupted transfer recovery, firmware-version/GATT behavior, and normal sensor operation afterward.
- Desktop release gate: installed-client check/download/install/relaunch, version/channel correctness, and preserved data. Keep the documented beta7/beta8 manual-reinstall discontinuity visible when relevant.

Record exact app/firmware identifiers, hardware setup, steps, expected/actual outcomes, and evidence for each result. Prior partial hardware successes are useful evidence, not substitutes for a final candidate pass.

## Deferred work and architectural feedback

Keep dynamic module delivery, mobile/multi-joint expansion, i18n, broad store refactoring, and bundle tuning behind measurement correctness and release verification. Module delivery does not resolve an undefined angle model. Prefer a small tested calibration interface before considering runtime packaging. Do not turn the current broad WIP into a release merely because all 364 existing tests pass.

## Changes made by this assessment

- Added this standalone assessment/task log.
- Added a current-state entry to HOME linking here and the live-calibration evidence.
- Left all pre-existing application, firmware, and document changes intact.
