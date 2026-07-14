---
tags: [coding-log]
date: 2026-07-14
summary: "移除左側 Sidebar,改為頂部狀態列+底部 icon 導覽列;LiquidKnob 改寫成可抓取拖曳(useLiquidKnob hook);校準精靈第2步倒數卡死的 StrictMode 根因已修復;71 tests 綠"
---

# 2026-07-14 變更日誌 — 底部導覽列改版 + 校準倒數修復

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260714_ui_dropdown_sidebar_warp|前置:側欄拖拉+液態指示器]]

## 🎯 目的

使用者一次提出 5 項:
1. 所有選單(除下拉式)的滑動指示塊要能被抓取拖曳
2. 校準精靈第 2 步(站直捕捉零位)倒數不會動
3. 移除左側選單,改在底部新增 bar
4. 新 bar 用 icon 取代舊左側選單的文字按鈕
5. 移除左下偵錯視窗

事先用 `AskUserQuestion` 確認第 3 項範圍:使用者選「整個左側面板都消失」——
logo/連線狀態/Connect 按鈕移到新的頂部 header,不是只搬導覽列。

## 🐛 校準倒數 bug——實測抓根因(不是憑空猜)

**重現**:暫時在 `useStore.ts` 掛一個 `window.__store` 除錯鉤子(用完即刪),
繞過 `isConnected` 閘門,跑到精靈第 2 步、點下捕捉按鈕、每 400ms 輪詢倒數顯示——
卡在「3」超過 3.2 秒不動。

**根因(加 `console.log` 進 `capture()` 迴圈後確認)**:經典 React 18 StrictMode
陷阱。`main.tsx` 用 `<React.StrictMode>` 包 App,dev 模式下會刻意把每個元件
mount→unmount→remount 一次(抓漏清理的 bug)。`cancelledRef` 的 `useEffect` 只在
cleanup 把它設成 `true`,從未在 effect 本體重設回 `false`——StrictMode 的模擬
unmount 把它永久卡在 `true`,即使元件其實正常掛載中。任何 `capture()` 呼叫
在第一次 tick 後就被誤判「已取消」提早返回,數字從此凍結。**這個 bug 在正式
build 不會出現**(StrictMode 雙重呼叫只在 dev 模式),但使用者測的正是
`npm run dev`。

**修法**:`useEffect` 本體開頭補 `cancelledRef.current = false`,不能只靠
`useRef(false)` 的初始值。用同一套除錯工具重新驗證:倒數正確跑
3→2→1→捕捉中,修復後移除全部除錯痕跡。

## 🔧 版面大改

- **刪除 `Sidebar.tsx`**,連帶清掉 `useUiStore.ts` 裡的死狀態(`sidebarCollapsed`/
  `sidebarWidth`/`sidebarDragging` 及其 setter——這些只是今天稍早為了側欄拖拉
  調寬功能而加的,側欄沒了就沒用了)。
- **新增 `TopHeader.tsx`**:logo+連線狀態+Connect 按鈕,橫向玻璃 bar。
- **新增 `BottomBar.tsx`**:icon 導覽(Dashboard/Actions/History/Settings)取代
  舊垂直文字導覽,用新的 `useLiquidKnob` hook(含拖曳,見下)。
- **新增 `NavIcons.tsx`**:四個極簡線條 SVG icon(專案沒有 icon 套件,手刻)。
- **`App.tsx`**:`.app` 從側欄寬度 CSS grid 改成直式 flex(TopHeader / main / BottomBar)。
- **`global.css`**:移除全部 `.sidebar`/`.nav`/`.log-panel`/`--sidebar-w` 規則,
  新增 `.top-header`/`.bottom-bar`/`.bottom-bar-item`。
- 修掉兩處提到「側欄」的過時文案(`DashboardView.tsx`、`CalibrationWizard.tsx`),
  改成「頂部」,對應 Connect 現在的實際位置。

## 🖐 指示塊可抓取拖曳(item 1)

`LiquidKnob.tsx` 從被動元件改寫成 `useLiquidKnob()` hook,額外回傳
`getItemProps(key)`。關鍵洞察:指示塊是 `pointer-events:none` 的裝飾元素,
視覺上永遠疊在「目前選中項」的按鈕正下方——所以「抓指示塊」直接實作成
「把拖曳事件掛在目前 active 的那顆按鈕上」(`getItemProps` 只在
`key === activeKey` 時才回傳真正的 handler,其餘按鈕維持原本 `onClick` 不變)。
這樣完全不需要 z-index/pointer-events 疊層手法。

拖曳機制:`onPointerDown` 記錄起點(用 ref 存權威即時值,state 只負責觸發重繪,
沿用今天稍早側欄拖拉把手的同一套模式);移動要超過 4px 門檻才觸發(避免點擊
已選中項時視覺抖動);拖曳中指示塊的 track 加 `.dragging` class 關閉 CSS
transition,讓它直接跟手而非被緩動追著跑;放開時比對指示塊目前中心與每個
選項中心的距離,吸附最近的選項並呼叫 `onSelect`;若吸附結果跟原本相同,
指示塊會透過重新啟用的 transition 自動滑回原位,不需要額外的「拖了但沒選新的」
特判邏輯。

套用在 `BottomBar.tsx`(從側欄版的垂直改水平)與 `DashboardView.tsx` 的分頁
(取代舊的不可拖曳 `<LiquidKnob>` 元件用法)。`GlassDropdown` 依使用者原話
(「除下拉式」)刻意不動。

## ✅ 驗證

- 每個階段性修改後 `npm run ci`(typecheck+71 tests+build)皆綠
- 校準倒數 bug 用除錯鉤子實測重現→加 log 找根因→修復→同工具重新驗證,而非憑空猜測
- 瀏覽器對 Vite dev server 做結構化驗證(本 session 無可用截圖工具):
  - 版面:頂部 header(logo/狀態/Connect)、底部 4 個 icon 按鈕、DOM 裡已無
    `.sidebar`/`.log-panel`
  - 模擬拖曳(pointerdown→超門檻 pointermove→pointerup)抓底部導覽當前 active
    的 Dashboard icon 拖到 History:指示塊跟手移動、放開後視圖真的切換成
    History
  - 同一套拖曳機制在 Dashboard 分頁(趨勢圖→詳細數值)也驗證成功
  - 對「未選中」的分頁單純點擊(無拖曳)仍立即切換,不受影響
  - GlassDropdown 仍正常開關,確認下拉選單未被牽動

## 📝 後續待辦

- 拖曳中沒有「即時預覽會吸附到哪個選項」的高亮提示,只有放開瞬間才決定——
  如需要更精緻的手感可以再加,目前範圍內夠用
- 回到 2026-07-14 架構會議的「驗證優先」30 天計畫:BLE 實機驗證 + Profiler 基線
