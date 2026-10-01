# 2026-10-01 Android APK and beta.21

## Result
- Android APK builds (debug and signed release) and ships with desktop beta `v1.2.0-beta.21` (release asset `IRMS_1.2.0-beta.21_android_arm64.apk`, arm64-v8a only, sideload, no auto-update).
- Toolchain: SDK/NDK 27 at `E:\Android\Sdk`, AVD `irms_api34` (Android 14, x86_64) at `E:\Android\avd`. Env needed per shell: ANDROID_HOME, NDK_HOME, JAVA_HOME (Microsoft JDK 21).

## Changes
- btleplug on Android: vendored droidplug + jni-utils Java sources under `gen/android/app/src/main/java`, `JNI_OnLoad` in `lib.rs` (jni 0.19 / jni-utils, android-only deps), ProGuard keep rules.
- Manifest BLE permissions (BLUETOOTH_SCAN/CONNECT, legacy + location for API <= 30); `MainActivity` requests them at start.
- HTTPS: reqwest's platform verifier panics on Android (no Kotlin init), so `telemetry::with_platform_roots` uses bundled `webpki-root-certs` on Android only.
- Release signing via env vars `IRMS_ANDROID_KEYSTORE` / `IRMS_ANDROID_KEYSTORE_PASSWORD`; keystore and password live in IRMS_secrets (new, back it up; losing it breaks APK upgrades).
- `tauri.conf.json` pins Android versionCode (1002021) because the derived code is identical for all 1.2.0 betas. Bump it with every release.

## Problems hit
- Wrong JAVA_HOME derived from `which java` made the first Gradle run fail.
- Release build crashed on first network call (platform verifier not initialised); the debug run had not exercised it. Found by testing the release build on the emulator, fixed above.
- rustfmt failure in CI after adding JNI_OnLoad; fixed.

## Verified
- Debug and release APK launch on API 34 emulator, UI renders, Connect tap yields "Connection failed" without crash (emulator has no Bluetooth). Release APK signature verified (v2).
- `npm run ci` green (463 vitest, 84 cargo tests, clippy).

## Not verified (needs a real phone)
- Actual BLE scan/connect/notify on hardware, runtime permission prompt flow, HTTPS requests succeeding on Android (only "no panic" observed), OTA firmware from Android, layout on real devices (bottom gesture bar overlaps the footer text slightly), armv7 and x86 builds not shipped, Play Store/iOS not started.
