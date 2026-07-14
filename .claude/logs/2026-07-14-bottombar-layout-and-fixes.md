# 2026-07-14 — Layout overhaul: bottom nav bar + draggable knobs + calibration countdown fix

## Request

Five items in one message:
1. The moving "knob" piece in all menus (except dropdown-style) should be grabbable/draggable.
2. Sensor Calibration wizard step 2 ("站直捕捉零位") doesn't count down.
3. Remove the left sidebar menu; add a bottom bar instead.
4. The new bottom bar uses icons instead of the old sidebar's text buttons.
5. Remove the bottom-left debug/log window.

Clarified with the user before starting: item 3 means the *entire* left panel
(logo, connection status, Connect button, debug log) disappears — logo/connection/
connect move to a new top header bar; navigation moves to a new bottom icon bar.

## Actions

### Item 2 — Calibration countdown bug (root-caused before fixing)

Reproduced first (didn't guess): temporarily exposed the zustand store on
`window` for browser-console testing (`useStore.ts`, removed after), bypassed the
`isConnected` gate, drove the wizard to step 2, clicked capture, and polled the
countdown display over ~3.2s — it stayed frozen at "3" the entire time. Added
temporary `console.log` instrumentation inside `capture()`'s loop and re-ran:
confirmed `cancelledRef.current` was already `true` on the very first tick.

**Root cause**: classic React 18 StrictMode pitfall. `main.tsx` wraps the app in
`<React.StrictMode>`, which in dev intentionally mounts→unmounts→remounts every
component once (to surface missing-cleanup bugs). `CalibrationWizard`'s effect
only *set* `cancelledRef.current = true` in its cleanup, never reset it back to
`false` in the effect body — so StrictMode's simulated unmount permanently
flipped the flag, even though the component was genuinely still mounted. Every
subsequent `capture()` call saw `cancelledRef.current === true` after the first
`await delay(1000)` and returned early, freezing the display at its first tick.
This bug is invisible in a production build (`electron-vite build` — StrictMode's
double-invoke is dev-only) but real under `npm run dev`, which is what the user
was testing with.

**Fix**: `cancelledRef.current = false` at the top of the effect body, not just
relying on the initial `useRef(false)` value. Re-verified with the same
window-store harness: countdown now correctly progresses 3→2→1→"捕捉中…" over
~3s. Removed all debug instrumentation and the temporary store-window hook.

### Items 1, 3, 4, 5 — Layout overhaul

- **Deleted `Sidebar.tsx`** entirely, and its dead state from `useUiStore.ts`
  (`sidebarCollapsed`, `sidebarWidth`, `sidebarDragging` + setters — all only
  existed to support the sidebar's drag-resize feature from earlier today, now
  moot since there's no sidebar to resize).
- **New `TopHeader.tsx`**: logo + connection dot/text + Connect/Disconnect button,
  horizontal glass bar.
- **New `BottomBar.tsx`**: icon nav (Dashboard/Actions/History/Settings) replacing
  the old vertical text nav, using the new `useLiquidKnob` hook (see below) with
  `onSelect` wired in for drag support.
- **New `NavIcons.tsx`**: minimal inline SVG line icons for the four nav items
  (no icon library in this project's dependencies — hand-drawn to match the
  existing SF-Symbols-ish aesthetic).
- **`App.tsx`**: `.app` changed from the sidebar-width CSS-grid layout to a plain
  column flex layout (`TopHeader` / `main` (flex:1, scrollable) / `BottomBar`).
- **`global.css`**: removed all `.sidebar`/`.sidebar-resize-handle`/`.nav`/
  `.nav-item`/`.log-panel`/`.app.collapsed`/`--sidebar-w` rules; added
  `.top-header`, `.bottom-bar`, `.bottom-bar-item`.
- Fixed two stale UI strings that referenced "側欄" (the now-gone sidebar) in
  `DashboardView.tsx` and `CalibrationWizard.tsx` — both now say "頂部" (top),
  matching where Connect actually lives now.

### Item 1 — Making the knob itself grabbable

Rewrote `LiquidKnob.tsx` from a passive component into a `useLiquidKnob()` hook
that also returns `getItemProps(key)`. The insight: the knob is a decorative,
`pointer-events: none` element that visually sits **exactly under the currently
active button** — so "grab the knob" is implemented as "attach drag handlers to
whichever button is currently active" (`getItemProps` only returns real handlers
when `key === activeKey`; every other button keeps its plain `onClick`,
untouched). This sidesteps needing any z-index/pointer-events layering trick to
make an element sitting *behind* interactive buttons receive its own pointer
events.

Drag mechanics: `onPointerDown` on the active button records a drag-start ref
(mirrors the pattern already used for the sidebar resize handle earlier today —
ref for the authoritative live value, state only to drive re-renders); movement
is gated behind a 4px threshold so ordinary taps on the already-active item don't
visually jitter; while dragging, the knob's track gets a `.dragging` class that
disables its CSS transition so it follows the pointer 1:1 instead of chasing it
through an eased animation. On release, the nearest `[data-knob-key]` item (by
comparing the knob's current center to every item's center) is selected via
`onSelect`; if it's the same as before, the knob just glides back to its resting
spot through the normal (now re-enabled) transition — no special-case code needed
for "drag ended without a real change."

Wired into both `BottomBar.tsx` (vertical→horizontal orientation swap from the
old sidebar version) and `DashboardView.tsx`'s tabs (replacing the old
non-draggable `<LiquidKnob>` component usage). `GlassDropdown` deliberately left
untouched — the user explicitly excluded dropdown-style menus from this ask.

