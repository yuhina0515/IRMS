---
tags: [irms, ui, v3, plan]
summary: "Implementation plan for the approved v3 'Rehabilitation Workbook' UI (doc/ui-v3-gpt/PROPOSAL.md) on branch claude/irms-ui-v3."
date: 2026-09-25
---

# UI v3 implementation plan

**Approved 2026-09-25 by the user:** adopt v3; 2D pose by default with a 3D toggle; block
session start until calibrated; PR #10 (v2) is superseded. Spec: `doc/ui-v3-gpt/PROPOSAL.md`.

## Constraints

- Behaviour stays: rep counting, TriggerEngine semantics, safety-limit resolution, OTA and
  calibration locks, demo labelling, telemetry consent. Only presentation changes, plus the
  approved calibration gate on Start Session.
- No page-level scroll at 1024×600, 1280×720, 1920×1080 (and 175 % scaling): `html`/`body`/
  shell/page never scroll; overflow only inside one named bounded region per view.
- Offline fonts only (Inter, JetBrains Mono already bundled); Chinese titles use a system serif
  fallback (no new font bundle until the user approves one — PROPOSAL §9 Q6).
- Day theme default, night available, follows the system until the user picks one.

## Steps

1. **Tokens + shell** — new stylesheet with v3 tokens mapped onto the existing semantic names
   (canvas/surface/text/accent/…) so unchanged components keep working; top navigation replaces
   the rail + command bar; fixed-height page frame.
2. **Dashboard** — coach band (state contract §5), primary metric + target ruler, pose stage
   (2D SVG default, 3D `Leg3D` toggle, calibration scope line), bottom dock (reps, hold, time,
   start/end, mute), diagnostics drawer replacing the six-card strip; calibration gate.
3. **Settings** — category index + one bounded pane: 裝置與連線 / 校準 / 顯示 / 軟體與韌體 /
   模組 / 資料與隱私 / 示範模式, reusing the existing panels.
4. **Actions** — paged list + inspector; three explicit parameter cells; short trigger names.
5. **History** — paged list; full-page review (summary strip, chart without Roll overlay,
   bounded detail pane with prescription/calibration notes and export).
6. **Verify** — CI; Playwright (mocked IPC) at the three sizes × both themes asserting
   `scrollHeight == innerHeight` and `scrollWidth == innerWidth` on every view and key state;
   screenshots reviewed.

Out of scope here (PROPOSAL marks them as new work): persisted per-attempt events and
per-rep review, cross-session comparison, patient-focus mode, bundled Chinese serif font.
