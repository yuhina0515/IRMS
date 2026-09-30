---
tags: [irms, ui, design, brief]
summary: "Design brief for GPT: re-review the IRMS desktop UI and propose a visually different direction (v3), covering no-page-scroll layout, a trustworthy live-monitoring hierarchy, 3D/2D pose presentation and session analysis."
date: 2026-09-25
---

# IRMS UI v3 — design brief for GPT

**Design authority (AI_CODING_RULES §1.1):** drafts may come from Claude Code or GPT; the user
decides. This brief asks **GPT** for the draft. Claude Code implements whatever the user
approves. Do **not** edit anything under `IRMS_App_Tauri/` or `IRMS_App/`: this is a design
deliverable, not an implementation.

## Product in one paragraph

IRMS is a knee-rehabilitation monitor: two IMUs (thigh + shin) on an ESP32 stream gravity
vectors over BLE at 25 Hz to a Tauri desktop app (React + Tailwind + three.js + Chart.js). A
therapist picks an exercise ("action": target angle ± tolerance, hold time, safety limit), the
patient performs reps, and the app counts reps, fires LED/buzzer feedback and an over-limit
alarm, and stores the session for later review. Users: a therapist at the desk and a patient
glancing at the screen from ~2 m away mid-exercise. Primary language zh-TW (English secondary).

## What the user asked for (2026-09-25, after a real-device session)

1. **A different style.** The current UI (dark slate + cyan, 4 px radii, a technical
   "command-bar" look) and the unmerged v2 proposal (`doc/UI_DESIGN_LANGUAGE_V2.md` on branch
   `claude/irms-ui-redesign-38fvnr`, PR #10) were both designed with Claude. Review them, then
   deliberately explore a direction that is **not** a recolour of either.
2. **No page-level scrolling.** "Many screens let the whole page scroll up and down; I want the
   auto-layout to never do that." Every view must fit the window at the supported sizes; when
   content genuinely exceeds the space (long action list, long history, many settings), it must
   be paged, tabbed, collapsed or scroll **inside one clearly bounded region**, never by
   scrolling the page. Measured today (mock data): Settings overflows by 676–1076 px at
   1920×1080 … 1280×720; other views fit only because the mock lists are short.
3. **Live-monitoring values must be rethought.** Only the **primary metric** (the angle the
   current action is judged on) and the **3D pose** are trustworthy to a user today. The six
   stat cards (thigh, shin, knee, thigh roll, shin roll, varus/valgus) are not usable as
   shown. Real-device findings behind this:
   - Sensors cannot be strapped exactly on the side of the leg; clothing lifts them, so each
     IMU sits at an arbitrary tilt. Calibration derives a hinge axis per limb to compensate.
   - Roll values mostly reflect mounting/axis-estimate error, not anatomy (a seated shin
     showed 15–20° "roll" that was really flexion leaking into the wrong axis).
   - Raw thigh/shin pitch are meaningful only relative to standing and only once calibrated.
   Decide what a clinician and a patient actually need on this screen, in which order, and
   what should be hidden, demoted or shown only with a confidence caveat.
4. **3D and 2D pose presentation need redesign** (currently a small three.js leg plus a 2D
   arc gauge). Propose how pose is shown, when 2D vs 3D is appropriate, and how calibration
   confidence is communicated.
5. **Session analysis.** History's "Analyze" used to be just a chart + "Export CSV". A summary
   strip now exists (peak, mean, time in target, over-limit count/time, active duration — see
   `current/history-analysis-after-fix.png`). Design a proper review screen: what a therapist
   wants after a session (rep timeline, per-rep peak/hold, comparison with previous sessions
   of the same action, calibration-changed warning).
6. Action list tags wrapped badly (fixed as a stopgap; the redesign should own the layout).

## Constraints

- Window: min 1024×600 (tauri.conf.json), design target 1280×720 and 1920×1080, Windows
  scaling 100–175 %. No page scroll at any of these.
- Light and dark themes; WCAG AA contrast for text; state never conveyed by colour alone;
  `prefers-reduced-motion` respected.
- Alarm/over-limit and "hardware error (ERR:1)" states must be unmistakable from 2 m.
- Keep existing information architecture unless you argue for changing it: Dashboard (live),
  Actions (exercise protocols), History (sessions), Settings (device, calibration wizard,
  firmware OTA, update channel, telemetry, demo mode).
- Charts: Chart.js; 3D: three.js. Fonts must be bundleable offline (current: Inter Variable,
  JetBrains Mono Variable via @fontsource).

## Inputs to read

- `doc/UI_REDESIGN.md` — current UI spec (beta8).
- `git show origin/claude/irms-ui-redesign-38fvnr:doc/UI_DESIGN_LANGUAGE_V2.md` — v2 proposal.
- `IRMS_App_Tauri/src/views/*.tsx`, `src/components/*.tsx`, `src/styles/tailwind.css` — what
  each screen actually contains today.
- `doc/ui-v3-gpt/current/*.png` — screenshots (real device where the filename says `real`).

## Deliverables (write only inside `doc/ui-v3-gpt/`)

1. `PROPOSAL.md` — Obsidian frontmatter (`tags`, `summary`, `date`). Sections: critique of
   current + v2 (short, concrete); the new direction's name and principles; design tokens
   (colour for both themes with contrast ratios, type scale, spacing, radii, motion); per-view
   layout at 1280×720 and 1920×1080 showing how each view avoids page scroll; the live-monitor
   information hierarchy (item 3) with explicit keep/demote/remove decisions per value; 3D/2D
   pose spec (item 4); session review spec (item 5); open questions for the user.
2. `mockup-dashboard.html`, `mockup-settings.html`, `mockup-history-review.html` — static,
   self-contained HTML/CSS (no external network), 1280×720 viewport, realistic zh-TW content,
   a theme toggle, and no page scroll. These are for the user to judge the style; they are
   not production code.

Be opinionated: the user wants to see a genuinely different option to choose from.
