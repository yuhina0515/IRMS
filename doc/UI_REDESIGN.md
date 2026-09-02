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

## Shell (Phase 3, revised 2026-09-02 for dual-layer nav)

```
┌────────────┬─────────────────────────────────────────────────────┐
│  [≡] IRMS  │ [logo] IRMS.        ● Disconnected   [☀/🌙][Connect] │ <- TopHeader
│            ├─────────────────────────────────────────────────────┤
│ ▸Dashboard │      ( Dashboard │ Actions │ History │ Settings )     │ <- top segmented control
│  Actions   ├─────────────────────────────────────────────────────┤
│  History   │                                                      │
│  Settings  │                    active section's bento grid       │
│            │                                                      │
└────────────┴─────────────────────────────────────────────────────┘
  Sidebar        .app-column (TopHeader / segmented-row / main)
```

`BottomBar.tsx` / `LiquidKnob`-driven pill nav from the original teardown is retired — replaced
first by the top segmented control alone (Phase 4(1)), then joined by `Sidebar.tsx` per the
2026-09-02 design handoff ("採用,新增側邊欄+頂部雙層導覽"). Both nav surfaces drive the same
`useUiStore` `view` state and stay in sync — clicking either updates both. `TopHeader` keeps its
job (identity + connection state + theme toggle) unchanged in role.

**Note for the mobile prep (see coding log for 2026-09-01 pt.2):** this shell already assumes a
narrow-viewport-first layout (segmented control instead of a bottom bar reads fine at phone width;
a bottom bar would have needed a native tab-bar equivalent anyway). That's a happy accident, not a
substitute for actual mobile interaction design — see that section for what's still open.

## Dashboard — highest density, 25Hz live data

Not everything gets exploded into separate always-visible bento cells — the secondary
visualization (chart/3D/2D/detail) stays a single card with an internal switcher, same pattern as
today's tabs, just re-skinned. Exploding it into 4 permanent cards would blow the layout budget on
narrow viewports for content only one of which is useful at a time.

```
┌────────────────────────────────┬───────────────────┐
│  PRIMARY METRIC GAUGE (large)   │  Progress/Reps     │
│  target-zone arc + coach hint   │  ring              │
│                                  ├───────────────────┤
│                                  │  Session controls  │
├──────────────┬───────────────────┴───────────────────┤
│  Secondary visualization card (chart/3D/2D/detail,     │
│  internal tab switcher — same pattern as today)        │
└─────────────────────────────────────────────────────┘
```

## Actions — browse/select

```
┌────────────────────────────────────────────────────┐
│  [ Search actions...              ]      [+ New]     │
├───────────┬───────────┬───────────┬──────────────────┤
│ card       │ card       │ card      │ card             │  <- equal-size bento cells,
└───────────┴───────────┴───────────┴──────────────────┘     column count responsive
```

## History — deliberately NOT bento

A chronological session log reads as a list, not independent cards — forcing it into bento grid
would be applying the archetype where the content shape doesn't fit it. Keep a row-based list;
selecting a row opens the existing analysis modal.

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
