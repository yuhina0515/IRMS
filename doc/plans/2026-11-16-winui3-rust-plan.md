---
tags: [irms, plan, architecture, rust, winui3, windows]
date: 2026-11-16
summary: "Plan to replace the WebView (React/TypeScript) interface with a pure-Rust WinUI 3 interface on Windows; Android development is paused like iOS. Gated by a feasibility spike and measured against a baseline."
---

# WinUI 3 + Rust interface plan (2026-11-16)

Decisions by the owner on 2026-11-16:

1. Replace the WebView interface with a native one to cut resource use.
2. Pause Android development, the same way iOS was paused on 2026-10-15.
3. Build for Windows only, with WinUI 3 and Rust.

This replaces the earlier Slint and native-Android drafts of this plan (commits `58743f1`,
`b4b9a18`).

Goal: IRMS runs on Windows as one Rust program with a WinUI 3 interface and no WebView in normal
use, with the same features as the Tauri desktop app and a measured drop in memory and CPU use
against the Tauri baseline.

Constraints:

- The December report plan (`2026-11-10-december-report-plan.md`) keeps priority. The Tauri app
  stays the shipping line until cutover; nothing here may block `beta.26`.
- Toolkit: Microsoft's `windows-reactor` crate (declarative WinUI 3 for Rust), the same toolkit
  the owner's JoyMap project uses. A C# WinUI 3 shell over a Rust library is the fallback only
  if a spike gate fails.
- No resource claim without a measurement from phase 0 and phase 1.

## What pausing Android means

- No new Android releases. The last one (`beta.25`, versionCode 1002025) stays published as it is.
- The Android code in `IRMS_App_Tauri` (Gradle project, JNI init, bundled root certificates) is
  left in place and not maintained. It is not ported to the new app.
- The Android keystore in `IRMS_secrets` is kept; losing it would block any later upgrade path.
- The core crate from phase 2 keeps platform-specific code behind `cfg` so a later mobile
  interface can reuse it, but nothing is built or tested for mobile.

## What exists today (measured 2026-11-16, tracked files, tests included)

| Part | Size | Fate |
|---|---|---|
| `src-tauri/src/*.rs` | 7,400 lines | Kept; split from Tauri types into a core crate |
| `src/services` | 6,700 lines TS | Ported to Rust |
| `src/store`, `src/shared`, `src/hooks`, `src/platform` | 2,500 lines TS | Ported to Rust or replaced by component state |
| `src/components`, `src/views` | 5,250 lines TSX | Rewritten as `windows-reactor` components |
| `src/i18n` | 2,000 lines TS | Converted to a Rust string table |
| CSS | 3,100 lines | Replaced by WinUI styling |
| `Leg3D.tsx` (three.js), `chartSetup.ts` (Chart.js) | 2 files | No drop-in replacement; see gates G2 and G3 |
| Runtime modules (`modules.rs`, `modules.ts`, `modulesInstall.ts`) | JS loaded over `asset:` | See open decision D2 |

## What the toolkit offers (checked in `windows-reactor` 0.100.0 on 2026-11-16)

- Present: `Grid`, `NavigationView`, `TabView`, `ListView`, `TextBox`, `NumberBox`, `ComboBox`,
  `Slider`, `ToggleSwitch`, `ContentDialog`, `InfoBar`, `ProgressBar`, `Image`, `Canvas` with
  `Line`, `Rectangle` and `Ellipse`, `SwapChainPanel`, `WebView2`.
- Not found: `Path`, `Polyline`, `Polygon`. A chart cannot be one polyline element.
- Known from JoyMap on 0.100: no timers and no key events; dynamic lists need
  `View::keyed_fragment`.
- crates.io also lists `windows-reactor-pre` 0.108.0, a snapshot of a newer API. The spike checks
  whether it closes the gaps above.
- Text boxes are the system's own controls, so Chinese input needs no special work.

## Phase 0: baseline (no code change)

Measure the current Tauri build on one Windows machine:

