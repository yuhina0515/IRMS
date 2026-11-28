---
tags: [irms, ota, firmware, hardware, plan]
summary: Close the open OTA gaps found on 2026-11-28 (app guards, firmware restart timing, idle timeout, rollback) and record a telemetry run id for #19.
date: 2026-11-28
---

# Remaining OTA gaps

Owner input: sensor jitter that afternoon comes from the unit lying on Hina-PC next to a blower-fan GTX 1070.

## Constraints
- No release, tag or merge without the owner's go-ahead. Draft PRs only.
- Before flashing: full flash backup; the board ends on the released 1.0.1-beta.2.
- Capture only the IRMS window; isolated `--db`.
- Needs a wearer or a person, not attempted: #22, #23, strap slip, IME, laptop renderer (#21).

## Tasks
| ID | Who | Scope | Focus |
|---|---|---|---|
| A1 | lead | native app | block disconnect and window close while an OTA transfers |
| F1 | lead | firmware (from `feat/raw-stream`) | restart after the END callback returns; OTA idle timeout; rollback until a client connects |
| R1 | eng-qa (sonnet) | both diffs | try to disprove, read-only |
| T1 | lead | bench | OTA of the dev firmware, idle timeout, rollback by reset, app reset test, telemetry run id (#19) |

## Done
Each item verified on the board or marked unverified; board back on 1.0.1-beta.2; log updated.
