# Persistent local startup-readiness — 2026-10-30

Plan:plans/2026-10-30-startup-readiness-plan.md. Baseline928814a clean, CI41066460644 SUCCESS.
Initial quota56%/28%, latest45%/26%, no quota hold active. Continued one bounded task above20stop;
after any quota hold require allknown>=30 for resume. No purchases/reset/auth substitution.
No devices, app/participant data, real profiles, native schema/IPC, deployment or people messaging.

Lead added async openHistoryTransitionGate beside unconnected owner. Trusted audited stats read
must settle before owner creation. Ownfields, safe counters and basic consistency; explicitzero/
historyFence:null only local ready. Pending/fenced/unknown/legacy/error returns held with no owner.
Deadline1..60000ms/default5000, promise-chain read handles sync throw, fixed reasons/no raw cause;
late result never upgrades held, finally clears timer. No replay/repair/erase/native calls added.

Meeting: engineering/security independent read-only design+final review (inherited model/backendID
unverifiable). Accepted explicit0/null versus unknown, count consistency before reason selection,
no pre-exposed owner, deadline/read same-tick tests, and trusted reader versus authentication limit.
Both final static reviews no blocker, did not rerun69cases. Full fence/capacity audit stays in actual
journal.stats; factory is defensive precondition, not replacement. NoUI/locale change needing third
reviewer. No demographic thresholds or universal institution/country/population claim.

Verification: initial32owner/startup cases passed, then added counter consistency and two same-tick
deadline cases from design priorities. Final37targeted passed (19owner+15startup+3CLI); TypeScript,
Vite build and node syntax passed. Existing ToolsView/chunk warnings remain. Fresh Cargo no-run
selected unchanged current native executable; full168Rust/7ignored/fmt/Clippy and736fullfrontend
not rerun. No production imports found (expected rg status1); collector unchanged.
New69actual browser/native cases (61prior+8startup), artifact
doc/recovery/startup-readiness-probe-20261030.json: pending restart/fencedempty/queuedfence block,
explicitempty localready, pending/released audit, closedstore held with retained readings. Native
rows remain through local empty fixtures; not native-history proof. Old artifacts preserved, raw/
servedmodule/runtime/native hashes and cleanup recorded. No test/setup failure or post-evidence
source edits. Scope still controlled ack transport, not actual Tauri IPC/native cancellation.

Docs/spec/cheatsheet/optimization/HOME/checkpoint updated. Next bounded task: cooperating-context
exclusive owner around startup audit/lifetime. Raw factory remains bypassable test primitive;
current snapshot is not cross-window reservation/eviction/restore authority. Unlock/retention/data
erasure/WebView/realIPC/native interruption remain gates. No complete-tail/auto-resume/rebind/repair.
Scoped commit/push/update draftPR5, no merge. Inspect new head CI before another push.
