---
tags: [irms, knowledge, literature, moc]
date: 2026-10-03
summary: "IRMS reference library: 202 sources, 22 topics, 12 guides, traceable citations and offline search."
---

# IRMS 專業知識與文獻資料庫

本資料庫提供 IRMS 的研究背景、工程依據與待驗證問題：**202 筆來源、22 個主題、12 篇專業導讀**，包含 157 篇研究／方法期刊來源、1 份作者技術報告、41 份技術／官方指引及 3 個資料集入口。快照日為 **2026-10-03**。同一來源跨主題只計一次。

**2026-10-04 升級：14 篇核心全文精讀**，補上族群、樣本、設備、方法、結果、限制及章節／表格定位，並接入所有檢索格式。[精讀比較與入口](FULL_TEXT_REVIEW.md)

**2026-10-06 查核**：[4 項更正／數值疑點](EVIDENCE_RECONCILIATION.md)、[25 主張與 12 驗證活動對照](EVIDENCE_MAP.md)，包含 Claude 已提交的真機紀錄與尚缺的完成證據。[全部後續工作](GOAL_PROGRESS.md)

[14 篇逐項品質與外推域評讀](QUALITY_APPRAISAL.md) 區分 JBI 歷史清單與自訂工程檢查，非獨立雙人審查。[實際瀏覽器／Zotero 驗收流程](ACCEPTANCE_CHECKLIST.md) 尚待執行。

每筆都有書目／原始入口、繁體中文重點、IRMS 用途、適用限制、閱讀深度與查核狀態。這是經主題篩選的參考庫，未完成全文系統性回顧或逐篇偏誤風險評估；引用文獻不能直接證明 IRMS 的準確度、診斷能力或復健療效。

## 立即使用

開啟 [離線搜尋 index.html](index.html)，以中文／英文、作者、DOI 或來源 ID 搜尋，並篩選主題、來源類型、閱讀深度及優先閱讀。此單一 HTML 自帶資料，直接以瀏覽器開啟即可，不需要伺服器、API 金鑰或安裝套件。

在 Obsidian、GitHub 或文字編輯器，從 [完整來源索引](INDEX.md)、[22 個主題](data/topics.json) 或下方導讀開始。報告引用可使用 [BibTeX](references.bib) 或 [RIS](references.ris) 匯入 Zotero 等書目工具；正式使用數值與詳細實驗設定前，仍需核對原文。

| 目的 | 入口 |
|---|---|
| 查核研究數值與方法 | [14 篇全文精讀](FULL_TEXT_REVIEW.md)、[結構化摘錄](data/full-text-reviews.json) |
| 專題背景與研究動機 | [復健背景](guides/07-rehabilitation-context.md)、[閱讀路徑](READING_PATHS.md) |
| 理解可量到的角度 | [量測模型](guides/01-measurement-model.md)、[佩戴校準](guides/02-calibration.md) |
| 處理誤差與精度論述 | [濾波延遲](guides/03-signal-fusion.md)、[統計驗證](guides/04-validation-statistics.md) |
| 支持開發與硬體驗收 | [專案程式對照](IRMS_MAPPING.md)、[驗證計畫](VALIDATION_PLAN.md) |
| 寫出有界限的文獻主張 | [25 項引用主張表](CLAIMS.md) |
| 給 AI／工具檢索 | [檢索規則](ASSISTANT_GUIDE.md)、[資料結構](SCHEMA.md)、[retrieval.jsonl](data/retrieval.jsonl) |
| 維護與擴充 | [來源方法](SOURCE_METHOD.md)、[維護流程](MAINTENANCE.md) |

## 專業導讀

