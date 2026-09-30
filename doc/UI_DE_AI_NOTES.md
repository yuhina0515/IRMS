# Clinical workbench UI audit — 2026-09-30

## Research and baseline

Repeated visual conventions are evidence of generic design, not proof of AI authorship.
[Joshua Snoddy's design critique](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/)
identifies gradient heroes, glass cards, interchangeable typography and equal card grids.
For this application the useful question is whether a treatment decision has a clear visual priority.
[W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) informs narrow-layout review;
the requested 44px targets follow [Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).
Inner scrolling is the user's explicit workbench constraint; this is not a claim of WCAG certification.

| Suspected convention | Actual baseline evidence |
| --- | --- |
| Default gradients / glass | Mostly absent in active v3. `src/styles/tailwind.css` retains a legacy `.sidebar-item.active` gradient and `.glass` names, but active `TopNav.tsx` uses text tabs and flat surfaces. Do not confuse class names with rendered glass. |
| Uniform rounded cards | Present: `.v3-sheet` 20px, `.v3-pose` 14px, controls 10px, pills throughout. Nested rounded surfaces flatten hierarchy. |
| Emoji / icon-in-circle rows | Not a dominant active pattern. `DashboardView.tsx` coach marks encode state; demo warning must remain. No decorative replacement icons needed. |
| Purple-blue palette | Plum accent and lavender tint in root/night tokens, no current blue-purple gradient. Functional states already have distinct green/amber/red tokens. |
| Symmetric grids | Dashboard `.v3-stage` is nearly 50/50 despite the judged metric being primary. History has six equal summary columns but renders seven values (`HistoryView.tsx`), causing an implicit row. Actions already use a purposeful list/inspector split. |
| Generic copy | Mostly absent: labels describe target, calibration, connection and provenance. Preserve clinical and demo warnings rather than invent promotional copy. |
| Excess shadows | Not dominant on v3 sheets. Keep elevation limited to overlays; selected rows need a clear edge, not floating cards. |

## Direction and adaptive contract

- Chalk surfaces, graphite text, petrol-blue interaction accent; green stays reserved for successful target/hold, amber for uncertainty, red for faults. No decorative gradients.
- Sans headings for operational hierarchy, tabular monospace measurements, ruled square-edged sections. The larger measurement region is primary; pose is supporting evidence.
- `src/styles/workbench.css` owns the new presentation contract after the existing stylesheet. Preserve shared component semantics and all service/native contracts.
- Shell uses dynamic viewport height and safe-area padding. Page never scrolls. Explicit inner regions handle long content, including diagnostics, forms and module UI.
- Fluid spacing and type; 760px navigation reflow; named workbench container at 720px stacks measurement/pose, lists/inspectors and settings index. A compact-height rule covers 1024x600 without hiding measurement context.
- Narrow controls are at least 44px. History keeps aligned columns in an inner horizontal scroller; no data columns are silently discarded. Pagination remains unchanged.
- Verify 360x800, 390x844, 768x1024, 1024x600 and 1920x1080 in light/dark, long names, demo banner, disconnected/holding/alarm, populated lists, review, settings and module panes. Native WebView2/DPI, touch keyboard, Android and hardware acceptance remain separate from CI.

The current user request authorizes design changes despite the older Gemini-only delegation in `AI_CODING_RULES.md` §1.1. No native sizing rules or clinical calculations are changed.
