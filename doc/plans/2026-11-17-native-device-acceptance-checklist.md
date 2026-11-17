---
tags: [irms, native, hardware, acceptance, checklist]
summary: Step-by-step real-device acceptance for the native v1.3.0-beta.6 app; each step lists what to do, what passes, and what to report.
date: 2026-11-17
---

# Native app: real-device acceptance (v1.3.0-beta.6)

Run on the laptop with the ESP32 powered (USB power is fine). Windows Bluetooth must be On. Report each step as
PASS / FAIL plus a screenshot or the on-screen error text. Stop at the first FAIL and send it; do not retry in a loop.

| # | Step | Pass looks like |
|---|---|---|
| 1 | Install `IRMS_1.3.0-beta.6_x64-setup.exe` (release page), launch. If the Tauri app is installed, note whether its records were imported on first launch. | App opens; Tauri prescriptions present if Tauri was installed |
| 2 | Click connect with the device powered. | Device name appears, state "connected", angles update when you move the leg |
| 3 | Settings > Software and firmware > 檢查韌體 (no install). | Shows latest signed version and the device's firmware version |
| 4 | Run the calibration wizard (full, left or right as worn). | Wizard reaches the last page; resulting calibration is saved; knee angle ~0 when standing straight |
| 5 | Pre-session wearing check, then quick re-zero once. | Check passes; re-zero replaces the zero without redoing the axes |
| 6 | One short session (about 1 min, one prescription). | Counts reps, voice cues play, session saved and appears in history |
| 7 | Export that session as CSV. | File opens with plausible rows |
| 8 | Close and reopen the app. | Calibration, theme, voice setting and telemetry choice are remembered |
| 9 | Look at the window on the real screen (GL renderer) and type Chinese in a text field (IME). | Window draws, no blank frame; IME composition works |

Not in this run: firmware install (OTA) stays in the Tauri app until the OTA chunk pacing is validated; do it only
as a separate step with a spare device image.

Known limits: all native work before this run was verified on simulated data only. Windows radio is normally Off on
the desktop; the laptop is the intended test machine.
