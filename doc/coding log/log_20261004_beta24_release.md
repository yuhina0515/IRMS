---
tags: [release, android, calibration]
date: 2026-10-04
summary: Released v1.2.0-beta.24 (mobility record, strategy C) with signed installer, signed arm64 APK and beta-latest manifest.
---

# v1.2.0-beta.24 (versionCode 1002024)

- Content: strategy C mobility wizard/trend (see [[log_20261003_calibration_c_mobility]]). Docs were already synced (PROJECT_STATUS, OPTIMIZATION, plan); README/ROADMAP needed no C edits.
- Process: version bump (5 files), `npm run tauri build` with updater key env vars from IRMS_secrets, `tauri android build --apk --target aarch64` with keystore env vars, hand-built latest.json (signature read from the .sig), `gh release create --prerelease --target feat/calibration-b`, `beta-latest` clobbered. Branch pushed (d4dc43e).
- Verified: APK signer CN=IRMS; beta-latest reports 1.2.0-beta.24 with signature; installer URL HTTP 200.
- Problem: first Android build failed on NDK_HOME with forward slashes; backslash paths fixed it.
- Not verified: installer signature vs pubkey (not re-checked this time), APK on a device, any real-device C measurement.
