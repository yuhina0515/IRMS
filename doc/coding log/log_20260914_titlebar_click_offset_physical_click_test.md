---
tags: [coding-log, tauri, bug]
summary: 用真正的硬體層級滑鼠輸入(Win32 SetCursorPos+mouse_event,非 UI Automation)在像素級精確量測過的座標上實測最大化鈕,確認今天稍早套用的 shadow:false 修正沒有解決點擊偏移——游標確認精確停在按鈕視覺中心(GetCursorPos 核對),卻連 hover 樣式都沒觸發,證實問題比先前認知的更根本:不是單純座標算錯,是這個 175% DPI 縮放環境下,真滑鼠事件從未真正命中該元素。
date: 2026-09-14
---

# 2026-09-14 TopHeader 點擊偏移——真實硬體點擊測試(否定結果)

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260914_bug_pass_and_gemini_design_language_brief|今天稍早套用 shadow:false 修正的日誌]]

## 🎯 目的

使用者確認稍早套用的 `shadow:false` 修正沒有解決 TopHeader 視窗控制鈕點擊偏移的問題(「昨天試了
一下偏移問題還在」)。既有記錄(09-11)已知這類 bug 連 UI Automation 直接呼叫都測不出來——UI
Automation 走的是無障礙 API 直接觸發 handler,繞過了真正的滑鼠 hit-test 路徑。這次改用
**真正的硬體層級輸入**(Win32 `SetCursorPos` + `mouse_event`,不是任何形式的程式化 invoke),
在像素級精確量測過的螢幕座標上實測,取得比先前更嚴謹的證據。

## 🔧 變更內容

沒有程式碼變更,純測試。方法:

1. 用 `npm run tauri dev` 在使用者的實體桌面上跳出真正的 Tauri 視窗(套用今天稍早的
   `shadow:false` 修正)。
2. 用 `GetWindowRect`/`GetDpiForWindow` 找到視窗的真實螢幕位置與 DPI(**這台測試機是 175%
   縮放**,`GetDpiForWindow` 回報 168/96=1.75)。
3. 用 `PrintWindow` API **只擷取這個視窗自己的畫面**(不是整個桌面)——第一次嘗試不慎用了整個
   虛擬螢幕截圖,意外拍到使用者其他視窗(瀏覽器登入頁),已立即刪除,之後全程改用
   `PrintWindow` 精準定位到單一視窗,不再重蹈。
4. 對截圖做像素掃描(逐欄/逐列找亮度突增的圖示描邊),精確算出最大化鈕圖示中心在視窗畫面裡
   的實際像素座標,換算成螢幕絕對座標。
5. `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)` 確保這個 PowerShell 呼叫序列跟
   `GetWindowRect` 在同一個座標系(物理像素,不是邏輯像素)下運作。
6. `SetCursorPos` 移到算出的座標、`mouse_event(LEFTDOWN)`+`mouse_event(LEFTUP)`——這是
   OS 認得的真實硬體事件,不是任何形式的程式化「呼叫 handler」。
7. 點擊前後都用 `GetWindowRect` 比對視窗大小(最大化應該會改變 rect)、點擊後再用
   `PrintWindow` 截一次角落確認有沒有 hover 樣式(`.window-btn:hover` 會變色)、
   並用 `GetCursorPos` 核對游標真的精確停在算出的目標座標上。

## ✅ 驗證方式(這次的核心就是驗證本身)

- [x] `GetCursorPos` 核對:游標最終位置 `(2514, 109)`,與算出的目標座標**完全一致**——
      排除「游標根本沒到那個位置」這個最簡單的解釋
- [x] 點擊前後 `GetWindowRect` 比對:**完全相同**,視窗沒有最大化
- [x] 點擊後截圖比對按鈕角落:**沒有任何 hover 樣式變化**——如果游標真的懸停在按鈕上,
      `.window-btn:hover`(背景色變化)理應可見而未見
- [x] 結論:在座標經過像素級量測且用 `GetCursorPos` 二次核對過完全準確的前提下,真實硬體
      滑鼠事件**連 hover 都沒有命中這個元素**,不只是點擊沒生效。這排除了「純粹是我這次
      算座標算錯」的可能性,也比 09-11 的 UI Automation 測試更進一步排除「只是自動化工具
      本身不可靠」的疑慮——這是目前為止最直接的證據

## 📝 後續待辦

- **`shadow:false` 確認無效**,但目前判斷保留這個設定(無害,仍是上游文件對同類
  `decorations:false` 問題建議的作法),不單獨回退。
- **根因比先前設想的更深**:不是簡單的座標偏移量算錯,是真滑鼠事件在這個 175% DPI 縮放環境下
  沒有正確命中 WebView2 裡的目標元素,懷疑是 `tao`/`wry` 的 DPI 座標轉換問題(視窗實際物理
  尺寸 2344×1651 與設定檔 1280×820 邏輯像素 × 1.75 縮放理論值 2240×1435 有明顯落差,~104×216
  物理像素,但內容確實填滿整個視窗、沒有黑邊,代表不是內容尺寸問題,而是尺寸計算/座標轉換
  本身有誤差)。
- **下一步需要使用者裁決,不是純技術判斷**:
  1. 若能在**100% 縮放**的螢幕/VM 上測一次,可以直接確認是否為 DPI 縮放觸發的問題——但
     這需要實際換一台機器或改變顯示設定,不是這次能單方面做的事。
  2. 若確認是 DPI 相關,結構性解法會是放棄 `decorations:false` 自訂標題列,改回原生視窗框
     搭配 Windows 11 DWM caption 顏色 API(`DwmSetWindowAttribute`)做主題化——但這會推翻
     09-05 到 09-08 那一整輪自訂標題列/開機動畫的設計方向,動工前必須先跟使用者確認,
     不能自行決定。
