You are acting as a senior product designer for a real desktop application's window chrome. I'm
attaching a fresh screenshot of the top-left corner (logo + connection status + theme toggle +
Connect Device button) and top-right corner (minimize/maximize/close) of the current title bar.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app that pairs with a wearable BLE sensor on a patient's leg during physical
therapy. Clinical/measurement tool, "data console" tone — see `doc/gemini-handoff-20260902/` for
the established visual direction (dense, high-tech, no Apple/glass language, bento-grid cards).

**What just changed (why this brief exists now):** the title bar used to rely on Windows' native
`titleBarOverlay` — an OS-drawn strip with real OS minimize/maximize/close buttons colored to
match the theme. That's gone now; the window is fully frameless (`frame: false`) and the app draws
its *own* minimize/maximize/close buttons and its own draggable region. The plumbing is done and
working (IPC-wired, drag region correct, double-click-to-maximize works) — what you're looking at
in the screenshot is placeholder styling: plain monochrome line-icon buttons, default hover state
(background color step + close button turns red on hover). This brief is purely about how it
should *look*, not how it works.

**What's already decided, don't relitigate:**
- The three buttons must stay minimize / maximize-or-restore / close, in that order, top-right.
- The bar must remain draggable (window move) except where interactive elements sit.
- No native OS chrome is coming back — whatever you design has to be buildable as HTML/CSS/SVG
  inside the existing React component (`TopHeader.tsx`).

**What's genuinely open:**
- Icon design for the three buttons — the current ones are bare geometric line icons (a dash, a
  square outline, an X). Should they be more custom/branded, or is minimal-geometric actually
  correct for this "instrument panel" tone?
- Hover/active/focus states — current hover is just `bg-surface-raised` (a background color step)
  plus red-on-hover for close. Is that enough, or does a data-console app want something with more
  presence (a glow, per the existing `shadow-glow-accent`/`shadow-glow-success` tokens already used
  elsewhere for "active/ON" elements)?
- Whether the logo/connection-status/theme-toggle/Connect-Device cluster on the left needs any
  visual adjustment now that it's sharing the bar with real window controls on the right, or
  whether it's fine as-is.
- Bar height, padding, and whether the whole bar should visually read as "part of the app" (current
  approach: `bg-surface` matching card backgrounds) or as a distinct "OS-chrome-replacement" strip
  with its own visual treatment.

**Deliverable I need back:** a concrete mockup image of the redesigned title bar (both light and
dark theme if you think they should differ), plus exact spec: hex/token values, icon paths or
descriptions precise enough to redraw as SVG, spacing, hover/active state values. I'll implement
whatever you produce faithfully in code.

**Current tokens in code** (CSS custom properties, RGB triplets — dark is `:root`, light is
`.theme-light`):
- Dark: canvas `#020617`, surface `#0f172a`, surface-raised `#1e293b`, border `#334155`,
  text `#f8fafc`, text-dim `#cbd5e1`, text-muted `#94a3b8`, accent `#22d3ee`,
  accent-strong `#06b6d4`, success `#34d399`, warning `#fbbf24`, danger `#f87171`.
- Light: canvas `#f8fafc`, surface `#f1f5f9`, surface-raised `#e2e8f0`, border `#e2e8f0`,
  text `#020617`, text-dim `#475569`, text-muted `#64748b`, accent `#0284c7` (sky-600),
  success emerald-700, danger red-700 (exact hexes in `tailwind.css` if you need them).
- Font: Inter Variable. Radius: `0.75rem` (cards), `0.375rem` (buttons/inputs) — the title bar
  currently uses square corners (0), which may or may not be intentional.
- Existing glow tokens (dark theme only): `shadow-glow-accent`, `shadow-glow-success` — a soft
  box-shadow used elsewhere to mark "active/ON" state instead of a flat color change.

**What to screenshot before sending this:** open the app, capture the full top bar (logo through
close button) in both light and dark theme — `Settings` has the theme toggle if you need to switch.
