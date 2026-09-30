---
tags: [coding-log, ui, animation, gemini]
summary: 依 Gemini 動畫語言審查(03 號簡報)全面重調互動動畫,收斂為三組具名 motion token;過程中抓到並修掉一個真實的 Toast 退場動畫 bug
date: 2026-09-05
---

# 2026-09-05 變更日誌 — 動畫語言全面重調(Gemini 03 號簡報)

> **相關文件**:[[HOME|導覽首頁]] · `doc/gemini-handoff-20260905/03-animations.md`

## 🎯 目的

延續 [[log_20260905_dashboard_container_query_adaptive_layout|同日的自適應版面工作]],
使用者貼上 Gemini 對「標題列/導覽/動畫語言」三份簡報中「動畫語言」那份的完整回覆。
診斷:各元件動畫時長/曲線各自為政,拉伸回彈(Tab Switcher)偏軟、偏慢,讀起來像果凍
而非精密儀器;下拉選單/Toast/確認對話框缺乏一致的進退場語言。按既定慣例
([[feedback_irms_ui_design_delegated_to_gemini]])直接落地實作 Gemini 的回覆,不再
回頭跟使用者確認設計本身。

## 🔧 變更內容

- **Motion tokens**(`tailwind.css` `:root`):新增 `--motion-ease-mechanical`
  (`cubic-bezier(0.16,1,0.3,1)`,180–240ms,位移/吸附/實體變形)、`--motion-ease-enter`
  (`cubic-bezier(0,0,0.2,1)`,彈窗/選單/Toast 進場)、`--motion-ease-exit`
  (`cubic-bezier(0.4,0,1,1)`,關閉/退場)。兩個主題共用,不隨明暗切換。
- **Tab Switcher(`LiquidKnob.tsx` + `useLiquidKnob`)**:`MORPH_DURATION_MS` 420→220、
  `STRETCH_MAX` 1.4→1.15;`knob-stretch-x/y` keyframe 改成單階段「擠壓後鎖定」
  (45% 時 `scaleX(1.15) scaleY(0.92)`),取代原本的多階段果凍波動;拖曳回正的
  `.liquid-knob-shape` transition 拿掉原本 `cubic-bezier(0.34,1.56,0.64,1)`(控制點
  >1,語意上就是彈簧過衝),改用 `--motion-ease-mechanical`。
- **GlassDropdown**:原本是外層 `scale(0.35→1)` 「從一個點長出來」的動畫,改成單層
  `translateY(-4px)→0` + opacity 的微幅位移,展開 140ms(`--motion-ease-enter`)、
  收合 100ms(`--motion-ease-exit`);`GlassDropdown.tsx` 的 `CLOSE_ANIM_MS` 同步
  160→100,否則 DOM 卸載時機會跟 CSS 動畫對不上。
- **Toast(`ToastHost.tsx` 新增進退場)**:原本完全沒有進退場動畫,`dismissToast`
  觸發的瞬間就從陣列消失。新增進場(160ms,`translateY(-8px)→0` + opacity)與退場
  (120ms,純 opacity,不做任何水平/垂直位移)。因為 store 的 `dismissToast` 是
  「立刻從陣列拿掉」而非「進入退場狀態」,`ToastHost` 另外維護一份本地鏡像
  `displayed`,把「已從 store 消失」的項目標記 `exiting` 並多留 120ms 才真正
  卸載,退場動畫才有時間播完(同樣手法也用在下面的 ConfirmDialog)。
- **ConfirmDialog**:原本 `.overlay`/`.dialog` 完全沒有動畫,開啟/關閉都是硬切。
  新增 150ms 淡入 + 2% 縮放振幅(`scale(0.98)→1`)進場,退場對稱處理,同樣靠本地
  `visible`/`closing` 鏡像狀態延遲 150ms 卸載;決議(`resolve`)本身仍然立即發生,
  不被動畫拖慢——呼叫端 `await requestConfirm()` 接的動作(例如刪除紀錄)不該等
  動畫播完。
- **BLE 連線狀態回饋**:`.dot`(header 的連線 LED)加上 180ms `background-color`
  transition,狀態切換不再硬切;`.dot.on` 在深色主題額外加一次性 180ms
  `filter: drop-shadow` 脈衝,取代「發光直接出現」。`DashboardView.tsx` 的
  `.dash-cell-gauge`(量表面板,操作者視線實際停留處,而非小小的 header LED)在
  `!isConnected` 時加上 `.panel-stale`,邊框 200ms 色溫轉移到 danger 紅,純顏色
  變化不帶任何位移動畫。
- **即時數值/window 最大化稽核(無需變更)**:確認 `MetricGauge`/`.stat .value`
  沒有任何 CSS transition 會拖慢即時數值渲染,`LiveChart.tsx` 的 Chart.js
  `animation: false` 早已停用內建動畫;`.app`/`.main`/`.top-header` 沒有任何
  `transition` 綁在會隨視窗尺寸變動的屬性上,故 maximize/restore 本來就是
  0ms 瞬切,兩項都是稽核後確認「本來就對」,沒有改動。
