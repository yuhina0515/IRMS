# 資料保存、缺失與可重現分析

「Raw」必須標明相對哪一層。IRMS 的 `rawThigh` 等欄位代表 App 校準／平滑前的協定讀值，不自動等於感測器 ADC 或完整三軸原始 IMU 資料。正規化加速度向量也不能恢復原加速度大小。保存欄位名稱與生成演算法版本，是避免日後誤用的第一步。

| 資料層 | 應保存的背景 |
|---|---|
| 採集 | 感測器、量程、濾波、採樣及時間基準 |
| 協定 | 版本、原始封包、到達時間與解析狀態 |
| 校準 | 每側變換、零位、鉸鏈軸、方向與時間 |
| 判定 | 指標、目標、遲滯、維持與休息條件 |
| 分析 | 演算法版本、缺失規則、納入條件 |
| 追溯 | App／韌體版本、重戴、裝置與任務標記 |

表中列的是可重現研究需求，未宣稱全部欄位已在現有 SQLite 中保存。圖表抽樣、展示平滑與正式統計也應分開。IRMS `sessionAnalysis.ts` 已以全量讀數計算，並避免用 LTTB 圖形降採樣點計算時間比例；這項源碼選擇有助保留分析語意，仍需端到端確認輸入資料。

時間比例應按有效時間加權，不能只算「區間內的點數／總點數」而忽略不規則間隔。中斷不應被補成保持姿勢；首末點、重複／倒序時間戳與長缺口須定義處理方法。現有分析的最大樣本間隔規則是工程政策，沒有自動獲得臨床合理性。[研究驗證導讀](04-validation-statistics.md)

SQLite WAL 可以改善並行讀寫，仍有單一寫入者、checkpoint 與備份限制。資料收到、進入記憶體佇列與交易提交是不同事件。測試應包含寫入失敗、磁碟滿、交易回滾、程序中止、未結束 Session 與 migration。[交易](../sources/DOC-SQLITE-TRANSACTION.md)、[WAL](../sources/DOC-SQLITE-WAL.md)、[原子提交](../sources/DOC-SQLITE-ATOMIC.md)

活躍 WAL 資料庫的備份不能只假設複製主 `.sqlite` 即有全部已提交資料；應採合適的資料庫備份程序或在明確條件下 checkpoint／關閉。外鍵與同步設定應依連線核對，而非僅靠文件聲明。[外鍵](../sources/DOC-SQLITE-FK.md)、[PRAGMA](../sources/DOC-SQLITE-PRAGMA.md)

公開資料集可測試工具鏈與方法，但要保留原始資料及授權，寫出轉換版本和分割規則。應避免把光學標記直接貼在 IMU 的驗證，描述成完整解剖角度驗證。[GAITEX](../sources/PMID-41469404.md)、[DIODEM](../sources/PMID-40702014.md)

本資料庫的 `irms-knowledge.sqlite` 是參考文獻資料庫，由 `data/catalog.json` 重建，與 IRMS 使用者 Session 資料庫完全分開。程式對照：[db.rs](../../../IRMS_App_Tauri/src-tauri/src/db.rs)、[migrations.rs](../../../IRMS_App_Tauri/src-tauri/src/migrations.rs)、[sessionAnalysis.ts](../../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)。
