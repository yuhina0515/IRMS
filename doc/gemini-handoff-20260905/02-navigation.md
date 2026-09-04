You are acting as a senior product designer for a real desktop application's primary navigation.
I'm attaching a fresh screenshot of the full app window — the left sidebar (Dashboard / Actions /
History / Settings) is what this brief is about.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app pairing with a wearable BLE sensor during physical therapy. Clinical tool,
"data console" tone. See `doc/gemini-handoff-20260902/` for the established visual direction this
inherited from (dense, high-tech, no Apple/glass language, bento-grid cards for dashboard-style
screens).

**Current state, honestly:** the sidebar is functional and unstyled beyond inheriting the app's
base card/button treatment — a vertical list of icon+label rows, active item highlighted with the
accent color as background. It has not had a dedicated design pass. Four items only, all always
visible (no collapsing, no nesting) — this app is small enough that a flat 4-item list may
genuinely be correct; don't assume it needs to become a fancier IA structure just because more
elaborate nav patterns exist.

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

**Deliverable I need back:** a concrete mockup image of the redesigned sidebar (both themes if you
think they should differ), plus exact spec: hex/token values, icon descriptions precise enough to
redraw as SVG, spacing/sizing, all interaction states (default/hover/active/focus). I'll implement
whatever you produce faithfully in code.

**Current tokens in code:** same token set as the title bar brief (`01-titlebar.md`) — ask the user
for that file's token block if you're being run as a standalone conversation without it, or see
`tailwind.css`/`tailwind.config.js` directly if you have repo access.

**What to screenshot before sending this:** the full app window with the sidebar visible, ideally
on the Dashboard view (most content-dense, shows the sidebar next to real page content), in both
light and dark theme.
