You are acting as a senior product designer reviewing a real, reproducible UX issue found during
testing, not requesting a fresh design from scratch — the fix could be "this tradeoff is fine,
leave it," and that's a legitimate answer.

**What the app is:** IRMS (智慧復健監測系統) — see `01-progressive-card-density.md` in this same
folder for full app context; this file assumes you've read that one's opening section.

**The finding:** on every screen (Dashboard, Actions, History, Settings), when the sidebar is in
its **expanded** state (220px), it visually overlaps and hides roughly the left 164px of the page
content — including the page's own `<h2>` title text. Confirmed via real screenshots at three
window sizes (1280×820, 1600×900, 1024×600) on 2026-09-11: the overlap is identical at every size,
so it's not a responsive-layout bug, it's a permanent property of the current sidebar
implementation whenever it's expanded.

**Why it happens (already diagnosed, not something you need to re-derive):**
`tailwind.css`'s `.app-column` reserves `margin-left: 56px` — the **collapsed** sidebar's width —
permanently, regardless of the sidebar's actual current state. `.sidebar` itself is
`position: absolute`, `width: 220px` when expanded, so the extra 164px (220 − 56) overlays on top
of `.app-column`'s content instead of pushing it sideways. This was a deliberate 2026-09-05
decision (comment in the CSS explains it): making the sidebar a flex sibling that actually resizes
`.app-column` caused the Dashboard's container-query grid to flicker between layout presets during
the 250ms expand/collapse transition, since the container's width would sweep through the
Dashboard's breakpoints. The overlap-instead-of-push behavior was accepted as the trade-off to
keep that transition smooth.

**The concrete cost of that trade-off**, now that it's been seen on real screenshots rather than
just reasoned about: the page title (`<h2>` in `.page-header`, e.g. "Guided Monitoring", "General
一般") is genuinely unreadable — not stylistically busy, actually visually cut off — for as long as
the sidebar is expanded, on every screen, at every window size. A first-time user has no way to
know what screen they're looking at from the title alone while the sidebar (which defaults to
expanded) is open.

**What's already decided, don't relitigate:**
- The technical cause and the reason the trade-off was made are both settled (above) — you don't
  need to re-diagnose why it happens.
- The Dashboard's container-query flicker problem during sidebar transitions is real and any fix
  must not reintroduce it.

**What's genuinely open — this is the actual ask:**
- Is this trade-off actually acceptable, now that its visual cost is concretely visible in the
  attached screenshots? You're allowed to say yes and leave it — the sidebar defaults to expanded
  but the user can collapse it, and returning users likely learn to collapse it or simply already
  know which screen they're on without reading the title.
- If it's not acceptable, what should change? Some directions, not prescribing one:
  - Give the page title enough left padding/margin to clear the *expanded* sidebar's full 220px
    (not just the collapsed 56px), accepting that the title sits further right when the sidebar is
    collapsed too (simpler, but "wastes" ~164px when collapsed).
  - Make only `.page-header` (not the whole `.app-column`) responsive to the sidebar's expanded
    width, via a CSS variable toggled on `.app` rather than a fixed margin, so the rest of the page
    grid still doesn't resize/flicker but the title specifically re-flows.
  - Something else — your call, you have more design vocabulary for this than a two-option list.

**Deliverable I need back:** a decision (keep as-is, or a specific fix direction) with reasoning.
If a fix, describe it concretely enough to implement (which element gets which CSS change) — a
mockup isn't necessary for this one unless you think the fix needs one to communicate.

**Screenshots attached** (this folder, taken 2026-09-11 at 1280×820): `dashboard_1280x820.png`,
`settings_1280x820.png`, `actions_1280x820.png` — the cropped title text ("...oring" for "Guided
Monitoring", "...ns" for "Actions") is visible in each; the sidebar is in its expanded state in
all three.
