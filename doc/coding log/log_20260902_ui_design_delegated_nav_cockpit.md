---
tags: [coding-log]
date: 2026-09-02
summary: "使用者裁定「以後 UI 設計全權交給 Gemini」,解決了先前累積的兩個待確認 IA 問題:移除頂部 SegmentedControl(側邊欄成為唯一主導覽)、Dashboard 次要視覺化從四選一頁籤改成 Gemini 規格的 2 欄常駐 Cockpit(左:趨勢圖/詳細數值互切,右:3D/2D 姿態互切)。兩個小切換器沿用既有 useLiquidKnob 機制各自獨立一份。npm run ci 全綠,雙主題截圖驗證通過,確認 Cockpit 版面在深淺主題下都正確呈現含發光效果的切換器。存了一則 feedback 記憶記錄這個委任決定,避免以後同類問題又跑回來問使用者。"
---

# 2026-09-02 變更日誌 — UI 設計委任 Gemini:移除雙導覽 + Dashboard Cockpit 版面

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260902_dashboard_bugfixes_and_styling|同日稍早:Dashboard 缺陷修復]] ·
> `doc/UI_REDESIGN.md`

## 🎯 請求

使用者針對上一批日誌留下的兩個待確認問題,回覆:「以後 UI 設計全權交給 Gemini。」

## 🔧 已完成

### 記憶:UI 設計決策委任

存了一則 feedback 記憶(`feedback_irms_ui_design_delegated_to_gemini`)——往後 Gemini
給出的 UI/IA 具體建議直接實作,不再回頭跟使用者確認設計面的取捨,即使牴觸這個專案
先前自己下過的決定也一樣。**範圍限定在 IRMS 的 UI 視覺設計**,不是「以後都不用問」的
通用規則;Gemini 聲明的可查證事實(對比度數字等)仍然要驗證,委任的是判斷,不是查證紀律。

### 移除頂部 SegmentedControl,側邊欄成為唯一主導覽

`App.tsx` 拿掉 `<SegmentedControl />` 與其外層 `.segmented-row`;直接刪除
`SegmentedControl.tsx`(不是留著當死碼——這次是真的被裁定取代,不是「還沒空間處理」)。
連帶清掉 `tailwind.css` 裡 `.segmented`/`.segmented-item`/`.segmented-row` 三組專屬樣式。
`useLiquidKnob`(定位/拖曳邏輯的 hook 本身)不受影響,繼續被 Dashboard 內部的次要切換器
使用。

### Dashboard 次要視覺化改為 Cockpit 2 欄常駐版面

`DashboardView.tsx` 拿掉原本「趨勢圖/3D姿態/2D姿態/詳細數值」四選一的單一 tab 卡片,
改成 Gemini round-2 規格的常駐並排:左欄(8 份寬,趨勢圖為主,可切到詳細數值)+
右欄(4 份寬,3D 姿態為主,可切到 2D 姿態)。**Gemini 的規格沒有明講四個內容原本的
「詳細數值」「2D 姿態」要放到哪裡去**——這是它留下的空白,不是它做過的決定,所以這裡
維持工程判斷:各自留一個小切換器跟主視圖同卡片,不遺漏任何既有功能。

外層 `.cockpit` 容器故意不掛卡片背景(直接坐在畫面底色上),用 `border-t` 跟上方摘要
卡片分隔;左右兩個面板各自才是真正的卡片(直接複用既有的 `panel glass`,不用另外造
一套樣式)。兩個小切換器各自獨立一份 `useLiquidKnob` 實例(`leftTabsRef`/`rightTabsRef`
+ 各自的 state),不是共用同一份——避免左右切換互相干擾。

## 🧠 關鍵決策

**Gemini 沒講到的細節(2D 姿態/詳細數值放哪),沒有因為「設計全權交給 Gemini」就不做
判斷**——委任的是「Gemini 已經做出的設計決定不用再讓使用者裁決」,不是「Gemini 沒說的
地方我也不用思考」。這兩者容易混在一起,這次記錄下來的分界是:規格內的部分直接照做,
規格外的空白仍然要工程判斷去填,填的時候不遺漏既有功能(2D 姿態跟詳細數值都是使用者
已經在用的東西)。

## ✅ 驗證

- [x] `npm run ci`:typecheck 綠、**284 tests(26 files)全綠**、build 成功
      (打包模組數 88→87,`SegmentedControl.tsx` 確認被移出建置產物)
- [x] 隔離啟動 + 截圖(雙主題):頂部確認不再有 SegmentedControl(側邊欄是唯一可見的
      主導覽),Cockpit 區域正確呈現左右並排、`border-t` 分隔線清楚可見、兩個小切換器
      點擊後正確且獨立地切換內容(右欄切到 2D 姿態不影響左欄的趨勢圖狀態)、深色主題下
      切換器的發光效果正確顯示
- [x] 過程中第一張截圖底部出現一條看起來像是橫向捲軸的線,用
      `scrollWidth`/`clientWidth` 實際量測 `.cockpit`/`.main`/`document.body` 確認
      三者數值完全相等(1019/1019、1023/1023、1267/1267),**沒有真的水平溢出**——
      如實記下這個檢查過程,不是忽略一個看起來可疑的畫面

## 🔎 自我審查

**檢查情境:兩個獨立的 `useLiquidKnob` 實例(左右面板各一份)會不會因為共用同一個 hook
模組而互相干擾狀態?**——`useLiquidKnob` 是一般的 React hook,每次呼叫產生獨立的
`useState`/`useRef` 綁定,兩次呼叫(`left`/`right`)之間沒有共享的模組層級狀態,理論上
彼此獨立。截圖實測:切換右欄到「2D 姿態」後,左欄的「趨勢圖」active 狀態與滑動指示塊
位置維持不變。**Pass**——不是只看程式碼結構推論獨立,是真的操作過確認互不影響。

## 📝 後續待辦

- Phase 4 到這裡,四個畫面的結構與樣式都已對齊 Gemini 的設計方向,兩個先前待確認的 IA
  問題都已落地。
- Phase 5(尚待進行):完整的對比度複查(這次雙主題的新增/異動 token 已個別驗證過,
  但還沒有一次性重跑全部 token 組合的系統性複查)+ 更完整的截圖驗收清單。
