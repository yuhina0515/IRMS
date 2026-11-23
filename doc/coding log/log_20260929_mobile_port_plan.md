---
tags: [irms, tauri, mobile, plan]
date: 2026-09-29
summary: Plan for taking IRMS_App_Tauri to Android + iOS with full BLE feature parity; codebase audit and blockers, no code changed yet.
---

# Mobile port plan (Android + iOS, full feature parity)

Decision (user, 2026-09-29): plan both platforms together; scope is full features including BLE to IRMS hardware.

## Audit of IRMS_App_Tauri (beta.18)

Already mobile-friendly:
- `Cargo.toml` crate-type has `staticlib`/`cdylib`; `lib.rs` uses `#[cfg_attr(mobile, tauri::mobile_entry_point)]`.
- `single-instance` is already behind `#[cfg(desktop)]` (lib.rs:34).
- rusqlite is `bundled`, reqwest uses rustls: both cross-compile.

Not ready:
- `tauri-plugin-updater` registered unconditionally (lib.rs:48) and `update.rs` commands assume desktop installers. Gate with `cfg(desktop)`; mobile updates go via store/APK.
- `ble.rs` uses btleplug (Manager::new at ble.rs:103). Android needs JNI init (`btleplug::platform::init`), Java glue (droidplug) and runtime permissions; iOS needs `NSBluetoothAlwaysUsageDescription`. OTA chunk delay tuned for WinRT (ble.rs:395) must be re-tuned per platform.
- `tauri.conf.json`: `bundle.targets` = nsis only; fixed 1280x820 / min 1024x600 window; CSP `connect-src` only allows ipc.
- `$APPDATA/modules/*.js` asset-protocol scope: verify path resolution in mobile sandbox.
- No `gen/android` or `gen/apple`; only `x86_64-pc-windows-msvc` Rust target installed; no Android SDK/NDK (JDK 21 present).
- UI is desktop layout (design v3, no page scroll); needs a responsive/touch layout.

## Phases

1. Toolchain: install Android Studio SDK + NDK, set `ANDROID_HOME`/`NDK_HOME`, add rust targets `aarch64-linux-android`, `armv7-linux-androideabi`, `x86_64-linux-android`. iOS needs a Mac + Apple Developer account (cannot be built on this desktop).
2. Cross-platform hygiene (desktop keeps working): `cfg(desktop)` for updater plugin and `update.rs` commands, JS-side platform check to hide update UI, window sizing only for desktop.
3. `tauri android init`; get the app launching with mock/no BLE.
4. BLE on Android: btleplug JNI init + permissions manifest; validate scan/connect/notify/OTA on real hardware.
5. Responsive UI pass (touch targets, single-column, safe areas).
6. iOS: `tauri ios init` on a Mac, Info.plist Bluetooth strings, re-validate BLE + OTA timing.
7. Distribution: signed APK/AAB for Android (manual, like the desktop signed build); TestFlight for iOS. Telemetry/firmware auto-OTA reuse existing signing.

## Done criteria
- Desktop `cargo check` + existing tests still pass after phase 2.
- Android debug APK connects to a real IRMS device over BLE and completes a data session.
- iOS build verified on a Mac before claiming parity.

## Open risks
- btleplug Android backend maturity (highest risk; same as the original Tauri migration's BLE concern).
- iOS cannot be verified from this machine.
