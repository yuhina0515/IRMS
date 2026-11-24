---
tags: [irms, squad, accessibility, keyboard, safety, tests]
date: 2026-10-29
summary: "Added confirmation keyboard containment/background isolation, preserved exit/replacement behavior, and allowed immediate hardware-error takeover."
---

# R03: accessible destructive confirmations

Plan: `plans/2026-10-29-confirmation-access-plan.md`. Baseline `10b2fd0`, clean readiness worktree, draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5). Previous goal turn is progress: R01/R02 code, validation and pushed commits. Quota at start: 66% five-hour / 91% weekly remaining.

## Independent review and decision
Read-only worker `/root/inclusion` (inherited model, no override; exact backend model unavailable) reviewed the baseline, implementation and lifecycle coverage. Lead alone implemented/tested/delivered. Original failure reproduced with user-event: after Cancel -> Confirm -> Tab, focus moved to body instead of Cancel.

Decision: retain current overlay stacking and visuals, mount the singleton confirmation in a body portal, preserve sibling inert attributes, contain focus/keyboard and block outside pointer activation. A native top-layer dialog would otherwise sit above the existing higher-z hardware ErrorOverlay. Hardware errors must cancel a pending confirmation immediately, clear its animation timer and transfer focus to an enabled emergency control. Do not claim the other custom overlays now have focus management.

Independent post-fix review found no blocker and suggested StrictMode replay coverage; added it because the app mounts under StrictMode. Background siblings added after opening are isolated by a scoped observer. Current two-button confirmation controls are the explicitly supported tab sequence; this is not a generic nested-modal library.

## Behavior and checks
- Cancel remains initial focus. Tab/Shift+Tab cycle between available decision buttons. Attempts to focus/click outside are contained; inert attributes expose native background isolation semantics.
- Decisions resolve immediately; both buttons disable through the existing 150ms closing animation. The top Escape handler stays registered until removal. Replacement requests cancel the old removal timer and retain the original invoker.
- Closing/unmount restores prior inert attributes, removes capture listeners/observer and returns focus to a connected, enabled invoker outside inert/hidden content. Missing/disabled invokers are skipped; selecting an application-specific replacement workflow focus remains part of the wider journey audit.
- Hardware errors preempt open/closing confirmations and reject new requests while active. Isolation releases immediately; focus moves to the first enabled error-overlay button, even if the first button is disabled. Old close timers cannot steal emergency focus.
- `aria-describedby` associates the short confirmation message. [W3C APG modal-dialog guidance](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) was fetched/read; it informs these patterns, not a conformance claim.

Tests cover forward/reverse wrapping, focus/click blocking, immediate resolve versus delayed DOM removal, lower-layer Escape priority, replacement during closing, new body siblings, original inert attributes, unmount, removed/disabled invokers, hardware takeover during open/closing/already active, disabled first emergency control and initially-open StrictMode replay. Full frontend test/typecheck/build result is recorded in the checkpoint. No Rust changes.

## Corrected failures and limits
The first new emergency tests failed in two different ways: one assertion observed a promise callback before its microtask, fixed with async act; a real focus race restored the opener before the emergency DOM existed during layout cleanup, fixed by transferring emergency focus in layout setup after mutations. Tests now verify focus remains there after 180ms. No worker edits, deployment, native UI automation or external messages.

The initial PR check-rollup list was empty; direct run listing established R02 run 40809681178 was actually in_progress, and R01's superseded run was cancelled by concurrency. Do not infer CI success or terminal failure from an empty check list. Native WebView inert behavior, full-application keyboard use, assistive-technology announcements, zoom and other modal journeys remain unverified. No hardware, clinical or population acceptance claim. Overall goal remains active; R04 BLE notification generation follows.
