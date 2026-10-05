# IRMS 主張與全文證據對照

查核：2026-10-06；App 快照 `af65daa2c4eb29b2e296c2023caf07d0e4b4a9e1`。

25 主張與 12 驗證活動全部對照。閱讀深度逐筆保留；工程推論和待驗證要求不是 IRMS 已有的性能結果。

[引用主張](CLAIMS.md) · [驗證計畫](VALIDATION_PLAN.md) · [數值查核](EVIDENCE_RECONCILIATION.md) · [資料](data/evidence-map.json)

## C01 — 穿戴式 IMU 可用於部分下肢運動學的院外研究

**來源與實際閱讀位置**

- [PMID-31991862](sources/PMID-31991862.md)：§3.3；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：沒有 IRMS 指定任務、目標族群與同步參考的效度資料。

**完成所需證據**：任務／族群分層的絕對角、ROM、波形誤差與信賴區間；使用流程完成率。

**驗證活動**：V05、V11（[工作表](VALIDATION_PLAN.md)）。

## C02 — 量測效度因關節、平面與任務而異

**來源與實際閱讀位置**

- [PMID-30935116](sources/PMID-30935116.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-41088368](sources/PMID-41088368.md)：Knee joint RoM (sagittal plane)、Figure 3；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts)

**尚缺**：矢狀 ROM 研究不能證明 kneeRoll 或所有任務的絕對角準確度。

**完成所需證據**：每個平面與估計量分開的獨立參考結果；不用合併 RMSE 當通過線。

**驗證活動**：V01、V05（[工作表](VALIDATION_PLAN.md)）。

## C03 — 校準需處理感測器與肢段的座標差異

**來源與實際閱讀位置**

- [PMID-32545227](sources/PMID-32545227.md)：§5；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：靜態歸零與功能肢段軸辨識不同；重戴／跨操作者效果未知。

**完成所需證據**：同次、重戴、跨操作者分層偏差、失敗率與 ICC 型式／信賴區間。

**驗證活動**：V02、V03（[工作表](VALIDATION_PLAN.md)）。

## C04 — 功能校準的表現具有任務依賴

**來源與實際閱讀位置**

- [PMID-37766040](sources/PMID-37766040.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-32545227](sources/PMID-32545227.md)：§5；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：尚未同條件比較 IRMS 動作與受限動作的校準品質。

**完成所需證據**：完整校準設定及動作激發矩陣、退化／拒絕標準與重測結果。

**驗證活動**：V02、V04（[工作表](VALIDATION_PLAN.md)）。

## C05 — 在合適限制下可不依賴磁力計估計某些關節角

**來源與實際閱讀位置**

- [PMID-24743160](sources/PMID-24743160.md)：Table 1；`full-text-extracted`。
- [PMID-35408159](sources/PMID-35408159.md)：Tables 1–2；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts) · [IRMS_App_Tauri/src/shared/protocol.ts](../../IRMS_App_Tauri/src/shared/protocol.ts)

**尚缺**：現有正規化向量沒有完整陀螺與加速度幅值，無法重跑原文融合；非矢狀膝角未驗證。

**完成所需證據**：輸入與模型假設對照、磁環境及退化測試、指定關節平面的參考結果。

**驗證活動**：V04、V05（[工作表](VALIDATION_PLAN.md)）。

## C06 — 關節軸品質與有效樣本選擇值得納入設計

**來源與實際閱讀位置**

- [PMID-32580394](sources/PMID-32580394.md)：§8.3；Table 1、§9.4；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：IRMS 的兩姿勢軸擷取不是 Olsson 演算法；81%／88% 原文矛盾不能作門檻。

**完成所需證據**：資訊量、回到基準、錯誤輸出／拒絕率與獨立軸參考；保存所有失敗試次。

**驗證活動**：V04（[工作表](VALIDATION_PLAN.md)）。

## C07 — 軟組織與附件影響感測性能

**來源與實際閱讀位置**

