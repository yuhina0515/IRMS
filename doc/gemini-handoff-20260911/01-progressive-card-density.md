You are acting as a senior product designer/UX architect for a real desktop application. This is
a system-level information-architecture question, not a visual skin pass — see the closing note
for why a previous brief in this same app used that same framing.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — a desktop
app (Tauri + React + TS) pairing with a wearable BLE sensor on a patient's leg during physical
therapy. Four screens: Dashboard (real-time gauge/chart/pose cockpit), Actions (custom-exercise
CRUD cards), History (past-session list + analysis modal), Settings (calibration + preferences
forms). Clinical tool, "data console" tone — dense, high-tech, bento-grid cards, no Apple/glass
language. Visual direction already established in `doc/gemini-handoff-20260902/`.

**What's already decided, don't relitigate:**
- The Dashboard already has a real adaptive-sizing system (built 2026-09-05, see
  `doc/gemini-handoff-20260905/04-adaptive-layout.md` for that original brief): CSS Container
  Queries keyed to `.dashboard-workspace`'s actual pixel height, three named presets — full bento
  grid, a compact three-column layout, and a numeric-only fallback below 385px of workspace
  height. This works and was just re-verified against the real app on 2026-09-11 (screenshots at
  1280×820 / 1600×900 / 1024×600, zero overflow, internal scroll fallback triggers correctly at
  the floor size).
- The sidebar already has an unrelated, size-independent icon-only collapse (220px expanded ↔
  56px collapsed, user-toggled via the hamburger button, not driven by window size).
- Neither of the above is what this brief is about. This brief is about a **new principle the
  product owner wants applied more broadly**: as a card's available space shrinks, it shouldn't
  just proportionally shrink its existing content — it should **drop information**, showing a
  simplified subset (fewer/no icons, less text) rather than the same content crammed smaller.
  The Dashboard's numeric-only fallback is the one existing example of this idea, but it was
  designed as a last-resort "nothing else fits" state, not as a general per-card principle applied
  gradually across a size range.

**What's genuinely open — this is the actual ask:**
- **Scope**: which card types should this progressive-density principle apply to? Candidates,
  with their current information content:
  - Dashboard `Stat` cards (`DashboardView.tsx`'s `<Stat>` — label + numeric value only, no icon
    today; used both in the "detail" tab and as the numeric fallback grid).
  - Actions cards (`ActionsView.tsx` — action name, a protocol badge pill, target/tolerance/hold
    numbers, a one-line description, Edit/Delete buttons; no icons today).
  - History session-list rows (`HistoryView.tsx` — timestamp, action-name snapshot, rep count,
    demo/abandoned badges, an analyze button).
  - Settings form sections/panels (less obviously "card-shaped," more likely out of scope, but
    your call).
  Give an explicit yes/no per card type, not just "cards in general."
- **The density steps themselves**: for each in-scope card type, define concretely what's tier-1
  (always visible, the reason the card exists) vs. tier-2/tier-3 (droppable as space shrinks) —
  e.g. is a protocol badge pill more or less disposable than the description line on an Actions
  card? Is a session's demo/abandoned badge tier-1 (it changes clinical interpretation, per this
  app's own established rule about "what changes a decision") or tier-2?
  Note the app doesn't currently put icons on most of these cards at all (only the sidebar nav
  does) — if your design introduces icons as part of the "full" state precisely so they can be the
  first thing dropped at the simplified tier, that's a legitimate answer, just say so explicitly
  rather than assuming icons already exist to be hidden.
- **What drives the transition**: per-card CSS Container Query (each card queries its own
  rendered width/height, same technique already chosen for the Dashboard and for the documented
  reason — it reacts to the card's actual available space regardless of grid column count or
  sidebar state, not a guess about viewport size) is the existing precedent and the presumed
  default — say so if you think a different mechanism is actually right for this case.
- **Concrete breakpoint values** per card type (e.g. "below 220px card width: hide the protocol
  badge pill, truncate the description to one line with ellipsis; below 160px: hide the
  description entirely, name + numbers only").

**Deliverable I need back:** a written specification — which cards are in scope, the tier
breakdown per card type, concrete container-query breakpoint values, and what's shown/hidden at
each tier. Mockup images of one representative card per in-scope type, at its "full" and
"simplified" states, would help but the written spec is the load-bearing part.

**Current relevant tokens/constants in code:**
- Card container: `.panel` = `bg-surface border border-border rounded-card p-6` (`rounded-card` /
  `p-6` = Tailwind defaults, no custom override).
- Dashboard's existing container-query thresholds (for reference/consistency, not necessarily the
  right numbers for card-level queries): `@container dashboard (max-height: 450px)` and
  `(max-height: 385px)`, keyed off `.dashboard-workspace`'s `container-type: size`.
- Window floor: `minWidth: 1024, minHeight: 600` (`src-tauri/tauri.conf.json`).
- Actions view's fixed-width filter controls (dropdowns at 220px/150px) are a separate, already-
  fine pattern — not part of this ask.

**Screenshots attached** (this folder, taken 2026-09-11 at the app's default 1280×820 window size):
`dashboard_1280x820.png`, `settings_1280x820.png`, `actions_1280x820.png` — showing the current
"full" state of Dashboard stat cards and Actions cards as the visual reference before you propose
what to drop at smaller sizes. History's list-row cards aren't in these three; if you need one,
take a fresh screenshot of the History screen before sending (see this folder's `README.md`).

---
*Why this is framed as a system question rather than a quick tweak*: the same lesson from the
2026-09-05 adaptive-layout brief applies here — hand-picking "hide the badge below 200px" for one
card type in isolation, without an explicit tier hierarchy, is exactly the kind of one-off magic
number that broke repeatedly last time. This brief exists so the answer generalizes across card
types instead of needing to be re-litigated per component.
