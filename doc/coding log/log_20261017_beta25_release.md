---
tags: [release, ota, android]
date: 2026-10-17
summary: Released v1.2.0-beta.25 from fix/ota-truncated-link-flow-control (OTA truncated-link guard + audit fixes + beta.24 mobility record) after local tsc/vitest green.
---

# v1.2.0-beta.25 (versionCode 1002025)

- Scope: OTA guard for truncated BLE links, transfer flow control, module-index rollback protection, audit bug fixes. Unified calibration (feat/unified-calibration) is deliberately NOT included: it awaits real-device bench data from Harold.
- Gate: `tsc --noEmit` clean, vitest 500/500 on the release branch. Rust has no tests.
- Process as beta.24: 5-file version bump, signed `tauri build`, signed arm64 APK, hand-built latest.json, `gh release create --prerelease`, `beta-latest` clobbered.
- Verified: APK signer CN=IRMS; beta-latest reports 1.2.0-beta.25 (after CDN delay); installer URL HTTP 200.
- Not verified: installer signature vs pubkey, install/OTA on a real device, APK on a device.
- Next: draft PR of this branch into main (user merges), then unified calibration as beta.26 after bench data.
