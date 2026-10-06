---
tags: [irms, ble, ota, firmware, telemetry]
date: 2026-10-06
summary: "Telemetry run f86c2579 showed OTA failing at ~58% on a link whose MTU stayed at 23. App now refuses OTA on a truncated link and fails fast when the device stops confirming bytes. Firmware untouched; real-device retest pending."
---

# OTA failure on truncated BLE link (2026-10-06)

Branch `fix/ota-truncated-link-flow-control` (not pushed).

## Request
Investigate the OTA interruption seen in IRMS telemetry, and why power was lost with a PISEN LS-DY259 power bank. Then fix.

## Findings
- Run `f86c2579` (beta.24): packets were exactly 20 bytes (`T:..,S:..,K:..`), app logged `BLE MTU too small`, yet auto-update started 0.4 s later.
- App sent 125-byte chunks at ~7.2 KB/s; device `OTA:PROGRESS` advanced ~1.2 KB/s (ratio ~0.17 ~= 20/125). Chunks were being cut to 20 bytes. Link dropped at 05:43:15, app saw the write error at 05:43:20 (684,375 B "sent", device had 106,600).
- Comparison run `863ac18d` (beta.14) had full-length packets, i.e. MTU negotiated fine. The difference is the negotiated MTU, not firmware.
- Initial hypothesis (flash write in BLE callback blocking the stack) is unproven and now secondary. Power bank: no evidence either way; no reset-reason is logged.

## Changes (app only)
- `bluetooth.ts`: `performOtaUpdate` refuses when `truncationReported` (new `settings.firmware.linkTruncated` string).
- `firmwareAutoUpdate.ts`: defers when `state().linkTruncated` (new optional field, wired in `firmwareAutoUpdateInstall.ts`) before touching the network.
- `ble.rs`: `wait_for_ota_window` caps unconfirmed bytes at 16 KB and aborts after 5 s without a device ack, surfacing device `OTA:ERROR:*`.

## Decisions
- Did not change firmware: no Arduino toolchain here, and the ring-buffer refactor has no evidence yet. A firmware-side `OTA:START` rejection when MTU < 128 is a good follow-up (only helps after the next flash).
- Did not touch the pre-existing uncommitted `Cargo.toml` change (line endings only).

## Verification
- `cargo test ota_tests`: 10 passed; `cargo fmt --check` ok; `cargo clippy -D warnings` clean.
- `tsc --noEmit` clean; `vitest run src/services`: 265 passed.
- Deliberately disabled the truncated-link gate and the window check: the new TS test and the stall test failed; restored, all pass again.
- Not run: full `npm run ci`, real device.

## Resume state
- Retest on hardware. If OTA still drops with a healthy MTU, capture serial `esp_reset_reason()` and then consider moving `Update.write()` out of the BLE callback.
- Open question: why Windows left the MTU at 23 on this connection (fresh reconnect fixed it in other runs).
