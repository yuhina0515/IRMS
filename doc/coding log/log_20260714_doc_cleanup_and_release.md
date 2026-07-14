---
tags: [coding-log]
date: 2026-07-14
summary: "v1.0.0 發布前清理:刪除混入 repo 的個人學校作業檔案與空設定檔、修正過時內容(10Hz→25Hz、側欄殘留提及、PROJECT_STATUS.md 過舊)、雙軌工作紀錄整合為單一 doc/coding log 系統(.claude/logs 停用)"
---

# 2026-07-14 變更日誌 — 發布前文件清理與雙軌日誌整合

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260714_architecture_meeting_winui3|同日:架構會議]]

## 🎯 目的

`/meeting` 被拿來問「發布前刪除不需要的文件、同步所有 markdown」,但這個題目
沒有真正「兩個以上方案該選哪個」的辯論點,不適合硬套辯論格式。改用三個獨立
agent 分頭盤點(過時內容 / 重複日誌 / 孤立檔案),我再逐一驗證後整理成清單,
交給使用者確認範圍再執行——盤點結果與執行方式仍記錄在這篇,只是不走完整的
會議 verdict 格式。

## 🔧 變更內容

### 1. 刪除個人/無關檔案(8 個,經逐一查證後使用者確認)

- `doc/34.docx`、`doc/37.docx`、`doc/5.docx`、`doc/附件一_自主學習計畫書 (1).docx`
  ——三位團隊成員的學校「自主學習計畫書」申請表(含學號欄位),只是拿 IRMS
  當作業題材,與專案技術文件無關。
- `doc/generate_schedules.py`、`doc/read_template.py`、`doc/update_docs.py`
  ——產生上述申請表的一次性腳本,其中一支硬編碼了作者本機 Windows 路徑。
- `.vscode/settings.json`——內容是空的 `{}`,無實質團隊共用設定。

全 repo 搜尋確認這 8 個檔案在任何地方(README、package.json、CI)都沒有被
引用;`I2C_Scanner/I2C_Scanner.ino` **不在此列**——它是 `PROJECT_STATUS.md`
明確記錄、仍在用的硬體 I2C 接線診斷工具,予以保留。

### 2. 修正過時內容(對照原始碼查證,非臆測)

- **`doc/OPTIMIZATION.md`**:BLE 頻率「10Hz」→「25Hz」(對照
  `IRMS_Sensor.ino` 第 4/171 行確認實際為 25Hz);移除已刪除的「側欄收合」
  「系統日誌面板」當作現行基礎建設的描述,改為「TopHeader+BottomBar UI 基礎」;
  移除已無意義的「側欄收合狀態持久化」待辦;順手把「淺色主題(目前僅深色)」
  這條已完成多時的待辦標記掉(2026-07-12 雙主題早就做了,三個掃描 agent 都沒抓到)。
- **`doc/AI_CODING_RULES.md`**:兩處 BLE 頻率標註「10Hz」→「25Hz」(此文件
  自稱是協定的權威速查來源,標錯特別需要修正)。
- **`doc/PROJECT_STATUS.md`**:頂部加註「本文件僅涵蓋至 2026-06-30,最新現況
  請見 HOME.md/ROADMAP.md」的提示,而非整份重寫(這份文件已被
  `doc/ROADMAP.md` 的 Phase 0–5/D1–D4 決策體系取代,重寫價值不高,加註更划算);
  同一處 10Hz→25Hz;「進行中/待辦事項 (Phase 3)」標題加註「已被 ROADMAP 取代」。

### 3. 雙軌工作紀錄整合(結構性變更)

- 發現 `.claude/logs/` 與 `doc/coding log/` 是兩套並行紀錄:同一天的工作各寫
  一份,3/4 完全重疊(doc 版本是濃縮中譯,決策/驗證細節沒有遺漏),第 4 份
  (WinUI 3 會議紀錄)只存在 `.claude/logs`,而 `.claude/` 是 Obsidian 預設不
  索引的點開頭資料夾——`doc/HOME.md` 與另一篇 coding log 用 wikilink 指向它,
  在實際 vault 裡很可能連不上。
- **把會議紀錄搬進 `doc/coding log/log_20260714_architecture_meeting_winui3.md`**
  (補上 frontmatter,讓 `doc/coding-logs.base` 的路徑過濾抓得到),並修正
  `doc/HOME.md`、`log_20260714_ui_dropdown_sidebar_warp.md` 裡指向舊位置的
  wikilink。
- **刪除全部 5 個 `.claude/logs/*.md`**(3 份重複 + 會議紀錄原始版 + 本次盤點
  過程寫的稽核紀錄本身),`.claude/logs/` 現在是空的。
- **新增 `.claude/CLAUDE.md`(專案層級覆寫)**:明確指示往後這個專案不再產生
  `.claude/logs/*.md`,工作紀錄一律直接寫進 `doc/coding log/`。這條覆寫全域
  CLAUDE.md「每個非瑣碎任務都要寫 `.claude/logs`」的規則,是使用者在盤點後
  明確選擇的方向。

## 🧠 關鍵決策與教訓

- **雙軌紀錄的根本問題不是「多寫一份」而是「其中一份對這個專案的知識庫不可見」**
  ——`.claude/logs` 不會被 Obsidian 索引、不會出現在 `coding-logs.base` 的自動
  清單、wikilink 指過去大概率斷鏈。既然這個 repo 本來就是 Obsidian vault、
  已經有自己的 coding log 慣例,繼續維護兩套只會製造「該以哪份為準」的困惑,
  沒有實質好處。
- **「同步 markdown」不是全面重寫,而是精準修正+加註過時範圍**——像
  `PROJECT_STATUS.md` 這種已經有更新版本(ROADMAP.md/HOME.md)取代的舊文件,
  重寫成本高、價值低,加一句「本文件僅涵蓋至 XX,最新請見 YY」的提示更務實。

## ✅ 驗證

- 三個 agent 的盤點結果(哪些檔案過時/重複/孤立)在動手前先用 `git ls-files`、
  `grep -n "10Hz"`、`grep -n "I2C_Scanner"` 等指令親自抽查覆核,沒有直接照單
  全收 agent 的結論。
- `.gitignore` 現況確認:過去完全沒有規則涵蓋這批被誤留的檔案,是它們會被
  追蹤進版控的根本原因;這次清理沒有額外補防禦性 `.gitignore` 規則(刪除即可,
  非必要的預防性條目)。

## 📝 後續待辦

- 待此輪清理全部確認後,重新執行 `npm run ci` 確認 app 本身不受影響(這批
  變更只碰文件與非原始碼檔案,理論上零風險,仍照流程驗證)
- 是否要把 v1.0.0 tag 移到清理後的 commit(目前 tag 指向的 commit 裡還帶著
  已刪除的個人資料檔案),待與使用者確認後再決定