## Decisions

- **Whole sidebar removed, not just the nav list** — confirmed with the user via
  `AskUserQuestion` before starting, since guessing wrong here would have meant
  redoing a nontrivial layout change.
- **Kept `useStore`'s `logs` ring-buffer state and `log()` action** even though
  nothing renders it anymore — the user asked to remove the *visual* debug
  window, not the underlying diagnostic mechanism (which still `console.log`s
  and is called from `bluetooth.ts`/`sessionController.ts` for real diagnostic
  value). Only the display disappeared, as a natural side effect of deleting
  `Sidebar.tsx`.
- **`.glass-warp` (SVG distortion) carried over to `.bottom-bar`** since it's the
  direct successor of the old `.sidebar` (which had it), but not added to
  `.top-header` or `.tabs` — matches the existing precedent that the distortion
  filter is reserved for primary navigation "menus," not every bar/control.

## Verification

- `npm run ci` (typecheck + 71 tests + build) green after every meaningful edit
  batch (removal, new components, drag mechanics).
- Root-caused the calibration bug empirically (see above) rather than guessing —
  reproduced, instrumented, confirmed the exact mechanism, then fixed and
  re-verified the fix with the same harness before removing the debug scaffolding.
- Browser-driven checks against the Vite dev server (no working screenshot tool
  this session, same limitation as earlier in the day — used `read_page`/
  `javascript_tool` instead):
  - Layout: top header with logo/status/connect, bottom bar with 4 icon items,
    no `.sidebar`/`.log-panel` in the DOM.
  - Simulated drag (pointerdown→pointermove past threshold→pointerup) on the
    active Dashboard icon in the bottom bar: knob followed the pointer with
    `dragging` class active, and on release the view genuinely switched
    ("History" became active) — confirmed via `activeAfterDrop`.
  - Same drag mechanic re-verified on the Dashboard secondary tabs (chart→detail).
  - Plain click (no drag) on an *inactive* tab still switches immediately,
    unaffected.
  - `GlassDropdown` still opens/works, confirming the dropdown was untouched.
  - Stale console errors from mid-session HMR renames were investigated and
    confirmed to be buffered history (identical timestamps across a fresh
    `navigate`), not live — a follow-up DOM query on the same fresh load
    confirmed a clean, working state.

## Self-review

Scenario checked: what happens if the user drags the knob back onto the *same*
segment it started on (no real selection change)? Traced through the code:
`isDragging` still gets set to `false` on `pointerup` regardless of whether
`onSelect` fired, which switches the rendered position back to `box.start`
(the resting spot, unchanged since `activeKey` never changed) — and since the
`.dragging` class is gone by then, the normal CSS `transition` picks up that
style delta and glides it back smoothly. No dead-end state, no special-casing
needed. Also checked: rapid drag across the full bar width before release —
`maxStart` clamps the knob to stay within container bounds throughout, so it
can't overshoot past the last item.
