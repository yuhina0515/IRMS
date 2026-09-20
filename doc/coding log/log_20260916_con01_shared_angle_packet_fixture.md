---
tags: [coding-log, protocol, con-01]
summary: Unified TR/SR/ERR/malformed/MTU-truncation test cases into a shared TS/Rust JSON fixture (fixtures/angle-packets.json), removing hand-duplicated test drift risk between the two implementations.
date: 2026-09-16
---

# CON-01: shared angle-packet contract fixture

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260916_status_and_task_plan|任務計畫 CON-01]]

## 🎯 目的

今晚第二項離線任務。檢查發現只有 `V:`(加速度向量)欄位透過 `fixtures/vector-packets.json`
在 TS(`protocol.contract.test.ts`)與 Rust(`protocol.rs`)之間共用同一份輸入/預期值;
`TR:/SR:` 欄位、ERR、malformed、MTU-23 截斷降級這些情境,兩邊各自手寫了大約 17 組概念相同
但實作各自維護的測試案例——其中一邊改了封包解析行為,另一邊的測試不會自動抓到。

## 🔧 變更內容

- 新增 `fixtures/angle-packets.json`(18 案例),涵蓋:完整 6 軸封包、向量欄位延伸、部分向量
  截斷、3 欄舊封包、TR/SR 前綴不被 T:/S: 誤吃、ERR、含空白 ERR、非法數值 malformed、純數字
  舊韌體相容、無法解析字串、MTU-23 兩種切點降級、半組 Roll 對截斷、缺 T:/S: malformed、
  中段亂碼 malformed、數值邊界切點不誤報 truncated。所有預期值都是直接讀 `protocol.ts` 現行
  解析邏輯逐案推導,不是照抄舊測試斷言。
- TS:`protocol.contract.test.ts` 新增 `shared angle packet contract` describe,`it.each` 讀
  新 fixture;`protocol.test.ts` 移除已被 fixture 覆蓋的個別案例,只留下不涉及解析輸出比對的
  MTU23 切點長度自我檢查。
- Rust:`protocol.rs` 新增 `angle_packet_contract` 測試,讀同一份 JSON;移除已被覆蓋的
  `full_six_axis_packet_ignores_derived_k_kr`、`extended_packet_preserves_pre_atan2_acceleration_vectors`、
  `legacy_three_field_packet_zeroes_roll`、`tr_sr_prefixes_not_swallowed_by_t_s`、
  `err_packet_reports_hardware_error_code`、`trailing_whitespace_still_parses`、
  `invalid_number_is_malformed`、`bare_number_legacy_firmware_carried_on_shin`、
  `unparseable_string_is_malformed`、整個 `mtu_23_truncation` 模組(只留長度自我檢查改名為頂層
  測試)、整個 `has_roll_vs_truncated` 模組。

## ✅ 驗證方式

- [x] `npx vitest run`:29 檔 317 測試通過。
- [x] `cargo test --manifest-path src-tauri/Cargo.toml`:45 通過(較先前少,因多個個別測試合併
  成單一 fixture 驅動測試,涵蓋範圍不變)。
- [x] `npm run ci` 全綠:typecheck、build、rustfmt、clippy(`-D warnings`)皆通過。

## 📝 後續待辦

- 任務計畫表所稱「broader IPC parity remains open」:目前共用 fixture 只覆蓋 BLE 角度封包的
  wire-level 解析。Tauri command 層(韌體更新、session 控制等 IPC)尚未有對應的跨語言契約
  測試,若之後要繼續 CON-01,那是下一個範圍。
