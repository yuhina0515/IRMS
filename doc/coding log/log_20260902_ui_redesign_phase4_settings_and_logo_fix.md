---
tags: [coding-log]
date: 2026-09-02
summary: "craft-ui-designer Phase 4,第二批:重建 Settings 頁(Calibration/General 雙欄 bento + Demo Mode 全寬)、移除 Appearance 面板(新方向是固定深色主題)、補齊 GlassDropdown 的新樣式。過程中用截圖驗證時發現一個影響全部畫面的真實 bug——TopHeader 的 logo-mark 完全沒有尺寸限制,PNG 以原生解析度渲染,把頂列撐成佔滿大半螢幕的巨型圖案,吃光所有頁面的可視內容空間;修好後重新截圖,Settings 頁確認正確呈現雙欄 bento 卡片、GlassDropdown 彈出選單無殘留的疊層問題。"
---

# 2026-09-02 變更日誌 — UI 重建 Phase 4(二):Settings 頁 + 全域 logo 尺寸 bug

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260902_ui_redesign_phase4_foundation_and_nav|Phase 4(一)基礎元件層 + 新導覽]] ·
> `doc/UI_REDESIGN.md`

## 🎯 請求

延續「開始計畫,逐一解決 tasks」,依重建順序(Settings → Actions → History → Dashboard)
處理 Settings 頁。

## 🔧 已完成

### Settings 頁重建為雙欄 bento

`SettingsView.tsx`:Calibration 與 General 卡片改用 `.grid`(`grid-template-columns: 1fr
1fr`)並排,Demo Mode 維持全寬在下方。**移除 Appearance 面板**——新方向是單一固定深色主題,
不再需要可切換的風格設定檔;`import` 移除 `STYLE_PROFILES`/`SYSTEM_STYLE_PROFILE_ID`,
`applyStyleProfile.ts`/`styles/profiles/` 本身暫不刪除(比照 `global.css` 的處理方式,
留給之後整批清理死碼時處理,不在本次範疇)。同時把檔案裡殘留的 `style={{ color:
'var(--text-dim)' }}` 這類直接引用舊 CSS 變數的 inline style 全部改成新 token 的 Tailwind
class(`text-text-muted`、`border-border` 等)——這些變數在 `global.css` 拔除後已經失效,
不是新問題,是這次動到檔案時順手修掉的既有落差。

### 補齊 GlassDropdown 樣式(遺漏補回)

上一批的基礎元件層漏了 `.glass-dropdown*` 一系列 class——GlassDropdown 不是 Appearance
死系統的一部分,是全域通用元件(Protocol 選擇、Demo 情境選擇都在用),必須補上。連同
`dropdown-grow`/`dropdown-shrink` 動畫 keyframes 一起補齊,沿用 09-01 那次 stacking
context 修復的 portal + `position:fixed` 邏輯(TSX 端本來就沒變,只是這次終於補上對應的
新版 CSS)。

### 發現並修復:全域 logo 尺寸 bug

視覺驗收 Settings 頁面時想確認捲動後的卡片內容,結果不管怎麼捲動畫面幾乎不變——追查後
發現 `TopHeader` 的 `.logo-mark`(logo `<img>`)**完全沒有被定義任何尺寸**,舊
`global.css` 原本有 `height: 28px; width: auto`,新的 `tailwind.css` 基礎元件層漏掉了
這條規則。結果是 PNG 素材以原生解析度渲染,把 `.top-header` 撐成接近滿版高度的巨型圖案,
吃光所有頁面的可視內容空間——**這不是本批新增的缺陷,是上一批(Phase 4 一)就已經存在,
只是當時的截圖都恰好只看畫面最上面一小塊,沒發現底下的內容其實被擠壓到幾乎看不見**。
補回 `.logo-mark { height: 28px; width: auto; display: block; }` 後重新截圖,整個
App 的可視內容空間立刻恢復正常。

## 🧠 關鍵決策

**Appearance 死碼不整批清,只斷開這次真的會動到的部分**:`SettingsView.tsx` 這次確實在
改,所以移除它裡面對 Appearance 系統的引用是本批份內工作;但 `applyStyleProfile.ts`/
`styles/profiles/`/`App.tsx` 裡的 `useEffect` 呼叫、`useStore.ts` 的 `styleProfileId`
欄位這些沒被這次改動直接觸及的部分維持原樣,不是漏做,是刻意不擴大這批的變更範圍——
這些殘留程式碼目前是良性的死碼(不影響任何行為,只是白跑),整批清理留給之後專門的
死碼清理批次,一次處理乾淨會比分散在每個順手經過的批次裡各改一點更容易驗證完整性。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**、build 成功
- [x] 隔離 `--user-data-dir` 啟動 + 暫裝拋棄式 `playwright-core` 連 CDP:
  - logo 修復前:反覆嘗試用 `scrollTop`/滑鼠滾輪捲動 `.main` 都拍不到下方內容,一度懷疑是
    screenshot 工具在這個 Electron/CDP 組合下的已知限制,後來才定位到根因不是捲動失效,
    是可視內容空間本身被巨型 logo 吃光
  - logo 修復後重新截圖:Dashboard 顯示正常尺寸的 header + 完整的量表卡片內容;
    Settings 顯示 Calibration/General 正確並排的雙欄 bento 卡片、Demo Mode 全寬卡片;
    點開 Protocol 下拉選單,彈出面板正確浮動顯示、選中項高亮、無殘留的 09-01 stacking
    context 問題

## 🔎 自我審查

**檢查情境:「怎麼捲都捲不動」這個現象,會不會其實是我的驗證腳本寫錯,而不是真的
app 問題?**——這正是這次差點誤判的地方。依序排除:先懷疑 `scrollTop` 賦值時機問題
(改用滑鼠滾輪事件)、再懷疑滾輪座標打在非滾動區域上(改用 `.hover()` 精準定位再
`wheel()`)、兩者都排除後才回頭檢查實際渲染出來的畫面本身——這一步是關鍵:與其繼續
猜測驗證腳本的問題,不如先看一次「螢幕上實際發生什麼」,結果直接看到巨大到不成比例的
logo 圖案佔滿版面,根因立刻明朗。**教訓記下來**:當自動化驗證結果連續多次不符預期時,
下一步是回頭肉眼檢查畫面本身在畫什麼,而不是持續嘗試調整驗證腳本的參數——後者容易陷入
「假設工具有 bug」的隧道視野,而這次的根因其實是 app 本身的真實缺陷。

## 📝 後續待辦

- Phase 4 剩餘:Actions → History → Dashboard,依序繼續。
- Appearance 死碼(`applyStyleProfile.ts`/`styles/profiles/`/`useStore.ts` 的
  `styleProfileId`)整批清理,留待所有頁面重建完成後一次處理。
- `global.css` 仍未刪除,同上待所有頁面確認無殘留引用後整批清除。
