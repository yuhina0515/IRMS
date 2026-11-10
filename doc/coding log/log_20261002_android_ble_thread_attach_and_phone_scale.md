---
tags: [android, ble, layout]
date: 2026-10-02
summary: First real-phone telemetry showed BLE connect failing instantly on Android (ThreadDetached); fixed with a JVM-attached tokio runtime, plus phone-size layout scaling.
---

# Android BLE thread attach + phone scaling

## Finding
Telemetry from an S21 Ultra running beta.21 showed `ble_error: JNI call failed (op: connect)` ~2 ms after every Connect tap. Reproduced on the emulator (Connection failed). Surfacing the error chain in `ble.rs` (`error_chain`) revealed `Other(JniCall(ThreadDetached))`: btleplug's droidplug calls `global_jvm().get_env()` on whatever tokio worker polls the future, and those threads were never attached to the JVM. The beta.21 emulator check only proved "no crash", not "no error" - my mistake.

## Changes
- `lib.rs`: keep the JavaVM in a static from `JNI_OnLoad`; on Android build a multi-thread tokio runtime whose `on_thread_start` calls `attach_current_thread_permanently`, installed via `tauri::async_runtime::set` at the top of `run()`.
- `ble.rs`: `error_chain` helper (Display + Debug + sources) used on the adapter/scan/connect paths so JNI errors are diagnosable from telemetry.
- Layout: the WebView ignores a wider viewport, so `index.html` applies `zoom: 0.82` and an `android-phone` class on Android phones; `workbench.css` stretches `.v3-shell` to `100dvh / 0.82` (dvh is not zoom-adjusted) and pads the footer above the gesture bar (safe-area env() is 0 here).

## Verified
Emulator (API 34 x86_64, debug): Connect now logs `Requesting Bluetooth device...` with no error, and Android's BtGatt.ScanManager registers and releases a scanner over the 15 s timeout. Screenshots confirm full-height scaled layout and footer clear of the gesture bar. `npm run ci` passes.

## Not verified
Real sensor scan/connect/notify (emulator has no Bluetooth hardware), runtime permission prompt on a real phone, layout on other tabs, arm64 release build with these changes (not built or published yet).

## Release
Published v1.2.0-beta.22 (arm64 APK versionCode 1002022, signed, v2 verified; desktop installer + latest.json; beta-latest updated). Real-phone retest pending.
