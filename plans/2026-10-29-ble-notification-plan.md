# R04: reject notifications from stale BLE listeners

Native baseline 10b2fd0; R03 modal edits are separate and not part of this review. Prior ENG report identified generation checking only after stream termination. Snapshot `C:/Users/Yuhina/AppData/Local/Temp/irms-readiness-20261029-snapshot/IRMS_App_Tauri/src-tauri/src/ble.rs` contains the same native baseline and remains read-only. No BLE protocol/firmware changes or device access authorized by this task.

Goal: stale listeners cannot emit raw/calibration/angle data or forward OTA status after disconnect/reconnect invalidates their generation. Inspect the actual locking/generation ordering, not only a standalone equality helper. Preserve disconnect events for the current generation and avoid letting stale teardown disconnect the new connection.

Reviewer `/root/engineering`, inherited model, read-only native BLE scoped analysis <=250 words, no edits/deploy/restart/commit/other-chat messages. Lead verifies implementation choice and alone edits. Add a meaningful regression through the same notification-dispatch guard that production uses; it must demonstrate rejected stale callback/output, plus current accepted notifications. Native btleplug/OS delivery ordering remains hardware acceptance rather than inferred from helper tests.

Run Cargo fmt/full tests/Clippy after change; frontend unchanged by R04. Record decisions/tests, update checkpoint and PR #5 without merge/release. Broader inclusion/research/performance goals remain active.