1. [量測模型：從感測器到膝關節角](guides/01-measurement-model.md)
2. [佩戴、校準與品質判斷](guides/02-calibration.md)
3. [訊號、姿態融合與延遲](guides/03-signal-fusion.md)
4. [量測驗證與統計解讀](guides/04-validation-statistics.md)
5. [步態、運動辨識與計次](guides/05-gait-and-recognition.md)
6. [生物回饋、狀態機與動作學習](guides/06-feedback-and-learning.md)
7. [復健背景、功能終點與遠距服務](guides/07-rehabilitation-context.md)
8. [硬體、固定與即時韌體](guides/08-hardware-and-firmware.md)
9. [BLE、封包完整性與時間](guides/09-ble-and-timing.md)
10. [資料保存、缺失與可重現分析](guides/10-data-and-reproducibility.md)
11. [權限、更新與模組生命週期](guides/11-security-and-lifecycle.md)
12. [使用性、研究設計與部署](guides/12-usability-and-study-design.md)

[專業術語表](GLOSSARY.md) 提供 60 個詞彙的中英文、用途及容易混淆之處。導讀中的工程公式、建議與待驗證計畫，是本庫的整理與推論；文獻結論則連到來源卡。

[本次完整性與搜尋驗證](VERIFICATION.md) 記錄已通過的檢查，以及瀏覽器畫面與書目工具匯入尚未驗收的範圍。

## 閱讀深度與查核

| 標記 | 本庫意義 | 本次筆數 |
|---|---|---:|
| `abstract` | 取得書目與摘要，導讀依摘要相關內容整理；未完成全文擷取 | 143 |
| `full-text-extracted` | 全文方法、結果、表格與限制的結構化單人摘錄，未做正式偏誤評分 | 14 |
| `full-text-sections` | 檢查原文指定章節，仍非完整系統性審查 | 1 |
| `primary-page-excerpt` | 檢查官方頁面標題與相關內容／文件身分 | 42 |
| `metadata-only` | 官方目錄確認文件，但直接原文未取得 | 2 |

兩筆 `metadata-only` 是 TDK 的 MPU6050 規格與暫存器文件：官方目錄可確認名稱，直接 PDF 本次遭阻擋或重新導向。已保留追溯與限制，沒有把它們列為已閱讀全文。其他技術文件的 HTTP 成功也只表示本次可取得，不代表 IRMS 相容性或性能已驗證。

書目由 Europe PMC 的 MED 記錄取得，VQF 另核對作者機構及 Crossref。PubMed／DOI 網頁本身可能對不同工具限流或攔截；本庫區分 API 書目驗證與連結可取得狀態。[機器可讀統計](data/stats.json)、[官方連結查核](data/link-checks.json)

## CLI 與 SQLite

在 repo 根目錄執行，使用 Python 3.9+ 與標準庫：

```powershell
python doc/knowledge-base/scripts/query.py "校準" --core
python doc/knowledge-base/scripts/query.py "Bland" --topic validation
python doc/knowledge-base/scripts/query.py "" --topic datasets --json
python doc/knowledge-base/scripts/build.py
python doc/knowledge-base/scripts/check.py
node doc/knowledge-base/scripts/check_search.js
```

`data/catalog.json` 維護一般來源；`data/full-text-reviews.json` 維護全文事實與定位。`build.py` 重建精讀筆記、卡片、主題、引用、離線搜尋、檢索 JSONL 與 **irms-knowledge.sqlite**。SQLite 是本機可重建產物，不進 Git；本次交付目錄已建立。它不讀取、更動或取代 IRMS 的使用者 Session 資料庫。中文版搜尋採子字串；SQLite FTS5 的英文斷詞不能取代中文查詢。

## 使用與版本範圍

此知識庫加入專案文件入口，沒有修改裝置、App 判定、復健目標、臨床流程或產品內的模組功能。程式對照鎖定已記錄的 App／韌體 commit，後續版本可能改變。原廠 stable／latest 文件是查核快照，不代表目前依賴版本。[專案快照](IRMS_MAPPING.md)

僅保存原創導讀及書目，沒有重新散布出版商全文或付費標準。文章、官方文件、資料集與第三方程式的授權各自適用；API 的 open-access 標記不等於可任意重新散布或訓練模型的授權。
