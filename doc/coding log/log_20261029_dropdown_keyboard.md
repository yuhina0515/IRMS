# R06 supported-locale dropdown keyboard journey

Baseline b42dfa2, clean readiness worktree; prior-head CI 40839537317 confirmed SUCCESS.
Plan `plans/2026-10-29-dropdown-keyboard-plan.md`; source-only snapshot
`%TEMP%/irms-dropdown-keyboard-snapshot`. Quota at start remaining 75%/79%; observed during final
checks 64%/77% (account windows, not exact task tokens). Lead alone edited/tested/delivered.

Independent read-only `/root/inclusion`, inherited model (exact backend ID unavailable), confirmed
missing trigger relationships, portal choices in ordinary Tab order, no arrow navigation and
unassociated language label. Flagged Escape capture conflict; lead read actual escapeStack.ts to
verify window-capture dispatch before fixing. Snapshot lacked that extra dependency; review's
initial uncertainty was explicit. No false-positive findings rejected.

Reproduced baseline ArrowDown failing to open the listbox. Shared component now exposes named
select-only combobox/listbox IDs, expanded and active-descendant state, trigger DOM focus and
non-tabbable options. Candidate value is distinct until Enter/Space/Tab/click; Home/End/arrows,
Page keys and prefix/repeated-character search explore choices, with IME/shortcut guards. Escape
cancels through the common stack, including the 100ms close interval. Closing is hidden and
noninteractive; disable, changed/reordered choices and rapid reopen are handled. External blur/
outside pointer intentionally cancel instead of committing; this variation is documented.

Display pane associates stable labels with language/theme/pose and language hint. Supported
language endonyms remain intact. Existing portal/viewport clamp/above placement/animation and
caller value/onChange contract preserved; active candidate scrolls into view using existing
selection styling. No visual redesign, translations or BLE/DB/IPC changes.

Final independent frozen-diff review found no blocker; native touch/pen selection under prevented
pointerdown remains acceptance work. Reviewer did not rerun tests. Added a native acceptance
record with environment/input/locale/zoom evidence requirements, not inferred native success.
W3C APG select-only guidance was read and linked; this is not a WCAG conformance audit.

Validation: 22 focused tests passed. Final full frontend JSON report: 560/560 tests, 57 files,
zero failures; typecheck and Vite build passed. Seven new tests cover keyboard/relationships,
single Tab departure, close animation, Escape layering, dynamic/disabled/empty choices, reopen/
IME and actual Settings zh-Hant -> en -> zh-Hant switching. Existing pointer/viewport checks
retained. Demo persistence assertions retained, changing only expected trigger role to combobox.
Rust unchanged; last verified 138 Rust / 13 collector tests plus fmt/Clippy from S03 not rerun.

Verification corrections: initial new imports were checked before their tests were added; completed
tests resolved unused-import diagnostics. Initial combobox lacked a fallback accessible name for
unlabelled legacy callers; added current/placeholder fallback while explicit field labels take
precedence. Initial full-run output was truncated and its following successful build hid the test
exit status; inspected Vitest result cache, reproduced the one stale DemoModePanel button-role
query, updated its role expectations and captured the final full JSON result with explicit exit
handling. Do not call the initial aggregate run a pass. Existing large Leg3D / ToolsView import
warnings and intentional crash-recovery test stderr remain; no new build failure.

Docs/spec/cheat-sheet/HOME/readiness/checkpoint updated. No native WebView, assistive technology,
touch/pen/zoom, unsupported locale/RTL, complete-modal or participant acceptance. No production
deployment or universal institutional/demographic suitability claim. Next: bounded remaining
overlay/field journey, preserving S03 coordinated rollout and native/R05/R07 gates.
