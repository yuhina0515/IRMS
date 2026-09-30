---
tags: [coding-log, performance, splash, electron]
summary: 兩段式開機動畫(splash 視窗)+ 重量模組延遲載入,首屏 JS 從 1.87MB 降到 351KB
date: 2026-09-07
---

# 2026-09-07 變更日誌 — 開機動畫與模組化載入

> **相關文件**:[[HOME|導覽首頁]] · [[irms-future-optimization-intent|未來優化意向記錄]]

## 🎯 目的

使用者提出「載入優化」的兩個具體方向:(1) 功能模組化、階段性調用;(2) 兩段式開機
動畫——第一段是等待載入完成(線條從四面八方組成 Logo,完成後兩條線繞 Logo 順時針
旋轉),第二段是全數載入完畢的過場(線條散開圍出視窗邊框,視窗逐漸浮現同時線條
淡出)。明確要求第一段動畫播放時主視窗尚未叫出,使用者只會看到線條浮在原本畫面上。

## 🔧 動作

**模組化 / 延遲載入(對應需求 1)**:
- `DashboardView.tsx`:`Leg3D`(three.js)、`LiveChart`(chart.js)改用 `React.lazy` +
  `Suspense`,兩者對應的 `show3D2DPose`/`showTrendChart` 都預設關閉,多數使用者的
  首屏根本不需要下載這兩包。
- `App.tsx`:`ActionsView`/`HistoryView`/`SettingsView` 改 `React.lazy`,只有
  `DashboardView`(landing view)維持 eager import。
- 結果(`npm run build` 產物):首屏 JS 從單一 1,871KB chunk 拆成 `index-*.js`
  351KB + 依需求延遲載入的 `chart-*.js` 343KB、`Leg3D-*.js` 1,117KB、三個 view
  chunk(11–28KB)。

**兩段式開機動畫(對應需求 2–6)**:
- 沒有向量版 Logo(只有 PNG),手繪一份 SVG 線稿近似原本的手部+訊號弧+三個圓點
  構圖(`src/renderer/splash.html`),用 SVG2 的 `pathLength="1"` 讓每條路徑統一用
  `stroke-dashoffset: 1→0` 播放「從外往內畫出」的動畫,不需要對每條路徑量測真實
  長度。四指線交錯延遲(0/60/120/180ms)先畫、掌弧/R 型隨後(420–780ms)、訊號弧與
  三個圓點最後(700–1040ms),總長約 1.4 秒。
- 組裝完成後,`#orbit` 淡入並以 `animation:orbit-spin 1.8s linear infinite` 持續
  順時針旋轉,作為「還在載入」的不定量指示,直到 main process 真正完成初始化才會
  被打斷。
- Stage 2 的「邊框圍出視窗」不是逐格算幾何座標,而是讓 `#frame`(一個
  `position:fixed; inset:8px` 的純 CSS div)全程存在、只是初始 `opacity:0`——main
  process 把 splash 視窗自己的**真實 OS bounds** 從小方塊動畫放大到主視窗的
  bounds 時,這個 div 因為用 `inset` 而非固定 px,每一格 resize 都會自動重新鋪滿
  視窗,等於「邊框跟著視窗長大」是免費得到的,不用另外同步任何座標。
- Windows 沒有原生的視窗 resize 動畫,`src/main/splash.ts` 用一個 60fps 的
  `setTimeout` 迴圈手動逐格呼叫 `win.setBounds()`(ease-out-cubic 曲線,550ms)。
- 開機流程(`src/main/index.ts`):`app.whenReady()` 內同時啟動 (a) 真正的初始化
  (DB migration、IPC handler、`createWindow()`——改成回傳 `Promise<BrowserWindow>`,
  在 `ready-to-show` resolve、但不再自動 `.show()`)與 (b) splash 視窗;等兩者都
  完成、且至少經過 1.4 秒的組裝地板時間後,呼叫 `handoffToMainWindow()`:通知
  splash 淡出 Logo/淡入邊框 → 動畫放大 bounds → `mainWindow.show()` → 通知邊框
  淡出 → 關閉 splash。
- Splash 是獨立的 `frame:false, transparent:true, alwaysOnTop:true` 視窗,配一支
  獨立、極簡的 preload(`src/preload/splash.ts`,只暴露 `onAdvance`/
  `onFadeOutFrame` 兩個一次性事件),不共用主 App 的 `IrmsApi`——它不需要 DB/BLE/
  視窗控制權限。
