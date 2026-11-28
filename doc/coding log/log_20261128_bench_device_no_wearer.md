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

## A session across a link loss
With a synthetic calibration (`method: bench-seed`, isolated database) a real-device session ran about 90 s.
A reset during it: the session was closed and saved 5 s later and the app reconnected 10 s after the reset.

## Not done
- **OTA (#19) not run.** Open, from review, not verified on hardware: the firmware may restart before
  `OTA:DONE` leaves the radio (expect a false failure); there is no effective rollback; no idle timeout for a
  stuck OTA; disconnect and window close are not blocked during OTA. Set up USB recovery (esptool is in
  `%LOCALAPPDATA%\Arduino15`) before trying.
- #22, #23 and the strap-slip measurement need a wearer. IME and laptop renderer need a person.
- CSV was exported by calling the app's own `export_csv` from a small program, not through the save dialog.
- CSV timestamps stay ISO text in Excel (same as the Tauri export).
- The Tauri app shares the link-loss change; only its Rust tests ran.
- A persistently failing command would now reconnect again and again until the owner presses disconnect.

## Problems during the run
- First grace-period change broke `propagates_write_failure`; the grace is now shorter than the caller limit.
- One renderer measurement was invalid (not connected after the previous app was killed) and was repeated.
- Opening the serial port does not always reset the board; the first mid-session attempt tested nothing.
- Someone used the desktop during the last UI step (theme changed), so UI automation stopped there.
