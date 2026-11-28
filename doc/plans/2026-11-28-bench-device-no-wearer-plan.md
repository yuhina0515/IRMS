---
tags: [irms, hardware, bench, plan]
summary: Device tests that need no wearer, run on the desktop with the ESP32 on USB (COM6) and Bluetooth, against main 40bcfbc and native v1.3.0-beta.14.
date: 2026-11-28
---

# Bench device run without a wearer

## Goal
Run every device check that needs only the powered ESP32 on the desk, and record evidence.

## Facts (observed 2026-11-28)
- ESP32 on COM6 (CH340), 115200 baud. Opening the port resets the board. Serial mirrors every BLE
  packet with a `millis()` prefix, about 25 Hz. Both IMUs report unit gravity vectors.
- Native v1.3.0-beta.14 is installed on the desktop. Bluetooth radio was Off (restore after).
- Excel (Office16) is installed.

## Constraints
- No wearer: no calibration poses, no repetitions, no slip or goniometer work (#22 worn part, #23).
- Never touch the default app databases; use an isolated `--db` in the scratchpad.
- Capture only the IRMS window. No firmware OTA or flashing without the owner's explicit yes.

## Tasks
| ID | Who | Scope | Focus |
|---|---|---|---|
| B1 | lead | serial, 10 min static | sample rate, jitter, gaps, noise, drift, ERR packets |
| B2 | lead | BLE via `irms_core::ble` harness, serial as ground truth | connect time, MTU, FW version, packet loss, disconnect/reconnect |
| B3 | lead | BLE link loss by resetting the board over serial | recovery behaviour |
| B4 | lead | installed app, isolated `--db` | connect, live view, GL vs software memory/CPU (#21, desktop only) |
| B5 | lead | CSV export code path on recorded packets, open in Excel | #20, only if it can use the real export path |
| W1 | eng-qa (sonnet) | OTA path: core + firmware | what would stop a Windows OTA from finishing (#19), read-only |
| W2 | general-purpose (sonnet) | native app UI + BLE host | which checklist steps can run without a wearer, how to drive them, read-only |

Worker report format: `file:line | BUG/RISK/NIT | what | failing scenario | one-line fix`; only verified
findings; under 400 words.

## Done
Each B task has a measured result or a stated reason it could not run; worker BUG claims are checked
by the lead; log in `doc/coding log/`.
