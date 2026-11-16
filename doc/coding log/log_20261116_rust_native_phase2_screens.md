---
tags: [irms, rust, slint, ui, prototype]
date: 2026-11-16
summary: "Phase 2 start: every screen of the native prototype exists in the calm companion style on simulated data (live, prescription, history, tools, settings, calibration wizard)."
---

# Rust-native plan: Phase 2 screens on simulated data (2026-11-16)

Follows [[log_20261116_rust_native_phase1_prototype]]. Style is calm companion (D4, decided today).

## Built (`IRMS_App_Native`)

- `ui/theme.slint`: palette (three styles x day/night), `Btn`, `Chip`, `Card`, `PageHead`, and the `App`
  global holding the simulated app state shared by all screens.
- `ui/live.slint`: live monitoring, laid out like the v3 screen (coaching band, judged metric with ruler,
  pose stage with 2D / 3D / values, bottom dock).
- `ui/pages.slint`: prescription (list + detail, "use for live monitoring"), history (table, review,
  delete), tools (range measurement that records comfort and limit from the live angle; live share is a
  placeholder), settings (six categories).
- `ui/app.slint`: top navigation, connection button and status, calibration wizard (three capture steps).
- `src/main.rs`: 50 Hz simulated rep cycle (bend, 3 s hold, return, rest; every fifth rep overshoots),
  session logic, in-memory history, simulated connect delay.

Rules kept from v3: no page-level scrolling (history is paged at eight rows), session start blocked until
connected and calibrated, 2D pose by default, personal range has no default value.

## Checked

- Build: `cargo build --release`, no warnings. Executable 9.6 MB.
- Snapshots of nine states from the renderer itself: `doc/plans/assets/2026-11-16-native-prototype/p2-*.png`.
- Click-through with real mouse input on the software renderer: connect, calibration wizard (three steps),
  start session, end session, session appears in history. All worked.
- Resource use with all screens compiled in (session running, 15 s): software renderer 25.8 MB working set,
  8.6 MB private, 5.2 % of one core; GL renderer 76.4 MB, 107.8 MB, 7.2 %.

## Not done or not checked

- Not click-tested: prescription detail, history review and delete, tools recording buttons, settings
  switches, disconnect during a session. They compile and render; behaviour is unverified.
- Placeholders with no behaviour: add / edit / restore prescription, firmware and software update, live
  share, 3D pose (gate G2), history analysis (review shows a one-line summary only).
- Text input (search, numeric fields) and the Chinese input method (rest of gate G3) are not in the prototype.
- History paging shows page one only; previous / next are not built.
- Only Traditional Chinese strings, hard-coded; no translation layer yet.
- The owner has not clicked through the prototype; phase 2 is "done" only when they have.

## Run it

```
cd IRMS_App_Native
cargo run --release                    # GL renderer
set SLINT_BACKEND=winit-software       # software renderer (lower memory)
```

Flags: `--style N`, `--night`, `--view N`, `--settings-tab N`, `--connected`, `--calibrated`, `--run`,
`--wizard`, `--seed-history`, `--log`, `--snapshot <png>`.
