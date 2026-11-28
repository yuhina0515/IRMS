---
tags: [irms, native, hardware, ble, ota, csv, log]
summary: First bench run on the real ESP32 without a wearer. Found and fixed undetected link loss and dead auto-reconnect on Windows, garbled Chinese in the CSV, a cut-off error message and three OTA host defects. OTA itself was not run.
date: 2026-11-28
---

# Bench run without a wearer

Plan: [[2026-11-28-bench-device-no-wearer-plan]]. Desktop, ESP32 on USB (COM6), firmware 1.0.1-beta.1,
native app built from `main` 40bcfbc plus this branch (`fix/ble-link-loss-and-ota-host`). The serial mirror of
every packet was the ground truth. The installed beta.14 and its database were not used.

## Workers
Lead did all hardware work. eng-qa (sonnet): OTA path review. general-purpose (sonnet): what can run without a
wearer. eng-qa (sonnet): review of the final diff.

## Measurements (device lying still)
- Serial, 600 s: 15,001 packets, 25.00 Hz, largest gap 41 ms, no ERR.
- Static noise: knee sd 0.09 deg, peak to peak 0.8 deg; drift over 10 min below 0.15 deg; gravity vector
  angle rms 0.45 / 0.68 deg (thigh / shin).
- BLE: 5,461 of 5,461 packets identical to serial; connect 3.3 s; MTU 128; arrival median 59 ms, max 240 ms.
- Renderer (connected, 60 s): software 2.5% of one core, 58 MB working set, 16 MB private; GL 3.8%, 104 MB,
  113 MB. GL captured correctly. Desktop only; #21 still asks for the laptop screen and the IME.

## Defects found and fixed
1. A board reset was never noticed (120 s with no event): btleplug's WinRT stream does not end while the
   peripheral is held. The listener now asks the link state when the stream is silent.
2. The native auto-reconnect could not start: the connection event had no `reason`.
3. In the real app the pending feedback write timed out (5 s) before Windows reported the loss, and its cleanup
   looked like a manual disconnect. It is now reported as a lost link.
   After 1-3: two of two resets reconnected, both in the probe and in the app, about 10 s after the reset.
4. CSV had no UTF-8 BOM: Excel 16 (build 17932) garbled the action name. Fixed and reopened correctly (#20).
5. The long "device not found" advice was cut off at the window edge; it now wraps.
6. OTA host (tests only, not run on hardware): bounded the status subscribe and data writes; OTA:DONE that
   arrives despite a failed END write counts; abort during download no longer flashes.

## Review of the diff, and fixes
- The first version of fix 1 called `peripheral.disconnect()` without the peripheral lock. btleplug holds an
  internal guard across a pending write or read, so the two could wedge. The listener now uses the coordinated
  disconnect. Four of four resets reconnected with the probe afterwards (lost seen after about 10 s,
  reconnect 3-6 s). The app itself was not run again after this review round.
- `OTA:DONE` now wins even when the END write never returns (test only).
- Automatic reconnect now stops after more than three consecutive command failures (test only).

## A session across a link loss
With a synthetic calibration (`method: bench-seed`, isolated database) a real-device session ran about 90 s.
A reset during it: the session was closed and saved 5 s later and the app reconnected 10 s after the reset.

## Firmware OTA (#19), approved by the owner the same day
- Recovery first: the full 4 MB flash was read to `E:\Monitoring-and-IoT\IRMS_firmware_backup\2026-11-28\`
  and verified against the chip. Restore: `esptool write-flash 0 full_flash_4MB.bin` (used once, hash verified).
- Abort at 400,750 of 1,177,536 bytes (headless probe, same core calls): `OTA:ABORTED`, still 1.0.1-beta.1,
  239 packets in the next 10 s.
- Full update from Settings in the app, beta.1 to beta.2: transfer 154 s, `verified OK`, reconnected about
  10 s after the restart, device reports beta.2. **The app said it had failed**: the firmware restarts before
  the END write is answered (HRESULT 0x800704C7) and `OTA:DONE` never arrives.
- Fix: after a complete transfer the app reads the version of the restarted device. Rerun on hardware from a
  USB-restored beta.1 reported success with beta.2 (transfer 147 s).
- The stale "new version" status line and the "never verified on hardware" hint were corrected afterwards
  (tests only).
- Packet-to-packet gravity jitter of sensor 1 rose from about 1 deg to 7 deg during the day. Mean direction
  unchanged, and it already showed on beta.1 before any flashing. Cause not confirmed (possibly vibration
  near the sensor); do not use today's later captures as a noise figure.
- No telemetry run id (telemetry was left off); the evidence is the serial log.

## Not done
- OTA open points, from review: no effective rollback; no idle timeout for a stuck OTA; disconnect and window
  close are not blocked during OTA.
- #22, #23 and the strap-slip measurement need a wearer. IME and laptop renderer need a person.
- CSV was exported by calling the app's own `export_csv` from a small program, not through the save dialog.
- CSV timestamps stay ISO text in Excel (same as the Tauri export).
- The Tauri app shares the link-loss change; only its Rust tests ran.

## Problems during the run
- First grace-period change broke `propagates_write_failure`; the grace is now shorter than the caller limit.
- One renderer measurement was invalid (not connected after the previous app was killed) and was repeated.
- Opening the serial port does not always reset the board; the first mid-session attempt tested nothing.
- The review found a lock-order defect in the first link-loss fix (see above).
- Someone used the desktop during the last UI step (theme changed), so UI automation stopped there.

## Follow-up: remaining OTA gaps
Plan: [[2026-11-28-remaining-ota-gaps-plan]]. Owner input: the afternoon jitter is the unit lying on Hina-PC next
to a blower-fan GTX 1070; the morning noise figures were taken on the same spot and include some of it.
Review before flashing: eng-qa (sonnet), findings applied (manual app install during OTA, guard only while
linked, refuse OTA while the image is unconfirmed).

App (PR #27): disconnect, window close and manual install are refused while an OTA transfers.
Firmware (IRMS-Firmware draft PR #2, 1.0.1-beta.3, not tagged or released): restart from loop() so OTA:DONE is
sent; 60 s idle timeout; rollback until a client has been connected for 3 s.

On the board (dev build, core 3.3.11):
- From the new firmware the host received `OTA:DONE` and reported success.
- Reset with no client after the update: back to 1.0.1-beta.2.
- Confirmed by a client, then reset: stayed on 1.0.1-beta.3 with beta.2 in the other slot. (A first attempt had
  beta.3 in both slots and proved nothing; it was repeated.)
- No data after OTA:START: `OTA:ERROR:TIMEOUT` at 60 s, link kept, next start accepted.
- Start before confirmation: `OTA:ERROR:NOT_CONFIRMED_YET`.

App on the board (final code): disconnect and close refused mid-transfer, update beta.1 to beta.2 ended with only
the success line, and a board reset afterwards reconnected. Telemetry run id for #19:
`4f7046c4-c75a-424e-ba94-adfe115ff9f9`. After the reconnect the app sends one harmless `OTA:ABORT` (cleanup of
the failed END write on released firmware).

Board left on the released 1.0.1-beta.2. Flash backups: `full_flash_4MB.bin` (beta.1 state) and
`full_flash_4MB_beta2.bin` in `E:\Monitoring-and-IoT\IRMS_firmware_backup6-11-28\`.

Still open: no test with an image that crashes or never advertises; the core 3.0.7 build is only compiled by CI;
#21 (laptop renderer, IME), #22 and #23 need a person; #20 was not run through the save dialog.