- Memory (whole process tree, WebView2 processes included): idle on the home screen, during a
  live session, after 10 minutes of a session.
- CPU during a live session.
- Cold start time and installer size.

Done when the numbers are in a coding log. These numbers set the target for gate G4.

## Phase 1: feasibility spike (go or no-go)

A throwaway app in a new crate, not connected to the shipping app. Each gate is pass or fail.

| Gate | Question | Pass when |
|---|---|---|
| G1 | Can sensor data reach the interface at full rate? The toolkit has no timers, and BLE runs on a tokio runtime. | Live values from the sensor (or a simulated stream at the same rate) update the screen without lag or a growing queue |
| G2 | Can a live chart keep up? | A session chart at the sensor's rate holds a steady frame rate, drawn either with `Canvas` lines or on a `SwapChainPanel` |
| G3 | What replaces the 3D leg? | Either a 3D view on a `SwapChainPanel` or a 2D drawing the owner accepts (D3) |
| G4 | Is the saving real? | Memory in a live session is clearly below the phase 0 baseline |
| G5 | Can the v3 layout be built? | One full screen of the v3 "Rehabilitation Workbook" design is reproduced closely enough for the owner to accept |

If G1, G2 or G5 fails because of the toolkit, repeat that gate once with `windows-reactor-pre`,
then with a C# WinUI 3 shell over the Rust core, before stopping. If G4 shows no clear saving,
stop: the rewrite has no purpose.

Done when each gate has a result and a recommendation is written in a coding log.

## Phase 2: core crate (useful even if the rewrite stops)

Move BLE, database, migrations, protocol, telemetry, firmware delivery and module verification out
of `src-tauri` into an `irms-core` crate with no Tauri types. The Tauri app becomes a thin layer
over it and keeps shipping. Done when `npm run ci` passes with the Tauri app on the core crate.

## Phase 3: port the TypeScript logic

Port `src/services` and the stores into `irms-core`, one service at a time, each with its vitest
cases ported to `cargo test`. The Tauri app can call the Rust version as each one lands, so the
port is checked in the shipping app before the new interface exists.

## Phase 4: WinUI 3 interface

Rebuild the v3 screens as `windows-reactor` components, in the order a session uses them:
connect, live session, calibration, history, settings, tools. The no-page-scrolling rule stays.

## Phase 5: replace what Tauri provided

- Updater: existing installs update through the signed `latest.json` of `tauri-plugin-updater`.
  The new app needs its own updater, and the last Tauri release must be able to update into the
  first WinUI release.
- Installer and the Windows App SDK runtime (bundled, as `windows-reactor-setup` does for JoyMap).
- Single instance, file dialogs, splash, the DPI guard, the Electron data migration.
- The database stays at its current path so no data migration is needed.

## Phase 6: runtime modules

Implement the design chosen in D2 and move the existing modules in `IRMS-Modules` to it.

## Phase 7: parity and cutover

Feature checklist against the Tauri app, device sessions, phase 0 measurements repeated. Then the
Tauri app is frozen the way the Electron app was.

## Open decisions for the owner

| # | Decision | Default used until answered |
|---|---|---|
| D1 | When phases 2 onward may start | After the December report; phases 0 and 1 may run before it because they do not touch the shipping app |
| D2 | Module system: keep the JS modules and show them in a `WebView2` created only while the tools tab is open, or redesign modules without a WebView | Keep the JS modules in an on-demand `WebView2`; the existing signed delivery stays unchanged |
| D3 | The 3D leg: keep real 3D or accept a 2D drawing | Decide at gate G3 with both shown |

## Risks

- `windows-reactor` is young: version 0.100 lacks timers, key events and several shape elements.
  Phase 1 exists to find out whether that blocks IRMS.
- The interface rewrite is the larger part of the code base and has no automated visual tests.
- Existing installs update through the Tauri updater; a break in that chain strands users.
- Two interfaces exist side by side from phase 4 to cutover, and fixes must go to both.
- Windows only: users on Android stay on `beta.25` with no fixes.
