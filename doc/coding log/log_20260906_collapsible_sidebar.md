---
tags: [coding-log, ui, navigation]
summary: 側邊欄 IRMS 文字換成收合按鈕,按下後旋轉並收合成僅剩圖示的窄軌;過程中抓到一個 flex-shrink 真實 bug
date: 2026-09-06
---

# 2026-09-06 變更日誌 — 側邊欄收合功能

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260905_sidebar_nav_rail_gemini_round2|前一天的側邊欄改版]]

## 🎯 目的

使用者直接要求(非 Gemini 設計簡報,使用者本人直接下的功能需求):把側邊欄頂端的
「IRMS」文字換成選單按鈕,按下時按鈕旋轉、側邊欄收合成窄軌,並且要有動畫。

## 🔧 變更內容

- **`NavIcons.tsx`**:新增 `MenuIcon`(三條水平線的漢堡選單圖示),風格與既有
  Dashboard/Actions/History/Settings 圖示一致(stroke-based、`currentColor`)。
- **`Sidebar.tsx`**:`.sidebar-brand` 文字換成 `.sidebar-toggle` 按鈕,本地
  `useState<boolean>` 管理收合狀態——刻意不寫進 `useStore`/`settings` persist,
  這是暫態的畫面偏好,不是需要跨重啟記住的設定,沒被要求持久化就不擴大範圍。
- **`tailwind.css`**:
  - `.sidebar` 寬度在 220px(展開)與 56px(收合)之間用
    `transition: width 0.25s var(--motion-ease-mechanical)` 動畫。
  - `.sidebar-toggle-icon.collapsed` 套用 `transform: rotate(90deg)`,同樣的
    mechanical token、同樣 0.25s。
  - 標籤文字沒有另外寫 fade 動畫——`.sidebar` 本身的 `overflow: hidden` 在寬度
    變窄時自然把文字裁掉,效果一致且不用多寫一組動畫。

## 🐛 過程中發現的真實 bug

第一版收合後截圖檢查,發現圖示整個消失、卻能看到每個項目標籤文字的前幾個字
(「Dash」「Acti」「Hist」「Sett」)卡在收合後的窄軌上——跟預期的「只剩圖示」正好
相反。用 `getBoundingClientRect()` 量測後確認:收合後圖示的 `width` 變成 **0**,
標籤文字的 `width` 完全沒變(仍是完整內容寬度)。

根因是這個 session 已經踩過好幾次的 flex-shrink 陷阱的變體:`.sidebar-item` 是
`display:flex`,圖示(`<svg>`)與標籤(`<span>`,帶 `white-space:nowrap`)都是
flex item。收合後容器可用寬度(~15px)遠小於「圖示+間距+標籤」總寬(~105px)。
標籤因為 `white-space:nowrap` 讓它的 flex 自動最小寬度等於完整內容寬度(規格定義,
换行被禁止時 flex item 的自動最小尺寸就是其最大內容尺寸),等於「拒絕縮小」;而圖示
沒有明確設定 `flex-shrink:0`,於是所有必要的縮小量全部落在圖示身上,把它擠壓到
寬度 0。**修法**:`.sidebar-item svg { flex-shrink: 0; }`,圖示固定 20px 不縮小,
換 label 被推出容器邊界外(56px 之後),乾淨地被 `.sidebar` 的 `overflow:hidden`
整段裁掉。

順帶把收合寬度從一開始隨手訂的 64px 微調成精確的 **56px**(= nav-group padding 12
+ item padding-left 12 + icon 20 + item padding-right 12)——64px 時圖示雖然固定住了,
但還是會透出約 8px 的標籤文字殘影(字母的一小截);56px 剛好是圖示完全顯示、標籤
完全裁掉的臨界值,不留任何殘影。

## ✅ 驗證

- `npm run ci`(typecheck + test + build)全綠,285 個測試全過。
- Playwright 對打包後的 App:
  - 量測收合觸發 80ms 後的中間寬度(非兩端值),確認動畫真的在跑而不是瞬間切換。
  - 收合後寬度精確等於 56px、展開後精確等於 220px。
  - 收合狀態下側邊欄仍可正常點擊切換頁面(點 Actions 確認 view 真的換了)。
  - 收合/展開的按鈕旋轉 class 正確切換。
  - 四種視窗尺寸(1280×820、1093×614、1024×600、1600×900)× 收合/展開兩種狀態,
    `.main` 的 scrollHeight/clientHeight/scrollWidth/clientWidth 全部吻合,零溢出
    迴歸。
  - 深/淺主題各截圖確認收合後乾淨的純圖示外觀(無文字殘影),全程零 console/page
    錯誤。

## Self-review

檢查情境:「收合寬度 56px 是根據目前的 padding 數值(12/12/12)反推出來的精確值——
如果之後有人改了 `.sidebar-nav-group` 或 `.sidebar-item` 的 padding,56px 這個
寫死的收合寬度會不會跟著錯開,又開始透出文字殘影?」——這是規格本身寫死數字組合
的技術債(跟 09-05 那次 `.sidebar-item.active::before` 的 `left:-12px` 是同一種
耦合),已在 CSS 註解裡把算式(12+12+20+12=56)明確寫出來,PASS(以目前的
padding 值驗證螢幕截圖零殘影;耦合本身用註解讓下一個修改者不會踩空,而非留一個
無聲的隱性依賴)。
