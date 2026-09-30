---
tags: [coding-log, ui, electron]
summary: "自訂視窗標題列(frame:false 取代 titleBarOverlay,順便解掉 RDP 卡死的舊限制)、Dashboard 趨勢圖/3D-2D 姿態預設收起、修一個連帶浮現的 17.6px 溢出迴歸、整理 4 份分開的 Gemini 設計需求草稿"
date: 2026-09-05
---

# 2026-09-05 變更日誌 — 自訂標題列、預設收起面板、Gemini 需求草稿

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260904_ble_ota_implementation|前一日:BLE OTA 實作]]

## 🎯 目的

使用者一次提出 8 點需求(GitHub 自動更新、多平台排版多樣性、Dashboard 面板預設收起、
自適應系統、內外翻預設關閉的原因、標題列與 OS 按鈕重疊、標題列可拖曳、把設計工作分批
交給 Gemini)。本檔記錄其中已完成實作的部分;GitHub 自動更新排入下一個任務;IA/視覺
設計相關的部分依專案既有慣例整理成 Gemini 需求草稿,不由本檔自行決定設計。

## 🔧 Dashboard 面板預設收起

- `useStore.ts` 新增 `showTrendChart`/`show3D2DPose`(persist v8→v9),兩者預設 `false`。
- `DashboardView.tsx`:趨勢圖分頁不在可見清單時,分頁切換 UI 整個不渲染(不留一個
  單項分頁列);3D/2D 姿態關閉時右欄整個不渲染,`.cockpit` 改掛 `cockpit-single` class
  收成單欄,而不是留一張空卡片。

## 🐛 連帶浮現的溢出迴歸(17.6px)

改動後用隔離 Playwright 啟動實測(而非只讀程式碼推論),在真正的預設視窗尺寸
(1280×820)量到 `scrollHeight(708) > clientHeight(691)`。深入量測發現:`.cockpit` 的
`min-height: min(260px, 30vh)` 下限,從沒把「首次啟動、尚未校準」才會出現的
`calib-chip` 警示 banner(約 61px)算進去——這個下限在原本兩欄版面剛好夠用,拿掉
一整欄內容之後仍然定死沒有跟著調整,而 30vh 在 1280×820 這個尺寸下(可用高度 784px)
算出的 235px 剛好比實際可用空間多 17.6px。改為 `min(200px, 24vh)` 後重新量測,
`scrollHeight === clientHeight`,兩種狀態(預設收起 / 兩個設定都重新開啟)皆確認為零
捲軸。這個修法本身也只是換一個手選數字——已記入下面的 Gemini adaptive-layout 需求
草稿,不假裝這是長久解法。

## 🔧 自訂標題列(frame:false)

- **問題**:使用者截圖顯示原本的 `titleBarOverlay`(OS 疊層繪製的原生最小化/最大化/
  關閉鈕)跟 App 自己畫的頂部列視覺重疊。
- **改法**:`main/index.ts` 的 `BrowserWindow` 選項從 `titleBarStyle:'hidden' +
  titleBarOverlay` 改成 `frame:false`——連 OS 疊層都不畫,`TopHeader.tsx` 自己畫
  最小化/最大化(還原)/關閉三顆按鈕與拖曳列(`-webkit-app-region:drag`,按鈕/輸入
  元件個別標回 `no-drag`),雙擊拖曳列可切換最大化/還原。
- **新 IPC**(`window:minimize`/`toggleMaximize`/`close`/`isMaximized`/
  `hasCustomTitlebar`/`maximizedChanged`):`minimize`/`toggleMaximize`/`close`/
  `isMaximized` 用 `BrowserWindow.fromWebContents(event.sender)` 取得目前視窗,不用
  額外傳遞視窗參照;`maximizedChanged` 是 main→renderer 的推播頻道(這個專案第一次用
  這個模式,先前所有 IPC 都是 renderer 發起的 invoke/handle)。
- **意外解掉一個舊限制**:原本的 `titleBarOverlay` 在這台機器的 RDP session
  (`SESSIONNAME=RDP-Tcp#0`)下會讓 DWM 合成卡死(2026-08-28 記錄),當時的因應是
  RDP session 整個退回原生視窗框。`frame:false` 走的是完全不同的路徑(不疊層、
  根本不畫系統框),理論上不會踩到同一顆雷。**沒有停在理論假設**——直接在同一台機器、
  同一個當初壞掉的 RDP session 裡,用一個臨時的環境變數繞過 RDP 分支重跑三次啟動,
  全部正常(視窗顯示、IPC 正常互動、最大化/還原 round-trip 正確),驗證後把 RDP
  特例整個拿掉,兩套邏輯合併成一套。GPU 加速停用(該問題的第二道防線,與 DWM
  疊層無關)維持不動。
- `window:hasCustomTitlebar` 這個 IPC 沒有跟著拿掉,故意保留、桌面版固定回傳
  `true`——留給使用者規劃中的 Android/iOS/iPadOS/watchOS 平台未來查詢用(那些平台的
  window chrome 概念完全不同)。

## 📝 Gemini 設計需求草稿(不由本次自行決定視覺設計)

`doc/gemini-handoff-20260905/` 新增 4 份獨立需求(格式比照
`doc/gemini-handoff-20260902/PROMPT.md`),依使用者「分多個對話請求」的要求分開:

1. `01-titlebar.md`——新標題列的視覺設計(功能已完成,這份只問長相)。
2. `02-navigation.md`——側邊導覽視覺設計。
3. `03-animations.md`——既有動畫語言(liquid-knob 拖曳指示器、dropdown 開合、
   toast/dialog)的audit + 調整建議,不是從零設計。
4. `04-adaptive-layout.md`——本次最大的一份,把使用者 #2(任何視窗尺寸都不要捲動、
   為未來多平台鋪路)與 #4(需要一套系統,不要一直手調數字)兩點合併成一份,明確點出
   今天這次 17.6px 迴歸就是「手調數字打地鼠」問題的具體案例,要求 Gemini 給出可轉譯
   成程式碼的公式/breakpoint 定義,而不是再一份「大概怎麼調」的描述。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + 285 tests + build)全綠,兩個 commit 各跑過一次。
- [x] 隔離 Playwright 啟動實測(非僅程式碼推論):
  - 預設收起面板後量到真實的 17.6px 溢出,修正後 `scrollHeight===clientHeight`,
    兩個設定都重新開啟的情境也重新量測確認零捲軸。
  - 自訂標題列在(繞過後的)RDP session 下三次啟動皆正常,`.window-controls` 實際
    存在且可點擊,最大化/還原按鈕的 round-trip 正確反映在 `isMaximized()`。
  - 深色/淺色雙主題各截圖一次確認標題列視覺正常、無重疊。
- [x] 每次改動後都清掉暫裝的 `playwright-core`,不留在 `package.json`/`package-lock.json`。

## 📝 後續待辦

- 4 份 Gemini 需求草稿尚未實際送出——使用者需要自己開對話貼過去,拿到回覆後依專案
  既有慣例(UI 設計交給 Gemini,不回頭找使用者做設計核可)直接實作。
- GitHub 自動更新(使用者 #1)排入下一個任務,尚未開始。
- OTA 硬體驗證(前一日 log 記錄的 B4/D1/D2)仍在等 Harold 回報,與本次改動無關,
  互不阻塞。
