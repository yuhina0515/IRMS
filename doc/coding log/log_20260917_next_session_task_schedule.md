---
tags: [coding-log, planning]
summary: Re-prioritized task schedule after the 09-16 offline batch (Roll fix, knee-frame candidate, CON-01 fixture unification, DOC-01 pointers) — split into offline-doable vs hardware-gated tracks.
date: 2026-09-17
---

# Next-session task schedule (post 09-16 offline batch)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260916_status_and_task_plan|09-16 原始任務計畫]] ·
> [[log_20260916_hinge_roll_shared_denominator_fix]] · [[log_20260916_knee_frame_reconciliation_candidate]] ·
> [[log_20260916_con01_shared_angle_packet_fixture]] · [[log_20260916_doc01_readme_status_tauri_reconciliation]]

## 🎯 目的

裝置仍不在身邊(見 [[log_20260916_session_close_hardware_unavailable]]),09-16 晚間已完成
一批離線工作。這份 log 重新核對 09-16 原始任務表(CAL-01~REL-01)的現況,分成「離線可續做」
與「需要裝置/真人」兩軌,排出下一次工作階段的建議順序,取代原表格作為目前的排程依據。

## 📊 任務現況(相對 09-16 原表更新)

| ID | 狀態 | 09-17 現況 |
|---|---|---|
| CAL-01 | ✅ 完成 | 證據保存、replay 工具、合成反例已建立(09-16 稍早批次) |
| CAL-02 | 🟡 部分 | Roll 共用分母退化已修好並上測試;knee 跨感測器座標系反例有已驗證候選公式但**刻意未接上**;**正式決策文件尚未寫**(見下方離線待辦#1) |
| CAL-03 | ⛔ 未開始 | 依賴 CAL-02 正式決策文件 + 真機驗證,兩者都還沒有 |
| CON-01 | 🟡 部分 | BLE wire-level 封包契約(向量、TR/SR/ERR/MTU 截斷)已統一成共用 fixture;Tauri IPC command 層(韌體更新、session 控制)契約覆蓋仍未開始 |
| E2E-01 | ⛔ 未開始 | 依賴 CAL-03 完成 + 真機 |
| DOC-01 | 🟡 部分 | README/PROJECT_STATUS 已加現況指標與警語;PROJECT_STATUS 內文逐節核對重寫仍未開始 |
| REL-01 | ⛔ 未開始 | 依賴以上全部 + 真機驗收證據 |

## 🔧 離線可續做(下次不需要裝置就能開始)

1. **CAL-02 正式決策文件**(建議優先):把 09-16 三篇 log(Roll 修復、knee 候選公式分析、
   原始任務表)整併成單一決策文件,補上任務表原本要求但目前分散/缺漏的部分——量測語意
   (已有雛形,見 Roll 修復 log)、貼裝假設明文化(髖屈軸/膝屈軸平行假設)、重複擷取品質
   門檻的具體數字(目前只有質性描述,沒有「多少度算通過」這種可驗收的門檻)、獨立肢段重校準
   行為。這是 CAL-03 開工前唯一的正式閘門,而且完全不需要裝置。
2. **CON-01 續:Tauri IPC command 層契約**:比對 `src-tauri/src/commands.rs` 與
   `src/platform/irmsApi.ts` 的呼叫介面(韌體更新流程、session 開始/結束/查詢),找出目前
   沒有跨語言契約測試覆蓋的邊界(例如：無效 session id、DB 鎖定中的併發呼叫、韌體檔案格式
   錯誤)。範圍比 BLE wire 協定大,建議先花 30 分鐘盤點清單,不必一次做完。
3. **DOC-01 續:PROJECT_STATUS.md 逐節重寫**:昨晚只加了警語沒動內文。需要逐節核對測試數量、
   DB schema 驗證狀態、真機驗證清單這些具體主張是否仍適用於 `IRMS_App_Tauri`,比對後才動筆
   ——不要憑印象重寫,每個數字都要回去對現在的 `npm run ci` 輸出或 coding log。
4. **(低優先,視時間)**:`packets.txt`(66,927 筆既有 trace)有沒有辦法在缺乏時間戳記/動作
   標籤的情況下,用統計方式抓出「兩肢段同步不動的站姿段落」,間接檢驗 `reconcileToReferenceFrame`
   的髖屈/膝屈軸平行假設在這批真實資料上站不站得住腳。這個機率不高(trace 本身就缺對應的
   hinge-axis 設定,見 09-16 review log),排在最後,不確定值得投入。

## ⛔ 需要裝置 + 真人配戴(排入待辦,無日期,等使用者下次有空)

1. 用既有 wizard 擷取流程重跑一次,**這次務必連 `proximal/distalHingeAxis` 與
   `proximal/distalZeroAccel` 完整設定一起存下來**(上次的 66,927 筆 trace 就是因為settings
   對不上而無法逐點驗證)。
2. 深屈膝真機驗收:確認 Roll 修復後的行為(不再飄到 ±180°)。
3. `reconcileToReferenceFrame` A/B 比較:同一組真人動作,分別用現行公式與候選公式算 knee,
   看兩者實際分歧多大、哪個更接近真人徒手量測值——這個結果決定要不要真的接上 CAL-03。
4. Issue #3 剩餘 session gate:達標/超限警報/靜音/斷線重連/abandoned session 復原。
5. OTA gate、桌面發版 gate(見 09-16 任務表,細節不重複列)。

## 📝 建議下次開場

若下次仍無裝置:從離線清單 #1(CAL-02 決策文件)開始,那是目前唯一擋住 CAL-03 的離線瓶頸。
若裝置已回來:先做「需要裝置」清單的第 1 項(補存完整設定),其餘都依賴這一步先做對。
