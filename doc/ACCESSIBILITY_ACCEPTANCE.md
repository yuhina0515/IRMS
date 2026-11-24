# Supported-locale keyboard acceptance records

Scope: shared GlassDropdown and Settings Display pane, baseline b42dfa2 on 2026-10-29.
Supported UI languages are zh-Hant and en; language names remain endonyms. No other language,
country, age, sex, gender, ethnicity or assistive-technology suitability is inferred.

Implemented select-only interaction is informed by the [W3C APG select-only combobox example](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/)
(read 2026-10-29). The example is guidance, not evidence of this application's conformance.
Our explicit variant cancels tentative changes on external blur/pointer departure; Enter, Space,
Tab or option click commits. Escape cancels. DOM focus stays on the trigger; active descendant
identifies the explored option. Shared Escape stacking owns the 100ms closing interval.

| Evidence | Observed locally | Remaining acceptance |
| --- | --- | --- |
| Field names | Language/theme/pose labels reference stable trigger IDs; language hint described; named listbox | Native screen-reader name/value/expanded-state announcements in both supported languages |
| Keyboard | Arrow open/navigation, Home/End, bounded movement, prefix/repeated-character search, explicit commit/cancel; normal Tab departure | Actual Windows WebView keyboard/IME combinations and mounted screens |
| State/lifecycle | Tentative navigation does not change setting; closing popup hidden/noninteractive; disable, dynamic options and rapid reopen handled | Touch/pen option activation with prevented pointerdown; device/browser-specific focus behavior |
| Language journey | Real Settings tests change zh-Hant -> en -> zh-Hant through the named control and Tab to Theme | Native-language terminology/comprehension review and real client announcement quality |
| Layout | Existing portal, viewport clamp/upward placement and scrolling retained; active choice scrolls into view | Zoom 200%/400%, small viewport, OS text scaling, touch targets and focus visibility on intended hardware |

Before native acceptance, record app revision/build, Windows/WebView version, input device,
screen-reader/version, UI locale, zoom/text scale and observer. Run:

1. Open Settings Display; reach Language using keyboard and by accessible-name navigation.
2. Open/navigate without committing. Cancel with Escape; confirm language unchanged and only the
   dropdown closes. Reopen and choose English with Enter; verify focus/name/announcement.
3. Reopen, explore Traditional Chinese and Tab. Verify one commit and focus on Theme; repeat with
   Shift+Tab, Space and option click/touch/pen. Check long-list active option stays visible at zoom.
4. Change available choices/disable the control where supported; verify no stale option or hidden
   focus. Open an underlying modal and confirm Escape closes only the dropdown first.

Record pass/fail/observed behavior, not an inferred pass from DOM tests. Other custom overlays,
Settings fields outside Display, unsupported locales/RTL and complete application journeys remain
outside this bounded batch. No WCAG, institutional, clinical or population approval is claimed.

## Hardware emergency alert follow-up

Baseline 2376a02, same date. ErrorOverlay is now a body-portal, named/described alertdialog that
owns focus independently of confirmation. Initial focus goes to the first enabled save/disconnect
control, otherwise the focusable alert. Tab stays within available controls; Escape is consumed
without dismissing hardware error. Mutation handling moves focus when save is disabled/removed.
Shared inert leases and explicit confirmation recovery-target handoff preserve background isolation
and eligible prior focus. Emergency Escape priority is 100; ordinary handlers retain priority-0 LIFO.

DOM evidence covers standalone alert, save/disconnect behavior, disabled/removed/no controls,
StrictMode/recovery, real confirmation in both render orders and open/closing states, late
confirmation cancellation, overlapping leases and new body siblings. These do not prove native
screen-reader speech, WebView inert enforcement, CSS-only visibility filtering or real touch input.
Current save/disconnect markup has no CSS-only hidden control; eligibility checks model disabled,
inert, hidden and aria-hidden states.

Native protocol addition: inject the owned-device hardware-error fixture with and without a live
session and pending confirmation. Verify title/code/frozen-state/hint announcement; keyboard access
to save/retry/disconnect; focus after disabled/removed save; Escape must not dismiss or close a
background layer. Recover the error and verify eligible prior focus and background access. Repeat
both supported locales, intended zoom/input/AT combinations, and record actual outcomes. Do not
substitute a simulated store mutation for native hardware acceptance.

## Calibration Wizard A control semantics follow-up

2026-10-29 baseline 752d475. Close exposes localized Close / 關閉 rather than only the visible
symbol. Existing left/right buttons expose mutually exclusive aria-pressed, including no selection
and saved initial side. Native button Tab/Space/Enter behavior and local selection are preserved;
choosing a side or closing without Apply does not persist settings. Seven focused DOM tests include
both supported locales and saved left/right cases. No calibration threshold or capture change.

This is not full wizard accessibility acceptance: portal/focus containment/restoration and step
announcements remain open, as does Wizard B. Native protocol: with owned hardware, inspect names
and pressed states using the intended screen reader in both locales, select either side by keyboard,
close and verify unchanged saved side. Record observed speech/focus and remaining modal failures;
do not substitute DOM checks for native calibration or participant acceptance.

