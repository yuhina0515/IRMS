# IRMS UI Redesign — Living Design Reference

> Produced by the `craft-ui-designer` skill, phase by phase. This is a living blueprint Phase 4
> builds against — update it as decisions change, don't append a history here (that's what
> `doc/coding log/` is for). See [[HOME]] for the latest status line and links to the phase logs.

## Direction (Phase 1, confirmed 2026-09-01)

- **IA**: single view container, no bottom tab bar. A top segmented control switches which
  section is shown — still one section at a time, not everything stacked into one long scroll.
- **Tone**: high-density lab/monitoring-instrument console. Not clinical-clean, not soft/warm.
- **Visual archetype**: bento-grid cards. No Apple semantics.
- **Tokens** (Phase 2, superseded 2026-09-02 — see below): originally `slate` neutrals + `cyan`
  accent only, single fixed dark theme.
- **2026-09-02 — dual theme, implemented**: external design handoff (`doc/gemini-handoff-20260902/`)
  came back with two directions ("Data-Console Dark" and "Precision Lab Light"); user picked
  **both** ("兩個都走") rather than choosing one. `IRMS_App/tailwind.config.js` colors now
  resolve through CSS variables (`rgb(var(--color-x) / <alpha-value>)`); `tailwind.css` defines
  the dark set on `:root` and the light set on `.theme-light`, toggled via
  `services/theme.ts`'s `applyThemeMode()` and persisted as `settings.themeMode`. A handful of
  the handoff's light-theme hex values failed WCAG when measured (not eyeballed) and were
  deepened one Tailwind step on the same hue — see the 2026-09-02 "gemini mockup implementation"
  coding log for the exact before/after numbers. Radii tightened (card 12px, control 6px, was
  16/8) per the handoff spec, same for both themes.
- **Dual-layer nav, implemented**: user also asked to adopt the handoff's sidebar, in addition to
  (not instead of) the top segmented control — both drive the same view state and stay in sync.
  `Sidebar.tsx` (left, icon+label, reuses `NavIcons.tsx` restored from the archived branch) +
  `SegmentedControl.tsx` (unchanged from Phase 4(1)).
- **"Glow" on active elements, dark theme only**: per the handoff's "lighting" note — a soft
  accent/success box-shadow on the active nav item / sliding indicator / connected-state dot.
  Not applied in light theme (a glow on white reads as a blur artifact, not an instrument light).
- **Numeric readouts go mono**: `JetBrains Mono Variable` self-hosted, wired to number inputs so
  far (Dashboard doesn't have live readout components yet).

## Shell (Phase 3, revised 2026-09-02 — sidebar-only nav)

```
┌────────────┬─────────────────────────────────────────────────────┐
│  [≡] IRMS  │ [logo] IRMS.        ● Disconnected   [☀/🌙][Connect] │ <- TopHeader
│            ├─────────────────────────────────────────────────────┤
│ ▸Dashboard │                                                      │
│  Actions   │                                                      │
│  History   │                    active section's bento grid       │
│  Settings  │                                                      │
│            │                                                      │
└────────────┴─────────────────────────────────────────────────────┘
  Sidebar        .app-column (TopHeader / main)
```

`BottomBar.tsx` / `LiquidKnob`-driven pill nav from the original teardown is retired. Briefly went
through a dual-layer phase (sidebar + top `SegmentedControl`, both driving the same view state) per
that day's design handoff, but Gemini's own review of the real implementation called that
redundant and confusing — sidebar is now the sole primary nav, `SegmentedControl.tsx` deleted (see
2026-09-02 "ui design delegated nav cockpit" log — this project now implements Gemini's UI/IA
calls directly rather than re-litigating them with the user). `TopHeader` keeps its job (identity +
connection state + theme toggle) unchanged in role.

**Note for the mobile prep (see coding log for 2026-09-01 pt.2):** this shell already assumes a
narrow-viewport-first layout (segmented control instead of a bottom bar reads fine at phone width;
a bottom bar would have needed a native tab-bar equivalent anyway). That's a happy accident, not a
substitute for actual mobile interaction design — see that section for what's still open.

## Round 2 (2026-09-02) — real-implementation feedback loop

Fed real screenshots (not mockups) back to Gemini for critique. Landed:
- **Card padding 16px→24px, grid gaps 16px→24px** — round 1's cards read as cramped once real
  content replaced mockup placeholder text.
- **Light-theme accent shifted from cyan to sky** (`#0284c7`/`#0369a1`, bg/text roles) — Gemini's
  read was that the round-1 WCAG-darkened cyan (`#0e7490`) lost the "vibrant lab" mood. Verified
  Gemini's own proposed fix before applying it: its suggested button-bg value (sky-500 `#0ea5e9`)
  actually measured 2.77:1 with white text and failed the same bar it was meant to fix —
  substituted sky-600 (`#0284c7`, 4.10:1) instead. **Dark theme's accent stays cyan** (Gemini's
  own call, "don't fix what already passed") — the two themes now use different accent hue
  families, a real divergence, not an oversight.
