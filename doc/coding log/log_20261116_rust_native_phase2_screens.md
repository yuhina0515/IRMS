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

## Second pass (same day)

Added: search field on the prescription list (filtering in Rust), history paging (previous / next, eight
rows per page), and a 3D candidate for gate G2: the leg projected in a three-quarter view on a ground grid,
drawn with the same `Path` element, no 3D engine. It is a drawing, not a rotatable model.

Checked with real mouse and injected keyboard input on the software renderer:
- Typing Chinese text into the search field filters the list (characters sent as Unicode key events).
- Picking a prescription shows its detail; recording the comfort angle in tools stores the live value;
  history next page shows rows 9 and 10 of ten.

Phase 0 number that was owed: the Tauri installer `IRMS.Dashboard_1.2.0-beta.25_x64-setup.exe` is 3.97 MB
(it relies on the WebView2 runtime already on the machine). The native executable is 9.7 MB and compresses to 4.1 MB with LZMA, so an
installer would be about the same size as today's, without needing WebView2.

## Not done or not checked

- Third click pass, all worked: history delete (ten rows became nine), "use for live monitoring" (live
  title changed to the picked prescription), disconnect during a session (session saved to history with its
  count and duration), night switch in settings.
- Still not confirmed by click: the history review panel (the test deleted a row right after, which closes
  it by design), the limit and clear buttons in tools, the style buttons in settings.
- Placeholders with no behaviour: add / edit / restore prescription, firmware and software update, live
  share, history analysis (review shows a one-line summary only).
- Chinese input method composition (candidate window, commit) is still untested: injected Unicode key
  events bypass the input method. Needs a person typing with 注音 or 倉頡. Numeric fields are not built.
- Gate G2 is the owner's call between the 2D view and the projected drawing; a true 3D model is not built.
- Only Traditional Chinese strings, hard-coded; no translation layer yet.
- Cold start to first painted frame is still unmeasured on both apps.
- The owner has not clicked through the prototype; phase 2 is "done" only when they have.

## Run it

```
cd IRMS_App_Native
cargo run --release                    # GL renderer
set SLINT_BACKEND=winit-software       # software renderer (lower memory)
```

Flags: `--style N`, `--night`, `--view N`, `--settings-tab N`, `--connected`, `--calibrated`, `--run`,
`--wizard`, `--pose N`, `--search <text>`, `--seed-history`, `--inject-fault`, `--real-ble`, `--log`,
`--snapshot <png>`, `--snapshot-after S`.
