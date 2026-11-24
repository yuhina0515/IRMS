# R06 hardware alert keyboard containment

Baseline 2376a02, clean readiness worktree; CI 40846105740 confirmed SUCCESS. Quota remaining
62% / 77%. Snapshot `%TEMP%/irms-hardware-alert-snapshot`, source-only. Scope: ErrorOverlay,
its DOM tests and the existing confirmation handoff only where verified integration requires it.
Preserve SessionSaveControl/backend behavior and emergency exit availability; no native claims.

Verified integration adjustment: shared inert leases prevent confirmation/emergency cleanup from
undoing another owner; explicit recovery-target handoff prevents capturing an emergency control
as its own invoker. Optional Escape priority (default 0 preserves LIFO) keeps hardware alert above
later background registrations. Scope includes modalIsolation.ts, escapeStack/useEscapeKey and
their targeted regressions; not a rewrite of every modal.

Goal: standalone hardware alert has an accessible title/description, owns initial/contained focus,
isolates background controls and offers save/disconnect without Escape silently dismissing error.
Recovery/unmount restores eligible prior focus without disrupting confirmation handoff, disabled
saves or StrictMode. Keep hardware error above other overlays. No BLE/DB/IPC/schema changes.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Inclusion | Inherited, backend ID unavailable | ErrorOverlay + ConfirmDialog focus/isolation + SessionSaveControl | Independent source audit/final diff: keyboard, alert semantics, handoff, truthful disabled save |
| Lead | Current | Verified reproduction, implementation/DOM tests, scoped delivery | One bounded emergency-control path, no unrelated modal rewrite |

Worker read-only: no edits/deploy/commit/network/heavy tests/other chats; <=250 words source:line
BUG/RISK scenario/fix/uncertainty. Capture failing-before focus/role regression, focused/full
frontend/typecheck/build, independent review and acceptance limits. New log/HOME/spec/readiness/
checkpoint and scoped PR update. Native screen-reader/WebView/touch/pen/zoom and complete
modal/institution/population acceptance remain open; S03 rollout gate preserved.

Outcome: baseline standalone focus failed; own portal/focus/isolation + coordinated handoff implemented.
Independent inclusion audit/final review accepted with CSS-only visibility/native acceptance limit.
32 focused and 572 full frontend tests (58 files), typecheck/build pass. Twelve new tests cover the
specified lifecycle and priority paths. Handoff log: `doc/coding log/log_20261029_hardware_alert.md`.
