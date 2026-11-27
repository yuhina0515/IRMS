---
tags: [irms, native, hardware, acceptance, checklist]
summary: Device session 1 with native v1.3.0-beta.14 (about 1.5 h) - smoke run, CSV in Excel (#20), renderer and IME (#21), hook-and-loop strap slip measurement. Replaces the beta.6 checklist.
date: 2026-11-27
---

# Native beta.14: device session 1

Replaces [[2026-11-17-native-device-acceptance-checklist]]. Laptop with Bluetooth On, ESP32 powered (USB is fine),
hook-and-loop straps as worn today. Mark each step PASS / FAIL with a screenshot or the on-screen text, and write down
the clock time. On a FAIL, note it, continue with the steps that do not depend on it, and do not retry in a loop.

## 0. Prepare (5 min)

1. 設定 → 軟體與韌體: the version is `1.3.0-beta.14`. If not, press 檢查更新, or install
   `IRMS_1.3.0-beta.14_x64-setup.exe` from the release page.
2. 設定 → 資料與隱私: turn telemetry **on** before connecting. The raw packets are what the slip numbers are
   computed from afterwards.

## 1. Smoke run (20 min)

| # | Step | Pass looks like |
|---|---|---|
| 1.1 | 連線裝置 | 裝置已連線; angles follow the leg; footer shows 裝置資料 |
| 1.2 | 設定 → 校準 → 開始校準 / 重新校準: pick the leg, finish the wizard, 套用校準 | 已校準; knee about 0 deg with the leg straight |
| 1.3 | 即時監測 → 開始療程 → 穿戴檢查 in the calibration pose → 開始檢查 | A verdict appears (note which one) |
| 1.4 | One session of about 1 min with one prescription, then 結束療程 | Repetitions counted, voice cues heard, record appears in 療程紀錄 |
| 1.5 | Close and reopen the app | Calibration, prescription choice, voice and telemetry choice remembered |

## 2. Strap slip measurement (30 min)

This is the "how much do the straps move" number for the report. The wearing check shows a verdict only, not
degrees, so also write down the live knee angle.

Do the whole block twice (run A, run B), with a full re-donning between them.

1. Straps on, calibrate (run A only; section 1 calibration counts if the straps were not touched since). Stand in the calibration pose; write down the knee angle.
2. 開始療程, run the wearing check, note the verdict, then press 取消.
3. Exercise: 20 knee bends (at least 60 deg of bend), 2 minutes of walking, 5 sit-to-stand. Do it with a session
   running and note any banner (「已自動修正轉軸」 or 「感測器可能移位」). Press 結束療程.
4. Same pose again: write down the knee angle, run the wearing check, note the verdict, 取消.
5. Take both units off and put them back on. **Do not recalibrate.** Repeat step 4. This is the start of run B.

| Point | Clock time | Knee angle in pose | Wearing verdict | Banner |
|---|---|---|---|---|
| A: after calibration | | | | |
| A: after exercise | | | | |
| A: after re-donning | | | | |
| B: after exercise | | | | |
| B: after re-donning | | | | |

Targets (provisional, from [[2026-11-10-december-report-plan]] section 3): within 3 deg after exercise, within 5 deg
after re-donning. Missing a target is a result to report, not a reason to stop.

## 3. CSV in Excel, issue #20 (10 min)

療程紀錄 → 回顧 → 匯出 CSV, open the file in Excel. Pass: Chinese is readable, columns are separated, angles and
timestamps are numbers. Note the Excel version and take a screenshot.

## 4. Renderer and IME, issue #21 (15 min)

1. IME: in 動作處方, create or edit a prescription and type a Chinese name with the Microsoft IME. Pass: the candidate
   window is next to the text field and the committed text is correct. Delete the test prescription afterwards.
2. GL renderer: close the app, then in PowerShell:

```powershell
$env:SLINT_BACKEND = 'winit-femtovg'
& "$env:LOCALAPPDATA\Programs\IRMS Native Beta\irms_app_native.exe"
```

Look at all five tabs, minimise and restore once, note any blank or black area. Note memory and CPU from Task Manager.
Close it, start IRMS from the shortcut (software renderer, the default) and note the same two numbers.

## Report back

The filled table, FAIL screenshots, the Excel screenshot, and the date and rough start time (to find the telemetry run).

Not in this session: goniometer comparison (#23) and thresholds (#22) are session 2; firmware OTA (#19) is optional.
