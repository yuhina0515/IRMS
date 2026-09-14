---
tags: [coding-log, tauri]
summary: 新增 dpi_guard 模組,開機時與 DPI/縮放比例改變時自動核對主視窗實際尺寸是否符合設定檔的邏輯尺寸×縮放比例,超出容忍值就強制修正回去。直接執行編譯後的 exe 確認真的有跑:這台 175% 縮放機器上 reported/expected 完全一致(2240×1435),drift=0——證實原生視窗框下 Tauri 的 DPI 換算本身是對的,稍早查到的落差只出現在已棄用的自訂標題列(decorations:false)路徑。
date: 2026-09-14
---

# 2026-09-14 新增 dpi_guard 自動偵測縮放模組

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260914_native_decorations_revert_confirmed_fix|同日稍早改回原生框的日誌]]

## 🎯 目的

使用者裁決改回原生視窗框之外,另外提出「需要一個可以自動偵測並縮放的模組」——對應的是
這幾篇日誌一路挖出來的核心疑點:這台機器 175% DPI 縮放下,視窗實際尺寸曾經跟設定檔的邏輯
尺寸 × 縮放比例對不上。

## 🔧 變更內容

新增 `src-tauri/src/dpi_guard.rs`:

- `check_and_correct(window)`:讀目前 `scale_factor()` 與 `inner_size()`,跟
  `MAIN_LOGICAL_WIDTH/HEIGHT`(即 `tauri.conf.json` 設定值)× 縮放比例算出的期望值比較,
  超過 4 物理像素容忍值就用 `set_size()` 強制修正回設定值。**每次檢查都印診斷 log**
  (不只是修正時才印)——這正是這幾天在挖的那個「reported size 跟 scale_factor 算出來的
  對不上」的異常本身,值得每次開機都留一筆記錄,不是修好就沉默。
- `watch(window)`:註冊 `WindowEvent::ScaleFactorChanged` 監聽,涵蓋換螢幕/縮放比例即時改變
  這種**執行期**才會觸發的情況——這跟開機時的檢查是互補的兩件事:`ScaleFactorChanged`
  完全不會在開機當下觸發(那時候「縮放沒有改變」,只是「一開始就設錯」),所以兩個函式
  都要呼叫,漏掉任何一個都補不到另一半的情境。
- `lib.rs` 的 `setup()` 在拿到 `main` 視窗控制代碼後立刻呼叫這兩個函式,發生在
  `splash::spawn_boot_sequence` 之前——避免開機動畫的「長到跟主視窗一樣大」那段動畫,把
  修正前的錯誤尺寸讀進去當成目標值。

## ✅ 驗證方式

- [x] `cargo check`/`cargo build` 皆過(過程中修掉一個 `#[non_exhaustive]` enum variant
      需要 `..` 收尾的編譯錯誤,以及一個未用到的 `Manager` import)
- [x] **直接執行編譯出的 exe**(不透過 `tauri dev` 這層,避免中途搞不清楚是不是真的重新
      編譯——過程中一度被舊背景行程的檔案監看自動重建搞混,直接執行才排除疑慮),擷取真實
      stderr 輸出:
      ```
      [dpi_guard] scale_factor=1.750 reported=PhysicalSize { width: 2240, height: 1435 }
      expected=PhysicalSize { width: 2240, height: 1435 } drift=(0,0)px
      ```
      **drift=0**——原生視窗框下,`inner_size()`(不含原生框線的內容區)跟
      `1280×820 × 1.75` 精確相符。這證實稍早在自訂標題列(`decorations:false`)路徑下量到
      的 ~100×200 物理像素落差,是那個模式特有的問題,不是這台機器/這個 Tauri 版本在
      DPI 換算上普遍算錯——原生框下的換算本身是對的

## 📝 後續待辦

- 這個模組目前只覆蓋「主視窗尺寸」這一種 DPI drift。若之後真的診斷出自訂標題列路徑的根因、
  決定切回去,這個模組的檢查邏輯要重新驗證是否還適用(`inner_size()` 在 `decorations:false`
  下量到的可能是不同的東西,見前兩篇日誌)。
- `MAIN_LOGICAL_WIDTH`/`HEIGHT` 目前是寫死常數,跟 `tauri.conf.json` 的值各存一份、沒有
  單一真實來源——尺寸若之後在設定檔裡改動,這裡要記得同步改,沒有編譯期防呆。
