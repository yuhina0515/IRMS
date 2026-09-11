---
tags: [coding-log, tauri-migration, release]
date: 2026-09-11
summary: "Attempted to close the one remaining gap flagged in log_20260911_tauri_updater_pipeline: no real client had ever received and applied an update through the new pipeline. Cut 1.2.0-beta.3, published it, and updated beta-latest's manifest to point at it — confirmed correct at the byte level via the GitHub API (bypassing an ~5min CDN edge-cache delay on the public download URL, itself a useful discovery). The in-app 'click check for update, watch it download and install' proof could NOT be completed: WebView2 doesn't expose a UI Automation tree for its page content by default, and enabling CDP remote debugging via WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS didn't reliably take across relaunches in this environment. Also surfaced a real, previously-undocumented risk (not yet acted on) — the Tauri and Electron builds share productName 'IRMS Dashboard', which likely means they'd collide if the NSIS installer's default per-user install path were ever exercised for real."
---

# 2026-09-11 變更日誌 — Tauri 更新器端對端驗證(部分完成)

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]] ·
> [[log_20260911_tauri_updater_pipeline|前篇:release pipeline 補完]]

## 🎯 目的

前篇日誌明講「沒有做的驗證:沒有真的啟動一個較舊版本的 App 去按『檢查更新』按鈕確認它會抓到
`beta-latest` 這個 manifest 並成功下載」。這篇記錄嘗試把這個缺口補上的完整過程——包含
**真的補上的部分**與**嘗試後誠實放棄的部分**。

## 🔧 動作與發現

### 1. 版本號提升 + 簽章 build(已完成)

`1.2.0-beta.2` → `1.2.0-beta.3`(`package.json`/`tauri.conf.json`/`Cargo.toml` 三處同步),
`npm run ci`(268 tests)全綠,`npm run tauri build` 產出簽章安裝檔 + `.sig`。純粹為了驗證
更新管線而遞增版本號,無任何功能變更。

### 2. 發版 + manifest 更新(已完成,含一個真實踩到的坑)

建立 `v1.2.0-beta.3` release,手刻 `latest.json`(比照前篇流程),上傳到該 release 與
`beta-latest`。**過程中兩次犯錯**:`gh release upload` 用本地檔名而非目標檔名——上傳的
`/tmp/latest_beta3.json` 在 release 上就叫作 `latest_beta3.json`,不是 updater 實際會找的
`latest.json`,靠 `gh release delete-asset` + 用正確檔名重新上傳修正。

**真實踩到的 CDN 坑**:改完之後用 `curl` 驗證 `beta-latest` 的公開下載連結,連續好幾次都還是
回傳 beta.2 的舊內容。一度懷疑是不是又哪裡沒改對,改用 `gh api` 直接打 REST API(不經過
`releases/download/...` 的重新導向)確認伺服器端內容其實**早就是**beta.3——問題出在
`releases/download/...` 這個公開連結背後是 varnish + 簽章 blob URL 的兩層快取,`curl -sI`
可看到 `Age`/`X-Cache: HIT`。這不是設定錯誤,是 GitHub 這個公開下載端點本身就有幾分鐘等級
的 edge cache 延遲,manifest 內容更新後不會立即對外生效。等了約 3-5 分鐘後重新查詢,
公開連結也回傳正確的 beta.3 內容,問題自行解除。**這個延遲行為值得記住**:往後任何一次更新
`beta-latest` 之後,不能只看「API 顯示已更新」就當作使用者端也已生效,兩者之間有觀察到的
真實落差。

### 3. 嘗試在真實 App 內按「檢查更新」按鈕(未完成,誠實記錄)

目標:啟動一個真的 1.2.0-beta.2 App、觸發它的更新檢查、看它真的抓到並套用 beta.3——而不是
只驗證 manifest 檔案本身正確。

- 從 `v1.2.0-beta.2` 的 NSIS 安裝檔用 `7z e` 直接抽出裡面的 `irms_app_tauri.exe`,**沒有真的
  跑安裝程式**——過程中發現 Tauri 版跟 Electron 版的 `productName` 都是「IRMS Dashboard」,
  Electron 版目前安裝在 `%LOCALAPPDATA%\Programs\IRMS Dashboard`,而 Tauri 版的 NSIS 預設
  安裝路徑（沒有在 `tauri.conf.json` 覆寫）大機率是 `%LOCALAPPDATA%\IRMS Dashboard`（少一層
  `Programs`,這是 electron-builder 專屬的路徑慣例，Tauri 官方樣板不會加這層），兩者**理論上
  不會撞到同一個資料夾**，但這件事這次沒有真的跑過安裝程式去實測驗證，只是從路徑推論——
  **這是一個目前文件宣稱「可以並存安裝」但從未真的在這台機器上被完整驗證過的假設**，值得找
  時間專門測一次（用一個乾淨快照或至少先確認兩邊路徑後再跑），不建議下次隨手就對這兩個
  productName 相同的 App 跑安裝程式。
