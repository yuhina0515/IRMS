---
tags: [irms, native, ble, ota, firmware, release]
summary: Connect retry for the Windows stale-cache NotConnected failure, and firmware update (OTA) in the native app; beta.10.
date: 2026-11-17
---

# Connect retry and OTA (beta.10)

Owner (2026-11-17): "無法連線" and "讓 OTA 功能上線".

- **Connect failure, from telemetry (beta.9 laptop run c32294c0, 07:02 to 07:04 UTC):** two `ble_error "Not connected [NotConnected]"` (op connect) right after an app restart; the previous run (5994244c) had connected in 9 s and ended with a manual disconnect. Earlier beta.7 saw one "Device not found within scan window" followed by a success. Cause (inference, not proven on hardware): `scan_for_device` takes the first cached advertisement whose name matches; Windows keeps cached entries for a device that is not connectable yet (it still holds the old link, or the app just restarted), so `peripheral.connect()` fails.
- **Fix:** `ble_lifecycle::establish_with_retry` (used by `ble::connect`): after a connect/setup failure it cleans up, waits 1.5 s, re-scans and retries, 3 tries in total, all inside the same generation, so a disconnect pressed during the wait retires the generation and stops further tries. Scan failures (device not found, no adapter), failed cleanup and cancellation are not retried. `establish` keeps the single-try behaviour. 5 new tests with a controllable fake connector (retry then success, attempt limit, plain establish once, no retry for scan/cleanup failure, cancellation during the wait); core 191 tests.
- **OTA in the native app** (`firmware_ui.rs`): after "檢查韌體", when the connected device reports an older version and the app is compatible, "更新韌體" (confirm step) downloads the image (signed manifest, size, SHA-256, MD5 checked by `irms_core::firmware_update::download_latest`) and sends it with `ble_perform_ota_update`; progress bar, abort button, no session start during an update, and the app self-updater does not restart the app during it. Never downgrades; unknown device version gets no offer. Native 45 tests.
- **Evidence about OTA risk:** telemetry of the Tauri beta.14 run (2026-09-26, 1,176,752-byte image) shows OTA:READY, then no completion or error for 6.8 minutes and ALREADY_RUNNING on the next start, so a Windows OTA has never been seen to finish. The core now has flow control and stall detection (written after that run) but nothing has run on hardware. The firmware only flips its boot target after a complete checked image, so the expected failure is a stuck or aborted transfer, not a bricked device. The UI says it is unvalidated.
- **Release:** v1.3.0-beta.10 (pre-release); the owner's laptop runs beta.9 with auto-update on, so it should pick this up by itself: the first real laptop test of the updater (look for a beta.10 app_start in telemetry).

## beta.11: the window stuck on "連線中" (owner, later the same night)

- Report: Windows showed IRMS_Device as connected, the app stayed on "連線中". Telemetry of the beta.10 laptop run (df7e5077): `app_start` only, no `connection` and no `ble_error` for minutes, so the connect flow produced no result at all: a Windows BLE step (connect, service discovery or subscribe) waited without end. In the old build the button was greyed out while connecting, so there was no way out except killing the app.
- Fix: `within()` time limits in `NativeConnector` (connect 20 s, discover 20 s, subscribe 10 s, disconnect cleanup 8 s); a timeout is an error naming the step and goes through the same 3-try retry; "取消連線" while connecting (cancels the generation and disconnects; a cancelled attempt reports no error); `describe_connect_error` gives next steps for NotConnected and timeouts. Tests: core 193, native 45. Which step hung is still unknown (only the next timeout message will say).
- An app stuck in "連線中" is not idle, so the self-updater will not install over it: restart the app and wait 30 s (do not press connect) to receive beta.11.

## Auto-reconnect after an unexpected link loss (parity with the Tauri app)

- Found while building the Phase 7 parity checklist: the Tauri app's `attemptReconnect` (5 tries, 3 s apart) had no native counterpart; an unexpected disconnect only ended the session and showed "未連線". It also meant the OTA "done" message ("the device reboots and reconnects") was not true in the native app.
- Native: a `ble:connection` disconnect whose reason is `notification_stream_ended` (not the wearer's disconnect, not the window closing) starts `start_auto_reconnect`: 3 attempts, 3 s apart, each a full connect that already retries inside (so up to 9 tries). The window shows "連線中斷 / 連線中斷,自動重新連線中(n/3)"; "取消連線" or any manual connect/disconnect (and closing the window) bumps an epoch that stops the loop; after the last failure it reports "自動重新連線失敗". The session that was running when the link dropped is still ended, as before (a resumed session is not attempted).
- Verification without a device: ignored test `auto_reconnect_reports_each_attempt_then_gives_up_and_a_manual_action_stops_it` run on this desktop (Bluetooth radio off, so every connect fails at once): attempts 1, 2, 3 reported, then the failure message; a manual epoch bump keeps a running loop quiet. A unit test covers the decision (`should_auto_reconnect`). Not tested: a real link loss, and the loop with a device that comes back.
