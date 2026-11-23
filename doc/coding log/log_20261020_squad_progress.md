---
tags: [irms, squad, reliability, mobility, session, tests]
date: 2026-10-20
summary: "Verified and fixed beta.25 mobility timing, leg-specific trends, capture/save cleanup and Session persistence races; 514 frontend tests and 98 Rust tests passed. No release or hardware acceptance."
---

# Beta.25 reliability progress

Plan: `plans/2026-10-20-irms-progress-plan.md`.

## Baseline and delivery

- User request: squad-driven IRMS progress.
- Verified live repository: `yuhina0515/IRMS`, beta.25 branch `fix/ota-truncated-link-flow-control`, draft PR #3. Baseline `cd4fd6696832de210c483dd0fcf4aa1ebbbd2b0b`.
- The old `E:/Monitoring-and-IoT/IRMS` checkout targets `IRMS-archive`; its local Cargo.toml change and untracked logs were preserved. The public checkout was on `feat/unified-calibration`; that branch was preserved too.
- Task worktree: `E:/Monitoring-and-IoT/IRMS-wt/squad-20261020`, branch `codex/irms-progress-20261020`. A tracked-source snapshot outside the worktree is recorded in the plan.
- Delivery: stacked draft PR targeting the beta.25 branch, without merge, release, signing, deployment or device access. Unified calibration remains gated on bench data.

## Squad

Three independent read-only workers ran before synthesis; all inherited the session model with no override. Workers did not edit or commit. The lead reproduced findings, implemented fixes and ran checks.

| Worker | Scope | Independent verification |
|---|---|---|
| mobility_engine | mobilityC engine and tests | In-memory snapshot reproductions; final engine review and focused tests |
| mobility_ui | MobilityWizard / MobilityTrend and tests | Source scenarios; two subsequent diff reviews |
| session_voice | Session controller / speech and tests | In-memory deferred-API reproductions; subsequent lifecycle/dock diff reviews |

## Accepted findings and changes

- A ten-sample hold passed in much less than the UI's two seconds. Captures now carry monotonic times; a qualifying window spans at least 2,000 ms and ten samples, without a gap over 250 ms. Tests cover four rates, short holds, discontinuity and invalid clocks. The gap threshold is an engineering continuity guard, not clinically validated.
- One opposite-direction outlier could flip the inferred axis and reject a valid held peak. Direction now follows the qualifying held windows. The mounting/angle formulas remain unchanged.
- Knee measurements silently skipped reference checks when thigh samples were absent. Required-reference samples must now align with mover samples; hips still need no reference.
- Best/history mixed left and right legs. Grouping now includes recorded side; old unknown-side records form their own group. The current side is shown and both locales explain comparison scope. No DB migration or historical rewrite.
- Closing a wizard left its capture subscription active until timeout; a delayed save could close a replacement. Capture unsubscribes on unmount. Successful background persistence refreshes parent history, while old-window toast/close callbacks are suppressed. Disconnect dismisses measurement, requiring a fresh neutral after reconnect.
- Failed history queries looked like an empty database. A failure now shows an error and retry, retaining previous rows.
- An old periodic batch could reject after a new session started and restore old readings into the new buffer. Flushes are serialized; End waits for the outstanding write and makes one final flush, with restoration fenced by session ID.
- End previously left counting/acquisition active during persistence. It now freezes acquisition immediately, stops feedback/speech, and keeps Start disabled until saving completes.
- A pending Start could activate after connection loss/reconnect. Connection generation invalidates it; any stale created record receives best-effort end and the caller sees failure rather than success.
- Speech suppression crossed session boundaries. Stopping speech now resets the safety suppression window. End/start explicitly clear old speech.

## Review corrections and deferred work

- Independent diff review caught a new Start-button regression caused by early `running:false`. Added the finishing blocker and a delayed-end Dashboard regression.
- Independent diff review caught history refresh being suppressed with old-window dismissal. Moved parent refresh ahead of the lifetime guard and strengthened the deferred-save regression.
- No initial worker finding was rejected as a false positive. Missing-reference protection is defensive: the current Wizard already supplies both streams.
- Different neutral poses, inability to identify anatomical direction from gravity alone, gyro capture, and unified-calibration design remain outside this bounded fix. Real bench evidence is still required.
- Existing final write/end failures keep the prior logging/reset policy; persistent storage failure is not made recoverable by this change. A future explicit unsaved-session recovery flow would be useful.
- Known build warnings remain: ToolsView is both statically and dynamically imported; Leg3D exceeds 500 kB. They do not fail CI.

## Validation and failures

- The three new Session race tests failed against the original controller, then passed after fixes.
- Final `npm run ci:frontend`: typecheck, **54 files / 514 tests**, production build all passed (exit 0).
- `npm run ci:rust` with `CARGO_BUILD_JOBS=2`: rustfmt, **98 passed / 3 ignored**, Clippy all targets/features with `-D warnings` passed (exit 0). This corrects the historical beta.25 release note's statement that Rust has no tests.
- First Rust run failed in a dependency compiler after a memory allocation failure / STATUS_STACK_BUFFER_OVERRUN. A bounded retry with two build jobs passed. This was a setup/resource failure, not an IRMS assertion failure.
- During development, typecheck caught an incorrect retry dictionary key and a Dashboard test used the wrong button label; both were corrected before final CI.
- `git diff --check` passed. No secret files, unrelated changes or generated outputs are included.

## Outstanding native acceptance

Real BLE timing and gaps; usability of continuous two-second holds; interrupted capture and reconnect; OS/WebView2 speech audibility/language; real delayed storage; physical measurement repeatability. No hardware, GUI installation, OTA, mobile run or release acceptance is claimed.