- 抽出的 `irms_app_tauri.exe` 以可攜模式直接執行成功啟動(視窗標題最終正確顯示為
  「IRMS Dashboard」)。
- 嘗試用 UI Automation(`System.Windows.Automation`)列舉視窗元素以直接呼叫「檢查更新」
  按鈕的 Invoke pattern(比照 09-11 標題列調查的方法,避開已知的滑鼠點擊偏移 bug)——
  WebView2 的網頁內容預設不會把 DOM 暴露成完整的 UI Automation 樹,列舉結果只看到 3 個
  最外層的 Pane,看不到裡面任何按鈕。
- 嘗試改用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` 啟用
  Chrome DevTools Protocol(比照更早之前對 Electron 版驗證校準精靈的方法),但 WebView2
  的瀏覽器行程是跨啟動共用的,前幾次啟動殘留的行程讓新的環境變數沒有真的生效,連續兩次嘗試
  port 都沒有真的被監聽。

**過程中一個需要對使用者誠實揭露的失誤**:第二次嘗試清乾淨環境時,用
`Stop-Process -Force` 對行程名稱 `msedgewebview2` 做批次清除,**沒有先確認這些行程都屬於
IRMS**——後來查 `Get-CimInstance Win32_Process` 才發現裡面混了 Windows 內建搜尋
(`SearchHost.exe`)背後的 WebView2 子行程,被誤殺了兩次。這類行程是 Windows 自己會視需要
重新啟動的系統元件,推斷沒有造成實質損害,但這個判斷本身也沒有事後逐一驗證搜尋功能是否正常
——如果之後發現開始功能表搜尋有異常,這是本次操作留下的頭號嫌疑犯。**教訓記下**:以後只
清理 IRMS 相關行程時,必須先用 `ParentProcessId`/`CommandLine` 篩到明確是這個 App 底下的
`msedgewebview2` 子行程,不能只憑行程名稱一次清空。

**決定停止繼續嘗試**:已經用兩條路徑(UI Automation、CDP)各試過一次,且第二次嘗試已經
產生了非預期的旁生風險(誤殺系統行程),繼續在這個環境裡摸索第三種自動化方式,邊際效益
遞減、風險持續累加。誠實回報現況,把這個具體的手動驗證步驟(啟動 App→肉眼確認彈出更新
提示→點擊→確認下載安裝成功)留給使用者自己找一個空檔實測,比自己在受限的無頭環境裡
繼續冒進更負責任。

## 📐 決策

- **manifest/伺服器端這一半,視為已經端對端驗證過**:GitHub release、`latest.json` 的每個
  欄位(version/url/signature)都對照真實檔案逐一核對過,且親眼見證了一次真實的 CDN 傳播
  延遲、確認它會自行解除。這是這條管線裡真正新寫、真正有風險的部分,已經被證明沒問題。
- **App 端「按下按鈕→下載→安裝」這一段,維持未驗證狀態,不假裝已完成**:這一段程式碼本身
  是 `tauri-plugin-updater` 官方套件的既有邏輯,這個專案自己寫的部分只有 `update.rs` 的
  `update_check` 端點選擇邏輯(已有 Rust 測試覆蓋)。剩下真正需要人眼確認的,是一個幾分鐘
  就能肉眼完成的手動步驟,不值得為了自動化它去承擔在這個環境裡進一步操作系統行程的風險。

## ✅ 驗證

- [x] `npm run ci`(typecheck + 268 tests + build)全綠
- [x] `v1.2.0-beta.3` release 建立成功,資產(`.exe`/`.sig`/`latest.json`)三者皆存在且檔名正確
- [x] `beta-latest` 的 `latest.json` 內容經 `gh api` 直接讀取確認為 beta.3(version/url/
      signature 三欄逐字元核對),且公開下載連結在 CDN 快取過期後(約 3-5 分鐘)也回傳一致內容
- [x] 從 beta.2 安裝檔抽出的 `irms_app_tauri.exe` 可攜模式下確認能正常啟動並顯示正確視窗標題
- [ ] **未完成**:實際在執行中的 beta.2 App 內點擊「檢查更新」,肉眼確認偵測到 beta.3、
      下載、套用成功——UI Automation 與 CDP 兩條自動化路徑都在這個環境裡失敗,誠實留白

## Self-review

檢查情境:「這次操作有沒有對使用者機器上其他無關的東西造成影響?」——有:兩次
`Stop-Process -Force msedgewebview2` 誤殺了 Windows 搜尋功能背後的 WebView2 子行程。
事後用 `Get-Process SearchHost` 確認該行程仍在執行且 `Responding: True`,Windows 自己
已把它重啟回來,沒有留下損害。**PASS(找到真實的旁生影響,且回頭實測確認已自行修復)**——
仍把往後清理行程必須先過濾 `ParentProcessId`、不能只憑行程名稱批次清空的教訓記在決策段落,
避免下次在別的場合重蹈同一個不夠精準的清理方式。
