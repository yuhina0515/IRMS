---
tags: [android, updater]
date: 2026-10-02
summary: Android update check was a stub that always said "no update"; added a real check that opens the APK download.
---

# Android update check

- Cause: `update_check` on mobile returned `Ok(None)` (tauri-plugin-updater is desktop-only), so Settings always showed "latest".
- Fix: new Rust command `android_update_check` fetches the stable/beta `latest.json`, compares semver with the running version, derives the APK URL from the version (never from the renderer) and HEAD-checks it. Front-end shows an `apk-available` state, a banner with a Download button, and opens the URL via plugin-opener. Android cannot self-install; the user installs the APK manually (same signing key required).
- Front-end only calls the command when the UA contains Android.
- Verified: `npm run ci` passes, `cargo fmt --check` ok, `tauri android build --debug --apk` compiles. Not verified on a device: an actual newer release appearing (needs a release newer than the installed one).
- Not released yet; needs a new beta (versionCode bump) on user's go-ahead.
