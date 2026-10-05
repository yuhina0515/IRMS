# 資料結構與格式

`data/catalog.json` 是一般來源的編輯入口；`data/full-text-reviews.json` 是全文事實摘錄的編輯入口；`data/topics.json` 定義主題與程式對照。`scripts/build.py` 重建所有閱讀、引用及檢索格式。不要直接修改產生檔。

## Catalog v1

頂層包含 `schema_version`、`snapshot_date`、`scope`、`project_snapshot` 與 `sources`。日期採 ISO 8601，未知欄位保留空字串／null，不推測出版日期。來源 ID 在維護中保持穩定。

| 欄位 | 用途 |
|---|---|
| `id` | 穩定 ID：MED 記錄採 `PMID-數字`；官方資料採 `DOC-...`；作者報告採 `ALG-...` |
| `title`, `authors`, `bibtex_authors` | 原始標題、原始顯示作者，以及引用匯出的姓／名表示 |
| `corporate_authors` | 可選的團體作者清單；BibTeX 以額外括號保護，避免誤分姓／名 |
| `bibliographic_overrides` | 可選的 API 書目修正；保存欄位、日期、原因及原始查核連結，不修改原 API 雜湊 |
| `year`, `first_publication_date` | 期刊年份及 API 所提供的首次出版日期；用後者檢查截止日 |
| `journal`, `volume`, `issue`, `pages` | 書目欄位；pages 可能是文章編號 |
| `doi`, `pmid`, `pmcid`, `url` | 識別碼及原始入口；同一 DOI／PMID 不重複建卡 |
| `open_access` | API 的開放取得標記，不是授權判定 |
| `source_type`, `study_type`, `publication_types` | 來源種類、整理時判讀的研究形式、API 原始出版類型 |
| `topics` | 一或多個 topics.json 主題 ID，來源總數不因交叉索引增加 |
| `priority` | `core` 或 `supporting`，僅供閱讀順序 |
| `review_level` | `abstract`、`full-text-sections`、`full-text-extracted`、`primary-page-excerpt`、`metadata-only` |
| `full_text_review_id`, `version_notices` | 可選的全文摘錄 ID 指向與更正通知；建置時連結全文物件，不在 catalog 重複儲存 |
| `summary_zh` | 原創繁體中文整理，非出版商摘要複製 |
| `irms_application`, `limitations_zh` | 專案用途與外推限制；不可在檢索中省略 |
| `evidence_locator` | 實際檢查的摘要、章節或官方頁面位置 |
| `verification` | `status`、`checked_on`、`method`，可含 URL、雜湊及取得失敗資訊 |
| `provenance` | 書目查詢、記錄入口、擷取方式與時間的追溯資料 |
| `rights_note` | 原文及第三方資料授權各自適用的提醒 |

`metadata-and-abstract-retrieved` 表示 API 書目／摘要取得；`retrieved` 等官方查核標記描述本次頁面取得；`metadata-only-document-unavailable` 表示只有官方目錄確認身分。這些狀態不是研究品質評分。

`data/reconciliation.json` 保存更正／疑點的結論、定位、原始 URL、PDF 雜湊、未解狀態及採用規則。建置時以來源 ID 加入 `evidence_reconciliation`，所有搜尋及 JSONL 保留結論與限制。`data/evidence-map.json` 是 25 主張對照的編輯入口，保存來源閱讀深度與定位、程式路徑、驗證活動、缺口及完成證據；產生 `EVIDENCE_MAP.md`。所有 V01–V12 至少對應一項主張。

`data/quality-appraisals.json` 保存 14 篇第二次核對的逐項判讀、理由、定位及適用工具，建置時加入 `quality_appraisal` 並產生 `QUALITY_APPRAISAL.md`。JBI 歷史清單與自訂工程域分開，沒有跨設計總分；同代理核對不能稱獨立雙人評讀。品質評讀與全文擷取是不同欄位，後續新全文不自動取得已評讀標記。

`data/query-manifest.json` 保存本次候選搜尋的原始查詢、日期、排序、命中及取得筆數；不保存出版商全文。`data/link-checks.json` 保存官方入口查核，並區分成功 PDF、HTML、重新導向、阻擋及工具無法取得。

## 產生格式

| 檔案／目錄 | 使用方式 |
|---|---|
| `reviews/*.md`, `FULL_TEXT_REVIEW.md` | 全文精讀、逐項定位與比較索引，由摘錄資料產生 |
| `sources/*.md` | 一筆來源一卡，供 GitHub／Obsidian／文字閱讀 |
| `topics/*.md`, `INDEX.md` | 跨主題閱讀與程式對照 |
| `references.bib`, `references.ris` | 書目工具匯入；沒有收錄出版商全文 |
| `data/retrieval.jsonl` | 每行自足的檢索單位，保留引用與限制 |
| `data/stats.json` | 單一來源統計，避免人工計數偏差 |
| `index.html` | 資料嵌入的單檔離線搜尋，無外部依賴 |
| `irms-knowledge.sqlite` | 本機可重建索引，Git 忽略，不是 IRMS Session 資料庫 |

SQLite 表：`sources`、`topics`、`source_topics` 與 FTS5 `sources_fts`。`sources.record_json` 保留完整來源記錄。FTS5 使用 unicode61，適合英文詞項；繁體中文子字串搜尋請用 HTML 或 CLI。

```sql
SELECT id, title FROM sources_fts WHERE sources_fts MATCH 'calibration';
SELECT id, title, review_level FROM sources WHERE summary_zh LIKE '%校準%';
```

## Full-text extractions v1

14 筆摘錄以來源 ID 關聯，含 `design_kind`、`focus`、`takeaway`，以及設計、族群樣本、設備、程序、參考系統與分析等六個 `{text, locator}` 欄位。`results` 與 `limitations` 也逐項保存文字和原文位置；限制的 `origin` 區分作者敘述與閱讀者推論。`appraisal` 不是正式偏誤風險評分；`irms_implications` 為工程推論，`open_questions` 保留數值疑點。

`access` 記錄 PMCID、原始 XML／全文 URL、取得日期、SHA-256、大小與擷取者；不包含出版商全文。XML 沒有固定 PDF 頁碼，因此使用章節、表格或標題。未報告欄位不臆測。`data/full-text-version-audit.json` 保存 14 篇與未升級的 ICC 指引之 MED 版本關聯查核，並非完整撤稿調查。

建置時將 `full_text_review` 加入 JSONL、HTML 與 SQLite `record_json`，並將事實、原文定位、限制及版本提醒納入全文搜尋。來源搜尋截止日與全文精讀更新日分開記錄。其餘來源仍維持原閱讀層級。
