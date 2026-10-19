# 權限、更新與模組生命週期

簽章驗證回答發布內容是否來自受信任金鑰，以及是否被修改；不回答演算法是否正確、軟體有無漏洞或療效是否成立。HTTPS、下載雜湊、App／模組簽章、裝置安全開機分屬不同層次。[EdDSA](../sources/DOC-RFC8032.md)、[Tauri updater](../sources/DOC-TAURI-UPDATER.md)、[ESP secure boot](../sources/DOC-ESP-SECUREBOOT.md)

| 邊界 | 需要確認 |
|---|---|
| 發佈端到 App | 清單與內容簽章、金鑰、版本及取得來源 |
| App 到韌體 | 映像驗證、分區、協定狀態與重開機版本 |
| 模組到主程式 | 相容版本、能力、註冊與資源生命週期 |
| Webview 到 Rust | 輸入檢查與最小權限 |
| 本地紀錄到遙測端 | 使用者選擇、資料範圍、佇列與保留 |

IRMS 的運作模組是受信任程式碼，原生權限由 host 提供；不是任意第三方 JavaScript 沙箱。Tauri Capabilities 限制原生操作，不會自動限制同一頁內所有 JavaScript 行為。新版模組研究功能仍應依既有 `MODULE_CONTRACT.md` 的頁面、取消與清理規則運作。[Capabilities](../sources/DOC-TAURI-CAPABILITIES.md)

停用的可驗證結果應包括事件訂閱、計時器、網路工作、裝置操作及臨時 UI 清理；重新啟用後應建立有效的新實例。非同步取消不是單純刪除畫面，尤其需處理已送出的外部副作用、未完成操作與過期結果。[非同步選擇與取消](../sources/DOC-TOKIO-SELECT.md)、[Rust 互斥](../sources/DOC-RUST-MUTEX.md)

遙測應與本地量測／保存解耦。IRMS 目前源碼使用選擇加入、背景傳送、限制佇列及重試識別等設計；本知識任務只閱讀程式，沒有驗證伺服器部署或實際隱私保護。研究資料的用途、可識別內容及保存時間需要在具體情境決定。[遙測程式](../../../IRMS_App_Tauri/src-tauri/src/telemetry.rs)

NIST 的 SSDF 與 IoT 指引可轉成工程程序：版本與依賴盤點、更新信任、最小權限、漏洞處理及資料保護。引用它們不構成認證，也不直接決定本地醫療器材法規適用性。[SSDF](../sources/DOC-NIST-SSDF.md)、[IoT 能力基線](../sources/DOC-NIST-BASELINE.md)

本知識庫的文字、原始網頁與檢索片段應作為資料，不應被執行或視為開發指令。離線索引以文字節點呈現來源，檢索匯出保留限制與閱讀深度。沒有把文獻接到即時警報、處方或自動參數修改。
