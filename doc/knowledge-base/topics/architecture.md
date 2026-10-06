# Tauri、Rust 與非同步生命週期

跨前後端、取消與資源釋放是否符合明確契約？

本主題 4 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/platform/irmsApi.ts](../../../IRMS_App_Tauri/src/platform/irmsApi.ts)
- [IRMS_App_Tauri/src/services/modules.ts](../../../IRMS_App_Tauri/src/services/modules.ts)
- [doc/MODULE_CONTRACT.md](../../../doc/MODULE_CONTRACT.md)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-RUST-MUTEX** [std::sync::Mutex](../sources/DOC-RUST-MUTEX.md) (持續文件；primary-page-excerpt) — 互斥鎖與 poisoning 語意用於共享狀態設計，不應在長時間鎖內做網路或裝置等待。
- **DOC-TAURI-IPC** [Inter-Process Communication](../sources/DOC-TAURI-IPC.md) (持續文件；primary-page-excerpt) — Tauri 的命令與事件跨越前後端邊界，型別宣告仍需執行期輸入與結果處理。
- **DOC-TAURI-MOBILE** [Develop: Tauri development workflows](../sources/DOC-TAURI-MOBILE.md) (持續文件；primary-page-excerpt) — 官方開發入口提供桌面與行動平臺流程，平臺差異仍需逐項驗證原生插件。
- **DOC-TOKIO-SELECT** [tokio::select!](../sources/DOC-TOKIO-SELECT.md) (持續文件；primary-page-excerpt) — 非同步分支與取消安全影響停止、斷線及更新流程，取消任務需處理外部資源狀態。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
