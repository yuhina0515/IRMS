---
tags: [irms, native, parity, plan, tauri]
summary: Phase 7 feature checklist, native (v1.3.0-beta.11) against the Tauri app (v1.2.0-beta.25): what is done, what differs by decision, and the real gaps.
date: 2026-11-17
---

# Native vs Tauri: feature parity checklist (plan phase 7)

Compared on 2026-11-17 from the source of both apps (Tauri `src/views`, `src/components`, `src/services`, i18n
keys; native `ui/*.slint`, `src/*.rs`). "Verified" means seen running (screenshot or telemetry); everything
else is read from code. Real-device evidence so far: connection, streaming, calibration and one session.

## Done in the native app

| Area | Tauri | Native |
|---|---|---|
| Live monitoring, guidance, hold timer, personal range | yes | yes (verified on a real device; the angle-range measuring flow was rewritten 2026-11-22 and is not yet run on hardware) |
| Calibration (unified) with leg choice, mobility and quick re-zero presets | yes | yes (verified on a real device) |
| Pre-session wearing check, slip monitor | yes | yes (the wearing check ran on a real device and gave a re-zero verdict; the slip monitor was not observed) |
| Prescriptions (create, edit, delete), search | yes | yes |
| Session history, delete with confirmation, CSV export | yes | yes (CSV: unit test only; not opened in Excel) |
| Range-of-motion records and trend | yes | yes |
| Telemetry (opt-in) and live share (host and viewer) | yes | yes (verified: telemetry is how real-device runs were read) |
| Voice feedback, alarm mute | yes | yes |
| ERR:1 (I2C) handling | overlay | banner and frozen pose (verified on the simulator; a real unplug produced ERR:1 packets and recovered, the screen was not observed) |
| Firmware check (signed manifest) and OTA install | yes | yes (OTA: never seen to finish on Windows in either app) |
| App self-update | Tauri updater | signed self-updater (verified end to end, laptop beta.9 to beta.11) |
| Auto-reconnect after an unexpected link loss | yes (5 tries) | yes since 2026-11-17 (3 x 3 tries; tested without a device only) |
| First-launch import of the Tauri database | n/a | yes |

## Differs by an owner decision (not a gap)

- Languages: Tauri has zh-Hant and English; native is zh-Hant only (i18n deferred by the project ruling).
- Modules: built into the program (D2), no downloaded scripts; the Tauri app has a runtime module panel. Since
  2026-11-22 all three IRMS-Modules (live-share, angle-range with its full flow and history, session-tips) are built in
  ([[log_20261122_native_builtin_modules_complete]]).
- 3D leg: native keeps a projected drawing (D3); Tauri has `Leg3D`. Since 2026-11-22 the native drawing is a 3D
  pose from pitch + roll of both segments (no heading; simulator-checked) and the native app also corrects a slipped shin strap in the session, which
  the Tauri app does not ([[log_20261122_native_pose_slip_strategy]]).
- Legacy Euler / "calibration B" wizards: deliberately not ported.
- Android and iOS: paused.

## Real gaps (candidates for work, none verified on hardware)

1. **Automatic firmware update when idle** (Tauri `firmwareAutoUpdate`): not ported. Intentionally left manual until
   a Windows OTA has been seen to finish.
2. **Keyboard shortcuts** (Tauri: `Enter` starts/ends a session, `K` connects): none in native.
3. **Theme "follow system"**: native has manual day/night only.
4. **In-app demo mode** (Tauri settings tab 示範模式, a full hardware-free walkthrough): native has the `--simulate`
   switch and the "IRMS Simulator Demo" shortcut, but nothing inside the app.
5. **Toasts**: native shows inline notices; no transient toast layer.
6. **Session protocol choice**: the settings row shows the knee protocol only, in both apps (other protocols block a
   session); same behaviour, listed so it is not mistaken for a gap.

## Not checked

Accessibility (screen reader names, focus order), HiDPI behaviour, high-contrast mode, long-name layout, the Tauri
splash, and every string against the English locale.

## Cutover conditions (plan phase 7)

The Tauri app is frozen once: OTA has been seen to finish on hardware, CSV opens correctly in Excel, the renderer
choice and IME are checked on a real screen, and the owner has used the native app for a full therapy session.
Signing is separate (owner: not now).
