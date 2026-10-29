# R06 select-only dropdown keyboard journey

Baseline b42dfa2, clean worktree; CI 40839537317 confirmed SUCCESS. Quota 75% / 79% remaining.
Source snapshot `%TEMP%/irms-dropdown-keyboard-snapshot`. Scope: GlassDropdown and Settings language
field (with focused/full frontend tests), not every modal or every locale. Preserve portal placement,
100ms close animation and caller API compatibility; no visual redesign or native acceptance claim.

Goal: keyboard-only users can discover the Settings language field, open its select-only list,
navigate/commit/cancel and continue logical Tab order. Use stable IDs, named combobox/listbox,
expanded/active-descendant state, selected vs tentative active option, navigation/commit/escape,
focus continuity and noninteractive closing popup. Preserve supported zh-TW/en language endonyms.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Inclusion | Inherited, backend ID unavailable | Snapshot component + language label; final frozen diff | Keyboard semantics, supported-language naming, lifecycle/emergency interaction |
| Lead | Current | Source evidence/reproduction/implementation/tests | Verify claims, fix one bounded path, document native/client limits |

Reviewer read-only: no edits, deployment, commits, network or heavy tests, no other chats. Report
<=250 words source:line BUG/RISK, concrete scenario/fix/uncertainty. Capture failing-before keyboard
regression; validate navigation/selection/cancel, dynamic options/disable/reopen and real Settings
language switch in both supported locales. Run focused and full frontend/typecheck/build. Update
new log/HOME/readiness/checkpoint; scoped commit/push/draft PR. Native WebView/screen reader,
unsupported locales, other overlays, S03 rollout and institution/population evidence remain open.

Outcome: baseline arrow-open failed, then 22 focused / 560 full frontend tests (57 files),
typecheck/build passed. Independent inclusion review accepted; native touch/pen/AT remains open.
Display theme/pose label association included with language; DemoModePanel persistence assertions
only updated expected trigger role. See log_20261029_dropdown_keyboard.md and native acceptance record.
