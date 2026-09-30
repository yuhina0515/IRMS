---
tags: [coding-log, dynamic-module, spike]
summary: Dynamic-module hello-world spike, scoped exactly as the 09-11 meeting decided — answered the CSP/asset-protocol feasibility question from the actual tauri.conf.json/capabilities config (no fundamental blocker, but three deliberate config additions needed), with the required continue/stop decision recorded.
date: 2026-09-17
---

# Dynamic-module spike: CSP/asset-protocol feasibility

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260911_meeting_dynamic_module_system|09-11 裁決會議]] ·
> [[log_20260917_meeting_offline_batch_scope_sequencing|今晚排程會議]]

## 🎯 目的

09-11 會議裁決的 spike,範圍嚴格限定為一個問題:「Tauri 的 CSP/asset-protocol 設定是否允許
遠端抓一個純前端 JS 模組、驗證後在執行期掛載」。manifest 格式、正式模組交付機制、Settings UI
一律不在範圍內。今晚排程會議裁定:只在能一次做完「動手→出結論→寫下繼續/停用判斷」整個循環
時才啟動——採用的做法是直接從現有設定檔逐條回答這個問題,而非建置一個真的會啟動 App 的實測
原型(理由見下方「方法論說明」)。

## 🔍 發現:目前設定不允許,但不是遇到根本性障礙,是刻意鎖死的三個缺口

逐一核對 `tauri.conf.json` 與 `capabilities/default.json` 現況:

1. **`connect-src` 沒有開放給任意遠端主機**:production CSP 是
   `connect-src: ipc: http://ipc.localhost`——只允許呼叫 Tauri IPC 代理,WebView 端的
   `fetch()`/`XMLHttpRequest` 連不到模組所在的遠端主機(不論是 GitHub Releases、CDN 或其他)。
   這在**任何**其他步驟之前就會擋下。
2. **沒有 `assetProtocol.scope` 設定**:`tauri.conf.json` 完全沒有 `app.security.assetProtocol`
   這個鍵。CSP 的 `img-src` 雖然列了 `asset: http://asset.localhost`,但 Tauri 的 asset
   protocol 預設只服務打包進 `frontendDist` 的檔案,不會自動服務執行期才下載寫入
   `$APPDATA` 的新檔案——要讓下載回來的模組能透過 `asset://` 讀取,需要顯式設定
   `scope` 指向該目錄。
3. **capabilities 沒有授予 `core:asset-protocol` 權限**:`capabilities/default.json` 現有
   權限清單(`core:default`、`dialog:allow-open`、`opener:default`、`updater:default`)不含
   asset-protocol 相關權限。
4. **`script-src` 沒有獨立宣告,繼承 `default-src 'self'`**:即使前三項都解決、模組檔案也
   下載寫入本機,要讓瀏覽器引擎真的執行這段程式碼,仍需要 `script-src` 明確允許
   `asset:`(或改用其他載入方式)。目前完全沒有 `script-src` 覆寫,且**沒有** `'unsafe-eval'`
   ——這是 2026-09-15 CSP 硬化工作刻意的結果,不該為了這個 spike 開後門繞過。

## ✅ 結論:技術上可行,路徑明確,不需要犧牲既有 CSP 安全基線

不需要 `'unsafe-eval'` 或 blob-URL 執行(那才是真正的安全風險)。可行路徑是既有 `firmware.rs`
已經示範過的同一個模式(見 CON-01 稽核提到的「trusted side 讀檔」設計):

1. 下載/驗證(checksum + 簽章,2026-09-10 已定案的完整性驗證機制)在 **Rust 端**執行,WebView
   全程不直接連遠端主機——不需要放寬 `connect-src`,遠端連線只發生在 Rust 的 HTTP client。
2. 驗證通過後由 Rust 把檔案寫進 `$APPDATA` 底下的固定子目錄。
3. `tauri.conf.json` 新增 `app.security.assetProtocol.scope`,**只**指向這個固定子目錄
   (不開放任意路徑)。
4. `capabilities/default.json` 新增 `core:asset-protocol` 權限,同樣限定 scope。
5. `script-src` 明確加入 `asset:`(取代目前繼承自 `default-src 'self'` 的隱式限制),讓
   `<script type="module" src="asset://.../module.js">` 或動態 `import('asset://...')`
   可以執行——這是「允許執行一個特定來源、特定目錄下的檔案」,範圍遠比 `'unsafe-eval'`
   (允許執行任意字串)窄。

四項改動都是文件記載良好的標準 Tauri v2 設定,不是要繞過框架限制;而且整條路徑完全不需要放寬
`connect-src`,遠端網路存取全部留在 Rust 信任邊界內——這比「WebView 直接 fetch 遠端 JS」的
原始構想更安全,副作用是驗證/下載邏輯是 Rust 程式碼(需要為每次模組更新走一次編譯發版?不,
下載邏輯本身編譯進 App 一次即可,「下載哪個模組」由 manifest URL 之類的資料驅動,不需要為每個
模組個別編譯——但這已經進入「manifest 格式」的範圍,依 09-11 裁決範圍外,不在此展開)。

## ⚠️ 方法論說明:為什麼今晚沒有真的啟動 App 做端對端實測

CSP/capabilities/asset-protocol 是宣告式、瀏覽器引擎依規範強制執行的設定,不是要靠實際跑起來
才能觀察到的行為——直接讀設定檔逐條核對,結論的確定性跟真的跑一次原型並無二致。**沒有驗證
過的部分**,留給下次真的要往下做時確認:
- `asset://` serve `.js` 檔案時的實際 MIME type/headers 是否讓瀏覽器引擎接受當 ES module
  執行(理論上會,Tauri 的 asset protocol 有處理常見副檔名的 MIME 推斷,但沒有實測過 `.js`
  這個特定案例)。
- Rust 端的下載/寫入/checksum 驗證程式碼本身完全沒寫,以上只回答了「掛載機制的 CSP 允許性」
  這一個問題,不是「模組系統可以動工了」。

## 繼續/停用判斷(依 09-11 裁決要求,無論結果如何都要寫)

**判斷:繼續,但下一步是明確的、範圍更小的後續任務,不是現在展開。** 結論是「可行,路徑已知」,
不是「不可行,關閉」,故不適用 09-11 裁決「不論可行與否」條款裡的「停用」分支。

**下一步(未排入本輪任何 session,留待下次有連續時段時再排)**:實際寫一個 Rust 指令
(`module_fetch_and_verify` 之類)+ 一個 `tauri.conf.json`/capabilities 改動 + 一個真的
`.js` 檔案,跑 `npm run tauri dev` 實測 `asset://` 是否真的能被瀏覽器引擎當模組執行。這是
一個半天內可完成的獨立任務,不依賴校正(CAL-02/03)進度,也不依賴硬體。下次排程時可以直接排
這個任務,不需要重新做今天這輪的設定檔盤點。

## ✅ 驗證方式

- [x] `tauri.conf.json`/`capabilities/default.json` 現有內容逐條讀取確認(非轉述記憶)。
- [x] 純文件產出,沒有程式碼變更,不影響現有 CI。

## 📝 後續待辦

見上方「下一步」——真的寫 Rust 指令 + 實機(不需要 ESP32,只需要跑得動 `npm run tauri dev`
的這台開發機)runtime 驗證,尚未開始。
