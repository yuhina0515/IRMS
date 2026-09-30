---
tags: [coding-log, tauri-migration, release, bugfix]
summary: "使用者用真實裝置上的 1.2.0-beta.1 回報『無法抓取更新』,逐步排除網路/簽章/端點設定後,確認根因是 tauri-plugin-updater 的請求預設沒有逾時——連線被靜默丟包時會無限期卡住、既不成功也不報錯。加上 30 秒逾時、SettingsView 改顯示真實檢查狀態,發布 1.2.0-beta.5。這次改成先 push 再建 release,避免重演 09-13 那次 tag 指向錯誤 commit 的事故。"
date: 2026-09-14
---

# 2026-09-14 變更日誌 — 更新檢查逾時修復 + 發布 1.2.0-beta.5

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260913_sidebar_persist_fix_beta4_release_and_migration_retirement_plan|前篇:09-13 側邊欄修復 + beta.4]]

## 🎯 目的

使用者在真實裝置上安裝的 `1.2.0-beta.1` 回報「無法抓取更新」。前篇日誌已經修過
`SettingsView.tsx` 的檢查結果被固定 toast 蓋掉的 UX 缺陷,但那個修正本身在 beta.1 上
不存在(舊 build),需要先確認使用者實際遇到的是不是同一個問題,還是背後真的有更深的
故障。

## 🔧 動作與發現

### 1. 逐步排除

- 確認簽章公鑰在 `d519883`(beta.1 重建基準 commit)與現在完全一致——不是簽章不匹配。
- 確認 beta.1 重建基準的 `update.rs` 已經包含正確的 beta 頻道選擇邏輯(`BETA_ENDPOINT`),
  不是舊版程式碼缺這塊功能。
- 請使用者在同一台機器的瀏覽器直接開 `beta-latest` 的 `latest.json` 下載連結——
  **成功下載,921 bytes**。這排除了「這台機器連不到 GitHub」,把範圍收斂到「同一個網址,
  瀏覽器抓得到,App 裡面抓不到」,指向 App 自己的請求路徑有問題。

### 2. 根因:`UpdaterBuilder` 從未設定過 timeout

查 `tauri-plugin-updater` 2.11.0 原始碼(`updater.rs`)確認 `timeout: Option<Duration>`
預設是 `None`,套件本身不會自己套用任何請求逾時。如果連線被防火牆/防毒/EDR 軟體**靜默
丟包**(不是主動拒絕——這類軟體常見的行為是放行瀏覽器這種受信任程式的流量,但對不認識
的未簽章執行檔的封包直接丟棄,而這個 App 目前確實未簽章,見 `OPTIMIZATION.md` 已知項),
請求會無限期卡住,既不會成功回呼也不會觸發 `.catch()`——這正好解釋「完全沒有任何提示,
連錯誤都沒有」這個症狀,跟單純的 CDN 快取延遲或找不到新版本(那些都至少會產生
`not-available`/`error` 狀態)不同。

### 3. 修復

- `update.rs`:`UpdaterBuilder` 加上 `.timeout(Duration::from_secs(30))`。30 秒是抓「小
  manifest 檢查要快速失敗」與「~4MB 安裝檔在較慢連線下載要有機會完成」的折衷值——這個
  timeout 是 `Update` 物件層級的,check 與 download 兩階段共用同一個值。
- `SettingsView.tsx`(前篇已完成,今天沒有重複改動):訂閱 `onStatusChange` 顯示真實狀態
  文字,取代原本不管結果都一樣的固定 toast——這樣下次即使真的逾時失敗,使用者也會看到
  「檢查失敗:...」而不是單純沒反應。

## 📐 決策

- **這次先 push 再建 release**,直接吸取 09-13 那次「tag 指向錯誤 commit」事故的教訓
  (見前篇日誌),不是靠記得住操作順序,而是把「push 在前」直接寫進這次的執行步驟本身。
- **30 秒選擇 check 與 download 共用同一個值,不分開設定**——套件的 `timeout` 欄位就是
  綁在同一個 `Update` 物件上,分開設定需要碰套件不支援的更深客製化,投報率不值得,30 秒
  對這個 App 的安裝檔體積(~4MB)是合理折衷。
- **沒有等到查出「為什麼」封包被丟(哪套防火牆/EDR、哪條規則)就先發版**——使用者的裝置
  不在手邊,無法遠端排查是哪套軟體;加上逾時是無論根因是什麼都該有的防禦性修正(任何網路
  請求都不該無限期卡住),不需要先破案才能動工。

## ✅ 驗證

- `cargo check` 與 `cargo test`(56/56)全綠,`.timeout()` 呼叫型別正確、不影響既有邏輯。
- `npm run ci`(typecheck + 283 tests + build)全綠(SettingsView 修正沿用前篇,今天沒有
  新增前端變更)。
- 隔離煙霧測試:啟動簽章版 `irms_app_tauri.exe`(先確認沒有殘留舊 process 佔用單例鎖與
  DB,清乾淨後才測),process 存活 6 秒無崩潰,啟動前後 `irms.sqlite` MD5 不變。
- `git ls-remote --tags origin v1.2.0-beta.5` 確認 tag 對應 `e48ec40`(版本號 bump
  commit),與 push 後的 `HEAD` 完全一致——這次沒有重演 09-13 的 tag 錯位。
- `gh api repos/yuhina0515/IRMS/releases/assets/<id>` 直接讀 `beta-latest` 的
  `latest.json` 內容,確認 `version` 為 `1.2.0-beta.5`。
- `gh release view v1.2.0-beta.5` 確認 `draft: false`、三個 asset(`.exe`/`.sig`/
  `latest.json`)齊全。

## Self-review

檢查情境:「這次的 30 秒 timeout,會不會反而讓網路正常但單純比較慢的使用者(例如真的在
下載 ~4MB 安裝檔,遇到較差的 Wi-Fi)被錯誤判定為『檢查失敗』?」——追蹤程式碼:
`timeout` 是 reqwest 的整體請求逾時,不是閒置逾時,30 秒對於檢查一個 ~1KB 的
`latest.json` manifest 綽綽有餘;但若 `download()` 階段共用同一個 `Update` 物件與同一個
30 秒上限,下載 ~4MB 安裝檔在很差的網路(例如 < 150KB/s)理論上真的可能撞到這個上限而被
判定失敗,即使連線本身沒有真的卡死。**PLAUSIBLE 但非本次要修的問題**:這次要解決的是
「無限期卡住、零回饋」這個更嚴重的症狀,30 秒對於目前遇到的「完全沒反應」個案來說已經是
大幅改善;如果之後真的出現「網路慢但沒斷,卻被逾時打斷下載」的回報,才需要把 check 與
download 拆成兩個不同時長的 timeout,不在這次修復範圍內硬猜著先做。