## Calibration Wizard A focus ownership follow-up

2026-10-29 baseline 61351c9. Wizard A is now a named body-portal dialog, taking initial focus on
Close, containing Tab/programmatic focus/pointer access and isolating background with a reversible
lease. Removed/disabled focused controls fall back to available controls or dialog. Eligible prior
invoker is restored on normal unmount; do not restore background under a higher active alert.
Wizard remembers its local control while yielding to confirmation/hardware, including confirmation's
closing interval; resumes after the alert portal disappears. Declared paint layers are wizard 1100,
confirmation 1200 and emergency 1500; source/CSS and DOM assertions do not verify native painting.
Escape priority: default background 0,
Wizard A 10, confirmation 20, hardware 100. Capture consumes Escape without closing; explicit Close
is preserved. Capture timing/math/settings persistence unchanged.

DOM integration tests cover both overlay component orders, confirmation closing, hardware recovery,
late mount below existing emergency, preempted wizard unmount, StrictMode and control lifecycle.
These tests do not prove CSS visibility filtering, native WebView isolation or assistive speech.
Step announcements and Wizard B are still open. Native protocol: open Wizard A by keyboard from
Dashboard and Settings, verify name/initial focus/Tab wrap/background isolation and return focus.
While capturing, press Escape (no close/background action), then explicitly Close. With owned fixtures,
open confirmation and hardware error, verify upper focus/commands and recovery to wizard control.
Run both supported locales and actual intended AT/input/zoom combinations; record observed results.

## Calibration Wizard B control/modal follow-up

2026-10-29 baseline 051c9e7. This follow-up closes the earlier source-level Wizard B control/modal
gap: B now has localized Close, mutually exclusive side pressed state, named body-portal dialog
and the existing single-calibration-wizard focus/alert precedence. Capture Escape consumes; explicit
Close remains available. Side remains local until Apply. Component identity, raw detection delay,
listener/enable/disable cleanup and solver/capture code remain unchanged.

DOM tests cover both supported locales, saved/null sides, keyboard selection/close without persistence,
StrictMode cleanup, 2499/2500ms detection boundary, capture Escape, and real confirmation/emergency
handoff without restarting raw enablement. These are mock lifecycle assertions, not BLE command,
raw quality, sampling, metrology or calibration acceptance. Arbitrary simultaneous A/B mounting is
outside the single-wizard contract. Native AT/paint/inert and step/error announcements remain open.
Native protocol: repeat Wizard A keyboard/alert journeys for B; observe actual raw enable/detection
and disable on close, without asserting quality from mere packet presence. Record both supported
locales, intended AT/input/zoom, exact device/firmware and observed results. No participant testing
or clinical/population/institutional conformance inferred.

## Wizard A step/error announcement follow-up

2026-10-29 baseline 24e1fdd. Persistent polite atomic status contains only existing localized step
title and capture-phase text. Persistent atomic alert follows errMsg. Countdown ticks/raw/live-preview
values are excluded. Retry uses existing clear path, so the same subsequent error creates another text
transition. Visible title/error layout, capture timing/math and focus contract remain unchanged.

DOM evidence: both locales, step change with stable nodes, capture start, countdown/raw update without
status text mutation, actual insufficient-data error and retry clear/repeat. This closes the earlier A
live-region source gap, not native announcement acceptance. Speech delivery, initial content handling,
polite/assertive interruption and recovery after confirmation/hardware preemption require intended
screen-reader/WebView verification. Wizard B announcement semantics remain separate/open.

Native protocol: in both locales navigate from placement to capture, observe announcement of the new
step and capture phase, then trigger owned-fixture insufficient data and retry. Verify the identical
failure is announced again, timer ticks/raw updates do not create speech chatter, and meaningful
instructions can still be reviewed. Repeat confirmation/emergency takeover and recovery. Record
actual spoken output/queue/order; do not infer it from role attributes or DOM text tests.

## Wizard B announcement follow-up

2026-10-29 baseline a0f71f8. B now keeps persistent polite atomic stage status and atomic alert.
Existing localized detection text, progress, face, pose/sweep/result titles distinguish meaningful
stages. Capture preparation and recording may each update once; countdown ticks/raw/numeric solver
results stay outside speech text. Alert follows capture error or failed-result message restricted to
result stage; existing retry/recalibration clears it. Original progress formula is shared with visible UI.

DOM tests cover both locales, detection fallback, raw-enabled floor face advancement, actual capture
failure/retry, all four pose/two sweep transitions and real solver rejection of deliberately static
underdetermined fixture data. Failed fixture proves rejection only, not valid/accurate calibration.
Source-level B speech gap is now addressed; actual native delivery/order/initial region behavior and
preemption recovery remain unverified. Reuse A native speech protocol for B, adding raw detection,
each face/pose/sweep/result and failed solve/recalibration. Record actual spoken output and verify
countdown/raw/numeric values do not cause chatter. Keep native BLE/metrology acceptance separate.
