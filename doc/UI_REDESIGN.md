# IRMS UI Redesign — Living Design Reference

> Produced by the `craft-ui-designer` skill, phase by phase. This is a living blueprint Phase 4
> builds against — update it as decisions change, don't append a history here (that's what
> `doc/coding log/` is for). See [[HOME]] for the latest status line and links to the phase logs.

## Direction (Phase 1, confirmed 2026-09-01)

- **IA**: single view container, no bottom tab bar. A top segmented control switches which
  section is shown — still one section at a time, not everything stacked into one long scroll.
- **Tone**: high-density lab/monitoring-instrument console. Not clinical-clean, not soft/warm.
- **Visual archetype**: bento-grid cards. No Apple semantics.
- **Tokens** (Phase 2): `IRMS_App/tailwind.config.js` — `slate` neutrals, `cyan` accent,
  `emerald`/`amber`/`red` semantics, all Tailwind's official palette values. Elevation via
  surface color steps + border, not shadow. WCAG-checked (worst case 6.96:1).
  ⚠ **2026-09-02: "dark" is no longer a locked requirement** — the user pulled back the earlier
  fixed-dark-theme decision ("不要執著深色" / don't fixate on dark). The tokens above are still
  what's implemented today, but light-vs-dark is now open input for the external design pass
  (see `doc/gemini-handoff-20260902/`), not a settled constraint. Don't re-lock it to dark in
  Phase 4 work without checking what comes back from that handoff.

## Shell (Phase 3)

```
┌──────────────────────────────────────────────────────────────────┐
│ [logo] IRMS.              ● Disconnected        [Connect Device]  │ <- TopHeader, unchanged role
├──────────────────────────────────────────────────────────────────┤
│      ( Dashboard │ Actions │ History │ Settings )                 │ <- NEW: top segmented
├──────────────────────────────────────────────────────────────────┤ control, replaces BottomBar
│                                                                    │
│                    active section's bento grid                    │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

`BottomBar.tsx` / `LiquidKnob`-driven pill nav is retired with this — the segmented control is a
new component (Phase 4), not a re-skin of `BottomBar`. `TopHeader` keeps its current job
(identity + connection state) unchanged; the segmented control is a second row under it, not
merged into it — connection state needs to stay visible regardless of which section is active.

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
