You are acting as a senior product designer for a real desktop application's primary navigation.
I'm attaching a fresh screenshot of the full app window — the left sidebar (Dashboard / Actions /
History / Settings) is what this brief is about, and **only** what this brief is about.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app pairing with **exactly one** wearable BLE sensor unit (strapped to a patient's
thigh and shin) during physical therapy. Clinical tool, "data console" tone. See
`doc/gemini-handoff-20260902/` for the established visual direction this inherited from (dense,
high-tech, no Apple/glass language, bento-grid cards for dashboard-style screens).

**Scope guardrail — read this before anything else:** a previous attempt at this same brief came
back as an image of a generic dashboard template (fabricated "Performance Graph" panels, a
multi-device "Device Connectivity" list with invented sensor names, garbled label text) that had
nothing to do with either the real app or the actual ask. That is exactly what this revision exists
to prevent:
- This app has ONE sensor, not several. Never invent additional devices, panels, metrics, or data
  widgets that aren't listed in this document.
- The scope is the **sidebar only** — a persistent left rail containing exactly 4 items (see
  below). Do not redesign, illustrate, or propose changes to the main content area, the Dashboard's
  cards, or any other screen. If a mockup shows anything besides the sidebar itself (plus, at most,
  a plain placeholder rectangle standing in for "the rest of the app"), that mockup is out of scope
  and should be discarded even if you already generated it.
- If you're not confident you can render small UI text/icons accurately in a generated image, skip
  the image entirely and rely on the written spec below instead — a precise written spec that gets
  implemented faithfully is more useful than an image with illegible or fabricated text.

**Current state, honestly:** the sidebar is functional and unstyled beyond inheriting the app's
base card/button treatment — a vertical list of icon+label rows, active item highlighted with the
accent color as background. It has not had a dedicated design pass. Four items only, all always
visible (no collapsing, no nesting) — this app is small enough that a flat 4-item list may
genuinely be correct; don't assume it needs to become a fancier IA structure just because more
elaborate nav patterns exist.

**The exact 4 items, in order (this is the entire nav — do not add, remove, or rename any):**
1. Dashboard — live session/measurement view
2. Actions — CRUD list of configured exercise/movement templates
3. History — past session records
4. Settings — device/calibration/app preferences

**Current source (`Sidebar.tsx`), for exact structure:**
```tsx
<nav className="sidebar">
  {NAV.map(({ id, label, Icon }) => (
    <button key={id} className={`sidebar-item${view === id ? ' active' : ''}`} onClick={...}>
      <Icon />
      <span>{label}</span>
    </button>
  ))}
</nav>
```

**What's already decided, don't relitigate:**
- Four top-level destinations, flat list, always visible: Dashboard, Actions, History, Settings.
  Not proposing new destinations or restructuring the IA here — that's a separate, bigger
  conversation this project isn't having right now.
- Sidebar stays a persistent left rail, not a hamburger/drawer — this is a desktop app used at a
  fixed workstation during a session, not a space-constrained mobile context (yet — see the
  separate adaptive-layout brief if the user shares it with you for how mobile/tablet might work
  later).

**What's genuinely open:**
- Visual treatment of the active/selected item — currently a flat accent-color background fill.
  Is that right for this tone, or does it want the same "glow" treatment (`shadow-glow-accent`)
  used elsewhere in the app for "active/ON" state, or something else entirely?
- Icon style — check what's currently rendering (simple line icons) and whether they read as
  professionally designed or as default/placeholder.
- Spacing/density — is the current rhythm between items too loose, too tight, or fine?
- Whether the sidebar needs any visual anchor at top (app branding currently lives in the title
  bar, not the sidebar — should the sidebar have its own identity marker, or is that redundant?)
- Hover and focus states for unselected items.
- The `liquid-knob` sliding indicator component already exists in this codebase (used for tab
  switchers elsewhere — a physics-based sliding highlight that morphs between selected items,
  draggable). Should the sidebar's active-item indicator use this same mechanism for consistency,
  or does a vertical persistent nav rail call for a different, more static treatment than a
  horizontal tab switcher?

**Deliverable I need back — in this priority order:**
1. **Required: a written spec.** Exact hex/token values, icon descriptions precise enough to
   redraw as SVG, spacing/sizing (px or rem), every interaction state (default/hover/active/focus).
   This is what actually gets implemented — treat it as the real deliverable.
2. **Optional: a mockup image**, sidebar only (see scope guardrail above), if and only if you're
   confident it will accurately reflect the written spec rather than introduce new elements the
   spec doesn't mention. If in doubt, omit it — a missing image costs nothing; a misleading one
   costs implementation time spent chasing a design that was never actually specified.

**Current tokens in code** (CSS custom properties, RGB triplets — dark is `:root`, light is
`.theme-light`; same set the title bar brief uses, inlined here so this conversation is
self-contained):
- Dark: canvas `#020617`, surface `#0f172a`, surface-raised `#1e293b`, border `#334155`,
  text `#f8fafc`, text-dim `#cbd5e1`, text-muted `#94a3b8`, accent `#22d3ee`,
  accent-strong `#06b6d4`, success `#34d399`, warning `#fbbf24`, danger `#f87171`.
- Light: canvas `#f8fafc`, surface `#f1f5f9`, surface-raised `#e2e8f0`, border `#e2e8f0`,
  text `#020617`, text-dim `#475569`, text-muted `#64748b`, accent `#0284c7` (sky-600),
  success emerald-700, danger red-700 (exact hexes in `tailwind.css` if you have repo access).
- Font: Inter Variable. Radius: `0.75rem` (cards), `0.375rem` (buttons/inputs).
- Existing glow tokens (dark theme only — a glow on the light theme's pale canvas just reads as a
  blur artifact, not an instrument light, so this app deliberately skips it there): `shadow-glow-accent`,
  `shadow-glow-success` — a soft box-shadow marking "active/ON" state instead of a flat color change.
- Sidebar container today: `w-48` (192px) fixed width, `p-3` padding, `gap-1` between items,
  `bg-surface` background, `border border-border`, `rounded-card` corners.

**What to screenshot before sending this:** the full app window with the sidebar visible, ideally
on the Dashboard view (most content-dense, shows the sidebar next to real page content), in both
light and dark theme. Attach the actual screenshot file to this conversation — don't describe it in
words only, and don't proceed without one.
