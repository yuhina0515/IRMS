---
tags: [coding-log, settings, auto-update]
summary: 新增 Settings 開關讓使用者自行決定要不要接收 beta 版自動更新推播
date: 2026-09-07
---

# 2026-09-07 變更日誌 — Beta 更新推播改為使用者可選

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260906_beta2_release|beta.2 發版日誌]]

## 🎯 目的

使用者直接要求:「軟體更新的部分讓使用者自行選擇是否要推送 beta 版本」。在此之前,
`electron-updater` 的 `allowPrerelease` 完全交給它自己的預設規則(目前安裝版本本身
含 prerelease tag 就自動視為 true)——沒有任何介面讓使用者主動選要不要繼續收 beta。

## 🔧 動作

- `useStore.ts` 的 `Settings` 新增 `allowBetaUpdates: boolean`,預設 `true`(維持這個
  App 至今唯一釋出管道的既有行為,不讓現有 beta 安裝在什麼都沒做的情況下突然停止
  收到更新);persist version 9 → 10,並補上對應的 migrate 回歸測試。
- `shared/ipc.ts` 新增 `UPDATE_SET_ALLOW_PRERELEASE` channel;`preload/index.ts`、
  `shared/types.ts` 的 `IrmsApi.updates` 對應加上 `setAllowPrerelease(allow)`。
- `main/updater.ts` 註冊這個 handler(與 `getCurrentVersion`/`checkNow` 一樣,不受
  dev-mode 的 `ENABLED` 開關限制,一定要能被呼叫),收到值就直接寫入
  `autoUpdater.allowPrerelease`。
- `App.tsx` 頂層加一個 `useEffect`,依 `settings.allowBetaUpdates` 一有值就呼叫
  `setAllowPrerelease`——不只在 Settings 頁才送,因為開機 5 秒後的自動檢查
  (`CHECK_DELAY_MS`)不管使用者當下停在哪一頁都會觸發。
- `SettingsView.tsx` 的軟體更新面板加上「接收 Beta 版更新」開關。

## 📐 決策

- 預設值選 `true` 而非 `false`:這個 App 目前唯一的發布軌道就是 beta(`1.1.0-beta.x`
  一路發到現在),預設關閉會讓現有唯一的實際使用者(開發者本人)裝上這個版本後
  自動更新突然停擺,得自己想到要去 Settings 開回來——這不是使用者要的行為,他要的
  是「可以選」,不是「預設關掉」。
- 沒有做 tri-state(自動/開/關):`electron-updater` 本身已經有一個基於目前版本
  推導的預設值,但一旦使用者在 Settings 裡動過這個開關,就沒有再回到「自動」的
  UI 入口——評估後認為單純 boolean 已經完整滿足「讓使用者自行選擇」這個要求,
  三態會是這次沒人要求的額外複雜度。
- main 沒有自己的獨立設定儲存,`Settings` 全部活在 renderer 的 zustand persist
  (localStorage)——選擇讓 renderer 開機時主動把值 push 給 main,而不是讓 main
  去讀 localStorage(那需要繞過 contextIsolation 手動解析 leveldb,複雜度不成比例)。
  zustand 的 `persist` 用同步 storage,store 建立時就已經水合完成,renderer 頂層
  effect 送出的時機遠早於 updater.ts 的 5 秒延遲,不需要額外的「main 準備好了嗎」
  握手。

## ✅ 驗證

- `npm run typecheck`:通過。
- `npm run test`(含新增的 v9→v10 migrate 回歸測試):26 個測試檔、286 個測試全過。

## Self-review

檢查情境:「使用者現在裝的就是 beta.2,如果預設值選錯(例如選 false),下一次
啟動會不會突然收不到任何更新推播,而使用者毫無所覺?」——確認預設值是 `true`,
且 `migrateSettings` 對舊版(v9 以前)persist 資料也補上 `allowBetaUpdates: true`
(見新增的回歸測試),PASS:任何既有安裝升級到這個版本後,自動更新行為與此次
改動之前完全一致,唯一差異是多了一個可以主動關掉的開關。
