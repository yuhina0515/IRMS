---
tags: [coding-log, ui, navigation, gemini]
summary: 依 Gemini 第二輪(逐像素文字規格)重建側邊欄為固定寬度貼邊導覽軌,捨棄整塊填色 active 狀態
date: 2026-09-05
---

# 2026-09-05 變更日誌 — 側邊欄改版(Gemini 02 號簡報,第二輪)

> **相關文件**:[[HOME|導覽首頁]] ·
> [[log_20260905_titlebar_visual_gemini_mockup|第一輪失敗診斷]] ·
> `doc/gemini-handoff-20260905/02-navigation.md`

## 🎯 目的

延續[[log_20260905_titlebar_visual_gemini_mockup|前一篇]]對「02-navigation 第一輪為何
只回一張不可信的圖」的診斷與重寫,使用者這次把重寫過的指令送出後,Gemini 回了一份
逐像素的文字規格(色碼、間距、字重全部寫死,並附上可直接對照的 TSX/CSS 骨架),
指出目前 `Sidebar.tsx` 視覺表現「像剛學會 CSS 的菜鳥」,active 狀態整塊填色的做法
「廉價」且會干擾 Dashboard 的 bento-grid 數據判讀。按既定慣例
([[feedback_irms_ui_design_delegated_to_gemini]])直接落地,不回頭確認設計本身。

## 🔧 變更內容

- **`.app`/`.app-column` 版面重構**(`tailwind.css`):原本 `.app` 用 `gap-3 px-3 py-4`
  把側邊欄跟主欄一起包成「浮動卡片」風格,現在這份 padding/gap 整個搬進
  `.app-column`,側邊欄變成貼齊視窗左緣的固定軌道(自己的 `border-right`,不再是
  獨立的圓角卡片)。
- **`.sidebar`**:固定寬度 220px(原本 `w-48`=192px),不响应式縮放
  (「死死釘在左側」);`padding: 24px 0`;背景改用新增的 `--sidebar-bg` token。
- **`.sidebar-item.active`**:拔掉整塊 `bg-accent` 填色 + `shadow-glow-accent`,改成
  左側 3px 強調色邊條(`::before` 偽元素)+ 10%→0% 線性漸層淡出的 wash,`color` 改用
  強調色而非深色文字。
- **新增 `.sidebar-brand`**:側邊欄自己的「IRMS」文字識別(純文字,不重複放圖示——
  標題列已經有完整 logo,見程式碼註解)。
- **`Sidebar.tsx`**:加上 `aria-current="page"`;圖示改明確傳 `size={20}`(對齊規格的
  20×20);刻意保留原本「元件自己讀 `useUiStore`」的寫法,沒有照 Gemini 範例改成
  props(`view`/`onNavigate`)傳遞——那需要同步改 `App.tsx` 呼叫端,且與全站其他元件
  (`TopHeader`、`SessionControlPanel`)的既有模式不一致,沒有為了這個元件另立一套的
  必要;CSS Modules 的建議同理不採用,維持與全站一致的 `tailwind.css` `@layer
  components` 寫法。

## 📐 決策(技術落地判斷,非設計優劣判斷)

- **新增 `--sidebar-*` token 而非直接寫死色碼**:Gemini 給的深色主題色碼
  (`#13151A`/`#232730`/`#8A919E`/`#00F5FF`)是全新的、不在既有 token 表裡的值——
  照單全收但包成 CSS 自訂屬性,保留全站「顏色都走 token」的既有慣例,而不是在
  `.sidebar` 規則裡直接寫死十六進位。
- **淺色主題色值是本次改版唯一的推導,不是 Gemini 給的**:這份規格只講深色主題,
  完全沒提淺色。沒有照抄深色的 `#00F5FF`(青色)到淺色,而是沿用既有 Round 2 決策
  (淺色主題刻意用 sky 色系而非 cyan)分配 `--color-accent-strong`;背景則比照深色
  「側邊欄比 `--color-surface` 更深一階、更中性」的關係,推導出淺色版「側邊欄比
  `--color-surface` 更淺一階」(用 `--color-canvas`),維持同一種「軌道與卡片要有
  區隔」的視覺意圖對稱套用到兩個主題。這是唯一一處需要工程判斷而非照抄規格的地方,
  已在 `tailwind.css` 的 token 註解裡寫清楚推導依據。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠,285 個測試全過。
- Playwright 對打包後的 App 做零溢出迴歸檢查(這是自適應版面那次工作反覆踩過的坑,
  側邊欄寬度從 192px 改 220px 屬於會影響版面預算的變更,值得重新確認):四種視窗
  尺寸(1280×820、1093×614、1024×600、1600×900)下 `.main` 的
  `scrollHeight`/`clientHeight`/`scrollWidth`/`clientWidth` 全部吻合,零溢出。
- 深/淺主題各截圖確認:active 項目的左側強調色邊條、漸層 wash、hover 狀態、
  「IRMS」品牌文字、貼邊無圓角的軌道背景皆符合規格。全程零 console/page 錯誤。

## Self-review

檢查情境:「`.sidebar-item.active::before` 用 `left: -12px` 讓邊條伸出按鈕本身的邊界,
貼齊側邊欄的實際左緣——如果之後有人調整 `.sidebar-nav-group` 的 padding(目前
12px),這個寫死的 `-12px` 會不會跟著跑掉、邊條位置錯開?」——確認這是規格本身的
寫法(Gemini 原始 CSS 也是同樣的 `left: -12px` 搭配 group padding 12px 寫死對應),
已在該行加上程式碼註解明確標出兩者的耦合關係,PASS(以目前的 12px padding 值驗證
截圖位置正確;耦合本身是規格既有的技術債,已用註解讓下一個修改者不會踩空,而非
留一個無聲的隱性依賴)。
