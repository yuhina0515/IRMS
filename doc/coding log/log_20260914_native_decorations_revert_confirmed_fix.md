---
tags: [coding-log, tauri, bug]
summary: 依使用者裁決暫時改回原生視窗框(decorations:true),TopHeader 的 hasCustomTitlebar() 改回 false 沿用既有的 RDP fallback 路徑。用同一套真實硬體滑鼠點擊方法實測原生最大化鈕——這次真的成功了(視窗 rect 確實變成最大化外溢值),確認原生框繞開了整個 09-11 起查不出根因的點擊偏移 bug class。自訂標題列程式碼刻意保留未刪,回頭切換只需要改兩處設定。
date: 2026-09-14
---

# 2026-09-14 暫時改回原生視窗框,實測確認修好點擊偏移

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260914_titlebar_click_offset_physical_click_test|稍早證實 shadow:false 無效的測試日誌]]

## 🎯 目的

稍早的真實硬體點擊測試證實 `shadow:false` 沒有解決點擊偏移,根因懷疑是這台 175% DPI 縮放
環境下 `tao`/`wry` 的座標轉換問題,不是本專案程式碼能單方面修的。使用者裁決:**暫時改回原生
視窗框**,不再繼續在自訂標題列這條路線上打轉。

## 🔧 變更內容

1. `tauri.conf.json`:主視窗 `"decorations": false` → `"decorations": true`,移除稍早加的
   `"shadow": false`(那是專為自訂標題列 + 陰影的假說準備的,原生框不需要,且原生視窗本來就
   該保留系統預設陰影)。
2. `platform/irmsApi.ts`:`windowControls.hasCustomTitlebar()` 由固定回傳 `true` 改回固定
   回傳 `false`——沿用既有本來就為 RDP session 準備的 fallback 路徑(`TopHeader.tsx` 早就
   处理過這個分支:不渲染 `WindowControls`、不掛 `data-tauri-drag-region`、不掛雙擊最大化),
   不是新寫的程式碼路徑,风险很低。
3. **刻意不刪除**任何自訂標題列/開機動畫相關程式碼(`WindowControls` 元件、`window-controls`
   CSS、`splash.rs` 的邊緣飛入動畫等)——使用者說是「暫時」改回原生,回頭要切回自訂標題列
   只需要把這兩處設定改回去。

## ✅ 驗證方式

- [x] `npm run typecheck` 過
- [x] `cargo check`/實際 `tauri dev` 編譯執行皆正常
- [x] `PrintWindow` 截圖確認畫面正確:原生標題列(含系統圖示、原生三顆控制鈕)+ 下方
      TopHeader(logo/連線狀態/主題切換,沒有重複的控制鈕),沒有雙標題列或版面錯誤
- [x] **關鍵驗證:重複稍早那套真實硬體滑鼠點擊方法**(像素掃描算出原生最大化鈕座標 →
      `SetCursorPos`+`mouse_event` 真實點擊)。點擊前 rect `220,220,2484,1719`,點擊後
      `-12,-12,2744,1976`(Windows 標準最大化外溢值)——**這次真的成功了**,證實原生框
      繞開了整個點擊偏移 bug class。用 `ShowWindow(SW_RESTORE)` 收尾還原視窗狀態

## 📝 後續待辦

- 原生框是**暫時**方案。根因(懷疑是 `tao`/`wry` 在 175% DPI 縮放下的座標轉換問題)仍未真正
  查清楚,等有機會在其他縮放比例的環境交叉驗證,或上游函式庫有修復,再評估要不要切回自訂
  標題列。
- 使用者另外提出「需要一個可以自動偵測並縮放的模組」,將在下一篇日誌處理(獨立於這次的
  原生框決定)。
