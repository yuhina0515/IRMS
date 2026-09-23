---
tags: [irms, ui, design, tauri]
date: 2026-09-24
summary: User-directed UI refresh with green light/dark themes, responsive shell, and browser preview.
---

# UI refresh

## Authorization and scope

The user asked Codex to redesign the UI, then explicitly said to continue. This direct instruction
supersedes the previous Gemini-only design assignment for this task, as recorded in
AI_CODING_RULES section 1.1. A direction question was offered; no specific alternative was
received before implementation, so the stated professional/light direction was used.
The user also authorized automatic commits, push, and PR creation; merging is not included.

The earlier status/code-review documents were committed first, preserving their separate history.
Their five defects remain open; no native BLE, OTA, calibration formula, or Session lifecycle
fix is included in this presentation change.

## Changes

- Full text navigation on desktop, compact icon navigation at narrower widths.
- Green light/dark theme tokens; light default for fresh settings, existing persisted theme retained.
- Page introductions for monitoring, actions, history, and settings; clear training-control heading.
- Rounded surfaces, readable metadata, consistent controls and visible keyboard focus.
- Dashboard uses content height and workspace scrolling instead of nested size containment.
- Calibration warning is a real keyboard-operable button; theme button has an accessible name.
- Demo banner takes its actual content height without viewport subtraction assumptions.
- `ui-preview.html` renders the real components using development-only Tauri mocks and clearly
  labels that it does not save data. It is excluded from production build inputs.
- Styles are isolated in `refresh.css`, loaded after legacy component styles, to keep the change
  reviewable without rewriting the large existing component stylesheet.

## Verification

- Full `npm run ci`: 337 frontend tests / 31 files, typecheck, production build, rustfmt,
  50 Rust tests, and Clippy passed after the theme/default changes.
- Final frontend CI rerun covers subsequent CSS/banner and tooltip cleanup.
- Browser preview: navigated all four views, switched dark/light, opened/closed the calibration
  wizard, enabled trend-chart and 3D-pose panels through Settings.
- DOM geometry checked at 1440x900, 1024x768 and 768x900. Found and fixed a conflicting legacy
  breakpoint leaving a spare grid column. Checked panels had no horizontal content overflow.
- With chart/pose enabled at 1024x768, both canvas dimensions were positive and both panel
  scroll heights equaled their client heights. These checks cover layout, not sensor accuracy.
- Screenshot capture was unavailable in the connected in-app browser, so pixel-level visual QA
  and native Windows/DPI verification are not claimed. A draft PR preserves this review gap.
- Production bundle still has the previously known non-blocking large Leg3D chunk warning.

## Handoff

Run `npm run dev -- --port 1428` in `IRMS_App_Tauri`, open `/ui-preview.html`, and inspect the
first design in both themes. Preview IPC returns sample/empty data and cannot certify database,
updates, or BLE behavior. Use `npm run tauri dev` for native acceptance. The mock browser preview
starts in demo mode and cannot update a real device.

Before merge, visually review native desktop layouts and perform the previously recorded
hardware acceptance work separately. Do not infer that a UI refresh closes the code-review findings.
