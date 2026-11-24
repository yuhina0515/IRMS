# R05 history review query/projection

Baseline05a223f clean worktree; quota84%/69%. Previous head CI40868891187 in progress: local work
allowed, no superseding push until terminal success or actual-failure investigation.
Snapshot %TEMP%/irms-history-review-snapshot (5 source/tests, no DB/private/generated data).
Verified current path: chart getData(1200) materializes all rows for LTTB, then getData() queries
all rows again for full-resolution analysis; locale change repeats both. CSV export must remain full.

One bounded change: additive sessions.getReview/native command returning existing LTTB chart plus
all analysis-required rows projected to timestamp/kneeAngle/proximalAngle in one DB read. Retain
getData/export contracts, original chart knee-based LTTB/order/duplicate-row behavior and existing
Date.parse/metric/module-analyzer semantics. Analysis never uses sampled values. Native chart fixed
1200 budget; projected full analysis is still O(n), not a global memory ceiling. No DB schema change.
Split data lifetime from chart locale lifetime so locale redraw uses existing review snapshot.
Errors must be caught, stale session/unmount completions discarded; no inaccurate sampled summary.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | Inherited; backend ID unavailable | Snapshot DB/history/analyzer and final diff | One-query consistency, projection sufficiency, chart parity, async/locale contract |
| Lead | Current | Reproduction, additive DTO/IPC/review integration, tests/benchmark | Complete analysis/export fidelity, measured synthetic payload evidence and scoped delivery |

Worker read-only no edits/deploy/commit/heavytests/otherchats; <=300words source:line BUG/RISK,
failing scenario/fix/uncertainty. Lead tests query/DTO/full-analysis parity, same-time row identity,
empty/small/large/malformed timestamps, renderer single-load/locale/stale/error/export behavior.
Use targeted synthetic comparison for serialized bytes, not native FPS/heap assertions; typecheck,
frontend/build and Rust fmt/test/Clippy appropriate to native changes. New English log/HOME/spec/
cheat-sheet/threat/performance/checkpoint, scoped commit/push/update draftPR5 only after CI gate.
Do not claim native performance, universal population/institution or participant acceptance.

Outcome: source baseline duplicated reads reproduced; additive snapshot/projection implemented with
legacy chart/export/full-analysis parity and locale/stale/error tests. Reviewer allocation-lifetime
suggestion accepted; final engineering re-review no blocker. 606 frontend/141 Rust tests passed,
6 Rust ignores (3 live+3 manual), new manual benchmark separately passed; typecheck/build/fmt/Clippy
passed. Hashed15k fixture returned JSON3,311,285 ->1,912,413 bytes; exact scope/limits in new protocol.
