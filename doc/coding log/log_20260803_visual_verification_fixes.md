---
tags: [coding-log]
date: 2026-08-03
summary: "首次取得螢幕存取,實際開起來看:抓到 4 個只有跑起來才看得見的缺陷——冷開機誤報「數值已過期」、未支援協定的量表看起來仍在運作、History 回顧圖畫錯安全上限(用導出值而非該場實際生效值)、Esc 堆疊會一次關掉兩層 modal;新增 escapeStack 純邏輯層 + 6 tests(132 tests);以隔離 user-data-dir 造假資料驗證 History/LTTB/CSV,使用者真實 DB 全程未動"
---

# 2026-08-03 變更日誌 — 目視驗收與其後的修正

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260801_freeform_app_improvements|前一批:自由修改]] ·
> [[log_20260801_meeting_app_review|會議意見清單]]

## 🎯 請求

「現在你可以開始使用螢幕與滑鼠。」

前兩批(裁決實作、自由修改)全部只過了 typecheck / test / build,工作日誌裡連續兩次
記著「**未目視確認畫面**」。這次終於能把 app 開起來看。

## 🔧 已完成

### 冷開機時誤報「數值已過期」(自己上一批種下的)

Dashboard 一開起來,量表就是灰的,底下寫著「斷線中 · 數值已過期」——但這是冷開機,
從未連線過,量表顯示「--」,**根本沒有一個數值可以過期**。`stale={!isConnected}`
把「沒有值」和「值是舊的」當成同一件事。

假警告的代價不是難看,是它會訓練使用者忽略真警告——而這條訊息真正該發揮作用的時機
(療程中途斷線、量表停在 15 秒前的殘值)正是最需要被相信的時候。

修法:把不變式放進元件,而不是要求每個呼叫端記得判斷 —— `showStale = stale && sample != null`。

### 未支援的協定,量表看起來仍在正常運作

切到 Elbow Flexion:開始按鈕正確擋下並說明理由,**但上方的量表照樣畫出目標帶
(88–112°)與紅色超限刻線(122°)**,一副隨時可以量測的樣子。原因是那些數字全部
來自動作參數,與感測器裝在哪條肢體無關,所以畫得出來。

畫面因此自相矛盾:最大、最像「正在運作」的元件說可以,按鈕說不行。而卡片標題寫
「Elbow Flexion」、量表軸標寫「膝關節夾角」並排,看起來只像個 bug。

修法:量表加 `unsupported`,灰階並標示「此協定尚未支援 — 量表讀的仍是膝關節夾角」;
教練提示改為「此協定尚未支援,請於設定切換回膝關節」,且排在「請先連線裝置」**之前**
——接上裝置也不會讓它變成可用的量測,先叫人去連線是把人推向走不通的路。

順帶把 `.metric-gauge.stale::after` 的 CSS `content` 改成元件渲染的真實文字節點:
同一個樣式現在要承載兩種訊息,而且 `::after` 的文字選不起來也不保證讀得出來。

### History 回顧圖畫出一條當時不存在的安全線

造了假資料才看得到:session #2 存的 `safetyLimit` 是 80,回顧圖的紅色「超限門檻」
卻畫在 **65**(= target 45 + tolerance 10 + 導出邊界 10)。`HistoryView` 呼叫
`computeMetricZone` 時沒有帶 `safetyLimit`,於是一律退回導出值。

這是病歷等級的錯誤:督導看回顧圖判斷患者當時有沒有超限,而那條線根本不是當時生效的
門檻。上一批才因為同樣的理由替 Dashboard 量表補上 safetyLimit,`HistoryView` 漏了。
CSV metadata 也一併補上 `# safetyLimit`(空值 = 當時沿用導出值,與圖表的退回規則一致)。

### Esc 會一次關掉兩層 modal

原本每個 modal 各自 `window.addEventListener('keydown', h, true)` + `stopPropagation()`,
註解宣稱「最後掛載的先收到」。兩點都是錯的:

- 同一個事件目標上的 listener **依註冊順序**觸發,與 capture/bubble 無關;
- `stopPropagation()` 只擋得住其他目標上的 listener,擋不住同目標的兄弟
  (那是 `stopImmediatePropagation()` 的工作)。

實際後果:在歷史分析視窗按刪除跳出確認框,一次 Esc 會**連確認框帶歷史視窗一起關掉**。

