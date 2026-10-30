# Actual browser/native ordering with controlled acknowledgement

The [61-case report](owner-ordering-probe-20261030.json) extends the historical53 cases with8
owner-ordering cases. Chrome executes the actual unconnected TypeScript owner and IndexedDB journal;
the parent invokes the actual Rust/SQLite test oracle. A controlled promise carries delayed or
substituted acknowledgements through CDP. This is not actual Tauri IPC fault injection, native
cancellation, production quiescence or a physical-device test.

Four fixed loopback routes serve a minimal importmap page, transpiled journal, transpiled owner and
shared budget JS module. No browser-to-native route, arbitrary path mapping, dependency download or
user browser profile is added. Report hashes identify raw source, served module bytes, budget,
compiler/runtime and native executable. Fresh Cargo no-run selection checks the current executable;
hashes are not attestation or a reproducible-build proof.

The positive sequence has explicit barriers:

1. Register accepted append in browser owner before invoking actual native append.
2. Native commits2rows/1receipt. Parent withholds the returned full count.
3. Reserve history transition; assert draining, no IDB fence and no mutation request. New work rejects.
4. Deliver the real full count; fence callback awaits actual journal transaction completion.
5. Only then may mutation callback signal parent. Parent verifies native rows still exist, performs
   synthetic backup-session deletion and delivers completion. Owner remains historyComplete held;
   original journal is retained. This is not complete user-data deletion.
6. Force-stop/reopen only the owned Chrome tree, same profile/origin. Durable marker and original
   queue remain; the memory owner is absent. Startup recovery/owner recreation is not implemented.

Negative fixtures register an append before actual native commit/retry. A short acknowledgement
enters appendUncertain with no fence or delete request; native2rows and journal2rows remain. A withheld
reply triggers a25ms browser drain deadline; its late actual full count clears only pending, never
the first hold reason or permission to mutate. The deadline is a failure-control exercise, not a
latency benchmark. Separate owner/queue fixtures are explicit test resets, not product unlock APIs.

Oracle append/inspect still execute normal startup initialization and may finalize orphaned sessions.
The negative assertion is that no gate-coordinated deletion/restore callback occurred, not that every
SQLite field remained unchanged. Only the reconcile oracle uses a read-only connection before init.

Reproduce using the fresh-build procedure in [native oracle](native-journal-oracle.md), selecting
`--output ../doc/recovery/owner-ordering-probe-20261030.json`. Preserve previous19/29/39/53 reports.
The19 controlled-promise unit cases remain a separate result, not added into61 or a new full-suite
total. Temporary browser/profile/DB/request/server cleanup completes before successful publication.

Remaining startup gate: a fresh memory owner must not accept work until durable journal/fence and
native reconciliation decisions are checked. A persisted unresolved marker or pending data must
block automatic start/replay/erase. All production append/start/history operations must eventually
route through one owner; other windows/processes or bypass operations remain outside this evidence.
Unlock/retention, external or both-store restore, WebView persistence, eviction and actual IPC/native
termination timing remain unfinished. No complete-tail, metrology, clinical or universal readiness
claim is made, and the prototype remains unconnected to acquisition.
