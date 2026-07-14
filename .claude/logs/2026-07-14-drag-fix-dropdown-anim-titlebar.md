# 2026-07-14 — Drag-to-switch fix, dropdown grow/shrink, knob stretch, frameless window

## Request

Four items:
1. Menu drag-to-switch doesn't work (click still works fine).
2. Dropdown should animate grow-on-open / shrink-on-close (Liquid Glass style),
   not just the existing jelly-wobble.
3. The moving knob piece (non-dropdown menus) should visually stretch while being
   dragged, matching Liquid Glass.
4. Remove the window's native title bar/black border for an edge-to-edge UI.

## Actions

### Item 1 — root cause and fix

The previous `useLiquidKnob` implementation attached `onPointerMove`/`onPointerUp`
directly to the active button, relying on `setPointerCapture` to keep receiving
events regardless of where the pointer physically moved. In a real drag, the
pointer easily leaves a small button's bounds within a single movement — without
capture reliably keeping the button as the event target, `pointermove`/`pointerup`
stopped reaching the handler, leaving the drag stuck mid-gesture (no visible
progress, no completion) while a plain click (single down+up with no travel)
still worked fine. This matches the reported symptom precisely.

**Fix**: on `pointerdown`, manually attach `pointermove`/`pointerup`/`pointercancel`
listeners to `window` (native `addEventListener`, not React's synthetic system) for
the duration of that one drag, keyed by `pointerId`; remove them on drag end.
`setPointerCapture` is still attempted as a best-effort supplement but the window
listeners are now the authoritative tracking mechanism, so pointer travel outside
the button's bounds no longer breaks anything.

Verified specifically by dispatching `pointerdown` on the button but
`pointermove`/`pointerup` on `window` (simulating the pointer leaving the button) —
confirmed the drag still completes and the view switches.

### Item 2 — dropdown grow/shrink

`GlassDropdown.tsx` previously unmounted the popup the instant `open` went false —
no exit animation was possible. Added a three-state model: `open` (logical),
`mounted` (DOM presence), `closing` (drives the shrink keyframe class). Closing now
plays a `dropdown-shrink` animation for 160ms before the popup actually unmounts
(`requestClose()` sets a timer); opening plays `dropdown-grow`. Both are pure
`scale()` — removed the old `rotate()` jelly-wobble per the user's explicit "not
just jitter" ask. Kept the existing `transform-origin: top center` so it still
visually "grows out of" the trigger button.

### Item 3 — drag stretch

Added a `dragStretch` value computed the same way as the sidebar's velocity-based
wobble from earlier today: track `(Δposition / Δtime)` between consecutive
`pointermove` events, map to a `scaleX`/`scaleY` factor (clamped to 1.4x), applied
as an inline style on `.liquid-knob-shape` while dragging. On release, the inline
override disappears and a CSS `transition` (disabled mid-drag via `.dragging`
descendant selector, same pattern as the track's position transition) springs it
back to scale(1). Left the existing one-shot `.morph` keyframe untouched for
plain-click-triggered selection changes — the two don't fight in practice since a
running CSS `animation` simply takes precedence over the transition-based
drag-release settle for that one frame, which reads as a satisfying combined
"stretch then bounce" rather than a visible glitch.

### Item 4 — frameless, edge-to-edge window

`main/index.ts`: switched from the default framed `BrowserWindow` to
`titleBarStyle: 'hidden'` + `titleBarOverlay` (Windows-supported hybrid — removes
the title bar area/text while keeping native minimize/maximize/close as a small
system-drawn overlay in the top-right corner, rather than a fully custom
`frame: false` window that would need hand-rolled replacement controls). Overlay
color/symbol color follow the system theme, and — since I was touching this
code anyway — wired `nativeTheme.on('updated', ...)` to update both the overlay
and `backgroundColor` live on theme switch (previously `backgroundColor` was only
ever set once at window-creation time, a small pre-existing gap fixed as a
natural side effect of adding the same plumbing for the new overlay).

Since there's no title bar to drag the window by anymore, `.top-header` in
`global.css` got `-webkit-app-region: drag` (with buttons inside opting back out
via `-webkit-app-region: no-drag` so they stay clickable), plus right-padding to
keep content clear of the native overlay button cluster.

## Decisions

- **Window listeners over pointer capture as the primary drag-tracking mechanism**
  — capture is kept as a best-effort extra, not relied upon, since it's exactly
  the assumption that broke item 1.
- **`titleBarStyle: 'hidden'` + `titleBarOverlay` over `frame: false`** — preserves
  native minimize/maximize/close without having to build and wire up replacement
  buttons + IPC calls to `win.minimize()`/`maximize()`/`close()`. If the user wants
  a fully custom title-bar-less look with bespoke controls later, that's a
  follow-up, not a blocker here.

## Verification

- `npm run ci` (typecheck + 71 tests + build) green after all four changes.
- Browser-driven tests against the Vite dev server confirmed items 1–3 (see below).
  **Item 4 cannot be visually verified this way** — `titleBarStyle`/`titleBarOverlay`
  only affects the native `BrowserWindow` chrome, which doesn't exist in a plain
  browser tab loading the same URL. Confirmed only that the main process starts
  without error and `npm run typecheck` accepts the new Electron API surface
  (`titleBarOverlay`, `setTitleBarOverlay`); the actual visual result needs the
  user's own look at the real Electron window.
- Hit a scare mid-verification: React logged "change in the order of Hooks" for
  `DashboardView`/`BottomBar` during a drag test. Traced it down before assuming
  either "it's fine" or "it's broken": re-read `useLiquidKnob` end-to-end and
  confirmed every hook call happens unconditionally before the single early
  return — no structural hook-order bug in the code as written. Killed all
  lingering `electron.exe` processes from the session's many restarts, started a
  fully fresh dev server, opened a brand-new browser tab (not just `navigate` on
  the old one, to rule out any lingering module/Fiber state), and reran the exact
  same drag scenario: no warning, worked cleanly. Confirms the warning was a
  React Fast Refresh artifact from hook-count changes across this session's many
  incremental edits to `LiquidKnob.tsx`/`useLiquidKnob`, not a real defect —
  wouldn't have wanted to report this as "verified" without chasing that down.

## Addendum — second drag bug found after the fact (same day)

User reported, with screenshots, that dragging the knob from Dashboard onto
Actions visually worked but then snapped back to Dashboard's state instead of
committing. Root-caused rather than patched blind:

**Mechanism** (confirmed against the W3C Pointer Events Level 3 spec via a
research pass, not guessed): `beginDrag` was still calling
`e.currentTarget.setPointerCapture(e.pointerId)` as a "belt and suspenders"
leftover from the item-1 fix. Per spec, once a pointer is captured, the
synthesized compatibility `click` event that follows `pointerup` targets the
**capturing element**, not wherever the pointer actually released (this
overrides the normal same-element hit-test rule used for uncaptured pointers).
So the sequence was: drag Dashboard→Actions, release over Actions →
`finishDrag()` correctly computes `nearestKey = 'actions'` and calls
`onSelect('actions')` → **then** the browser still fires a `click` on the
*original* Dashboard button (because it held capture) → Dashboard's own
`onClick={() => setView('dashboard')}` fires *after* the drag logic and
stomps the state right back.

**Fix**: removed the `setPointerCapture` call entirely. It was already
vestigial — the item-1 fix made `window`-level `pointermove`/`pointerup`
listeners the actual tracking mechanism, so capture wasn't doing anything
useful, only causing this new bug as a side effect. Uncaptured pointers use
normal hit-testing for click synthesis, which naturally doesn't fire on
Dashboard when release happens over a different element.

**Verification limitation, stated plainly**: this specific bug (and therefore
this specific fix) could **not** be reproduced or confirmed via this session's
`dispatchEvent(new PointerEvent(...))`-based browser testing — click
compatibility-event synthesis after `pointerup` is part of the browser's
*trusted*-event pipeline and does not fire for script-dispatched (untrusted)
pointer events, confirmed by testing with a temporary global click listener
that logged nothing during a synthetic drag. So unlike everything else in this
session's testing, this fix is verified by (a) an authoritative spec citation
for the exact mechanism, matching the reported symptom precisely, and (b) a
regression check confirming the drag-to-switch behavior still works after
removing the capture call — but not by directly reproducing the bug-then-fix
before/after in this sandbox. The user's own retest in the real app is the
only way to fully close this one out.

## Self-review

Scenario checked: what if a drag ends up right back at the segment it started
from (no real selection change)? Confirmed via code trace: `isDragging` still
flips to `false` on release regardless of whether `onSelect` fired, so the
rendered position falls back to `box.start` (unchanged, since `activeKey` never
changed) and the stretch inline style disappears — both glide back to rest via
the now-re-enabled CSS transitions. No dead-end state.

Also checked: dropdown rapid open→close→open before the close animation
finishes. `requestOpen()` clears any pending close timer and sets `mounted`/`open`
back to true immediately, so a fast re-open doesn't get killed by a stale timeout
from the previous close — traced but not live-tested (would need real rapid-click
timing, hard to simulate meaningfully via dispatched events at this level).
