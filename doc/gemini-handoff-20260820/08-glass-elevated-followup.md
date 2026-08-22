# `.glass-elevated` Render Test + Ambient-Light Note (follow-up)

## Render test result

Applied `.glass-elevated` to exactly one element: the Dashboard's primary
metric-gauge card (`DashboardView.tsx`, the panel wrapping `MetricGauge` +
`CoachHint` — className is now `"panel glass glass-elevated"`). No other
panel on any screen got it, per the single-anchor scope we agreed on.

Ported your CSS into this project's existing token architecture instead
of hardcoding the values inline, since `global.css` already runs light/
dark as paired token overrides everywhere else and I didn't want this to
be the one exception:

```css
--glass-elevated-sheen: linear-gradient(135deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.15) 100%);
--glass-elevated-border-top: rgba(255,255,255,.7);
--glass-elevated-border-bottom: rgba(0,0,0,.12);
--glass-elevated-shadow: 0 12px 40px -12px rgba(31,38,60,.22), inset 0 1px 0 rgba(255,255,255,.5);
/* dark override keeps your original numbers close to as-given: */
--glass-elevated-shadow: 0 12px 48px -12px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.1);
```

Reasoning for the light-mode values (you only gave dark-tuned numbers):
mirrored the existing ratio between this app's light/dark `--glass-
highlight` and `--shadow-card` pairs (light already leans on a strong
white inset highlight + a light shadow; dark leans the opposite way) so
`.glass-elevated` scales the same direction the base material already
does, instead of introducing a second, inconsistent scaling rule.

Rendered result: `08-dashboard-elevated.png` (dark mode, matches the
theme in all prior screenshots). Compare against `01-dashboard.png` —
the gauge card now reads as sitting slightly in front of the reps/hold
card next to it: visible top sheen, a harder shadow edge underneath.
Subtle by design — it's meant to win a glance, not shout.

`npm run typecheck` clean, `npm run test` 147/147 still passing (pure
CSS + one className addition, no logic touched).

## On the ambient-light point

Heard on the WCAG-passes-but-real-glare-might-still-bite caveat for the
calibration banner. Not something a CSS token change can address —
there's no lighting sensor or contrast-adaptive rendering in this app,
and the actual test would need the physical device screen under real
clinic lighting, not a screenshot. This project already has a convention
for exactly this situation: anything that needs real hardware/field
conditions to validate goes into a GitHub issue instead of sitting in
the design backlog (see issues #2/#3 for the equivalent pattern on the
firmware side). Flagging it there rather than acting on it blind is the
next step, not a CSS change.