- [PMID-18401071](sources/PMID-18401071.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-24743160](sources/PMID-24743160.md)：Table 1；`full-text-extracted`。
- [PMID-29933568](sources/PMID-29933568.md)：§3.1–3.2、Tables 1–2；§3.3–3.4、Table 4；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts)

**尚缺**：外殼姿態與人體解剖參考不可混用；皮膚、衣物與綁帶效果尚未量化。

**完成所需證據**：剛性外殼與解剖標記兩套參考各自的誤差及固定條件矩陣。

**驗證活動**：V01、V03、V05（[工作表](VALIDATION_PLAN.md)）。

## C08 — 光學參考也會受皮膚標記影響

**來源與實際閱讀位置**

- [PMID-16022983](sources/PMID-16022983.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-29933568](sources/PMID-29933568.md)：§3.1–3.2、Tables 1–2；§3.3–3.4、Table 4；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts)

**尚缺**：目前沒有完整參考模型、同步與參考本身不確定性資料。

**完成所需證據**：外殼標記與解剖標記分開分析，記錄參考校準、時間對齊與標記誤差。

**驗證活動**：V01、V05（[工作表](VALIDATION_PLAN.md)）。

## C09 — 姿態演算法表現受硬體與運動條件影響

**來源與實際閱讀位置**

- [PMID-33916432](sources/PMID-33916432.md)：§5；`full-text-extracted`。
- [PMID-22319365](sources/PMID-22319365.md)：Table 2；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/smoothing.ts](../../IRMS_App_Tauri/src/services/smoothing.ts) · [IRMS_App_Tauri/src/shared/protocol.ts](../../IRMS_App_Tauri/src/shared/protocol.ts)

**尚缺**：文獻最佳參數與離線頭部示例不能代表 IRMS 即時姿態融合。

**完成所需證據**：同原始三軸資料的因果比較、調參／測試分離及端到端延遲。

**驗證活動**：V06、V07（[工作表](VALIDATION_PLAN.md)）。

## C10 — 絕對誤差與中心化波形誤差不同

**來源與實際閱讀位置**

- [PMID-35957218](sources/PMID-35957218.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-35408159](sources/PMID-35408159.md)：Tables 1–2；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：扣掉光學均值的 relative RMSE 掩蓋部署零位偏移。

**完成所需證據**：同時保存絕對誤差、平均偏差、中心化波形誤差、ROM 與校準設定。

**驗證活動**：V01、V05、V06（[工作表](VALIDATION_PLAN.md)）。

## C11 — 相關性不能單獨證明方法一致

**來源與實際閱讀位置**

- [PMID-26110027](sources/PMID-26110027.md)：Table 1、Figures 1–5；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：相關係數與封包數不能替代方法一致性及獨立樣本。

**完成所需證據**：受試者／試次單位的平均差、LoA／信賴區間及事前用途界限。

**驗證活動**：V01、V02、V05（[工作表](VALIDATION_PLAN.md)）。

## C12 — ICC 需要明確模型與形式

**來源與實際閱讀位置**

