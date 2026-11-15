---
tags: [irms, rust, slint, ui, prototype, measurement]
date: 2026-11-16
summary: "Phase 0 baseline of the shipping Tauri app and a first Slint live-session prototype (IRMS_App_Native) on simulated data; first G1/G3/G4 readings."
---

# Rust-native plan: Phase 0 baseline and Phase 1 prototype start (2026-11-16)

Owner choices today: toolkit = Slint (confirmed); style directions to prototype = v3 Workbook carry-over,
calm companion, dark studio; next step = build the prototype first.

## Built

`IRMS_App_Native/` (standalone crate, not part of the shipping app): Slint 1.18, simulated 50 Hz knee
angle, coaching band, 2D side-view pose, 5 s live chart with target zone, hold bar, start/stop, three
style palettes x day/night switch (palette table in `ui/app.slint`, `Theme` global). Traditional Chinese
text uses the system Microsoft JhengHei.

## Measurements (one machine, idle desktop, 2026-11-16)

| | Tauri 1.2.0-beta.25 (installed) | Native prototype, software renderer |
|---|---|---|
| Processes | 7 (incl. WebView2) | 1 |
| Working set | 390 MB | 24 MB |
| Private bytes | 328 MB | 7 MB |
| CPU | 0.2 % of one core, idle connect screen | 5 % of one core, live simulated chart at 50 Hz |
| Binary | 9.2 MB exe (+ WebView2 runtime) | 7.4 MB exe |

Caveats, so these are not over-read:
- Tauri was measured on its idle connect screen with a scratch `APPDATA`, not in a live session; its CPU in
  a live session is unmeasured (phase 0 still owes that, plus 10-minute memory growth and cold start).
- The native CPU figure is the software renderer redrawing a path chart at 50 Hz; it is higher than Tauri idle,
  so "less CPU" is not shown, only "far less memory".
- Native binary ran in a scratch process with no real data layer, BLE or DB; a full app will be larger.

## Gates so far

- G3 (Traditional Chinese): display PASS (screenshot). Input method into a text field: not tested.
- G4 (saving): memory saving looks large (about 16x on working set) but is provisional per the caveats.
- G1 (chart keeps up): simulated rate holds 49 Hz; frame rate not measured on the software renderer.
- G2 (3D leg): not started; the prototype is 2D only.

## Open findings

- The default GL renderer (femtovg) showed a blank white window in this environment (virtual display driver
  present next to the GTX 1070); cause not isolated, could be capture or GL context. Software renderer works
  (`SLINT_BACKEND=winit-software`). Needs a check on a real display before choosing a renderer.
- Style switching and the start/stop button were not click-tested; only the Workbook day theme was seen.
