# Brief: redesign IRMS's design language around what it actually is

## What IRMS is (read this before anything else)

IRMS (智慧復健監測系統) is a wearable rehabilitation-monitoring system:

- **Hardware**: an ESP32 with two MPU6050 IMUs strapped to a patient's thigh and shin, streaming
  joint-angle data over BLE at ~25Hz.
- **App** (this repo, `IRMS_App_Tauri`, migrating off an Electron predecessor): the companion
  desktop app a **patient wears the sensor and looks at while doing a prescribed rehab exercise**
  (e.g. knee-extension reps), and that a **therapist/clinician glances at during the session or
  reviews afterward** (History tab). It shows real-time joint angle vs. a target band, counts reps,
  fires a visible+audible alarm if the patient moves past a safety limit, and logs sessions to a
  local SQLite DB for later review.
- This is **not** a devops dashboard, analytics tool, or trading terminal — it's a clinical
  rehab-monitoring instrument, occasionally glanced at mid-exercise by someone concentrating on
  moving their own leg correctly, and reviewed afterward by a clinician who needs to trust the
  numbers.

## Why this brief exists

Two prior rounds of your design work (`doc/gemini-handoff-20260902/`, `doc/gemini-handoff-20260905/`)
produced the current look: a dark "Data-Console" theme + light "Precision Lab" theme, bento-grid
cards, JetBrains Mono numerics, cyan/sky accents, sidebar nav rail. It's a coherent, well-executed
generic SaaS-analytics-dashboard aesthetic — and that's exactly the problem the user flagged: it
reads as a generic dashboard reskin, not as something that was designed *for this*. This brief asks
for a genuine redesign of the design language itself — not incremental token tweaks — starting from
what this instrument actually is and who actually looks at it and why, per the above.

You have full design authority here (see `AI_CODING_RULES.md` §1.1 in this repo) — colour system,
typography, iconography, card/panel visual language, motion language, and information hierarchy are
all open to reconsideration. Nothing about the current look is sacred.

## What to actually look at

Don't rely only on the screenshots in this folder — read the live source directly (you have
`read_file`/`grep_search`, use them):

- `IRMS_App_Tauri/src/styles/tailwind.css` — current token definitions (`@layer base`,
  `:root`/`.dark`) and component classes (`.panel`, `.sidebar`, `.btn`, etc.)
- `IRMS_App_Tauri/tailwind.config.cjs` — color scale mapping
- `IRMS_App_Tauri/src/views/DashboardView.tsx` and its child components (`MetricGauge`,
  `ProgressRing`, `CoachHint`, `Leg3D`, `LiveChart`, `AngleVisualizer`) — this is the view a patient
  is actually looking at mid-exercise; it's the highest-stakes screen in the app
- `IRMS_App_Tauri/src/components/Sidebar.tsx`, `TopHeader.tsx` — nav chrome
- Screenshots in this folder: `01-dashboard-dark.png`/`02-dashboard-light.png` (both themes, the
  key screen), `03-actions-dark.png`, `04-history-dark.png`, `05-settings-dark.png`,
  `06-actions-light.png` — current build, taken 2026-09-14.

## Specific things to weigh in on

1. **Dashboard's real-time safety semantics**: the target-band gauge, the over-limit alarm state,
   rep count, and calibration/connection status are the only things that matter while someone is
   mid-exercise. Does the current visual hierarchy actually put those first, or does the bento grid
   (5 small stat tiles + 2 big panels, all roughly equal visual weight) bury them? What should
   "everything is fine, keep going" vs. "you're about to trip the alarm" *feel* like at a glance —
   not just color-coded, but composition/motion too.
2. **A calmer, more clinical character than "data console"**: the current dark theme's naming
   ("Data-Console") and cyan-glow accents evoke a hacker/ops-monitoring aesthetic. Is that the right
   register for something a rehab patient looks at while exercising? Propose whatever you think is
   actually right — could be the same dark/light split with a different palette and type character,
   could be something structurally different. Your call.
3. **Known layout issue already found, don't re-solve, but keep in mind**: `03-actions-dark.png`'s
   3-column card grid already drops secondary text (safety-limit description) at completely
   ordinary 1280px window widths — found in the previous round
   (`doc/coding log/log_20260912_gemini_09-11_briefs_implementation.md`, "觀察但未動的一點"), not
   yet fixed. If your redesign changes the card system, factor this in; if it doesn't, flag it as
   still open.
4. **Sidebar/titlebar identity**: currently a plain nav rail + flat custom titlebar. Does the new
   design language want a different visual identity here, or is the structure fine and only tokens
   change?
5. **Motion language**: `doc/gemini-handoff-20260905/03-animations.md` set the current motion
   tokens (mechanical/enter/exit eases). Should a clinical instrument's motion character be steadier
   and less "snappy-tech-product" than what's there now? Your call on what "steadier" means
   concretely (durations, easing, what's allowed to move at all).

## What to hand back

Whatever level of detail you think this needs — but to be genuinely implementable without another
round-trip, please include actual numbers where they're checkable facts (hex values + computed WCAG
contrast ratios for both themes, spacing/type scale, motion durations/easings), not just adjectives.
Per-view redesign notes (Dashboard especially) are more useful than a single moodboard description.

After you respond, the AI coding assistant on this repo will implement it directly and verify
checkable facts (contrast ratios, etc.) against your numbers — per the standing convention, it
will not push back on aesthetic judgment calls, only report genuine technical infeasibility.
