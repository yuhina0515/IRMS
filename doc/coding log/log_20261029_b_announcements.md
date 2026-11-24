# R06 Wizard B phase/error announcements

Baseline a0f71f8 clean worktree. Plan plans/2026-10-29-b-announcements-plan.md; snapshot
%TEMP%/irms-b-announcements-snapshot. Initial quota remaining91%/70%, observed86%/70% before delivery.
Earlier turns were verified waits on CI40867759978, not a product block. During local implementation
that same a0f71f8 run reached confirmed terminal SUCCESS; no restart or superseding push occurred.
Lead revised idle-only waiting to allow local preparation while retaining the success-before-push gate.

Independent read-only inclusion reviewer (inherited model, backend ID unavailable) confirmed missing
announcement semantics for raw detection, floor faces, poses/sweeps/results and capture/solver errors.
Accepted: persistent polite atomic status using existing localized stage/progress text and stable
assertive error node. Floor face plus progress differentiates all faces; result status excludes
confidence/residual values. Capture phase distinguishes preparation from recording using existing
labels but excludes individual countdown ticks/raw frames. Error is err or failed result only while
result stage is active, clearing on retry/recalibration. Shared derived progress preserves the original
visible formula. No raw subscription/detection/timer, sampling, solver, UI layout, clinical message,
threshold, Apply/settings/BLE/DB/IPC contract change.

Two baseline locale cases failed for absent status region. Four new cases plus existing B tests
(12 focused) and typecheck pass: both locales intro/detection/pose; actual capture insufficient-data
failure and retry; four poses/two sweeps using static fixture vectors trigger real underdetermined
solver failure, no Apply, then recalibration clear; raw-enabled floor +X -> -X and 12-step numbering.
Mutation observer verifies zero status changes from countdown ticks; raw frames leave status text
unchanged. Synthetic vectors deliberately fail, not evidence of successful or accurate calibration.
Existing intro test now targets status/heading/visible progress to avoid hidden speech duplicate
text queries; no weakened start gate. Final frozen-diff review no blocker; reviewer did not rerun tests.

Native speech delivery/order/initial regions/preemption recovery, successful hardware calibration,
metrology and actual BLE behavior remain unverified. No service deployment/participant operation or
universal institutional/country/population conformance. R05 paced performance/R07 institution/metrology
and S03 coordinated rollout gates remain open. HOME/spec/cheat-sheet/readiness/acceptance/checkpoint
updated. Next bounded batch: R05 history query/render performance source review, one verified issue
only, preserving read/export contracts and avoiding another broad scan or unsupported timing claims.

Final validation: 600/600 frontend tests across 62 files, zero failures; typecheck and Vite build
passed. Existing chunk/ToolsView warnings and intentional crash stderr unchanged. Rust/collector
unchanged, not rerun. Previous head a0f71f8 CI 40867759978 SUCCESS verified before scoped delivery.
