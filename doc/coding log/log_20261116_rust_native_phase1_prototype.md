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

## Measurements (one machine, 2026-11-16)

Tauri = installed 1.2.0-beta.25 (see the correction at the end: the scratch `APPDATA` did not take effect), whole process tree (7 processes, WebView2
included), demo mode playing the "rep-cycle" scenario. Native = `IRMS_App_Native` release build, one
process, simulated 50 Hz data with `--run`. CPU is percent of one core over 20 s.

| State | Tauri working set / private / CPU | Native software renderer | Native GL (femtovg) |
|---|---|---|---|
| Idle, not connected | 390 MB / 328 MB / 0.2 % | not measured | not measured |
| Live data, no session | 413 MB / 228 MB / 5.5 % | n/a | n/a |
| Session, start | 417 MB / 244 MB / 7.0 % | 24.3 MB / 7.6 MB / 4.1 % | 70.2 MB / 99.5 MB / 5.5 % |
| Session, +10 min | 247 MB / 250 MB / 5.2 % | 24.8 MB / 7.7 MB / 4.1 % | 43.4 MB / 99.3 MB / 5.5 % |
| Window handle after launch | 287 ms | 81 ms | 26 ms |
| Executable | 9.2 MB (+ WebView2 runtime) | 7.4 MB (first build, before the `image` crate was added) | same binary |

Reading:
- Memory: private bytes about 250 MB (Tauri) against about 8 MB (software) or about 100 MB (GL). The GL
  figure is mostly driver and context memory, so the renderer choice decides most of the saving.
- CPU: about the same in a session (5 to 7 % against 4 to 5.5 %). The rewrite does not show a CPU saving.
- No memory growth over 10 minutes on either side (private bytes flat).
- Window-handle time is not time to first painted frame; it is a rough lower bound only.

Caveats:
- The native prototype has no BLE, database, i18n or module layer; the full app will be larger.
- The two native runs ran at the same time as each other, and the Tauri run overlapped builds of the prototype
  in its first minutes; the +10 min Tauri reading was taken with nothing else building.
- The Tauri live screen has no trend chart; the prototype draws one at 50 Hz, so the comparison is not like for like.

## Gates so far

- G1 (chart keeps up): PASS on simulated data. 49 to 50 Hz data, GL renderer reports about 98 frames per second
  (frame counter from the rendering notifier; the software renderer has no counter).
- G3 (Traditional Chinese): display PASS on both renderers. Symbol glyphs (check mark, moon) were missing on the
  software renderer, so the state mark is now drawn as shapes. Input method into a text field: not tested.
- G4 (saving): PASS for memory on both renderers against the +10 min Tauri session, with the caveats above.
- G2 (3D leg): not started; the prototype is 2D only.

## Style decision (D4)

Three directions were built (Workbook carry-over, calm companion, dark studio), each day and night; snapshots
in `doc/plans/assets/2026-11-16-native-prototype/`. The owner chose calm companion (柔和陪伴) on 2026-11-16.
The layout follows the v3 live screen: coaching band, judged metric with ruler, pose stage, bottom dock.

## Open findings

- GL renderer: the renderer's own snapshot (`--snapshot`) is correct, but a screen capture of the window on
  this desktop (virtual display driver next to the GTX 1070) is blank white. Whether a person sees it blank is
  unknown; needs one look on the physical screen before a renderer is chosen.
- Style switching and start/stop were verified through launch flags (`--style`, `--night`, `--run`), not by
  clicking the buttons.
- Prototype flags: `--style N`, `--night`, `--run`, `--log`, `--snapshot <png>`.

## Correction (same day): the Tauri runs used the real database

The baseline runs set `APPDATA` and `LOCALAPPDATA` to a scratch folder before starting the Tauri app. That
does not redirect it: the app resolves its data folder through the Windows known-folder API, not the
environment variable. The scratch folders stayed empty and the app used the real
`%APPDATA%\com.irms.app.tauri\irms.sqlite` on this desktop. Found later the same day, when a second test
session showed the first one in History.

What it did there: two demo sessions (the 10-minute run, killed mid-session and so marked "not ended
normally", and an 11-second one) with 16,629 `sensor_data` rows, all `source = 'demo'`. The database held
no sessions before; schema version unchanged (10); the five prescriptions untouched.

Cleanup done: the three database files were copied to
`%APPDATA%\com.irms.app.tauriackup-20261116-before-demo-cleanup\`, then exactly those two sessions and
their rows were deleted. Now 0 sessions, 0 sensor rows, 5 prescriptions. The session id counter stays at 2,
so the next real session gets id 3.

The measurements themselves are unaffected (same binary, same work). For future runs, isolate the Tauri app
with a different app identifier (the existing `com.irms.app.tauri.v3check` folders show that method), not
with environment variables, and check the real database's row counts before and after.
