# IRMS_Sensor → moved to IRMS-Firmware

The ESP32 firmware now lives in **[yuhina0515/IRMS-Firmware](https://github.com/yuhina0515/IRMS-Firmware)**
(split 2026-09-25 with its history preserved; same sketch under `IRMS_Sensor/` there).

Tagging `vX.Y.Z` in that repo builds the firmware in CI and publishes an Ed25519-signed
release. The IRMS app installs it automatically over BLE OTA when the device is connected and
no session is running — see `doc/AUTO_PUSH_PLAN.md`.

References elsewhere in this repo to `IRMS_Sensor/config.h`, `IRMS_Sensor/imu.h` etc. refer to
the same paths inside IRMS-Firmware. The BLE protocol section of `config.h` is still a contract
with `IRMS_App_Tauri/src/shared/protocol.ts` and `src-tauri/src/protocol.rs`.
