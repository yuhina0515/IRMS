# R06 Wizard A step and error announcements

Baseline 24e1fdd clean worktree. Plan plans/2026-10-29-calibration-announcements-plan.md;
snapshot %TEMP%/irms-calibration-announcements-snapshot (one source file). Initial quota remaining
31%/72%; fresh pre-full-suite reading 97%/72% after the shared five-hour window reset naturally.
No credit/reset/credential action. CI 40867351215 pending / 40866950201 running at start; no restart.

Independent read-only inclusion reviewer, inherited model (backend ID unavailable), confirmed ordinary
conditional step/error content had no announcement semantics. Lead accepted; three new regressions
failed against baseline absence of status/alert regions. Implemented persistent polite atomic status
from existing localized step title plus capture phase; persistent atomic alert from existing errMsg.
Visible headings/errors remain in their original locations. No clinical dictionary or visible layout,
capture math/timing, throttled preview, focus/overlay or settings/BLE/DB/IPC changes.

Decision: do not announce countdown ticks or raw/preview values, and do not make entire wizard live.
Error clears using existing retry path, allowing identical subsequent failure to change text again.
20 focused A tests and typecheck passed. New three cases exercise both supported locales, stable node
across step change, capture phase, zero status text mutations during countdown/raw update, and actual
insufficient-data failure/retry clear/repeat. Existing step test now queries the visible heading role:
getByText became ambiguous because persistent speech text correctly repeats the visible title.
That failure was a query scope issue, not product malfunction.

Final independent frozen-diff review accepted with no blocker; reviewer did not rerun tests. Native
speech delivery, polite/assertive ordering, initial-region announcement and recovery after higher-overlay
preemption remain unverified. Wizard B announcements are separate. No universal conformance, country,
institutional or population acceptance; no actual hardware/participant/service operations. R05/R07
paced-performance/institution/metrology and S03 coordinated rollout gates stay open. HOME/spec/cheat
sheet/acceptance/readiness/optimization/checkpoint updated. Next bounded task: Wizard B step/error
announcement contract review, preserving its raw stream lifetime and excluding per-frame speech.

Final verification: 596/596 frontend tests across 61 files, zero failures; typecheck and Vite build
passed. Existing Vite chunk/ToolsView warnings and intentional crash stderr unchanged. Rust/collector
unchanged, not rerun. CI 40867351215 (24e1fdd) now in progress; 40866950201 (051c9e7) terminal cancelled.
Do not classify that cancellation as test failure or restart it. Before next code batch, allow newest
head CI to reach terminal outcome so rapid autonomous pushes do not continually supersede checks.