- **`accent` split into two roles**: `accent` = background/button only, `accent-strong` = text/
  link (needs the darker step to stay readable as text on its own). Every `text-accent` call site
  updated to `text-accent-strong`.
- **danger deepened** red-600→red-700 (`#b91c1c`, 6.47:1) — Gemini's suggestion, verified better
  than round 1's fix.
- **success kept as-is** (emerald-700) — Gemini suggested green-700 as "better contrast," measured
  it and it's actually worse (5.02:1 vs emerald-700's 5.48:1); kept the existing value.
- **Canvas** dark→pure-white shifted to slate-50 (`#f8fafc`) per request, cosmetic.

## Dashboard — highest density, 25Hz live data

**Status (2026-09-02):** styled with the new tokens, three real pre-existing bugs fixed
(gauge/ring/2D-visualizer were reading dead CSS variable names since the 09-01 teardown — the
"two black rectangles" seen in early screenshots; `Leg3D.tsx`'s 3D view background was rendering
white because `THREE.Color()` can't parse CSS4 space-separated `rgb()` syntax, only comma syntax;
the 2D visualizer SVG had no width cap and rendered mostly off-screen — all three confirmed via
before/after screenshots), **and restructured to Gemini's always-visible 2-column "Cockpit"**
(implemented directly per the design-delegation call — see the 2026-09-02 "ui design delegated
nav cockpit" log).

The summary row (primary gauge | progress ring + session controls) is unchanged. Below it, the
old 4-way tab card (chart/3D/2D/detail) is gone — replaced by two always-visible panels, each
keeping its own small internal switcher for content Gemini's spec didn't explicitly place:

```
┌────────────────────────────────┬───────────────────┐
│  PRIMARY METRIC GAUGE (large)   │  Progress/Reps     │
│  target-zone arc + coach hint   │  ring              │
│                                  ├───────────────────┤
│                                  │  Session controls  │
├─ border-t separator, no card bg on this outer row ───┤
│  Chart panel (8 cols)            │  3D panel (4 cols)  │
│  toggle: 趨勢圖 / 詳細數值        │  toggle: 3D / 2D    │
└──────────────────────────────────┴────────────────────┘
   .cockpit-panel                    .cockpit-panel-3d
```

## Actions — browse/select (rebuilt 2026-09-02)

```
┌────────────────────────────────────────────────────┐
│  [ Search actions...              ]      [+ New]     │
├───────────┬───────────┬───────────┬──────────────────┤
│ card       │ card       │ card      │ card             │  <- equal-size bento cells,
└───────────┴───────────┴───────────┴──────────────────┘     column count responsive
```

Cards get a hover state (`border-accent` + color transition) per round-2 feedback — signals
"this is an executable template," not just a static info card. Deliberately did **not** add a
Gemini-suggested "Start" button per card — that's a new feature (jump straight to Dashboard with
this action pre-selected), not a restyle of what exists; noted for a future ask, not implemented
speculatively.

## History — deliberately NOT bento (rebuilt 2026-09-02)

A chronological session log reads as a list, not independent cards — forcing it into bento grid
would be applying the archetype where the content shape doesn't fit it. Keep a row-based list;
selecting a row opens the existing analysis modal.

Round-2 feedback agreed with this call and asked for a div-based row list; implemented as a
**styled semantic `<table>` instead** — same visual outcome (hover background shift, clear
metadata hierarchy) with real column alignment and table accessibility semantics a hand-rolled div
grid would have to reimplement. A deliberate deviation from the literal suggested markup, not the
visual intent.

```
┌────────────────────────────────────────────────────┐
│  session row  │ date │ action │ reps │ badge          │
│  session row  │ date │ action │ reps │ badge          │
│  ...                                                   │
└────────────────────────────────────────────────────┘
```

## Settings — one bento card per settings group

Only two groups now, not three — the Appearance/style-profile card is retired along with it
(Phase 4, 2026-09-02): this direction is a single fixed dark theme, there's no more light/dark
profile picker to expose. `applyStyleProfile.ts`/`styles/profiles/` are dead code left in place
for now (same treatment as `global.css`), not yet deleted.

```
┌────────────────────┬────────────────────┐
│  Calibration         │  General             │
├────────────────────┴────────────────────┤
│  Demo Mode (full width — more controls than  │
│  the other groups, doesn't fit a half cell)   │
└──────────────────────────────────────────┘
```

## Responsive breakpoints

- **Mobile (<640px)**: everything single-column. Segmented control becomes a horizontally
  scrollable pill row. Dashboard stacks in priority order: gauge → progress/reps → session
  controls → secondary-visualization card.
- **Tablet (768–1024px)**: 2-column bento where content allows (Actions, Settings). Dashboard
  keeps its 2-column split (gauge | progress+controls stacked).
- **Wide desktop (>1280px)**: layouts as sketched above; Actions can go 3–4 columns.

## Open for Phase 4

- Segmented-control component itself (visual spec + interaction states).
- Bento card base component (the shared shell: surface/surface-raised, border, `rounded-card`,
  padding scale) that every section's cards build on.
- Per-view rebuild order — not yet decided, ask before starting Phase 4.
