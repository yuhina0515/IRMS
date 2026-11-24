# Bound native deletion prerequisite — 2026-10-31

Plan:plans/2026-10-31-bound-delete-plan.md. Baseline54f03d8 clean, CI41083792235 SUCCESS.
Quota initial88%/22%, latest81%/21%, no hold active at last check. One small bounded task; no devices,
participant/app data, productionIPC/UI/schema/oracle change, deployment or people messaging.

Lead added cfg(test)-only sessions_repo::delete_bound. Canonical original binding+positive ID,
one transaction identity comparison before exact one-row deletion, normal cascade and commit.
Missing/foreign/recreated/malformed target returns error; never refreshes binding/recreates session.
One engineering read-only design/final reviewer, inherited model/backendunknown, no blocker. Accepted
same-transaction condition, zero-row refusal, other-session preservation and abort rollback. Additional
reviewers not needed for this narrow prerequisite; lead owns implementation/verification.

Focused4realSQLite cases passed; full172passed/7ignored, fmt/Clippy all-targets/all-features -D warnings
passed. Includes validcascade/unrelatedreadings preserved, foreignDBsameID, deleted/recreated/invalid
identity and AFTER DELETE failure restores sessions/readings/receipts, then retry. No failing test or
environment issue. No source edits after final checks. Native production behavior unchanged because
helper/tests cfg(test). Prior78browser/native artifact,48frontend targeted/build and736fullfrontend
not rerun. Manual oracle remains numeric delete, not bound-delete proof; collector unchanged.

Docs/spec/cheatsheet/optimization/HOME/checkpoint updated. Matching keys are lineage, not authority,
backup generation, quiescence or data-erasure proof; independent journal still retained. Next task
after quota permits: actual oracle bound-delete integration with fence/journal retention. No clinical,
population/institution/country universality, demographic thresholds or automatic resume/rebind/erase.
Scoped commit/push/update draftPR5, no merge; inspect newheadCI before nextpush. Livequota<=20 means
savehold/stop new expensivework; resume only allknown>=30. No purchase/reset/auth substitution.
