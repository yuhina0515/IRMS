# Calibration B beta + firmware raw stream + doc sync (2026-10-01)

Request (user, /squad): (1) lift the firmware limit via OTA if possible, else finish and say "flash it" (Harold will test everything later and upload via telemetry); (2) update every non-log document under `doc/`; (3) ship calibration B as an app beta.

## Known facts
- Firmware repo `yuhina0515/IRMS-Firmware` (clone `_repo-migration/new-IRMS-Firmware`). Tag `vX.Y.Z[-beta.N]` must equal `IRMS_FW_VERSION` in `IRMS_Sensor/config.h`; release workflow compiles, signs manifest, prerelease tags go to the `beta-latest` pointer. Secret `FIRMWARE_SIGNING_KEY` is set. No local compiler: CI (`build.yml`) is the compile check.
- App parser (`shared/protocol.ts`) treats any unknown packet as malformed, so new data must be opt-in and off by default (old apps never enable it).
- Today's `V:` vectors are unit-length (scale lost) and gz/raw gyro are not sent.

## Design
Firmware 1.0.1-beta.2: new opt-in packet, enabled by `CMD:RAW_ON`, disabled by `CMD:RAW_OFF` and on disconnect:
`G:tgx/tgy/tgz/sgx/sgy/sgz/tax/tay/taz/sax/say/saz` = bias-corrected gyro deg/s (sensor axes, incl. gz) for thigh and shin, then raw accelerometer in g (not normalised). Existing packet untouched.
App: parse `G:`, `enableRawStream()`, calibration B uses (a) gyro principal axis as hinge estimate fused with the gravity-plane normal, (b) floor stage with raw g solves bias AND per-axis scale (six faces), (c) wizard UI (zh-Hant/en), offered next to flow A and labelled beta. Falls back to gravity-only B when the device firmware has no `G:` (old firmware).
Release: app `1.x.y-beta.N+1` signed Tauri build + `beta-latest` latest.json; firmware tag `v1.0.1-beta.2` for OTA to beta-channel apps.

## Tasks
| ID | model | scope | focus |
|---|---|---|---|
| F1 | opus | firmware diff (`IRMS_Sensor/*`) | I2C read, struct races, buffer lengths, BLE congestion, opt-in default off, reset on disconnect |
| D1 | sonnet | `doc/HOME, PROJECT_STATUS, ROADMAP, OPTIMIZATION` vs code | drift list (facts that no longer match) |
| D2 | sonnet | `doc/AI_CODING_RULES, MODULE_CONTRACT, TAURI_MIGRATION_PLAN, README, UI_*` vs code | drift list |
| D3 | haiku | top-level README(s), `doc/templates`, `ui-v3-gpt`, `calibration-evidence`, gemini-handoff dirs | which are non-log docs needing change, which are historical |
| R3 | opus | `calibrationB.ts` gyro/scale additions + wizard state machine | math and flow correctness |

Report format: file:line | BUG/RISK/NIT | what is wrong | concrete failing scenario | one-line fix; only verified findings; under 400 words (doc workers: doc:line | stale claim | what the code says).

## Done criteria
CI compile green on firmware branch; typecheck + full vitest green; wizard smoke-checked in a browser with stubbed BLE; app beta published with signed latest.json; firmware tag released and `beta-latest` manifest verified; docs synced; work-log written.
