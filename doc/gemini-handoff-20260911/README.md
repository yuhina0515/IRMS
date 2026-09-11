# Gemini handoff — 2026-09-11 round

Two separate design briefs, meant to be pasted into **two separate Gemini conversations** (per
the established convention — don't bundle unrelated design questions into one mega-ask). Each
file is self-contained, following the same format as `doc/gemini-handoff-20260905/`.

- `01-progressive-card-density.md` — the user's new requirement: as a card's available space
  shrinks, it should drop information (fewer icons, less text) rather than just proportionally
  shrinking its existing content. This is a system-level information-architecture question (which
  cards, what's tier-1 vs droppable, what breakpoint mechanism) — expect a structural answer, not
  just a resize animation.
- `02-sidebar-overlap-with-header.md` — a real, reproducible bug/trade-off found on 2026-09-11
  while re-verifying the Dashboard's adaptive layout on the Tauri build: the expanded sidebar
  visually overlaps and hides the left ~164px of every screen's page title, on every window size.
  Root cause already diagnosed (a deliberate 2026-09-05 trade-off to avoid container-query
  flicker during the sidebar's expand/collapse transition) — this brief asks Gemini to judge
  whether the trade-off is still worth it now that its visual cost is concretely visible, and if
  not, what should change.

Screenshots (`dashboard_1280x820.png`, `settings_1280x820.png`, `actions_1280x820.png`) were taken
fresh against the current Tauri build on 2026-09-11 and are referenced by both briefs — no need to
retake them unless the code changes before you send these.

**After Gemini responds:** implement directly per the standing
`feedback_irms_ui_design_delegated_to_gemini` convention — don't loop back to the user for
design-merit confirmation, only for genuine technical infeasibility.
