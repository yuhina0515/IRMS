# R06 Wizard B control and modal ownership

Baseline 051c9e7 clean worktree. CI 40866950201 in progress at start and rechecked during validation;
not restarted or treated as failed. Plan plans/2026-10-29-calibration-b-access-plan.md; source snapshot
%TEMP%/irms-calibration-b-access-snapshot. Quota remaining initially 36%/73%, observed 32%/72% during
final checks. Shared account percentages, not task-token accounting. Lead alone edits/tests/delivers.

Independent inclusion reviewer (inherited model, exact backend ID unavailable) confirmed missing
Close action name, selected-side semantics, dialog/focus ownership and capture Escape leakage.
Lead accepted findings; baseline test failed to find the localized Close control (accessible name
was only multiplication symbol). Existing A/B share the same single-wizard isolation contract;
arbitrary simultaneous A/B mounting is not supported. Normal active-wizard isolation prevents
background UI from opening another wizard; this is not a general modal arbitration system.

Added named body portal, localized Close, aria-pressed from existing local side and priority10
Escape that consumes during capture/preemption. Reused existing focus lifecycle; only hook comment
changed to A/B. Preserve B component identity during higher-alert handoff. Raw listener/effect/timer,
floor/pose/sweep/result capture/solver and Apply-only settings persistence untouched. No threshold,
clinical translation, demographic or sensor-validity change.

Seven new access cases plus original intro test (8 focused) pass, as does typecheck. Coverage:
StrictMode portal/name/isolation/eligible-invoker restoration and raw-listener cleanup; both locales
Space/Tab/Enter side choice and Close without settings persistence; saved left/right; detection gate
at 2499/2500ms; capture Escape against later ordinary background handler and explicit Close cleanup;
actual confirmation closing/emergency recovery without restarting raw enablement. Initial integrated
mock lacked bluetoothService.send used by SessionController hardware-error handling; fixed stub,
not product behavior. No false-positive product findings rejected.

Final independent frozen-diff review no blocker; reviewer did not rerun tests. Native BLE command
execution/raw validity/sample accuracy/calibration quality, WebView painting/inert enforcement,
assistive speech, step announcements and arbitrary concurrent wizards remain unverified. No service
calls/deployment or participant operations. S03 coordinated rollout, R05 paced performance and R07
institution/metrology gates remain open. HOME/spec/cheat sheet/acceptance/readiness/checkpoint updated.
Next bounded task: step/error announcement journey in one calibration wizard, preserving live-preview
throttle and avoiding per-frame speech; do not repeat completed modal/side-control audit.

Final lead validation: 593/593 frontend tests across 60 files, zero failures; typecheck and Vite
build passed. Existing chunk/ToolsView warnings and intentional crash-recovery stderr remain.
Rust/collector unchanged, not rerun. Full goal remains active with native/research/rollout gates.
