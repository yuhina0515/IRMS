---
tags: [irms, plan, architecture, rust, slint, windows, ui]
date: 2026-11-16
summary: "Plan to replace the WebView (React/TypeScript) interface with a Rust-native interface on Windows, starting from the interface itself; Android development is paused like iOS."
---

# Rust-native interface plan (2026-11-16)

Decisions by the owner on 2026-11-16, in order:

1. Replace the WebView interface with a native one to cut resource use.
2. Pause Android development, the same way iOS was paused on 2026-10-15. Windows only.
3. The interface is Rust-native, not WinUI 3.
4. The work starts from the interface, not from the core.

This replaces the earlier drafts of this plan (Slint with Android `58743f1`, native Android
fallback `b4b9a18`, WinUI 3 `8afcecf`).

Goal: IRMS runs on Windows as one Rust program with a Rust-native interface and no WebView in
normal use, with the same features as the Tauri desktop app and a measured drop in memory and CPU
use against the Tauri baseline.

Constraints:

- The December report plan (`2026-11-10-december-report-plan.md`) keeps priority. The Tauri app
  stays the shipping line until cutover; nothing here may block `beta.26`.
- Toolkit: Slint (Rust-native, draws its own widgets, free styling, has a `Path` element for
  charts). Confirmed by the owner on 2026-11-16.
- No resource claim without a measurement.

## What pausing Android means

- No new Android releases. The last one (`beta.25`, versionCode 1002025) stays published as it is.
- The Android code in `IRMS_App_Tauri` is left in place and not maintained. It is not ported.
- The Android keystore in `IRMS_secrets` is kept; losing it would block any later upgrade path.

## What exists today (measured 2026-11-16, tracked files, tests included)

| Part | Size | Fate |
|---|---|---|
| `src/components`, `src/views` | 5,250 lines TSX | Rewritten in Slint (phases 1 and 2) |
| CSS | 3,100 lines | Replaced by Slint styling |
| `src/i18n` | 2,000 lines TS | Converted to Slint translations |
| `Leg3D.tsx` (three.js), `chartSetup.ts` (Chart.js) | 2 files | No drop-in replacement; settled in phase 1 |
| `src/services` | 6,700 lines TS | Ported to Rust (phase 4) |
| `src/store`, `src/shared`, `src/hooks`, `src/platform` | 2,500 lines TS | Ported to Rust or replaced by Slint properties |
| `src-tauri/src/*.rs` | 7,400 lines | Kept; split from Tauri types into a core crate (phase 3) |
| Runtime modules | JS loaded over `asset:` | See open decision D2 |

## Phase 0: baseline (no code change)

Measure the current Tauri build on one Windows machine: memory of the whole process tree
(WebView2 included) idle, in a live session and after 10 minutes; CPU in a live session; cold
start time; installer size. Done when the numbers are in a coding log.

## Phase 1: interface style and prototype

A new crate `IRMS_App_Native`, not connected to the shipping app, fed by simulated sensor data.

1. The owner picks one or two style directions (D4).
2. Build the live-session screen in each picked direction as a running Slint window: angle
   readout, live chart, pose view, session controls, day and night.
3. The owner chooses one. That screen becomes the reference for every other screen.

The prototype also answers the feasibility questions, each pass or fail:

| Gate | Question | Pass when |
|---|---|---|
| G1 | Can a live chart keep up? | The chart at the sensor's rate holds a steady frame rate |
| G2 | What replaces the 3D leg? | A 3D view or a 2D drawing the owner accepts (D3) |
| G3 | Does Traditional Chinese work? | Text renders with a bundled CJK font and a text field accepts Chinese from the system input method |
| G4 | Is the saving real? | Memory with the screen running is clearly below the phase 0 baseline |

If G4 shows no clear saving, stop: the rewrite has no purpose.

## Phase 2: all screens, still on simulated data

Build the remaining screens in the chosen style, in the order a session uses them: connect,
calibration, history, settings, tools. Rules kept from v3: no page-level scrolling, session start
blocked until calibrated, 2D pose by default. Done when the owner can click through the whole app.

## Phase 3: core crate

Move BLE, database, migrations, protocol, telemetry, firmware delivery and module verification out
of `src-tauri` into an `irms-core` crate with no Tauri types. The Tauri app becomes a thin layer
over it and keeps shipping. Done when `npm run ci` passes with the Tauri app on the core crate.

## Phase 4: port the TypeScript logic and connect

Port `src/services` and the stores into `irms-core`, each with its vitest cases ported to
`cargo test`, and replace the simulated data in the new interface screen by screen.

## Phase 5: replace what Tauri provided

- Updater: the last Tauri release must be able to update into the first native release.
- Installer, single instance, file dialogs, splash, the DPI guard, the Electron data migration.
- The database stays at its current path so no data migration is needed.

## Phase 6: runtime modules

Implement the design chosen in D2.

## Phase 7: parity and cutover

Feature checklist against the Tauri app, device sessions, phase 0 measurements repeated. Then the
Tauri app is frozen the way the Electron app was.

## Status (2026-11-16)

- Phase 0: measured, see `doc/coding log/log_20261116_rust_native_phase1_prototype.md`. Cold start to first
  frame and installer size are still owed.
- Phase 1: prototype built; G1 pass on simulated data, G3 display pass (input method untested), G4 pass for
  memory (no CPU saving shown), G2 not started. Style chosen: calm companion.
- Phase 2: all screens built on simulated data, see `log_20261116_rust_native_phase2_screens.md`. Open until
  the owner has clicked through it.
- Phase 3: started 2026-11-16 at the owner's request (earlier than the D1 default). Slice 1 done: `IRMS_Core`
  holds types, protocol, defaults, downsample, migrations, ble_lifecycle, db; see
  `log_20261116_rust_native_phase3_core_slice1.md`. BLE, telemetry, firmware and modules still in `src-tauri`.
- New open point: renderer choice. Software renderer about 8 MB private, GL about 100 MB; the GL window could
  not be confirmed on screen from a remote capture.

## Open decisions for the owner

| # | Decision | Default used until answered |
|---|---|---|
| D1 | When phases 3 onward may start | Started 2026-11-16 on the plan branch at the owner's request; merging to main still waits for the December report |
| D2 | Module system without a WebView | Decide after phase 2; none is built before then |
| D3 | The 3D leg: real 3D or a 2D drawing | Decide at gate G2 with both shown |
| D4 | Interface style direction | Decided 2026-11-16: calm companion (柔和陪伴), chosen from three prototyped directions; snapshots in `assets/2026-11-16-native-prototype/` |
| D5 | Slint license: royalty-free with a Slint attribution, or GPLv3 | Royalty-free with attribution; read the license text against the IRMS license before cutover |

## Risks

- The interface rewrite is the larger part of the code base and has no automated visual tests.
- Screens built on simulated data can hide problems that only real sensor data shows.
- Existing installs update through the Tauri updater; a break in that chain strands users.
- Windows only: users on Android stay on `beta.25` with no fixes.
