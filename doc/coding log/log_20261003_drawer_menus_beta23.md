---
tags: [ui, android, release]
date: 2026-10-03
summary: Drawer menus on narrow/portrait screens, update-intro split, smaller checkboxes, no auto-nav on module enable; released v1.2.0-beta.23.
---

## What shipped (v1.2.0-beta.23, versionCode 1002023)
- Compact layout = `@media (max-width: 760px), (orientation: portrait)`, platform-independent. Main nav, Settings categories and Tools module picker all become left drawers; wide landscape keeps the original layout.
- Enabling a module no longer navigates to it (eb116f5). Checkboxes are smaller. Software update intro is split into desktop and Android statements.
- Release assets: signed NSIS installer + .sig, signed arm64 APK, `latest.json` (also on `beta-latest`).

## Decisions
- Nav drawer is `absolute; top: 100%` under `.v3-topnav` because Android `env(safe-area-inset-*)` is 0 (edge-to-edge webview), so a fixed `top: 0` drawer covers the status bar.
- Platform flags computed locally in components; tests mock `../platform/irmsApi` wholesale.

## Mistakes
- Exported `IS_ANDROID` from irmsApi: broke 10 tests (mock lacks it). Fixed with a local const.
- `python3` is a Store stub on this box; the first edit script silently did nothing. Use `python`.
- Fixed-top nav drawer overlapped the Android status bar clock (see above).
- Release APK would not install over the debug-signed emulator build; uninstall first.
- A just-uploaded `beta-latest/latest.json` read stale via CDN for a few seconds; re-check with a cache-busting query.

## Verification
- `npm run ci` green (463 tests + Rust). Emulator: Settings/Tools/main drawers in portrait, original tabs in landscape; release APK signature OK and launches.
- Not verified: real phone (Realme unavailable to adb), History tab in compact mode, desktop portrait window, real BLE path.

## Handoff
- The user pasted a phone lock password in chat; refused and not used. They should change it.
- Awaiting decisions on the four questions in [[ui_redesign_plan_codex_20261003]] (top tabs vs bottom bar, Live pose default, switches vs checkboxes, remove 0.82 zoom).
- Later: live-share log spam (~2 Hz, unconfirmed), armv7/iOS, real-sensor BLE verification via telemetry.
