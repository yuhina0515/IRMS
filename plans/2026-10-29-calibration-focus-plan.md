# R06 Wizard A modal focus and overlay precedence

Baseline 61351c9, clean readiness worktree; CI 40861529361 SUCCESS. Initial quota 45%/74%.
Snapshot %TEMP%/irms-calibration-focus-snapshot (six source/tests; no secrets/generated files).
Goal: body portal named dialog, initial/contained/restored focus, background inert lease and
keyboard/pointer protection. Preserve capture math/timing/settings persistence, explicit close action.
During capture Escape must be consumed without reaching background. Emergency and confirmation
(including closing animation) must own focus above wizard; resume wizard focus after their removal.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Inclusion | Inherited; backend ID unavailable | Snapshot Wizard/Confirm/Error/isolation/Escape | Independent modal precedence, Tab/control lifecycle, invoker restoration |
| Lead | Current | Reproduction, scoped hook/portal implementation, tests, docs/delivery | No broad modal rewrite, no hardware or sampling claims |

Proposed implementation: Wizard-specific focus lifecycle yields while store hardwareError/confirm
or any actual alertdialog is present. Observe body portal insertion/removal to cover confirmation's
150ms closing interval. Shared reference-counted inert leases; release wizard lease while preempted.
Store subscriptions/event guards avoid order-dependent focus fights. Remember in-wizard focused
control across preemption; remove all listeners/observers/subscriptions on cleanup. Wizard Escape
priority 10 (confirmation 20, default background 0, emergency 100), always armed but no-op while capturing/blocked.
Default stack behavior unchanged. Lead verifies these decisions; reviewer may reject with evidence.

Worker read-only: no edits/deploy/restarts/commit/heavy tests/other chats. <=300 words source:line
BUG/RISK, failing scenario, fix and uncertainty. Baseline failing regression; actual overlay integration,
StrictMode, disabled/removed controls, capture Escape, localized semantics, typecheck/full frontend/build.
New coding log/HOME/spec/cheat-sheet/acceptance/checkpoint and scoped push/update draft PR #5.
Native AT/WebView, Wizard B, step announcements, capture-metrology and rollout acceptance stay open.

Design correction: negative wizard priority would lose to ordinary background handlers. Lead uses
10/20/100 and regression registers a later background priority-0 handler during capture. Only the
confirmation Escape call changes; default LIFO and emergency behavior remain intact.

Review outcome: confirmed late-wizard paint ordering risk, explicitly raised confirmation to 1200
(wizard CSS 1100, emergency 1500), with stable-fragment integration regression. Final independent
re-review accepted; actual WebView painting remains an acceptance gate.

Done: final independent review no blocker; 586 frontend tests/59 files, typecheck/build passed.
Native paint/AT and remaining gates explicitly unverified; see new calibration_focus coding log.
