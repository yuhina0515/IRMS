---
tags: [irms, integration, safety, calibration, session, ble]
date: 2026-11-10
summary: "integrate/beta26: seven PR #5 fixes cherry-picked (hold continuity, BLE lifecycle, storage bounds, close protection), hyperextension dwell and hysteresis, one-step re-zero from the wearing check. 705 frontend / 119 Rust tests pass; no device verification."
---

# beta.26 candidate: software round

Plan: `~/ClaudeConfigSync/planning/irms-2026-11-10.md`. Branch `integrate/beta26`, local only.
Continues [[log_20261110_integrate_beta26]] and [[log_20261110_mounting_shift_check]].

## 1. Selected fixes from PR #5 (cherry-picked with `-x`)

| Commit | What it fixes |
|---|---|
| df2c5bd | A hold no longer counts through silent sensor gaps (more than 250 ms) or clock anomalies |
| 35bb677 | Native BLE notifications cannot be dispatched after their connection was retired |
| b3012f0 | Overlapping connection attempts are fenced; cleanup errors are kept |
| 4556b18 | Bounded storage transactions; collection stops instead of dropping readings when storage falls behind |
| 275336c, 432d5fa | Unsaved sessions are protected from a normal window close; start, close and installer handoff are interlocked |
| 156ae17 | Updater handoff progress and retryable failures are shown |

Left on the PR #5 branch on purpose: the live-share ownership change (needs a coordinated
collector rollout), history paging and the receipt/binding work (their migrations 10 to 12 clash
with unified calibration's migration 10), the accessibility series (touches the wizards that
unified calibration rewrote; needs its own pass), telemetry/download budgets, and every
unconnected `test(storage)` prototype.

Shared documents (`HOME`, `OPTIMIZATION`, `README`, `AI_CODING_RULES`) kept this branch's version
wherever a pick conflicted, because the PR #5 text refers to documents that are not on this
branch (`RESEARCH_READINESS.md`, `THREAT_MODEL.md`, the readiness checkpoint). Each pick's own
coding log and plan came along unchanged. One README section (BLE notification retirement) was
kept by hand.

## 2. Hyperextension alert: dwell and hysteresis

The alert compared a single sample with -5 deg, so a knee resting near the tolerance toggled the
alarm and its spoken cue. `TriggerEngine` now starts the alert after 300 ms of continuous samples
past the tolerance and ends it once the knee is back by 2 deg (knowledge base guide 13, V08). A
data gap restarts the dwell and never ends an active alert. The dashboard banner still follows
the per-sample flag; only the alarm path (engine events, voice) is debounced.

For owner review: 300 ms, 2 deg and the 5 deg tolerance are all provisional.

## 3. One-step re-zero at session start

Problem reported by the owner: the sensors sit a little differently at every donning. The
pre-session wearing check already detected that, but only advised a quick re-zero, which meant
cancelling, opening Settings and holding the posture again.

Now, when the check finds an in-plane offset only, the dock offers to reset the zero from the pose
that was just held (`applyQuickRezero`: same hinge axes, new zero, stored as a new active profile
before the live settings change), then starts. Declining does not start: a session with a known
zero offset is no longer offered. Guards:

- Offsets above 20 deg on any limb are not re-zeroed (`QUICK_REZERO_MAX_DEG`); the wearer is asked
  to check the posture or recalibrate, because the check cannot tell a moved sensor from a wrong posture.
- A sideways turn (out of plane) still goes to the recalibration prompt.
- A trembling pose stays inconclusive; a failed profile write keeps the old calibration and does not start.

## Validation

- `tsc` pass; Vitest 71 files / 705 tests pass; `vite build` pass.
- Rust after the picks: fmt pass, 119 tests pass (3 ignored), Clippy `-D warnings` pass. Sections
  2 and 3 changed no Rust.
- New tests: 3 engine cases for dwell, gap and hysteresis (the existing case was rewritten for a
  moving clock); 6 dock cases for the re-zero offer, decline, write failure, large offset and trembling.

## Not verified

Nothing ran on a device. The BLE lifecycle picks change native code that only a real link
exercises; they need the connect / disconnect / reconnect part of the device script before a
demonstration relies on them. All new thresholds are provisional.
