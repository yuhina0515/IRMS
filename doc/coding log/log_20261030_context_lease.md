# Cooperating context lease — 2026-10-30

Plan:plans/2026-10-30-context-lease-plan.md. Baseline5f74c37 clean, CI41074620172 SUCCESS.
Quota initial43%/26%, latest91%/22% after natural five-hour window rollover; no reset used/purchased.
No quota hold active;20stop/30resume remains. One bounded task, no devices/real app/profile/data,
participants, native schema/IPC changes, deployment, production hookup or people messaging.

Lead added openCooperatingHistoryOwner: fixed exclusive WebLock/ifAvailable before audit, callback
lifetime retained after independently published owner. Fixed held outcomes on busy/missing/error/
deadline, no reader if no grant. Live proxy checked at entry and dispatch; releaseonly idleopen or
historyComplete/no pending, sync revoke before ending lifetime. Unexpectedrequestend revokesproxy.
Actual two CDP targets in owned profile/origin; no new network/file endpoints or native authority.
W3C primary editor draft read for bucket/lifetime/nullifbusy/termination; draft not certification.

Meeting: engineering/security readonly design/final/narrow fixes, inherited model/backendunknown.
ENG found requestfailure during audit -> lateready -> orphan lifetime. New regression failed before
post-await expired/published guard; corrected and reviewers confirmed. Lead additionally reproduced
lease-loss-before-append-microtask and lease-loss-during-fence defects; two tests failed on callback
dispatch, then passed after per-stage live checks. Both reviewers confirmed narrow fix, no new blocker.
Security initially found no blocker before these corrections; final statement supersedes that scope.
Getter error boundary also included before final verification. No UI/locale requiring thirdreviewer.

Final validation:48focused passed (11lease+15startup+19owner+3CLI), TypeScript/Vite/node syntax
passed. Fresh actual78cases (69prior+9lease), doc/recovery/context-lease-probe-20261030.json; Bbusy
doesnotaudit during A audit/lifetime; pending/uncertain releaserefused; oldrefsrevoked; handoff;
target death releasesbrowserlease butpersistentqueueholds; historyComplete releasekeepsfence.
Prior45then46focused runs preceded final48; initial regression failures above were real defects,
not environment failures. New artifacts rerun after final source correction. No post-evidence edits.
Native unchanged, current cached executable selected via fresh no-run build; last168Rust/7ignored/
fmt/Clippy and736fullfrontend not rerun. Collector unchanged. Older artifacts preserved, finalsource
hashes/cleanup verified. No production imports found (expected rgstatus1).

Limits: samebucket cooperating callers only, not auth/nativeglobal/crossprofile/cancellation. Existing
native work can survive context death/lease loss; queue/fence startup plus native original-binding
preconditions remain required. Raw factories/directIPC bypass wrapper. Synthetic numeric native
deletion is not bound-delete authorization. Next bounded software task: native bound-history mutation
preconditions before resolving journals. Data-retention/deletion/unlock UX/restoregeneration/WebView/
eviction/powerloss still unfinished; no demographic thresholds/universal readiness/complete-tail claim.
Docs/spec/cheatsheet/optimization/HOME/checkpoint updated. Scoped commit/push/update draftPR5,
no merge; inspect newheadCI before nextpush. Pause expensive work if knownquota<=20.
