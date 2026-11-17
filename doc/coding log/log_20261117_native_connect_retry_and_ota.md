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