- **`prefers-reduced-motion` 整併**:原本分散在檔案兩處(只涵蓋 dropdown 與
  knob),整併成一個區塊:先用 `*,*::before,*::after` 把全站動畫/轉場一律壓到
  0.01ms,再針對「帶有語意」的狀態變化(dropdown/toast/dialog/overlay 開關)疊加
  回一組獨立的 80ms 純 opacity keyframe(`fade-in-reduced`/`fade-out-reduced`)
  ——因為 CSS 動畫進行中的屬性沒辦法只用一般規則(即使加 `!important`)蓋掉,
  唯一乾淨的做法是換一組不含 transform 的專用 keyframe,不能只是在原本的
  enter/exit keyframe 上疊加 `transform:none`。Tab 指示塊的「目前選中哪一個」
  維持即時更新(`.liquid-knob-track` transition 歸零,但位置仍隨 React state
  即時變化),因為這屬於有意義的狀態指示,不是純裝飾。`useLiquidKnob` 內新增
  `matchMedia('(prefers-reduced-motion: reduce)')` 監聽,拖曳時直接跳過拉伸速度
  的計算(不只是視覺上藏起來),指示塊在減少動態模式下變成 1:1 剛性跟隨游標。

## 🐛 過程中發現的真實 bug

用 Playwright 對打包後的 App 做真實互動計時檢查(不是只看程式碼)時,Toast 退場
動畫第一版完全沒有播放,dismiss 後瞬間消失。追查發現 `ToastHost.tsx` 的鏡像狀態
更新邏輯有誤:

```js
// 錯誤版本:filter 在同一次呼叫裡就用了「還沒被標記」的舊 exiting 值
const kept = prev
  .filter((t) => currentIds.has(t.id) || t.exiting)
  .map((t) => (currentIds.has(t.id) ? t : { ...t, exiting: true }))
```

當一個 toast 剛從 store 消失時,它在 `prev` 裡的 `t.exiting` 必然還是 `false`
(還沒被標記過)——`filter` 用這個舊值判斷,在 `map` 有機會把它標成 `true`
**之前**就已經被篩掉了,120ms 的退場動畫因此完全沒有機會播放。修法是拿掉這個
`filter`,單純用 `map` 保留每一個項目並視情況標記 `exiting`,真正的移除完全交給
另一個 effect 的計時器負責:

```js
const kept = prev.map((t) => (currentIds.has(t.id) ? t : { ...t, exiting: true }))
```

這個 bug 只有在真的等到 3 秒自動 dismiss 那一刻做時序斷言才會現形——單純看畫面
「有沒有動畫類別」或只測「開啟瞬間」的話不會發現,是這次刻意排入計時檢查
(而非只看有沒有 console error)才抓到的。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠,285 個測試全過(bug 修好前後各跑
  一次,確認修法沒有破壞既有測試)。
- Playwright 對打包後的 App 做真實互動時序檢查(暫裝 `playwright-core`,驗證完
  即解除安裝,不進 `package.json`):
  - GlassDropdown 開啟後 popup 掛載;點擊關閉後、100ms 退場動畫播放中仍掛載;
    動畫播完後卸載——三個時間點都符合預期。
  - ConfirmDialog(經由 Settings 的「啟用示範模式」按鈕觸發)同樣驗證開啟掛載、
    150ms 退場動畫播放中仍掛載、播完後卸載。
  - Toast(經由 Settings「快速歸零」在無即時資料時觸發警告)驗證:觸發後立刻掛載
    且未帶 `exiting`;約 3 秒自動 dismiss 後,120ms 退場動畫播放中仍掛載且帶
    `exiting`;動畫播完後卸載——這一步正是抓到上述 bug、修好後重新確認通過的
    斷言。
  - Dashboard Tab Switcher(先在 Settings 打開趨勢圖與 3D/2D 顯示讓分頁出現):
    點擊切換後 `.liquid-knob-shape` 短暫帶有 `.morph` class,確認 keyframe 動畫
    確實觸發。
  - 全程監聽 `console`/`pageerror`,四輪互動測試皆為零錯誤。
  - 檢查編譯後的 `out/renderer/assets/index-*.css`,確認所有新 token/keyframe
    (`--motion-ease-*`、`dot-connect-pulse`、`toast-in/out`、`dialog-in/out`、
    `overlay-in/out`、`fade-in/out-reduced`)都正確編出,且整併後的
    `prefers-reduced-motion` 條件句沒有被 Tailwind 的 `@layer` 處理破壞(這是
    `@container` 曾經中過的坑,`@media` 目前確認沒有同樣問題,但仍主動查證而非
    假設)。

## Self-review

檢查情境:「Toast 的本地鏡像狀態(`displayed`)如果同時有多個 toast 疊加,其中一個
進入退場、另一個還在正常顯示,兩者的計時器是否會互相干擾(例如某個 toast 的
`setTimeout` 回呼誤刪了別的 toast)?」——確認 `scheduledRef` 用 `Set<number>` 以
`id` 為鍵去重排程,而移除時用 `prev.filter((x) => x.id !== t.id)`,只精準移除自己
這個 id,不會影響同時存在的其他 toast。結果:PASS——雖然這次的驗證腳本每次只觸發
單一 toast,沒有直接跑到多 toast 並存的情境,但這是靠讀程式碼確認邏輯正確(以 id
為鍵、互不干擾),而非實測驗證,記錄這個邊界作為未來若真的疊多個 toast 時的
已知風險點,而非虛報已經測過。