- [PMID-27330520](sources/PMID-27330520.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：ICC 原始指引有公式更正；目前缺重戴／操作者／日期的完整獨立樣本。

**完成所需證據**：先記錄模型、單次／平均、絕對一致性／一致程度；用更正版與完整樣本計算 CI。

**驗證活動**：V02（[工作表](VALIDATION_PLAN.md)）。

## C13 — SEM／MDC 可輔助解讀量測誤差下的改變

**來源與實際閱讀位置**

- [PMID-15705040](sources/PMID-15705040.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：尚未有匹配 IRMS ICC 形式、SD 來源與目標任務的 SEM／MDC。

**完成所需證據**：同目標族群重測設計下的誤差模型；MDC 與臨床重要變化分開。

**驗證活動**：V02、V05（[工作表](VALIDATION_PLAN.md)）。

## C14 — 部分平均步態參數較有研究支持

**來源與實際閱讀位置**

- [PMID-32393301](sources/PMID-32393301.md)：Methodological quality、Table 1；Discussion；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/triggerEngine.ts](../../IRMS_App_Tauri/src/services/triggerEngine.ts)

**尚缺**：IRMS 目前計次與角度資料不等於已驗證時空步態、對稱或變異指標。

**完成所需證據**：每種指標獨立定義與參考標記；受試者層級資料切分與錯計／漏計。

**驗證活動**：V05、V08（[工作表](VALIDATION_PLAN.md)）。

## C15 — 真實生活的短片段與慢速會影響演算法

**來源與實際閱讀位置**

- [PMID-37316858](sources/PMID-37316858.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：居家短片段、慢速、重連與未知活動尚未有目標情境資料。

**完成所需證據**：標記真實活動、低速、停頓與缺口，分層報告判定／資料品質。

**驗證活動**：V05、V07、V08（[工作表](VALIDATION_PLAN.md)）。

## C16 — 分類資料應包含非運動片段

**來源與實際閱讀位置**

- [PMID-37051835](sources/PMID-37051835.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/triggerEngine.ts](../../IRMS_App_Tauri/src/services/triggerEngine.ts)

**尚缺**：非運動、錯誤動作及回到休息位的真實標記資料不足。

**完成所需證據**：包含未知活動與停頓的試次，按受試者切分，報誤計／漏計及原因。

**驗證活動**：V08、V11（[工作表](VALIDATION_PLAN.md)）。

## C17 — 生物回饋研究存在正向結果與證據限制

**來源與實際閱讀位置**

- [PMID-34063355](sources/PMID-34063355.md)：§3.6.2、Figure 5；§3.6.3、Figure 6；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/triggerEngine.ts](../../IRMS_App_Tauri/src/services/triggerEngine.ts)

**尚缺**：神經疾病混合裝置回饋不能推得 IRMS 膝部療效；圖／正文差異保留。

**完成所需證據**：匹配族群與訓練量的對照，回饋撤除、保留與轉移終點及不確定性。

**驗證活動**：V12（[工作表](VALIDATION_PLAN.md)）。

## C18 — 使用者與治療師評估可支持需求設計

**來源與實際閱讀位置**

- [PMID-30669657](sources/PMID-30669657.md)：§3.1、Table 2；`full-text-extracted`。
- [PMID-30366919](sources/PMID-30366919.md)：Results／Opportunities and challenges、Challenges；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/calibration.ts](../../IRMS_App_Tauri/src/services/calibration.ts)

**尚缺**：外部原型的 SUS 或訪談不是 IRMS 的精度與療效。

**完成所需證據**：首次佩戴／校準／操作完成率、幫助、錯誤及訪談；功能終點另外測。

**驗證活動**：V11、V12（[工作表](VALIDATION_PLAN.md)）。

## C19 — 某些完整遠距療程可有與傳統服務相近的結果

**來源與實際閱讀位置**

- [PMID-26178888](sources/PMID-26178888.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-31743238](sources/PMID-31743238.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/triggerEngine.ts](../../IRMS_App_Tauri/src/services/triggerEngine.ts)

**尚缺**：完整遠距服務模式與 IRMS 原型不同，缺匹配介入比較。

**完成所需證據**：先定義服務與責任，再做前瞻對照及預先指定終點，不以可用性冒充療效。

**驗證活動**：V11、V12（[工作表](VALIDATION_PLAN.md)）。

## C20 — 患者回報與客觀功能量測可互補

**來源與實際閱讀位置**

- [PMID-26032657](sources/PMID-26032657.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：ROM 與完成次數不足以代表癥狀、任務功能及完整恢復。

**完成所需證據**：明確功能終點、患者回報及追蹤時點，與量測品質分開。

**驗證活動**：V05、V11、V12（[工作表](VALIDATION_PLAN.md)）。

## C21 — 膝負荷估計需要額外模型與資料

**來源與實際閱讀位置**

- [PMID-32039192](sources/PMID-32039192.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-41088368](sources/PMID-41088368.md)：Knee joint RoM (sagittal plane)、Figure 3；`full-text-extracted`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts)

