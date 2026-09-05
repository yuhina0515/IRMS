---
tags: [coding-log, ui, titlebar, gemini]
summary: 依 Gemini 提供的標題列視覺對照圖(深/淺主題各一張),把視窗控制鈕的閒置/hover 色改用語意 token
date: 2026-09-05
---

# 2026-09-05 變更日誌 — 標題列視覺 token 對齊(Gemini 圖片參考)

> **相關文件**:[[HOME|導覽首頁]] · `doc/gemini-handoff-20260905/01-titlebar.md`

## 🎯 目的

使用者貼了兩張圖(深色/淺色主題各一張,標註「那兩張圖是 Gemini 給的」),內容是
`TopHeader`/`WindowControls`(已於 09-04 完成的自訂標題列)的視覺對照,附帶
literal 的 token 標註:閒置圖示顏色標「text-dim」、關閉鈕 hover 標「danger」、
淺色主題的發光 token 給出的十六進位值(`#020617`/`#020117`,接近純黑)印證本專案
既有慣例——發光效果只在深色主題有意義,淺色主題下這兩個「glow token」實際上只是
一般深色文字,而非真的發光。

## 🔧 變更內容(`tailwind.css`)

- `.window-btn` 閒置顏色:`text-text-muted` → `text-text-dim`(圖片明確標註
  「Icon Deck: icon: text-dim」)。
- `.window-btn-close:hover`:原本寫死 Windows 風格的 `#e81123`/`#ffffff`,改用
  `bg-danger text-canvas`(語意 token,圖片標註「Hover: danger」)。寫死色碼的
  問題是它完全不會隨淺/深主題切換——`--color-danger` 在深色主題是
  `#f87171`(珊瑚紅),淺色主題是 `#b91c1c`(較深的紅),而 `#e81123` 兩種主題下
  都是同一個 Windows red,與其他所有 danger 色元件(`.btn-danger` 等)不一致。

## 📐 決策

- 只落地了圖片裡「可以直接對應到現有元件、且有明確語意標註」的兩項改動。圖片同時
  附了一個「0.75rem」的間距標註,但無法確定它精確對應哪個元素的哪個屬性(padding?
  按鈕間 gap?與視窗右上角的距離?),而目前的視窗控制鈕刻意採用「緊貼視窗右上角」
  的 Windows 慣例(使用者滑鼠甩到螢幕最角落就能點到關閉鍵,這是作業系統層級的操作
  肌肉記憶,見既有的 `.window-controls` 註解),貿然加間距有弄壞這個慣例的風險,
  因此这一項先不猜測實作,留待使用者或 Gemini 給出更明確的說明。
- 使用者同時貼的第二張圖(側欄導覽 + Dashboard 卡片版面)內容含有明顯的 AI 圖像生成
  雜訊文字(如「Blocatooth」「Lass Channes 21mt 61ms」「Hawheart」等不存在的裝置/
  欄位名稱),無法從中萃取出可執行的具體規格——不同於前三份簡報(標題列/動畫/自適應
  版面)都附有精確的文字規格可以逐項對照實作。這張圖暫不動工,已回頭跟使用者確認
  是否還有配套文字說明。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠,285 個測試全過。
- Playwright 對打包後的 App 截圖比對(深色主題閒置/關閉鈕 hover 狀態、淺色主題),
  確認閒置圖示顏色與關閉鈕 hover 背景色符合預期,視覺上與 Gemini 提供的兩張參考圖
  一致。

## Self-review

檢查情境:「`bg-danger text-canvas` 這組語意 token 在深色主題下,珊瑚紅背景
(`#f87171`)配近黑文字(`--color-canvas` 深色主題值 `#020617`)的對比度,圖示是否
仍然清楚可辨?」——實際截圖比對(見上方驗證)確認 X 圖示在珊瑚紅底色上清楚可見,
且這組 `bg-danger`/`text-canvas` 搭配已是全站 `.btn-danger` 既有的既定寫法
(`button.btn` 基底已定義 `text-canvas`,`.btn-danger` 只疊加 `bg-danger`,兩者
相同組合已在其他地方通過先前的對比度檢查),並非新引入未經驗證的配色。
