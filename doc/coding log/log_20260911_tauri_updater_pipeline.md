---
tags: [coding-log, tauri-migration, release]
date: 2026-09-11
summary: "Wired up the missing half of Tauri Phase 4 auto-update: tauri.conf.json's createUpdaterArtifacts:true only produces a signed installer + .sig, it does not itself emit the latest.json manifest the updater plugin actually reads (that assembly step lives inside tauri-action, which this repo doesn't use). Hand-built latest.json for the existing v1.2.0-beta.2 build, uploaded it to that release, and created the fixed beta-latest release update.rs's BETA_ENDPOINT already assumed existed. Beta channel now resolves; stable channel will resolve automatically once a real non-prerelease release ships."
---

# 2026-09-11 變更日誌 — Tauri 更新器 release pipeline 補完

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]] ·
> [[log_20260910_tauri_phase3_phase4|前篇:Phase 3+4 App 端實作]]

## 🎯 目的

使用者要求「繼續進行 Tauri 的轉移完成後續作業」。`TAURI_MIGRATION_PLAN.md` 把 Phase 4
剩餘工作明列為「release pipeline 未完成」——App 端的 updater 呼叫、頻道切換都已經在
2026-09-10 寫好,但沒有真的產出過 `latest.json`,`update.rs` 的 `BETA_ENDPOINT` 從寫下的
那一刻起就指向一個不存在的 `beta-latest` release。這是不需要硬體就能推進的項目,今天把它
做完。

## 🔧 動作

1. **重新跑一次簽章 build**(版本號不變,`1.2.0-beta.2`):用
   `E:\Monitoring-and-IoT\IRMS_secrets\` 底下的 signing key + password 設環境變數執行
   `npm run tauri build`。產出 `.exe` + `.sig`,**沒有** `latest.json`——`tauri.conf.json`
   的 `bundle.createUpdaterArtifacts: true` 這個名字讓人以為它會連 manifest 都生出來,
   實際上只保證每個安裝檔旁邊多一個 `.sig`,manifest 的組裝是 `tauri-action`
   (官方 GitHub Action)才做的事,這個 repo 從一開始就沒有 CI,所以這步永遠得手動做。
2. **手刻 `latest.json`**:讀出 `.sig` 檔的完整內容塞進 `platforms["windows-x86_64"].signature`,
   `url` 指向 GitHub release 上該版本安裝檔的實際下載連結(檔名裡的空格會被 GitHub 換成點,
   沿用 [[irms-project-conventions]] 已記錄的這個坑,對照 `gh release view` 實際回傳的檔名
   確認過)。
3. **上傳到兩個地方**:
   - `v1.2.0-beta.2` 這個既有 release(`gh release upload`)——現在這個 release 自己也是
     一個完整、自我描述的更新來源。
   - 新建 `beta-latest` release(`gh release create beta-latest latest.json --prerelease`)——
     `update.rs` 寫這個常數時就註記「假設 release 流程會維護這個固定 tag,但這步從未真的
     做過」,今天把這個假設兌現。這個 release 本身**不是**給人下載的東西,標題與 notes 都
     講明它只是機器讀的 pointer。
4. **建立 `beta-latest` 前先問過使用者**:這是新建一個公開 GitHub release,Auto Mode
   分類器擋下第一次嘗試(視為需要額外確認的外部可見動作),用 `AskUserQuestion` 問過、
   使用者選擇「建立」後才真的執行。上傳 `latest.json` 到既有 `v1.2.0-beta.2` release
   (只是幫既有 release 補資產,不是新建 release)則沒有被擋。
5. **`.gitignore` 補上 `latest.json`**:這是每次 release 都要重新產生的建置產物(內含
   該次建置專屬的簽章),不該進版控;本地暫存檔已刪除,只活在兩個 GitHub release 的資產裡。
6. **文件同步**:`TAURI_MIGRATION_PLAN.md` Phase 4 的「release pipeline 未完成」項改為
   已建立手動流程(附上完整步驟給下次發版照做),beta endpoint 註記從「placeholder」改為
   「已生效」,stable endpoint 維持原樣說明(等第一個正式版才會有東西可解析)。

## 📐 決策

- **不寫 CI 自動化,維持手動流程**——這個 repo 從 Electron 版開始就一直是手動
  `electron-builder --publish`/`gh release create`,沒有 `.github/workflows`。今天的範圍
  是「讓 beta 頻道能解析到東西」,不是「順便把整條發版流程自動化」,自動化是另一個獨立
  決定,不該在補一個缺口的同時順手擴大成一個新專案。
- **`beta-latest` 只放 `latest.json`,不重複上傳安裝檔**——manifest 裡的 `url` 已經指向
  版本化 release 上的真正安裝檔,`beta-latest` release 自己帶一份安裝檔只會製造「使用者
  搞不清楚該從哪裡下載」的重複來源,且未來每次覆蓋 `latest.json` 時還要重新上傳一次安裝檔,
  純粹的維護成本。

## ✅ 驗證

- `gh release view v1.2.0-beta.2 --json assets`:確認 `latest.json` 出現在資產清單裡,
  跟既有的 `.exe`/`.exe.sig` 並列。
- `gh release create beta-latest ...` 回傳
  `https://github.com/yuhina0515/IRMS/releases/tag/beta-latest`,確認建立成功。
- 讀 `latest.json` 內容逐欄核對:`version` 與 `tauri.conf.json`/`package.json`/`Cargo.toml`
  三處一致(`1.2.0-beta.2`);`url` 對照 `gh release view` 實際回傳的資產檔名逐字元比對
  (含空格→點的轉換)確認可下載;`signature` 欄位是直接讀檔內容,不是手打,排除轉錄錯字。
- **沒有做的驗證**:沒有真的啟動一個較舊版本的 App 去按「檢查更新」按鈕確認它會抓到
  `beta-latest` 這個 manifest 並成功下載——這需要先有第二個更高版本號的 beta 才能真正
  端到端證明「舊版能抓到新版」,不是這次手上能做的事,誠實記在
  [[TAURI_MIGRATION_PLAN]] 的「尚未端到端驗證」註記裡。

## Self-review

檢查情境:「`beta-latest` release 的 `latest.json` 如果之後某次忘記更新,會不會讓 beta 版
使用者永遠卡在同一個「有更新」的舊訊息,或更糟——卡在一個已經不存在的舊版本 URL?」——
目前的機制是**手動覆蓋**,沒有任何東西強制下一次發版的人記得更新 `beta-latest`。用今天
剛建好的這篇日誌與 `TAURI_MIGRATION_PLAN.md` 的步驟說明作為程序記憶,但這確實是一個
純靠人記得的缺口,不是由建構防止的。**PASS(有找到風險並誠實記下),但不是
「已經修好」**——如果之後要把發版動作腳本化,這是第一個該收進腳本的檢查
(例如發版腳本結尾印出「別忘了同步更新 beta-latest」提示,或直接把兩次上傳都寫進同一支
腳本裡,不留給人手動記兩次)。
