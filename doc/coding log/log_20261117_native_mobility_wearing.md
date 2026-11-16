---
tags: [irms, rust, slint, calibration, mobility, release]
date: 2026-11-17
summary: "Native calibration flow (presets, leg, quick re-zero, restore at startup), range-of-motion records with trend, and the pre-session wearing check; released as v1.3.0-beta.2."
---

# Native mobility measurement, calibration flow and wearing check

Goal from the owner: continue the feature migration, then publish `v1.3.0-beta.2`.
Baseline: `e7d74ea` (native prescriptions and preferences). Plan:
[[2026-11-16-rust-native-ui-plan]], gates in its Phase 4/7.

## What the Tauri app did that the native one did not

The Tauri mobility path is the unified calibration flow with the `mobility` preset
(`CalibrationFlow.tsx` + `calibrationFlow.ts`); the legacy `MobilityWizard` is only a
developer toggle and was **not** ported. The native wizard was a three-step prototype:
fixed left leg, no knee-first order, no skips, no mobility, no quick re-zero, and the
calibration was lost on every restart and on every disconnect.

## Changes

- `IRMS_Core::calibration_flow` (new): port of `calibrationFlow.ts` plus the record and
  trend half of `mobilityC.ts`: presets, flow state machine (side/preset/neutral lock
  after the prepare page, mandatory knee sweep, skip, re-capture discards every movement),
  `solve_flow`, `rezero_profile`, `wearing_verdict`, `is_still_window`, method identity
  (`schema` 2, side, reference kind, posture), `comparable_trend`, `trend_with_breaks`.
  14 unit tests.
- Native `wizard.rs` (new, replaces the prototype wizard in `pipeline.rs`): leg choice,
  calibrate / mobility / quick re-zero presets, reference kind and posture, per-movement
  early feedback, skip, two-press re-capture, review with per-movement peaks, failed
  movements and a redo, optional mobility record, apply.
- `Store`: `active_profile`, `apply_calibration` (profile first; a mobility-record failure
  leaves the calibration applied and is reported), `mobility_rows`. The calibration in
  force is restored at startup and is no longer dropped on disconnect.
- Settings / Calibration shows the newest total, the best comparable total and the
  comparable history, with a visible separator wherever the method identity changes.
- `wearing.rs` (new): on a real device (not the simulator) a session first runs the
  Tauri wearing check: take the reference posture, hold 2 s, verdict ok / inconclusive /
  re-zero (in-plane offset <= 20 deg, re-zero and start) / recalibrate / too far. Only an
  `ok` verdict starts the session by itself; every other verdict waits for the wearer.
  Disconnect closes a pending check.
- Simulated rig: hip extension and abduction scripts (`gravity_abd`), so the whole mobility
  preset runs headless; `--mobility-demo` and `--wizard-preset N` flags for snapshots.
- Version `1.3.0-beta.2` in the crate, lockfile, installer script, NSIS numeric version and
  release notes.

## Phase 5 items added after the beta.2 release (branch only, not in the beta.2 asset)

- History review has a CSV export (`Store::export_csv`, same metadata header and full readings as
  the Tauri export) through the system save dialog (`rfd`, no default features). Cancel writes
  nothing; failures are shown in the review panel. The dialog itself was not driven automatically;
  the CSV content is covered by a unit test.
- Single instance (`instance.rs`, named mutex): a second launch of the default installation shows
  the running window and exits; an explicit `--db` store is independent. Tested with two real
  launches against a scratch `LOCALAPPDATA`.
- Not ported on purpose: the DPI guard and WebView splash exist to work around WebView/tao
  behaviour and have no Slint counterpart.

## Decisions

- Legacy (Euler firmware) calibration branch: not ported. The native app already refuses
  firmware without gravity vectors with a visible message.
- Posture choice and "cannot fully straighten" are part of the prepare page, as in Tauri.
- Wearing check is skipped in simulated mode, as in Tauri.
- Not done on purpose: i18n (zh-Hant only), A/B calibration methods (merged into unified).

## Verification

- Core 150 tests, native 31 tests after the CSV test (30 at the beta.2 build), Clippy with
  warnings denied on both crates, `cargo fmt --check` clean.
- Simulated rig, full mobility preset: peaks match the scripted movements (hip flexion 60,
  extension 20, abduction 30, knee 80 degrees; total 190) and are saved with identity
  `schema 2 / left / straight / standing / calibrationId`.
- Persistence: apply, reopen the database, the calibration and the record are restored;
  a newer calibration replaces the active one.
- Wearing check on rotated vectors: reference pose passes, 12 deg in-plane re-zeroes and
  then passes, 40 deg in-plane is "too far", 25 deg out of plane asks to recalibrate,
  shaking or missing vectors give no verdict. A UI-level test starts a session on a matching
  pose and leaves a shifted pose waiting.
- Installed release (`/S`, default path): hash equals the build, version 1.3.0-beta.2,
  Settings snapshot inspected (mobility total 190 deg, restored calibration), silent
  uninstall removed files and registry, no default database was created.

## Not verified

No physical device: the wizard, mobility totals and the wearing check ran only against
the simulated two-sensor rig. Hip abduction on a real sensor is documented as less
reliable (coronal plane). The installer and executable are unsigned (Smart App Control
may still block them). The Tauri updater and `beta-latest` are untouched.

## Owner decisions (2026-11-17) and beta.3

- Release: CSV export and single instance ship as `v1.3.0-beta.3`; the published beta.2 is left untouched.
- D2: modules are built into the program (no downloaded scripts). Settings / Modules lists the
  built-ins truthfully: range measurement, mobility and session analysis are built in; live share
  (needs telemetry ported first) and firmware update (needs a physical device) are marked unported.
- D3: keep the projected drawing, no 3D engine; the button is renamed "立體投影".
- Tauri updater cutover and the Electron data migration wait for physical-device acceptance and signing.
- beta.3 installer: 5,936,790 bytes, SHA-256 `4511c7129c476e8177a968ec0ac65830a921969d377fb53d907a5af31c92d269`.
  Silent install, version 1.3.0-beta.3, installed hash equals the build, Settings / Modules snapshot
  inspected, silent uninstall removed files and registry, no default database created. 31 native tests
  and Clippy passed.
