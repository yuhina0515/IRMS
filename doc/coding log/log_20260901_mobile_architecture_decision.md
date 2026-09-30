---
tags: [coding-log]
date: 2026-09-01
summary: "使用者提出要準備 Android/iOS 部署,先從 UI 互動邏輯開始。查證發現決定技術路線的硬限制:iOS Safari/WebKit 完全不支援 Web Bluetooth,包括 Capacitor/Cordova 這類 WKWebView 包裝殼,不只是瀏覽器本身。兩條路線(Capacitor 重用現有 React+Tailwind vs React Native 原生重寫)都得重寫 BLE 層,分歧點只在 UI 層要不要共用。使用者選 React Native + react-native-ble-plx,UI 層與桌面版分開各自實作;並裁定手機作業排在桌面版 Phase 4 完成之後才開始。決策記入 ROADMAP.md D5,本次無程式碼變更。"
---

# 2026-09-01 變更日誌 — 行動裝置部署技術路線裁決

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP#D5|行動裝置部署:React Native + react-native-ble-plx,獨立 UI 層]] ·
> [[log_20260901_ui_redesign_phase3_layout|同日:UI 重建 Phase 3]]

## 🎯 請求

使用者在 UI 重建 Phase 3 完成後提出:「我希望可以開始準備 Android 與 iOS 的部屬,但是先從
UI 互動邏輯開始。」

## 🔍 查證

「先從 UI 互動邏輯開始」隱含一個框架假設——寫互動邏輯之前得先知道它是寫在什麼元件模型上
(React Native 的 View/Text,還是 Capacitor 包裝的 DOM/Tailwind)。用 `WebSearch` 查了一個
會直接決定這個選擇的硬限制:**iOS 的 Safari/WebKit 完全不支援 Web Bluetooth API**,而且
這個限制**不只是瀏覽器本身**——任何用 WKWebView 包裝的殼(Capacitor、Cordova)一樣受限,
因為 WKWebView 用的就是同一套 WebKit 引擎。Apple 官方立場是不打算實作,近三年沒有變化
(來源:[caniuse.com/web-bluetooth](https://caniuse.com/web-bluetooth)、
[WebBluetoothCG implementation-status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md))。

結論:**不管選哪條路,BLE 這層在手機上都得重寫**,不可能沿用 Electron 現行的
`navigator.bluetooth`(`bluetoothService.ts`)。真正該問使用者的,不是「能不能沿用桌面版
的連線邏輯」(不能,兩條路都不能),而是「UI 層要不要跟桌面版共用程式碼」。

## 🔧 已完成

用 `AskUserQuestion` 把查證結果攤開後問了兩題:

1. **手機版 UI 層架構**:Capacitor(重用現在 Phase 4 正在建的 React+Tailwind 元件,代價是
   互動手感較接近網頁,BLE 仍要另裝 plugin)vs **React Native + react-native-ble-plx**
   (成熟、被大量驗證過的原生 BLE 方案,真正原生手感,代價是 UI 層要用 RN 元件重寫一遍,
   跟桌面版是兩套獨立程式碼)。**使用者選 React Native + react-native-ble-plx**。
2. **手機作業要不要暫停桌面版 Phase 4**:**使用者選「先完成桌面版 Phase 4 再開始手機」**。

決策寫入 `ROADMAP.md` §一(架構決策)新增 **D5**,格式比照既有 D1–D4(現況/決策表格/後果),
與 D1–D4 放在同一份文件方便日後查詢,不是散落在單次日誌裡才找得到。新增 Task #10
(`Mobile: scope React Native + ble-plx interaction logic`)標記為待辦但阻塞於 Phase 4。

## 🧠 關鍵決策

**兩條路線的比較表把「BLE 都要重寫」列為兩邊共同代價,不是 React Native 獨有的缺點**——
如果只列 Capacitor 這邊「需要重寫」而不提 RN 也一樣要重寫,會誤導使用者以為 Capacitor
在這件事上比較省事,但查證結果是兩邊完全對等,分歧點只在 UI 層。這是先查證才問、而不是
先問再查的價值:少問一個會被查證結果直接推翻的假問題。

**沒有把商業邏輯層(`services/` 底下的純函式,如 triggerEngine/calibration/movementMetric)
列進比較表的分歧項**——不管 UI 層選哪個框架,這層都不受影響、兩邊都能直接 import 使用,
不是這次決策要權衡的變數,列出來只會模糊真正的分歧點。

## ✅ 驗證

純架構決策與文件產出,無程式碼變更,不適用 `npm run ci`。

## 🔎 自我審查

**檢查情境:「iOS Safari 不支援 Web Bluetooth」這個結論,會不會其實只適用於「網頁瀏覽器
分頁」,不適用於「包在原生殼裡的 WKWebView」(理論上原生殼可能有辦法繞過)?**——這正是
會讓整個比較表崩潔的關鍵假設,如果查錯就會把 Capacitor 的可行性判斷完全弄反。查證結果
明確指出限制在 WebKit 引擎本身(iOS 上所有瀏覽器,包括第三方瀏覽器,依 App Store 規則
都必須用 WKWebView/WebKit,不能自帶其他引擎),所以 Capacitor/Cordova 這類 WKWebView
封裝殼**同樣受限,不是繞過瀏覽器沙盒就能解決的問題**。**Pass**——結論適用於題目問的
兩個選項,不是只適用其中一個。

## 📝 後續待辦

- 桌面版 Phase 4(元件重建)是下一個要做的工作,手機端工作在那之後才開始。
- Task #10 目前只是佔位追蹤,React Native 專案本身尚未建立、`react-native-ble-plx` 尚未
  評估實際整合細節(iOS/Android 各自的權限宣告、背景 BLE 行為差異等),留到 Phase 4
  完成後的那一輪再展開。
