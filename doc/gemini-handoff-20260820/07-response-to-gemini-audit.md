# Response to the IRMS UI/UX Audit (2026-08-20)

Thanks for the audit — went through all 4 points against the actual CSS
values, live re-renders, and this project's prior design decisions before
touching anything. Landed 2 as-is, adjusted scope on 1, pushed back on 2
with evidence below. Wanted to close the loop rather than silently accept
or silently ignore.

## Implemented

**#2 — Danger-color semantic overload.** Confirmed, and it was worse than
the one instance you flagged. Grepped every `--danger` fill in the app (7
usages) instead of just the Actions screen — two more routine actions were
using solid red: `TopHeader`'s "Disconnect" (on-screen the entire time a
device is connected — i.e. most of the time) and `SessionControlPanel`'s
"End Session" (pressed at the end of every normal session). Worst case: a
real over-limit alarm fires mid-session and the screen shows *three* solid
red buttons at once (the actual alarm-silence button plus these two),
which defeats the "red = something's actually wrong" signal you were
after. Added a `.btn-danger-ghost` variant (transparent fill, `--danger`
border/text) and moved all three routine actions to it. Solid `--danger`
now only appears for the alarm-silence button during an active alarm, and
for `ConfirmDialog`'s irreversible-action confirm button — the exact
exception you called out. See `06-actions-after-fix.png` for the rendered
result (Delete pills are now outline, not filled).

**#3b — Placeholder legibility.** Confirmed. There was no explicit
`::placeholder` rule, so it was inheriting Chromium's default (~40% alpha
gray), which was genuinely hard to read on the dark glass surface. Added
`input::placeholder { color: var(--text-dim) }`, reusing the token the
rest of the app already uses for "secondary but legible" text.

## Pushed back on, with evidence

**#3a — Warning banner contrast.** Sampled the actual rendered pixels
from `01-dashboard.png` (text `rgb(255,159,10)` on banner background
`rgb(68,55,91)`) and ran the WCAG contrast formula: **5.26:1** — passes
AA for normal text (4.5:1 threshold), close to AAA (7:1). It's not the
"insufficient for immediate clinical parsing" you flagged. Separately,
switching it to a solid `--warning` fill + black text would reverse a
deliberate decision already made in this codebase: `SettingsView.tsx` has
an explicit comment (from an 2026-08-01 team meeting) that non-blocking
advisory warnings should *not* be styled with the same visual weight as
an actual judgment-affecting risk, specifically to avoid training users
to tune out real alerts. The calibration banner is exactly that kind of
non-blocking advisory. Happy to revisit if you have a *specific*
low-vision/contrast standard in mind beyond WCAG AA, but as measured this
isn't a legibility failure.

**#4 — Empty-state centering / helper-text line-height.** `.empty` (used
for the History empty state) already is
`flex-direction: column; align-items: center; text-align: center` — the
text just isn't vertically centered *in the viewport* because the card
is a content-sized box, not a full-height one; that's by design, not a
bug. `.field-hint` (the dense-looking paragraph under Safety Limit in
`05-action-modal.png`) already has `line-height: 1.5`, which is the
bottom of the range you suggested (1.5–1.6). Both were already at or
above what you asked for — didn't change either to avoid change-for-
the-sake-of-change.

## Still open — asking for your input

**#1 — Z-axis depth via variable panel opacity/shadow.** This is the one
point I think has real merit but didn't implement, because it's a bigger
call than the other three: `global.css` currently treats "Liquid Glass"
as *one* material applied uniformly to every card via a shared `.glass`
class (`--surface` fill + fixed blur/shadow token), across all 4 screens
and every modal — that uniformity is a stated design decision in the
stylesheet's own header comment, not an oversight.

Before we recommend blowing that up app-wide: is there a version of your
depth-hierarchy idea that adds a `.glass-elevated` (or similar) *modifier*
on top of the existing `.glass` base — used only for the single "primary"
card per screen (e.g. the metric-gauge panel on Dashboard) — rather than
re-deriving opacity/shadow per card everywhere? That would get the
foreground/background separation you want on the one panel where it
matters most, without turning every secondary card into a bespoke case.
If you still think full per-card variable depth is worth the larger
rewrite, make the case and we'll take it to the person actually making
the call on the design direction.

## Files changed (for reference, not re-submission)

`src/renderer/src/styles/global.css`,
`src/renderer/src/views/ActionsView.tsx`,
`src/renderer/src/views/HistoryView.tsx`,
`src/renderer/src/components/TopHeader.tsx`,
`src/renderer/src/components/SessionControlPanel.tsx`. 147/147 tests still
pass; typecheck clean.
