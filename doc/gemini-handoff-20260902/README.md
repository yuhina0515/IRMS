# IRMS UI Handoff for external design tools (2026-09-02)

Second handoff package (first was 2026-08-20, `doc/gemini-handoff-20260820/`). That round
polished the old "Apple Liquid Glass" language. This round is different: **that whole visual
language has been retired** (see `ROADMAP.md` — the direction and rationale are settled; what's
missing is execution quality, not direction). Screenshots here are the in-progress replacement,
captured live from the running dev build — nothing is mocked. The ask this time is blunt: the
color/typography/spacing values are individually "correct" (real Tailwind palette hex codes,
WCAG-checked contrast) but the composition still reads as generic/AI-made. This package exists to
get a real designer's eye (human or a dedicated design-generation tool) on it before more code
gets written on top of a weak foundation.

## What IRMS is

智慧復健監測系統 (Smart Rehabilitation Monitoring System) — an Electron + React + TypeScript
desktop app that pairs with an ESP32 wearable (BLE) worn on a patient's leg. It shows real-time
joint-angle guidance during rehab exercises, lets a therapist define custom exercise templates,
and keeps a session history for review/export. Not a consumer app — legibility and unambiguous
status color-coding (green=in range, orange=warning, red=danger/over-limit) take priority over
decoration, but "priority over decoration" doesn't mean it has to look unstyled.

## The settled direction (don't re-litigate this — refine within it)

- **No more Apple/Liquid Glass anything.** No frosted blur, no pill-shaped buttons/nav, no soft
  pastel gradients. That entire language is archived (`legacy-ui-liquid-glass` git branch /
  `ui-v1-liquid-glass-archive` tag in `IRMS_App`) and is a closed question, not a design option.
- **Tone: dense, high-tech data console** — closer to a monitoring instrument or a lab/industrial
  control panel than a wellness app. Think measurement and instrumentation, not comfort.
- **Light vs. dark is explicitly open — don't assume dark.** Earlier rounds locked this to a
  single fixed dark theme; that lock is lifted. The screenshots below are dark simply because
  that's what's currently implemented, not because dark is the answer. If a light (or light+dark)
  version of this same data-console tone reads better, propose it. What's still true: whatever is
  chosen should be one deliberate, coherent system — this isn't reopening "bring back the
  user-selectable style-profile switcher," it's "don't treat dark as a foregone conclusion."
- **Bento-grid card layout** for dashboard-style screens (confirmed direction, not up for debate).
  Whether every screen forces bento is open — History (a chronological list) was deliberately kept
  as a plain list instead of bento cards; that judgment call itself can be revisited if a designer
  has a better idea, but the reasoning ("does bento fit this content's actual shape") should carry
  over even if the specific call changes.
- **Single-page shell**: no more separate windows/routes between sections — one shell (top header
  + a segmented control switcher) with one section visible at a time. This part is implemented and
  functionally settled; visual polish of the segmented control itself is fair game.

What's actually being asked for: layout rhythm, spacing scale, visual hierarchy, color harmony
(not just individually-valid hex codes), and whatever specific polish makes this data-console UI
read as **deliberately, professionally designed** rather than "theme + rounded rectangles" —
regardless of whether the answer ends up light or dark.

## Current visual language (what exists right now — the baseline to improve on)

Currently implemented as dark (see the theme note above — this is what exists today, not a
constraint on what comes back). Color tokens (`IRMS_App/tailwind.config.js`,
`theme.extend.colors`) — all literal values from Tailwind's own official palette, not invented:

| token | role | value | Tailwind source |
|---|---|---|---|
| `canvas` | app background | `#020617` | slate-950 |
| `surface` | card/panel background | `#0f172a` | slate-900 |
| `surface-raised` | modal/dropdown/elevated layer | `#1e293b` | slate-800 |
| `border` | hairline stroke | `rgba(148,163,184,.16)` | slate-400 @ 16% |
| `text` / `text-dim` / `text-muted` | text hierarchy | `#f1f5f9` / `#cbd5e1` / `#94a3b8` | slate-100/300/400 |
| `accent` / `accent-strong` | primary interactive | `#22d3ee` / `#06b6d4` | cyan-400/500 |
| `success` / `warning` / `danger` | status | `#34d399` / `#fbbf24` / `#f87171` | emerald/amber/red-400 |

Typography: `Inter Variable` for UI chrome (self-hosted, already working — no reason to change
unless the redesign specifically wants a different typeface). A `mono` token points at "JetBrains
Mono Variable" for numeric readouts (angles, reps, timers) but the actual font file isn't wired up
yet — currently falls back to system monospace.

Radius: `rounded-card` (1rem) for bento cards, `rounded-control` (0.5rem) for buttons/inputs —
rectangular, not the old 999px pill shape. Elevation via background color steps
(`surface`→`surface-raised`) + a 1px border, not drop shadows (shadows barely read against a
near-black canvas — this technique itself is presumably fine to keep, it's how Linear/Vercel/
GitHub dark mode handle it, but happy to be told otherwise).

Full component-level CSS: `IRMS_App/src/renderer/src/styles/tailwind.css` (the
`@layer components` block — this is where every class like `.panel`, `.btn-primary`, `.segmented`
etc. is actually defined).

## Screens (segmented control, in order)

1. **Dashboard — "Guided Monitoring"** (`01-dashboard.png`) — the main/live screen. Big metric
   gauge card, progress ring + session controls beside it, a tabbed secondary panel below (trend
   chart / 3D pose / 2D pose / raw numbers) — **not yet rebuilt to the bento layout**, this
   screenshot is still mostly the generic card treatment. Note the two black rectangles near the
   bottom of the gauge card — that's a known unstyled leftover (SVG element with no color applied
   yet), not something to design around, just not fixed yet.
2. **Actions — "Custom Actions"** (`02-actions.png`) — card grid of exercise templates. Also not
   yet intentionally redesigned; currently just inherits the generic `.panel`/`.cards` treatment.
3. **History — "Rehabilitation History"** (`03-history.png`) — not screenshotted with data in it
   this round (empty state). Deliberately kept as a list, not bento (see above).
4. **Settings** (`04-settings.png`) — **the one screen that's had an actual design pass**
   (two-column bento: Calibration | General, Demo Mode full-width below). Closest thing to "what
   good could look like" that exists right now — still the thing being called ugly, so take it as
   a floor to raise, not a standard to copy.

## Files to submit

**Screenshots (always include all 4):**
`01-dashboard.png`, `02-actions.png`, `03-history.png`, `04-settings.png`

**Design-system source (if the tool needs to reason about exact tokens rather than eyeball PNGs):**
- `IRMS_App/tailwind.config.js` — every color/radius/shadow token
- `IRMS_App/src/renderer/src/styles/tailwind.css` — every component class

Don't submit `.tsx` files — same rule as last time, this is for visual/art direction, not code
collaboration. Bring back whatever the tool produces (palettes, spacing specs, actual mockup
images, component references) for manual integration into the code above.
