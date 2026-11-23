---
tags: [irms, native, hardware, telemetry, acceptance]
summary: First real-device run of the native beta.7 read from the telemetry collector: connection and live angles work, one 7 s ERR:1 (I2C) burst.
date: 2026-11-17
---

# Native beta.7: first real-device run (from telemetry, run d27aa7b0)

Owner tested at school on 2026-11-17 around 13:36 to 13:39 (Taipei) and had telemetry on; the run was read from the collector (`/irms-api/v1/runs`), nothing was pasted by hand.

- Run start (05:36:01Z): about 690 packets, a 109 s session with 4 reps and no connection event, packets 60 ms after launch. Very likely the simulator (opened via a demo entry or an older shortcut); not real measurement. Owner's operation order not confirmed.
- Real connection (05:36:38Z): `connection connected=true deviceName=IRMS_Device`. Packets `T:/S:/K:/TR:/SR:/KR:/V:` stream normally (about 20 to 25 Hz), `CMD:LED_*` and `CMD:ALARM_OFF` sent. Over the next minutes the knee angle K moved between 0 and 109.5 deg with the owner's leg movement (checked in 10 s samples).
- ERR:1: three `ERR:1` bursts, the main one 05:37:39.28Z to 05:37:46.30Z (171 packets, about 7 s), then K valid again. Owner confirmed this was an intentional test of the unplug/detach warning, so it is expected, not a fault: the device reported the I2C disconnect and recovered. Still unobserved: the native overlay and freeze behaviour during the burst (owner said the motion was captured correctly).
- LED feedback (`CMD:LED_ON/OFF`, 53 commands) shows a live session ran on the real device after calibration; several ON/OFF toggles inside one second (05:38:03, 05:38:08) may be zone-edge chatter, not analysed yet.
- Owner-reported UI bug (calibration wizard): the "initial posture" row was one cycling button showing 1 of 5 postures, so options looked hidden and "disappeared" on click. Fixed: all five postures are visible, directly selectable buttons (two rows); verified by screenshots for all three presets.
- Not seen in telemetry: calibration wizard outcome, session on the real device, CSV export (native does not emit `session_start`; `session_end` was seen only for the simulator part). Renderer and IME unknown.
- Conclusion: the beta.7 fix works; real BLE connection and live data are now confirmed on hardware for the first time in the native line.

## beta.8 release (owner: "go", 2026-11-17)

Version bump and the wizard posture fix, same release procedure as beta.7 (build-installer, `tauri signer sign`, hand-built latest.json, pre-release, `beta-latest` replaced).

## Installer: close the running app automatically (owner request, 2026-11-17)

- Owner installing beta.8 over a running beta got NSIS's "Error opening file for writing: irms_app_native.exe" (file locked by the old, still running app).
- `installer.nsi` now has `CloseRunningApp`, called at install start and again right before the files are written: if `irms_app_native.exe` runs, it sends a normal close request (`taskkill /IM`, the app then saves preferences, finishes and stores the current session, disconnects BLE and exits), waits up to 10 s, and only then force-ends it.
- Verified with a standalone harness of the same function (not a full install, to avoid touching the real uninstall registration): real app closed in about 1 s; nothing running returns at once. The force branch was exercised too: a WinForms window named irms_app_native.exe that refuses to close was ended after 14.8 s (the 10 s wait is 20 polls, each with a process check, so it runs a little longer).
- Effective from the NEXT installer (beta.8 as published still has the old behaviour: close the app first, or press Retry). Not released yet; the rebuilt local `target/installer` beta.8 file now differs from the published one and must not be uploaded.

## Owner feedback after beta.8 (2026-11-17)

- Calibration wizard posture row confirmed as the reported problem; real-device calibration and a session confirmed OK by the owner.
- Wearing check: with the "re-zero" verdict the dialog text said you can start without re-zeroing, but there was no such button (the code excluded verdict 3 from "start anyway"), and a failed re-zero closed the dialog silently, so the session looked impossible to start. Now: a "不歸零直接開始" button for that verdict, and a failed re-zero keeps the dialog open with the reason (`wearing-note`) so the wearer can retry or start anyway. (99de2dc)
- Window restored from minimized came back mostly black: reproduced by minimizing and restoring a running window and capturing only that window with PrintWindow (no desktop capture). Cause: the software renderer repaints only changed regions while the restored surface is empty. Fix: `repaint-nudge` property on MainWindow (window background changes by an invisible amount); the UI timer detects minimized -> restored and toggles it for 6 ticks. After the fix the same test shows a fully painted window.