**尚缺**：現有角度／向量不包含外力、人體參數或已驗證的力矩／GRF 模型。

**完成所需證據**：若新增負荷估計，需額外模型與獨立力板參考；目前不得輸出已驗證負荷主張。

**驗證活動**：V05（[工作表](VALIDATION_PLAN.md)）。

## C22 — 官方規格可支持協定與持久化設計

**來源與實際閱讀位置**

- [DOC-BLE-ATT](sources/DOC-BLE-ATT.md)：Official page or document headings; availability recorded separately；`primary-page-excerpt`。
- [DOC-SQLITE-WAL](sources/DOC-SQLITE-WAL.md)：Official page or document headings; availability recorded separately；`primary-page-excerpt`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts) · [IRMS_App_Tauri/src-tauri/src/db.rs](../../IRMS_App_Tauri/src-tauri/src/db.rs) · [IRMS_App_Tauri/src-tauri/src/protocol.rs](../../IRMS_App_Tauri/src-tauri/src/protocol.rs)

**尚缺**：規格與綠色 CI 不能證明真機零丟包、資料恢復或更新成功。

**完成所需證據**：版本明確的低 MTU／重連、交易失敗／中止／備份與 OTA 分階段故障紀錄。

**驗證活動**：V07、V09、V10（[工作表](VALIDATION_PLAN.md)）。

## C23 — 簽章可驗證來源與內容完整性

**來源與實際閱讀位置**

- [DOC-RFC8032](sources/DOC-RFC8032.md)：Official page or document headings; availability recorded separately；`primary-page-excerpt`。
- [DOC-TAURI-UPDATER](sources/DOC-TAURI-UPDATER.md)：Official page or document headings; availability recorded separately；`primary-page-excerpt`。

**實作對照**：[IRMS_App_Tauri/src-tauri/src/firmware_update.rs](../../IRMS_App_Tauri/src-tauri/src/firmware_update.rs) · [IRMS_App_Tauri/src/services/modules.ts](../../IRMS_App_Tauri/src/services/modules.ts)

**尚缺**：簽章驗證不涵蓋模組／更新功能效果、取消與復原。

**完成所需證據**：壞簽章／壞映像／失連／取消／重啟測試、裝置版本確認與權限檢查。

**驗證活動**：V10（[工作表](VALIDATION_PLAN.md)）。

## C24 — 公開同步資料可支持方法重現

**來源與實際閱讀位置**

- [PMID-41469404](sources/PMID-41469404.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-40702014](sources/PMID-40702014.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/angleMath.ts](../../IRMS_App_Tauri/src/services/angleMath.ts) · [IRMS_App_Tauri/src/shared/protocol.ts](../../IRMS_App_Tauri/src/shared/protocol.ts)

**尚缺**：資料集輸入、標籤與硬體不同；現有封包不能重現完整融合。

**完成所需證據**：先核對授權、輸入與標籤，再分開公開資料重現及 IRMS 真機效度。

**驗證活動**：V04、V05、V06（[工作表](VALIDATION_PLAN.md)）。

## C25 — 現行報告框架有助透明試驗計畫與報告

**來源與實際閱讀位置**

- [PMID-40294593](sources/PMID-40294593.md)：Abstract; metadata from Europe PMC MED record；`abstract`。
- [PMID-40228499](sources/PMID-40228499.md)：Abstract; metadata from Europe PMC MED record；`abstract`。

**實作對照**：[IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

**尚缺**：完成報告清單不能代替事前研究設計、資料與適用程序。

**完成所需證據**：研究問題、主要終點、樣本依據、分析方案與完整試驗紀錄。

**驗證活動**：V05、V11、V12（[工作表](VALIDATION_PLAN.md)）。
