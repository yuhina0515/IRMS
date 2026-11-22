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

- The owner requested the first native installer as `v1.3.0-beta.1`; see
  [[2026-11-16-native-beta1-installer]]. This is a separate, unsigned test release,
  with no Tauri updater cutover or claim of feature parity. The existing database
  isolation remains in place. Public code signing is still pending.
- Phase 0: measured, see `doc/coding log/log_20261116_rust_native_phase1_prototype.md`. Cold start to first
  frame and installer size are still owed.
- Phase 1: prototype built; G1 pass on simulated data, G3 display pass (input method untested), G4 pass for
  memory (no CPU saving shown), G2 not started. Style chosen: calm companion.
- Phase 2: all screens built on simulated data, see `log_20261116_rust_native_phase2_screens.md`. Open until
  the owner has clicked through it.
- Phase 3: started 2026-11-16 at the owner's request (earlier than the D1 default). Slice 1 done: `IRMS_Core`
  holds types, protocol, defaults, downsample, migrations, ble_lifecycle, db; see
  `log_20261116_rust_native_phase3_core_slice1.md`. Slice 2 done: the BLE transport is in the core
  behind a `BleHost` trait (needs a real-device run before merging). Telemetry, firmware and modules still in `src-tauri`.
- Phase 4: started. `judge.rs` in the core ports movementMetric, guidance and triggerEngine with 37 tests;
  the native prototype judges with it. See `log_20261116_rust_native_phase4_judge.md`.
  Also ported and checked call by call against the TypeScript on shared fixtures: session analysis, angle
  maths, slip monitor, unified calibration core. The prototype runs the whole pipeline on a simulated
  two-sensor rig (`log_20261116_rust_native_prototype_real_pipeline.md`). Left: sessionController, the older
  calibration methods, mobility measurement, the translation layer. Native session storage, retry on write failure,
  packet-driven judging and Windows history reopen are covered in [[log_20261116_native_sqlite_recovery]].
  The native session feedback slice (ordered BLE effects, mute/rearm, Windows
  speech, stop/fault/close ownership and normalized snapshots) is implemented;
  see [[log_20261116_native_session_feedback]]. Complete controller/reconnection
  parity, mobility flow, translations and the other listed gates remain open.
- 2026-11-17: mobility measurement, the calibration flow (presets, leg, quick re-zero, restore at startup)
  and the pre-session wearing check are ported and shown in the native app, see
  [[log_20261117_native_mobility_wearing]]; released as `v1.3.0-beta.2`. Simulated rig only. Still open:
  legacy/Euler branch (deliberately not ported), phase 5 (updater cutover, single instance, file dialogs,
  Electron migration), phase 6 modules (D2), 3D leg (D3), signing and physical-device acceptance.
- New open point: renderer choice. Software renderer about 8 MB private, GL about 100 MB; the GL window could
  not be confirmed on screen from a remote capture.

- 2026-11-17 (later, beta.3 to beta.11): **Phase 5 is largely done**: single instance and the CSV file dialog
  (beta.3), the Tauri updater cutover and first-launch import of the Tauri database (beta.6), a signed
  self-updater with silent `/SELFUPDATE` installs (beta.9; the laptop updated beta.9 to beta.11 by itself),
  installer/uninstaller that close a running app, firmware check and OTA UI (beta.5, beta.10). Phase 6 follows
  D2: modules are built into the program. D3: the 3D leg stays a projected drawing. D5: Slint license read against
  the IRMS license, no conflict ([[log_20261117_slint_license_review]]). Real-device evidence (from telemetry):
  connection, streaming, calibration, one session; beta.1 to beta.6 had run the simulator by default, fixed in
  beta.7 ([[log_20261117_native_real_ble_default]]). Windows holding a paired device makes the app unable to find it
  ([[log_20261117_native_connect_retry_and_ota]]). Still open: OTA on hardware (never seen to finish on Windows),
  CSV in Excel, renderer choice and IME, signing (owner: not now), Phase 7 parity checklist and cutover, merge of the
  PR stack #9 to #12. Dependency audit: [[log_20261117_dependency_audit]].

## Open decisions for the owner

Development after the feedback slice adds prescription CRUD, ID-bound confirmations
and isolated preference persistence; see [[log_20261116_native_actions_preferences]].
Further expansion stopped when the owner cleared the goal. The remaining migration
and acceptance gates below are still open; beta.1 artifacts were not replaced.

| # | Decision | Default used until answered |
|---|---|---|
| D1 | When phases 3 onward may start | Started 2026-11-16 on the plan branch at the owner's request; merging to main still waits for the December report |
| D2 | Module system without a WebView | ~~Decided 2026-11-17: built into the program~~. **Reversed by the owner 2026-11-22** (modules must update without an app update, with a management page). New direction from [[log_20261122_meeting_updatable_modules]]: phase 1 signed module packages + host-rendered declarative screens + registry/rollback + management page; phase 2 wasmi logic modules behind a capability API. Built-ins stay as fallbacks |
| D3 | The 3D leg: real 3D or a 2D drawing | Decided 2026-11-17: keep the projected drawing, no 3D engine |
| D4 | Interface style direction | Decided 2026-11-16: calm companion (柔和陪伴), chosen from three prototyped directions; snapshots in `assets/2026-11-16-native-prototype/` |
| D5 | Slint license: royalty-free with a Slint attribution, or GPLv3 | Decided 2026-11-17: royalty-free with attribution. License text read against the IRMS license on 2026-11-17, no conflict found (see `doc/coding log/log_20261117_slint_license_review.md`) |

## Risks

- The interface rewrite is the larger part of the code base and has no automated visual tests.
- Screens built on simulated data can hide problems that only real sensor data shows.
- Existing installs update through the Tauri updater; a break in that chain strands users.
- Windows only: users on Android stay on `beta.25` with no fixes.
