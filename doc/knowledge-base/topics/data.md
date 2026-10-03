# SQLite、時間戳與資料保存

原始、校準、判定與展示資料能否被可靠重現？

本主題 7 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src-tauri/src/db.rs](../../../IRMS_App_Tauri/src-tauri/src/db.rs)
- [IRMS_App_Tauri/src-tauri/src/migrations.rs](../../../IRMS_App_Tauri/src-tauri/src/migrations.rs)
- [IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-SQLITE-WAL** [Write-Ahead Logging](../sources/DOC-SQLITE-WAL.md) (持續文件；primary-page-excerpt) — WAL 允許讀寫並行但仍有限制；checkpoint、長讀取與備份程序會影響資料保存。
- **DOC-RFC3339** [RFC 3339: Date and Time on the Internet: Timestamps](../sources/DOC-RFC3339.md) (持續文件；primary-page-excerpt) — 時間戳格式與時區表示用於紀錄交換；耗時與訊號積分仍應使用單調時鐘。
- **DOC-RFC8259** [RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format](../sources/DOC-RFC8259.md) (持續文件；primary-page-excerpt) — JSON 格式用於匯出與 API 交換；解析成功不代表欄位語意、數值範圍或版本正確。
- **DOC-SQLITE-ATOMIC** [Atomic Commit In SQLite](../sources/DOC-SQLITE-ATOMIC.md) (持續文件；primary-page-excerpt) — 原子提交機制有助理解崩潰恢復；仍須考慮實際儲存裝置與同步設定。
- **DOC-SQLITE-FK** [SQLite Foreign Key Support](../sources/DOC-SQLITE-FK.md) (持續文件；primary-page-excerpt) — 外鍵檢查須依連線設定確認，刪除、匯入與 migration 不應依賴未啟用的約束。
- **DOC-SQLITE-PRAGMA** [PRAGMA Statements](../sources/DOC-SQLITE-PRAGMA.md) (持續文件；primary-page-excerpt) — journal_mode、foreign_keys、synchronous 與 user_version 等設定要按用途與版本核對。
- **DOC-SQLITE-TRANSACTION** [Transaction](../sources/DOC-SQLITE-TRANSACTION.md) (持續文件；primary-page-excerpt) — 交易邊界與錯誤處理關係到一批感測資料是否完成寫入，UI 接收與磁碟提交須區分。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
