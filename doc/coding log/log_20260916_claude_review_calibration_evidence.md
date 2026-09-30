---
tags: [coding-log, calibration, protocol]
summary: Reviewed Claude's latest report, preserved 66927 trace packets, fixed two vector parser defects, and established calibration counterexamples.
date: 2026-09-16
---

# Claude report review and first implementation batch

## Authorization and review

User authorized starting the task plan after reviewing Claude's recent report. Read `.claude/CLAUDE.md`, HOME, recent commit/log inventory, and the complete `log_20260915_live_calibration_singularity.md` (last modified September 15 at 22:57). No newer Claude report was found in the repository. The latest report explicitly asks for a model and capture-flow redesign, preserving the current pitch improvement until replaced. Its late-session findings supersede the earlier beta10 mounting-only explanation.

## Evidence and implementation

- Recovered the temporary trace and extracted all 66,927 tagged packets into `doc/calibration-evidence/20260915/packets.txt`, with SHA-256 provenance. Excluded unrelated console output. Audit: 66,560 angle/vector packets, 367 ERR packets, zero malformed/truncated packets. No timestamps or movement labels are available.
- Added `scripts/replay-calibration.mjs` (Node 24) for repeatable raw audits and optional unsmoothed hinge projection using caller-provided settings. Missing calibration settings explicitly produce null calibrated metrics.
- The exact hinge-axis settings referenced in Claude's prose are absent from the located report/trace. The reported manual Euler offsets are not an equivalent replacement. Requested their location from the user; no current live settings were substituted.
- Added shared TS/Rust fixtures (11 cases), first confirmed both implementations failed, then fixed TS accepting empty vector fields as zero and Rust discarding bad fields before accepting six remaining values. Partial/bad extensions still preserve valid legacy angles with truncation flagged.
- Added synthetic redesign evidence: pure 150-degree flexion incorrectly produces 180-degree Roll; this desired-behavior test is explicitly an expected failure. A second counterexample demonstrates that comparing independently mounted sensor-frame vectors can produce a false 60-degree relative angle even when both limbs move together and standing offset is zero.
- Updated protocol addenda in system docs, coding rules, and the optimization checklist. Broader IPC parity remains open.

## Verification

- Before fix: TS contract tests failed for empty and whitespace fields; Rust failed for an extra invalid field.
- After fix: full `npm run ci` passed: **315 frontend tests passed + 1 expected failure**, **62 Rust tests passed**, typecheck/build/rustfmt/Clippy passed.
- Raw replay completed against all preserved packets. `git diff --check` passed.
- The existing Leg3D chunk-size warning remains non-blocking.
- No firmware build/flash, live calibration, updater or OTA acceptance was performed. No commit or release was created. Prior application/firmware changes were preserved.

## Plan state and next work

- CAL-01: raw evidence preserved, replay tool and synthetic failure established; exact historical calibrated replay and agreed measurement thresholds remain incomplete pending matching settings or a new labeled capture.
- CON-01: vector-extension boundary batch completed; broader IPC/packet grammar coverage remains.
- CAL-02: add coordinate-frame alignment to the model/capture design gate. Separate flexion, relative knee angle and out-of-plane deviation, explicitly state observability and invalid-data behavior, and define quality/repeatability criteria before choosing the replacement.
- CAL-03 and remaining E2E/release tasks have not started. Existing calibration remains active and its Roll limitation is not fixed by this batch.

See `doc/calibration-evidence/20260915/README.md` for replay instructions, limitations, and the design gate. Do not report expected-failure tests as resolved defects or raw packet audits as calibrated/clinical validation.

## User clarification

The user clarified that the manual debugging discovery occurred after Codex reached its
five-hour usage limit, and Claude was asked to record it. Preserve attribution to the
user's observation; do not assume a separate complete settings export exists. A new
labeled capture with a complete settings snapshot remains the reliable route to final
validation if the historical snapshot cannot be recovered.
