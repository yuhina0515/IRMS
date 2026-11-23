---
tags: [irms, native, telemetry, preferences, bugfix]
summary: Native app remembers the opt-in telemetry choice (default off, like Tauri); calibration ids made strictly increasing after a flaky test.
date: 2026-11-17
---

# Remember telemetry choice; calibration id fix

- **Decision (assistant, evidence-based, reversible):** the Tauri app stores `telemetryEnabled` as a persisted
  setting, default false, chosen by the user in Settings. The native app forgot the choice at every launch. It now
  persists it in the preferences sidecar (`telemetryOn`, default false; old files without the field read as off).
  Startup re-enables telemetry only when the saved choice is on. "Reset preferences" keeps the current telemetry
  state, so resetting the look never changes data sharing. A failed or blocked preference read falls back to off.
- **Bug fix:** `cal-<ms>` ids could collide when two calibrations were created in one millisecond (seen as a flaky
  `quick_rezero_keeps_the_axes_and_replaces_the_zero`). `wizard::new_calibration_id()` is strictly increasing;
  both creation sites use it.
- Verification: native 39 tests (new: choice survives restart, old file defaults off), 8 repeated runs stable,
  core 180, Clippy and fmt clean, release build OK. Not run: a launch with saved telemetry on (the default
  endpoint is the public collector, not used for tests).
- Hardware: a 10 s BLE scan with the radio on found no IRMS device (only one unnamed -100 dBm peer); radio restored
  to off. Device validation, renderer/IME on a real screen, signing and the Tauri updater run remain open.
- Slint license read against the IRMS license: see `log_20261117_slint_license_review.md`.
