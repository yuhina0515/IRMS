---
tags: [irms, plan, architecture, rust, slint, android]
date: 2026-11-16
summary: "Plan to replace the WebView (React/TypeScript) interface with a pure-Rust Slint interface on Windows and Android, gated by a feasibility spike and measured against a baseline."
---

# Pure-Rust interface plan (2026-11-16)

Decision by the owner on 2026-11-16: go with option B, a pure-Rust GUI without a WebView, while
keeping Android support. This plan sets the order of work and the points where the work stops if
the evidence is against it.

Goal: IRMS runs on Windows and Android with no WebView, the same features as the Tauri app, and a
measured drop in memory and CPU use against the Tauri baseline.

Constraints:

- The December report plan (`2026-11-10-december-report-plan.md`) keeps priority. The Tauri app
  stays the shipping line until cutover; nothing here may block `beta.26`.
- Toolkit: Slint on both platforms. If a spike gate fails on Android, the fallback there is a
  native Android interface (Kotlin, Jetpack Compose) over the same Rust core, with Slint kept
  for Windows (see D5). egui is no longer the fallback.
- No resource claim without a measurement from phase 0 and phase 1.

## What exists today (measured 2026-11-16, tracked files, tests included)

| Part | Size | Fate |
|---|---|---|
| `src-tauri/src/*.rs` | 7,400 lines | Kept; split from Tauri types into a core crate |
| `src/services` | 6,700 lines TS | Ported to Rust |
| `src/store`, `src/shared`, `src/hooks`, `src/platform` | 2,500 lines TS | Ported to Rust or replaced by Slint properties |
| `src/components`, `src/views` | 5,250 lines TSX | Rewritten in Slint |
| `src/i18n` | 2,000 lines TS | Converted to Slint translations |
| CSS | 3,100 lines | Replaced by Slint styling |
| `Leg3D.tsx` (three.js), `chartSetup.ts` (Chart.js) | 2 files | No drop-in replacement; see gates G3 and G4 |
| Runtime modules (`modules.rs`, `modules.ts`, `modulesInstall.ts`) | JS loaded over `asset:` | Needs a new design; see open decision D2 |

## Phase 0: baseline (no code change)

Measure the current Tauri build on one Windows machine and one Android phone:

- Memory (whole process tree, WebView processes included): idle on the home screen, during a live
  session, after 10 minutes of a session.
- CPU during a live session.
- Cold start time, installer size, APK size.

Done when the numbers are in a coding log. These numbers set the target for gate G5.

## Phase 1: feasibility spike (go or no-go)

A throwaway app in a new crate, not connected to the shipping app. Each gate is pass or fail.

| Gate | Question | Pass when |
|---|---|---|
| G1 | Can Slint and `btleplug` live in one Android APK? `btleplug` needs its Java classes and a JNI init, which the Tauri Gradle project provides today. | The spike connects to the sensor (or any BLE peripheral) on a phone and shows a live value |
| G2 | Does Traditional Chinese work on Android and Windows? | Text renders with a bundled CJK font, and a text field accepts Chinese from the system keyboard on both |
| G3 | Can a live chart keep up? | A chart at the sensor's rate holds a steady frame rate on the phone |
| G4 | What replaces the 3D leg? | Either a 3D view through Slint's GPU integration or a 2D drawing the owner accepts (D3) |
| G5 | Is the saving real? | Memory in a live session is clearly below the phase 0 baseline on both platforms |

If G1 or G2 fails on Slint for Android, repeat that gate with a native Compose screen calling the
Rust core through generated Kotlin bindings (UniFFI) before stopping. If G5 shows no clear
saving, stop: the rewrite has no purpose.

Done when each gate has a result and a recommendation is written in a coding log.

## Phase 2: core crate (useful even if the rewrite stops)

Move BLE, database, migrations, protocol, telemetry, firmware delivery and module verification out
of `src-tauri` into an `irms-core` crate with no Tauri types. The Tauri app becomes a thin layer
over it and keeps shipping. Done when `npm run ci` passes with the Tauri app on the core crate.

## Phase 3: port the TypeScript logic

Port `src/services` and the stores into `irms-core`, one service at a time, each with its vitest
cases ported to `cargo test`. The Tauri app can call the Rust version as each one lands, so the
port is checked in the shipping app before the new interface exists.

## Phase 4: Slint interface

Rebuild the v3 "Rehabilitation Workbook" screens in Slint, in the order a session uses them:
connect, live session, calibration, history, settings, tools. Translations move to Slint's
translation system. The no-page-scrolling rule stays.

## Phase 5: replace what Tauri provided

- Updater: the signed `latest.json` flow from `tauri-plugin-updater` needs an own implementation
  that existing installs can still update into.
- Single instance, file dialogs, splash, the DPI guard, the installer, the Electron data migration.
- Android: Gradle project, permissions, the signing and versionCode flow.

## Phase 6: runtime modules

Implement the design chosen in D2 and move the existing modules in `IRMS-Modules` to it.

## Phase 7: parity and cutover

Feature checklist against the Tauri app, device sessions on both platforms, phase 0 measurements
repeated. Then the Tauri app is frozen the way the Electron app was.

## Open decisions for the owner

| # | Decision | Default used until answered |
|---|---|---|
| D1 | When phases 2 onward may start | After the December report; phases 0 and 1 may run before it because they do not touch the shipping app |
| D2 | Module system without a WebView: WebAssembly modules, Slint markup loaded at run time, or modules compiled into the app | Decide after the spike; none is built before then |
| D3 | The 3D leg: keep real 3D or accept a 2D drawing | Decide at gate G4 with both shown |
| D4 | Slint license: the royalty-free license (covers proprietary desktop and mobile apps, asks for a Slint attribution) or GPLv3 | Royalty-free with attribution; the license text must be read against the IRMS source-available license before cutover |
| D5 | Android interface: Slint (one interface for both platforms) or native Compose (second interface in Kotlin, Rust core shared) | Slint if G1 and G2 pass; native Compose if either fails |

## Risks

- The interface rewrite is the larger part of the code base and has no automated visual tests.
- Slint's Android support is official but younger than its desktop support; G1 and G2 exist to
  find its limits early.
- Existing installs update through the Tauri updater; a break in that chain strands users.
- Two interfaces exist side by side from phase 4 to cutover, and fixes must go to both.