修法:新增 `services/escapeStack.ts` —— 單一 listener 查詢堆疊,只呼叫最後推入的那個。
另外把 hook 的 effect 相依從函式實體改成「有沒有啟用」,呼叫端幾乎都是 inline arrow,
原本等於每次 render 都拆掉重掛(CalibrationWizard 在 25Hz 資料流下每秒 25 次),
而且會讓堆疊順序取決於誰剛好重新 render,不再是誰在上層。

### 停用理由只藏在 tooltip

Settings 的「啟動校準精靈」在未連線時 `disabled`,理由只放在 `title` 裡:要滑鼠停留
才出現、觸控叫不出來、看起來就只是「按了沒反應」。改為可見說明,與 app 其他地方
(Record Pose、未支援協定的開始鈕)一致。

## 🧠 關鍵決策

- **不因為 GUI 測不出來就改動能用的程式碼**。Esc 在畫面上沒反應時,我先加了一個把
  按鍵寫進 `document.title` 的探針,再從 app 外面用 PowerShell 讀回來:字母鍵讀得到
  (`key=b armed=y`,證明 listener 有掛上且已啟用),Esc 完全沒有事件。兩個互相獨立的
  監聽器(window capture 的 hook、document bubble 的 GlassDropdown)同時收不到,
  結論是**這條自動化輸入管道送不出 Escape**,不是 app 的問題。真正的缺陷是後來讀
  程式碼發現的堆疊語意,那個我用測試驗證。
- **用隔離的 user-data-dir 造假資料,不碰使用者的真實 DB**。History 需要資料才看得到,
  但往使用者的 `irms.sqlite` 塞測試 session 是不可接受的。改用
  `--user-data-dir=<scratchpad>` 開一份乾淨的 DB,由 app 自己跑完 migration 建表,
  再用 `node:sqlite` 灌入三場(一種 triggerType 一場)。事後確認真實 DB 的
  `LastWriteTime` 全程停在 01:55:55。
- **測試放在能測的那一層**。專案的 vitest 是 `environment: 'node'`,沒有 jsdom,
  為了測一個 hook 去裝 jsdom + testing-library 代價過高。改成把「最上層優先」的排序
  邏輯抽成純函式模組,DOM 只留一層薄殼。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck(node + web)+ **132 tests**(126 → 132)+ build
- [x] **escapeStack 的測試確認可以失敗**:暫時把 `dispatchEscape` 改回「呼叫全部」
      的舊語意,3 個測試立刻紅,訊息正是那個 bug 本身——
      `expected [ 'history', 'confirm' ] to deeply equal [ 'confirm' ]`
- [x] **migration 對真實 driver 的全新安裝路徑**:隔離 user-data-dir 冷開機,
      better-sqlite3 依序套用 migration 1→5(log five lines),`user_version = 5`。
      先前只驗過 v1.0.1 升級路徑(0→4),這次補上 0→5 全新安裝
- [x] **History 修正前後目視對照**:同一場 session,紅色超限線由 65 移到 80,
      我刻意種在資料裡的單點尖峰(86°)由「遠高於線」變成「剛好越線」
- [x] **LTTB 在真實資料上生效**:4500 筆 → 圖表標示「1200 點(圖表抽樣後)」,
      而且單點尖峰被保留下來(這正是選 LTTB 而非等距抽樣的理由)
- [x] **CSV 匯出**:檔頭含 `# safetyLimit,80`,全檔 4512 行 = 12 行 metadata + 1 行
      欄位名 + **4500 筆原始資料**,確認匯出走的是全量而非圖表用的抽樣資料
- [x] `abandoned` 旗標端到端:第三場標記為 1,列表正確顯示「未正常結束」徽章
- [ ] **Esc 的實際按鍵行為仍未驗證**。自動化輸入送不出 Escape(字母鍵正常),
      需要人在鍵盤上按一次確認。堆疊語意本身有測試覆蓋。
- [ ] **校準精靈仍未看過**。整個精靈 `disabled={!isConnected}`,沒有裝置就進不去;
      上一批新增的免手擷取、工具列、上一步全部仍未目視——歸在 issue #3。

## 📝 後續待辦

- 精靈相關 UI 的目視驗收與免手擷取門檻調整,依賴實機(issue #2 / #3)。
- 仍未處理:狀態僅以顏色區分(色盲不可辨)、modal 無 focus trap、Electron 33 升級、
  `CMD:ZERO` 重新歸零(需改韌體)、BLE 改用 service UUID filter。
- 開發期小地雷(不影響出貨):一次 HMR 同時更新四個檔案時畫面整片空白,需手動
  reload;dev 模式自動開啟的 DevTools 是獨立視窗,做視窗自動化時會擋住版面。
