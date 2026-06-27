# 變更日誌 — IRMS_App v2 從零重寫

## 日期
2026-06-27

## 目的
依使用者要求,將桌面監測端 (IRMS_App) 從零重寫為現代化架構,並修復先前模組化重構時遺失/損壞的功能。原架構為「Vanilla JS 模組 + Express(localhost:3000)+ sqlite3」,本次改為 **Electron + Vite + React + TypeScript + IPC + better-sqlite3**。

ESP32 韌體 (IRMS_Sensor / I2C_Scanner) 與 BLE 通訊協定(UUID、封包格式、CMD 指令)**完全保留不變**,新前端 1:1 相容。

## 重寫前審查發現的問題(本次一併修復)
- 🔴 **超限安全警報遺失**:舊 `TriggerEngine.js` 無超限判定,全前端從未發出 `CMD:ALARM_ON`(Tier 1 安全功能)。
- 🔴 **ERR:1 紅色遮罩成孤兒**:`BluetoothService` 發出 `BLE_HARDWARE_ERROR`/`OK` 但無人監聽;斷線時不凍結畫面、不暫停寫入。
- 🟡 **`restore_defaults` 端點不存在**:前端呼叫但後端無此路由,按鈕 404。
- 🟡 **`TriggerEngine` 死訂閱** `BLE_ANGLES_UPDATED`(從未被 emit)。
- 🟡 **`notificationCounter` NaN**:state 無初始值導致節流日誌失效。
- 🟡 **`action` 欄位資料模型混淆**:存名稱卻以 id 比對。
- 🟢 DOM/state 雙真實來源、`window._currentTargetArcD` 全域變數、Toast/卡片 innerHTML XSS、`sqlite3 ^6.0.1` 版本可疑。

## 新架構(目錄)
```
IRMS_App/
  electron.vite.config.ts        建置設定(main/preload/renderer)
  tsconfig.{json,node,web}.json  專案參考式 tsconfig
  electron-builder.yml           打包設定(better-sqlite3 asarUnpack)
  src/
    shared/      protocol.ts(BLE 協定+解析) types.ts(DB 模型+IrmsApi)
                 ipc.ts(頻道常數) defaults.ts(預設動作)
    main/        index.ts(視窗+BLE 自動配對) db.ts(better-sqlite3) ipc.ts(handlers)
    preload/     index.ts(contextBridge → window.irms) index.d.ts
    renderer/    index.html
      src/       main.tsx App.tsx
        store/   useStore.ts(Zustand+persist) useUiStore.ts(toast/confirm/view)
        services/bluetooth.ts triggerEngine.ts sessionController.ts
        components/ Sidebar ToastHost ConfirmDialog ErrorOverlay
                    ProgressRing AngleVisualizer LiveChart SessionControlPanel
        views/   DashboardView ActionsView HistoryView SettingsView
        styles/  global.css
```

## 主要架構決策
1. **移除 Express/localhost**:改用 Electron IPC + `contextBridge`,renderer 以型別安全的 `window.irms.*` 取代 `fetch`。消除 CSP connect-src、連接埠衝突、`startServer` race。
2. **better-sqlite3(同步)取代 sqlite3**:擺脫可疑版本;DB 改存 `app.getPath('userData')`,不再置於專案樹(原 `irms.sqlite` 已移除)。
3. **單一真實來源**:Zustand store 取代 StateManager + DOM input 雙來源;`applyCalibration` 集中校準邏輯。
4. **TriggerEngine 純狀態機**:注入事件回呼,**重新實作超限安全警報**(`target+tol+10°`,對齊 §4.4),三種 triggerType 各有對應超限判定。
5. **ERR 處理復原**:`bluetooth.ts` 收到 `ERR:` 即設 `hardwareError`、停止餵入角度(自動暫停寫入);`ERrorOverlay` 全螢幕紅色遮罩;恢復正常封包即自動解除。
6. **資料模型修正**:sessions 改存 `actionId`(數字)+`actionName`(名稱快照),歷史顯示不再對不上。
7. **XSS 根除**:React 預設以文字節點渲染,無 innerHTML 注入點。

## 執行動作摘要
- 重寫 `package.json`(electron-vite/react/ts/better-sqlite3/zustand/chart.js)。
- 新增上述 29 個原始檔。
- 刪除舊版:`public/`、`routes/`、`main.js`、`server.js`、`db.js`、`extract_views.py`、`start.bat`、`package-lock.json`、`irms.sqlite`(皆保留於 git 歷史 commit 29618de)。
- 更新根 `.gitignore`(忽略 `out/`、`release/`、`*.sqlite`)。
- 同步更新 `doc/README.md`、`doc/PROJECT_STATUS.md`。

## 待辦 / 尚未驗證
- 依使用者指示**尚未執行 `npm install`**;裝置不在手邊,BLE 即時連線與韌體回饋尚待實機驗證。
- better-sqlite3 為原生模組,首次安裝需 `electron-rebuild`(已設為 postinstall)。
- 建議後續以模擬資料注入 store 進行 UI 端對端測試。