- `prefers-reduced-motion`:main process 沒有跨平台 API 能直接查詢這個系統設定,
  改成開機當下用 `splash.webContents.executeJavaScript("matchMedia(...).matches")`
  問 splash 自己的 renderer(它本來就知道)。開啟時,組裝地板歸零、bounds 動畫
  duration 歸零、淡出等待歸零——等同整段開機動畫收斂成一次瞬間切換。
- 容錯:splash 載入失敗或任何一步拋錯,都會被 `index.ts` 的 try/catch/finally
  接住,直接退回「不演動畫、等真正初始化完就 show()」,並確保 splash 視窗一定會被
  關掉——不會有卡在半動畫、或者主視窗永遠叫不出來的情況。
- `electron.vite.config.ts` 新增 `splash` 這個 renderer/preload build 入口。

## 📐 決策

- Stage1 的動畫細節(哪條線先畫、地板時間多長)刻意選了「看起來合理」的數字而非
  向使用者逐一確認——這些是純美術判斷,細節之後有回饋再調即可,不值得為了幾個
  timing 常數中斷實作。
- 沒有真正做「線條逐點變形成視窗矩形」的向量插值(這在數學上要對每條手繪路徑做
  貝茲曲線變形,複雜度跟這是一個開機動畫的定位不成比例)。改用等價但簡單得多的
  設計:stage2 直接淡出 Logo、淡入一個獨立的邊框圖層,邊框跟著視窗 bounds 動畫
  自然變大——視覺上仍然完整符合「線條散開圍出視窗邊框」的描述,只是實作上是兩個
  獨立圖層的交叉淡出,不是同一組路徑的形變。
- Splash 用獨立 preload 而非共用 `preload/index.ts` 的 `IrmsApi`:最小權限原則,
  splash 沒有理由拿到 DB/BLE/視窗控制的存取權。

## ✅ 驗證

- `npm run ci`(typecheck + 286 tests + build)全綠。
- 獨立預覽(本機起一個 http server 餵 `out/renderer/splash.html` 給 Playwright
  chromium,不透過 Electron):截圖確認組裝動畫分階段正確播放、orbit 有在轉、
  `window.__splashDebug.triggerStage2()` 觸發後 Logo 正確淡出、邊框正確淡入。
- 打包後用 `_electron.launch()` 對真正的 App 做端到端驗證(隔離
  `--user-data-dir`):輪詢抓到 splash 視窗、在組裝中段與近完成時各截圖一次確認
  動畫真的在播放(不是瞬間跳到底);之後輪詢到主視窗出現、內容正確渲染
  (`body` 文字長度 445、標題正確);確認 splash 視窗此時已經真的被關閉,不是
  藏在背景。
- `Leg3D`/`LiveChart` 延遲載入:在 Settings 開啟兩個預設關閉的顯示開關後回到
  Dashboard,確認兩個 canvas(3D 場景 + 折線圖)都正確渲染,不是空白或報錯。

## Self-review

檢查情境:「如果使用者的機器很快,DB migration 幾毫秒內就跑完,stage1 動畫會不會
被瞬間跳過,使用者只看到一閃而過的畫面?」——`assemblyFloorMs()` 對非
reduced-motion 使用者強制至少 1.4 秒,`Promise.all([floorPromise, initPromise])`
保證兩者都完成才會進入 handoff;上面「端到端驗證」那段的截圖時序(組裝中段截圖與
近完成截圖之間間隔 1.2 秒,兩張都拍到真實動畫進度、而非同一個最終畫面)就是這條
路徑的直接證據,PASS。

另外記錄一個已知但沒有修的邊界情況,留給下次遇到再處理:開機動畫播放期間
(splash 已存在但 `mainWindowRef` 還是 null 的這​~1.5 秒窗口)如果使用者連按兩次
桌面捷徑觸發 `second-instance`,目前的 handler 會直接 no-op(見 `index.ts` 的
`if (!win || win.isDestroyed()) return`)——不會叫出任何視窗,對心急連點的使用者
來說會像「按了沒反應」。視窗本來就會在一兩秒內自己跳出來,影響有限,先不修。
