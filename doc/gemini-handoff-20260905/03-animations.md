You are acting as a senior product designer/motion designer auditing a real desktop application's
existing animation and motion language. Unlike the other briefs in this round, I'm not asking you
to design something from a placeholder — this app already has a deliberate, somewhat elaborate
motion system, and I want your read on whether it's actually earning its complexity, plus a spec
for anything you'd change.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app pairing with a wearable BLE sensor during physical therapy. Clinical tool,
"data console" tone. See `doc/gemini-handoff-20260902/` for the established visual direction.

**What exists today (be specific in your audit, don't just eyeball the screenshot):**
- **Tab switchers** (Dashboard's chart/detail-numbers and 3D/2D pose toggles) use a custom
  `useLiquidKnob` hook: a sliding indicator that morphs between selected tab positions, can be
  physically grabbed and dragged (pointer-tracked, snaps to nearest item on release, stretches
  along the drag axis proportional to velocity — `STRETCH_MAX = 1.4`, up to 40% stretch), and does
  a spring-back "stretch" bounce (`knob-stretch-x`/`knob-stretch-y` keyframes, 0.42s
  `cubic-bezier(0.25, 1, 0.5, 1)`) when it lands on a new selection via click (not drag).
- **Dropdowns** (`GlassDropdown`) grow/shrink open (`dropdown-grow`/`dropdown-shrink`, ~0.2s) with
  a separate faster fade for the menu contents (`dropdown-fade`/`dropdown-fade-out`, ~0.1s).
- Toasts and confirm dialogs exist (`useUiStore`) — check their current transition behavior in the
  running app; this brief doesn't have their exact timing curves documented, audit them live.

**What's already decided, don't relitigate:**
- The liquid-knob drag-to-switch interaction itself is staying — it's a distinctive, deliberately
  built interaction, not accidental complexity. The question is tuning/polish, not "should this
  exist."
- No Apple/iOS-style spring physics that overshoot bouncily — this app's tone is precision
  instrument, not playful consumer app (per the existing "no Apple/glass language" rule).

**What's genuinely open:**
- Are the current timing values (0.42s knob stretch, 0.22s dropdown grow, 0.1-0.16s fades) actually
  well-tuned for a "precision instrument" feel, or do they read as too slow/too bouncy/too abrupt?
  Give concrete replacement numbers if you'd change them, not just "faster" or "snappier."
- Is there a consistent easing-curve *language* across the app right now, or does each animation
  use an ad-hoc curve? If inconsistent, propose a small standard set (e.g. one curve for
  enter/appear, one for exit/dismiss, one for physical/spring-like interactions) and which existing
  animations should move to which.
- Toast and confirm-dialog entrance/exit — audit what exists live in the app and tell me if it's
  consistent with the rest of the motion language or feels bolted-on.
- Whether any *new* animation is missing — e.g. does the Dashboard's real-time gauge/chart update
  smoothly enough, does connecting/disconnecting a device have any transition feedback, does the
  new custom title bar's maximize/restore need a transition?
- Reduced-motion consideration — does this app need a `prefers-reduced-motion` fallback given its
  clinical-tool context (some users may be sensitive to motion), and if so what should degrade vs.
  what's load-bearing (e.g. the liquid-knob's position change is informational, not decorative).

**Deliverable I need back:** a written audit (this brief doesn't need mockup images — motion isn't
static) with concrete replacement timing/easing values for anything you'd change, organized by
component, plus your answer on the reduced-motion question. I'll implement whatever you produce
faithfully in code.

**What to do before sending this:** actually interact with the running app for a few minutes —
click and drag the Dashboard's tab switchers, open a dropdown, trigger a toast, open a confirm
dialog — rather than judging from a static screenshot. If you're a text-only Gemini conversation
without live access to the running app, ask the user to describe or screen-record these
interactions instead of guessing at their feel from the keyframe values above.
