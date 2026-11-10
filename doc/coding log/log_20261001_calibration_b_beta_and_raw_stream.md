---
tags: [irms, calibration, firmware, release, docs]
date: 2026-10-01
summary: "Calibration B wizard (gyro hinge fusion + raw-g floor stage), firmware 1.0.1-beta.2 opt-in G: raw stream via OTA, app v1.2.0-beta.20 beta release, non-log docs synced. Device verification pending (Harold)."
---

# Calibration B beta, G: raw stream, doc sync (2026-10-01)

Plan: `doc/plans/2026-10-01-calibration-b-beta-plan.md`. Workers: F1 (opus, firmware diff), D1/D2 (sonnet, doc drift), D3 (haiku, doc triage). R3 (opus review of gyro/scale additions + wizard) was planned but NOT run.

## Done
- Firmware `IRMS-Firmware` v1.0.1-beta.2 (branch `feat/raw-stream`, draft PR #1, CI compile green): opt-in `G:` packet (gyro deg/s + raw accel g), `CMD:RAW_ON/OFF`, off on disconnect and during OTA. Tag released by workflow; `beta-latest` manifest verified = 1.0.1-beta.2. Beta-channel apps auto-OTA when idle. PR #1 is not merged (main lacks the tagged commit) - user decides.
- App: Rust `ble.rs` routes `G:` to a `ble:raw` event (otherwise it would be reported malformed); `parseRawPacket`; `bluetoothService.enableRawStream/onRawMotion`; engine adds gyro PCA hinge fused with plane normal (reject >15 deg, `gyroWeak` <0.75 dominance) and six-face bias+scale; `CalibrationWizardB.tsx` (settings, labelled beta, falls back to gravity-only without `G:`); zh-Hant/en keys.
- Release v1.2.0-beta.20: full `npm run ci` green (463 tests / 50 files), signed build, hand-built latest.json, `beta-latest` clobbered and re-downloaded (version, URL HTTP 200, signature present).
- Docs synced: HOME, PROJECT_STATUS, ROADMAP, OPTIMIZATION, AI_CODING_RULES (i18n rule, design-authority note), README, banners on UI_REDESIGN/TAURI plan/AUTO_PUSH/UI_V3, canvas redrawn for Tauri. Dead old-repo issue links turned into plain text.

## Findings
- Fixed: Rust parser would flag `G:` malformed (D1 finding).
- Rejected/skipped: MTU gate on `G:` (app drops short packets; base packet already needs MTU), silent-drop NIT, "86 bytes" comment NIT (real worst case 85).

## Mistakes / problems
- Nested heredoc failed (nothing applied); `python3` here is a Store stub (patch silently did nothing once) - use `python`.
- Eigenvector indexing bug in `estimateHingeFromGyro` (used `vectors[0][k]`; correct `vectors[k][0..2]`), caught by tests.
- Branch push does not trigger firmware CI; needed a PR.
- Wizard smoke test is jsdom only; not exercised in a browser with stubbed BLE.

## Unverified (Harold, report via telemetry)
Real-device `G:` stream, OTA of 1.0.1-beta.2, BLE load (~50 notify/s with raw on), calibration B on real wearers, English clinical wording needs clinician review. If OTA does not reach a device, flash 1.0.1-beta.2 manually.
