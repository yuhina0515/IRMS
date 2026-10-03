# 資料結構與格式

`data/catalog.json` 是來源卡的唯一編輯入口；`data/topics.json` 定義主題與程式對照。`scripts/build.py` 重建所有閱讀、引用及檢索格式。不要直接修改產生檔。

## Catalog v1

頂層包含 `schema_version`、`snapshot_date`、`scope`、`project_snapshot` 與 `sources`。日期採 ISO 8601，未知欄位保留空字串／null，不推測出版日期。來源 ID 在維護中保持穩定。

| 欄位 | 用途 |
|---|---|
| `id` | 穩定 ID：MED 記錄採 `PMID-數字`；官方資料採 `DOC-...`；作者報告採 `ALG-...` |
| `title`, `authors`, `bibtex_authors` | 原始標題、原始顯示作者，以及引用匯出的姓／名表示 |
| `corporate_authors` | 可選的團體作者清單；BibTeX 以額外括號保護，避免誤分姓／名 |
| `year`, `first_publication_date` | 期刊年份及 API 所提供的首次出版日期；用後者檢查截止日 |
| `journal`, `volume`, `issue`, `pages` | 書目欄位；pages 可能是文章編號 |
| `doi`, `pmid`, `pmcid`, `url` | 識別碼及原始入口；同一 DOI／PMID 不重複建卡 |
| `open_access` | API 的開放取得標記，不是授權判定 |
| `source_type`, `study_type`, `publication_types` | 來源種類、整理時判讀的研究形式、API 原始出版類型 |
| `topics` | 一或多個 topics.json 主題 ID，來源總數不因交叉索引增加 |
| `priority` | `core` 或 `supporting`，僅供閱讀順序 |
| `review_level` | `abstract`、`full-text-sections`、`primary-page-excerpt`、`metadata-only` |
| `summary_zh` | 原創繁體中文整理，非出版商摘要複製 |
| `irms_application`, `limitations_zh` | 專案用途與外推限制；不可在檢索中省略 |
| `evidence_locator` | 實際檢查的摘要、章節或官方頁面位置 |
| `verification` | `status`、`checked_on`、`method`，可含 URL、雜湊及取得失敗資訊 |
| `provenance` | 書目查詢、記錄入口、擷取方式與時間的追溯資料 |
| `rights_note` | 原文及第三方資料授權各自適用的提醒 |

`metadata-and-abstract-retrieved` 表示 API 書目／摘要取得；`retrieved` 等官方查核標記描述本次頁面取得；`metadata-only-document-unavailable` 表示只有官方目錄確認身分。這些狀態不是研究品質評分。

`data/query-manifest.json` 保存本次候選搜尋的原始查詢、日期、排序、命中及取得筆數；不保存出版商全文。`data/link-checks.json` 保存官方入口查核，並區分成功 PDF、HTML、重新導向、阻擋及工具無法取得。

## 產生格式

| 檔案／目錄 | 使用方式 |
|---|---|
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

本庫尚未逐篇結構化樣本數、偏誤風險及效應量。增加這些欄位時應附證據頁碼、提取者及日期，不以摘要推測缺失數值。
