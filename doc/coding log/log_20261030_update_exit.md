# R05 updater/session-start/normal-close interlock

Baseline275336c clean readiness worktree; previous CI40883973181 SUCCESS. Natural quota reset100%/59%
released prior hold; no paid credits/reset/auth switch. Plan plans/2026-10-30-update-exit-plan.md,
snapshot %TEMP%/irms-update-exit-snapshot (5 relevant source/tests, no private/generated data).
Lead implements/tests/Git; engineering independent read-only design/final review inherited model,
backend ID unknown. No deployment/installer/BLE/participant operations.

Verified updater's store running/id checks missed controller's pending native start before id exists.
Also installing flag only blocked another updater, while controller could create a new session during
install await; finally reopened installer state after success. Idle close reservation was unrelated.
Five cross-boundary tests initially reproduced4 failures/1 pass against real adapter/controller with
mock native invoke/installer. This is actual production orchestration evidence, not single-flag mocks.

Accepted design meeting: tiny no-import-dependency appTransition lease, acquired synchronously and
released by unique symbol owner. Start acquires before native await and releases finally; normal-close
reservation shares lease, releases on destroy failure. Updater retains existing store running/id guard,
then acquires same lease before install. Failure releases/rethrows for explicit retry; successful
handoff keeps lease/installing until process exit, preventing data acquisition during pending exit.
No import cycle, IPC/schema migration or demographic/clinical-default change. Ordinary localized
close hint now includes an application operation, avoiding a nonexistent-session save instruction
when an installer holds the gate. Existing manual end/save/retry and download/status paths retained.

Engineering design/final review accepted, no blocker. Lead verified reviewer race findings against
baseline regression. Six final adapter/controller tests cover pending-id start vs install, install vs
start/close, close vs install, successful install pinning, rejected install -> start/end/retry, and
failed start -> install. Added obsolete-release/new-owner regression. Earlier focused51 tests and
typecheck passed before final test additions; full final result recorded below. Reviewer ran no tests.

No Rust/collector source change; previous148 Rust/6 ignored and13 collector results are historical,
not rerun this batch. No native installer actually ran. Rejected promise cannot prove an external
installer never launched; successful promise cannot prove process exit. Successful launch remaining
open intentionally blocks new data; OS installer lifecycle requires Windows acceptance. Forced
termination/renderer crash, durable queue, lost-reply deduplication and broad research readiness remain
open. Do not repeat broad scans or treat mocked IPC ordering as native termination evidence.

Final630/630 frontend tests across66 files, TypeScript and Vite build passed. Existing Vite large
chunk/ToolsView warnings unchanged. Latest observed quota95%/58%, prior-head CI SUCCESS gate verified.
Next bounded source finding: UpdateBanner uses void restartNow without catch and only downloaded/APK
rendering, so installer rejection lacks UI handling and handoff lacks status feedback. Deferred to a
separate focused task, not hidden by adapter interlock tests. No real installer or native exit run.
