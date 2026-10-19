# 第二批全文：佩戴、參考與病變族群

摘錄日：2026-10-06；原來源搜尋截止日仍為 2026-10-03。從既有摘要來源選 11 篇，10 篇取得全文並完成結構化方法／結果／限制，1 篇 XML 取得失敗。沒有新增或重複計算原始來源，來源總數仍為 202。

| 主題 | 來源與閱讀入口 | 重要區別 |
|---|---|---|
| 同次校準與固定參考 | [Lebleu 2020](reviews/PMID-32012906.md) | 同次校準重複、外殼標記，不等於重戴或解剖角準確度。 |
| 最低功能校準 | [Carcreff 2022](reviews/PMID-35957218.md) | 絕對與 centered RMSE、每試次航向修正、光學時間對齊。 |
| 運動任務校準 | [Sport-specific 2023](reviews/PMID-37766040.md) | 代表試次選擇、首尾姿勢漂移修正、有符號 ROM 差。 |
| 病變者重測 | [Gait disorders 2026](reviews/PMID-41901917.md) | 55 人效度、27 人信度，跨日／操作者與平面分開。 |
| 骨關節炎範疇 | [OA scoping 2020](reviews/PMID-33322187.md) | 72 篇研究分類而非效果統合；樣本不一定跨論文獨立。 |
| 功能動作與峰值 | [Functional movements 2022](reviews/PMID-35161609.md) | 廠商融合、膝峰值對齊、consistency ICC。 |
| 機械已知角 | [CMM validation 2017](reviews/PMID-28846613.md) | 無人體、RMS 非最大誤差、解析度非角度準確度。 |
| 重戴與操作者 | [Clinical movement 2018](reviews/PMID-29495600.md) | 真實移除 IMU 但光學標記保留；系統不能互換。 |
| 佩戴偏移與段角 | [Single-IMU 2023](reviews/PMID-37448005.md) | 肢段角、工作期 ROM、位移條件、PCC／CCC 差異。 |
| 院外神經步態 | [Non-hospital gait 2017](reviews/PMID-28398224.md) | 足部感測、Kinect／240 fps 參考，病例展示非診斷效度。 |

[功能位置校準 2026](sources/PMID-41569824.md) 的 Europe PMC XML 回傳 HTTP 500；維持摘要層級，沒有從摘要推測完整設備／試驗結果。

## 檢查與採用界限

- 10 篇原始 XML 的 DOI、SHA-256 與 MED／XML 作者數逐筆核對；原始全文留在暫存區，不重新散布。
- 更正關係查核擴至 24 篇精讀與 ICC 指引，共 25 筆 MED 記錄。[版本查核](data/full-text-version-audit.json) 中的 preprint 關係不是新的獨立證據，未重複收錄。
- 本批沒有獨立雙人擷取或逐項品質評讀。第一批 [14 篇品質域評估](QUALITY_APPRAISAL.md) 的範圍沒有自動擴大。
- 使用參考曲線對齊、扣均值、逐試次修正或末端內插的數字，不能當 IRMS 即時絕對角性能。
- 對人體、患者、臺架與不同裝置的結果分開。將外部系統的「3°／5°／SEM」直接設為 IRMS 門檻，沒有本庫證據支持。

[24 篇精讀索引](FULL_TEXT_REVIEW.md) · [證據對照](EVIDENCE_MAP.md) · [驗證計畫](VALIDATION_PLAN.md)
