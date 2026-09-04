You are acting as a senior product designer/UX architect for a real desktop application that is
about to become a cross-platform family of apps. This is a bigger, more structural ask than a
visual skin pass — I need an actual system, not a mockup.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app pairing with a wearable BLE sensor on a patient's leg during physical
therapy, showing real-time joint-angle feedback (a gauge, a trend chart, a 3D/2D pose view, a
progress ring, a numeric detail grid) on a single "Dashboard" screen. Clinical tool, "data
console" tone — see `doc/gemini-handoff-20260902/` for the established visual direction (dense,
high-tech, bento-grid cards, no Apple/glass language).

**The concrete, immediate problem:** the Dashboard must never require scrolling to see its content,
at *any* window size the app is resized to — a therapist glancing at real-time feedback during an
exercise shouldn't have to scroll. This has been "solved" so far by hand-tuning CSS `min()`/`clamp()`
px-and-vh constants per element (gauge max-size, ring size, cockpit panel min-height, grid column
ratios) every time a new window-size/content-visibility combination breaks. It keeps breaking:
- 2026-09-03: got it working at the app's default 1280×820 and a wide 1600×900, but explicitly
  *punted* on a 1093×614 "worst laptop" case (still scrolls) and the <900px-width breakpoint
  (still scrolls) as "needs bigger IA changes, not more px tuning."
- 2026-09-04: made the Dashboard's trend-chart and 3D/2D-pose panels default-hidden (Settings
  toggles to re-enable). This *removed* content, and STILL broke — a `min(260px, 30vh)` height
  floor on the cockpit region, tuned for the old two-panel layout, didn't account for a
  conditionally-shown warning banner (~61px) that appears on first launch, and overflowed the page
  by 17.6px at the exact default window size. Fixed by shrinking the floor to another hand-picked
  number (`min(200px, 24vh)`) — which is itself just the same kind of guess, now smaller.

The pattern: every new combination of (window size) × (which optional panels are visible) ×
(which conditional banners are showing) is its own hand-tuned magic number, and nobody can predict
in advance which combinations will overflow. This needs a real system, not more guessing.

**The bigger context you're being asked to design for:** the desktop app is planned to expand to
Android, iOS, iPadOS, macOS, and watchOS. I am NOT asking you to design all five platforms today —
watchOS in particular is a fundamentally different interaction model (tiny glanceable screen,
likely no precise pointer, possible digital-crown input) and deserves its own dedicated
conversation later, not a bolt-on to a desktop CSS system. What I need from *this* brief is: a
layout system whose *principles* would still make sense when a phone/tablet/watch target
eventually gets designed, even though you're only asked to fully solve desktop today.

**What's already decided, don't relitigate:**
- No scrolling on the Dashboard specifically (other screens — Settings, Actions, History — are
  fine to scroll; they're forms/lists, not real-time glanceable displays).
- Bento-grid card language stays for desktop.
- The Dashboard's current content set: primary gauge + coach hint card, session control panel with
  a progress ring, and an optional "cockpit" area (trend chart OR detail-number grid on the left,
  3D pose OR 2D pose on the right — both now hidden by default per Settings toggles).

**What's genuinely open — this is the actual ask:**
- A real sizing methodology to replace ad-hoc `min(Npx, Mvh)` constants — container queries?
  A fixed set of named breakpoint "layout presets" (e.g. "full", "compact", "minimal") that each
  explicitly define what's visible and how, rather than the same layout shrinking continuously?
  Fluid typography/spacing via `clamp()` driven by a *documented* formula instead of trial-and-error
  numbers? Your call — I want a defensible system, not a specific technique prescribed in advance.
- What should happen at genuinely tiny sizes (sub-900px width, sub-620px height) — collapse the
  cockpit area into a single scrollable-on-purpose section instead of fighting to fit it? Hide it
  behind a toggle/expand affordance? Reduce to gauge-only? Give an explicit answer for the smallest
  size the app should support, not just "make it responsive."
- How conditionally-rendered content (warning banners, optional panels toggled in Settings) should
  be accounted for by the system *by construction*, so adding a new conditional element later
  doesn't require re-discovering another overflow bug the way the calib-chip banner did.
- Loosely, what principles from this system would carry over to a phone-sized or watch-sized
  screen later — not a full design, just enough that today's desktop system isn't accidentally
  desktop-only in its assumptions.

**Deliverable I need back:** a written specification of the sizing system (not just prose — actual
formulas/breakpoint definitions/pseudo-code I can translate into CSS), plus an explicit answer for
what the Dashboard looks like at: the app's default size (1280×820), a small laptop
(1093×614 — this one has never been solved), and the narrowest width the app should support
(current hard floor is 1024×600, `MIN_WIDTH`/`MIN_HEIGHT` in `main/index.ts`). Mockup images for
those three sizes would help but the system spec is the actually load-bearing part of this
deliverable.

**Current relevant tokens/constants in code:**
- Window floor: `MIN_WIDTH = 1024`, `MIN_HEIGHT = 600` (`main/index.ts`).
- Default window size: `min(1280, workAreaWidth) × min(820, workAreaHeight)`.
- Existing breakpoint: `@media (max-width: 900px)` collapses the cockpit's two-column grid to one
  column (still scrolls below this width — unsolved).
- Card radius `0.75rem`, control radius `0.375rem`, spacing follows Tailwind's default scale.
- Color tokens: same set as `01-titlebar.md` if you need them for mockups.

**What to screenshot before sending this:** the Dashboard at three window sizes if you can resize
the app window — default (1280×820), the app's actual `MIN_WIDTH`×`MIN_HEIGHT` floor (1024×600),
and something in between around 1093×614 if you can hit it. If resizing isn't practical, send the
default-size screenshot and describe the other two failure modes in text (they're both detailed
above).
