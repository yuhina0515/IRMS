# Gemini handoff — 2026-09-05 round

Four separate design briefs, meant to be pasted into **four separate Gemini
conversations** (per the user's explicit request — don't bundle them into one
mega-ask). Each file is self-contained: app context, current tokens, what's
decided vs. open, and the expected deliverable, following the same format as
`doc/gemini-handoff-20260902/PROMPT.md`.

- `01-titlebar.md` — visual redesign of the now-functional custom title bar
  (frame:false + our own minimize/maximize/close buttons, shipped 2026-09-04;
  see `doc/coding log/log_20260904_*` for the plumbing — this brief is about
  how it should *look*, not how it works).
- `02-navigation.md` — sidebar nav visual redesign. **Revised 2026-09-05** after the first attempt
  came back as a single generic dashboard-template image (fabricated multi-device panel, garbled
  text, scope drift into the main content area) instead of a sidebar-focused spec — see
  `doc/coding log/log_20260905_titlebar_visual_gemini_mockup.md` for the diagnosis. The revision
  inlines the token block (no longer depends on cross-conversation memory of `01-titlebar.md`),
  adds an explicit scope guardrail (sidebar only, single real sensor, no invented panels), and
  makes the written spec the required deliverable with the mockup image demoted to optional.
- `03-animations.md` — the app's existing animation/motion language (liquid
  knob tab indicator, morph/stretch physics, toasts, dialogs) — audit + spec
  for what should carry forward vs. change.
- `04-adaptive-layout.md` — the bigger one. Folds together the user's #2
  ("no scrolling on Dashboard regardless of window size, planning ahead for
  Android/iOS/iPadOS/macOS/watchOS") and #4 ("we need a system so we stop
  hand-tuning px/vh constants every time") requests. This is an actual
  information-architecture question, not a visual skin question — expect a
  longer, more structural answer from Gemini here than the other three.

**Before sending each:** attach a fresh screenshot per that file's "what to
screenshot" note — none are embedded here, since taking them fresh (rather
than reusing this session's now-deleted scratch captures) takes the user
seconds and guarantees Gemini sees the actual current state, not a stale one.

**After Gemini responds:** implement directly per the standing
`feedback_irms_ui_design_delegated_to_gemini` convention — don't loop back to
the user for design-merit confirmation, only for genuine technical
infeasibility.
