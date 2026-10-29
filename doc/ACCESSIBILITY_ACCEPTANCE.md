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
