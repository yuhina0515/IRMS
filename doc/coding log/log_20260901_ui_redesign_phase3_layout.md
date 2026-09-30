---
tags: [coding-log]
date: 2026-09-01
summary: "craft-ui-designer Phase 3(版面藍圖)。新建 doc/UI_REDESIGN.md 當活文件——外殼(TopHeader 不變 + 新的頂部 segmented control 取代 BottomBar)、Dashboard/Actions/Settings 的 bento 排版、History 刻意不套 bento(維持列表,因為內容形狀是時序記錄而非獨立卡片)、三組響應式斷點。讀了 DashboardView/TopHeader/ActionsView/HistoryView 現有原始碼,確保藍圖是基於真實既有功能而非憑空發明版面。Phase 4(元件重建)留給下一輪。"
---

# 2026-09-01 變更日誌 — UI 重建 Phase 3 版面藍圖

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260901_ui_redesign_phase1_phase2|Phase 1+2]] ·
> `doc/UI_REDESIGN.md`(本次產出的活文件,Phase 4 會持續更新,不是一次性日誌)

## 🎯 請求

使用者確認 Phase 1/2 方向後,要求「Phase 3 繼續完成」。

## 🔧 已完成

讀了 `DashboardView.tsx`、`TopHeader.tsx`、`ActionsView.tsx`、`HistoryView.tsx` 現有結構,
確保版面藍圖對應真實既有功能(量表+教練提示+進度環+session控制+次要視覺化 tab、動作搜尋+
卡片列表、歷史列表、四組設定分區),不是憑空畫版面。

產出 `doc/UI_REDESIGN.md`:
- **外殼**:`TopHeader` 職責不變(身分+連線狀態),新增頂部 segmented control 取代
  `BottomBar`/`LiquidKnob` 那套底部分頁——是全新元件,不是把 BottomBar 重新skin。
- **Dashboard**:主量表(大卡)+ 進度環/session 控制(側欄)+ 次要視覺化卡(維持現有
  chart/3D/2D/detail 內部 tab 切換,不炸成 4 張常駐卡片——窄螢幕下同時攤開 4 張只有
  一張在用的卡片會直接爆版面預算)。
- **Actions**:搜尋列 + 等大 bento 卡片格線,欄數依斷點響應。
- **History**:**刻意不套 bento**——時序記錄的內容形狀是列表而非獨立卡片,硬套 bento
  會是「套版型套過頭」的錯誤示範,維持列表 + 點選開分析 modal。
- **Settings**:三個小分區卡(校準/一般/外觀)+ Demo Mode 獨占整行(控制項比其他分區多,
  塞進 1/3 格會太擠)。
- **響應式斷點**:手機(<640px)全部單欄、segmented control 變可橫向捲動的 pill 列;
  平板(768–1024px)Actions/Settings 雙欄;寬螢幕(>1280px)如藍圖所繪,Actions 可到 3–4 欄。

## 🧠 關鍵決策

**History 不強套 bento grid**:Phase 1 定了 bento 當整體視覺方向,但套用時仍要判斷內容
形狀合不合適——一份時序 session 記錄的閱讀邏輯是「由新到舊掃過去」,bento grid 的獨立
卡片格線反而打斷這個閱讀順序。這是刻意的例外,不是漏套。

**次要視覺化維持內部 tab,不拆成常駐卡片**:窄螢幕(含之後的手機部署)版面預算有限,
chart/3D/2D/detail 四選一同時攤開會擠壓真正需要常駐可見的主量表與 session 控制。維持
現有 tab 切換的互動模式,只換皮不換邏輯。

## ✅ 驗證

純規劃/文件產出,無程式碼變更,不適用 `npm run ci`。下一步(Phase 4:重建元件)才會有
可執行程式碼與對應的建置/測試驗證。

## 🔎 自我審查

**檢查情境:這份藍圖有沒有漏掉現有功能,導致 Phase 4 重建時發現某個既有互動沒地方放?**
——逐一對照讀過的四個 view 原始碼:Dashboard 的校準提示 chip、超限警報靜音按鈕、
CalibrationWizard modal 觸發點;Actions 的新增/編輯 modal;History 的分析 modal;
Settings 的四個分區——**全部都在藍圖裡有對應位置或明確標記(modal 類保留現有觸發邏輯,
只是外層容器換皮)**。唯一沒收進藍圖的是「進階手動校準」這個可展開的次要區塊,補記在此
處提醒 Phase 4 別漏掉,藍圖本身不需要為每個可展開子區塊都畫一格。

## 📝 後續待辦

- Phase 4(元件重建)：先決定重建順序(哪個畫面先做),留給下一輪。
- Segmented control 元件本身的視覺規格與互動狀態尚未設計,是 Phase 4 的第一個真正要蓋的
  新元件(BottomBar 沒有直接對應可以照抄)。
- 「進階手動校準」這個可展開區塊要記得在 Phase 4 收進 Settings 的校準卡片裡。
