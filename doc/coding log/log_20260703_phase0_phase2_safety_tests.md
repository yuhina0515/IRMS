---
tags: [coding-log]
date: 2026-07-03
summary: "ROADMAP Phase 0 安全收尾(ERR 強制關回饋、斷線自動 End Session)+ Phase 2 導入 Vitest 22 項單元測試與 npm run ci"
---

# 2026-07-03 變更日誌 — Phase 0 安全收尾 + Phase 2 測試基建

> **相關文件**:[[HOME|導覽首頁]] · [[ROADMAP|架構與代碼計畫]] · [[log_20260703_architecture_audit_fixes|前置:審查修復日誌]]

## 🎯 目的

執行 [[ROADMAP]] 的 Phase 0 兩個無需硬體項目與 Phase 2 的 Vitest 導入。

## 🔧 變更內容

### Phase 0 — 安全收尾
1. **ERR 時主動關閉硬體回饋**(`sessionController.ts`)
   - 訂閱 `hardwareError` 由 null 轉非 null 的瞬間:重置 TriggerEngine、
     **繞過去重快取**強制下發 `LED_OFF` + `ALARM_OFF`(硬體實際狀態未知)。
   - 解決:I2C 脫落瞬間蜂鳴器若正在長鳴,會永遠卡在作動狀態。
2. **斷線時安全收尾 Session**(`bluetooth.ts` + `sessionController.ts`)
   - `BluetoothService` 新增 `onConnectionLost` 回呼,於**手動斷線**與
     **自動重連 5 次耗盡**兩個「確定失守」時機觸發。
   - `sessionController.handleConnectionLost`:Session 進行中則自動
     `endSession()`(停計時器 → flush 緩衝 → 寫入 endTime/reps)。
   - 解決:斷線後 Session 懸空、緩衝資料遺失。

### Phase 2 — 測試基建
- 導入 **Vitest 4**(`vitest.config.ts`,alias `@shared` 與 electron-vite 對齊)。
- 新增 22 項單元測試,3 個測試檔:
  - `shared/protocol.test.ts`:6 軸/3 欄/衍生欄位忽略/TR 前綴不被 T 誤吃/ERR/malformed/舊格式。
  - `services/triggerEngine.test.ts`:達標完整循環(進區→維持→rep→休息)、提早離區歸零、
    超限警報邊界(恰在 `target+tol+10` 不觸發)、reset 解除警報、segment 判定與膝直門檻。
  - `store/useStore.test.ts`:`applyCalibration`(反相先乘後加偏移、raw 保留)、
    `reconcileSelection`(保留/跨協定改選/刪除改選/清空)。
- `reconcileSelection` 加 export 供測試。
- `package.json` 新增 scripts:`test`、`test:watch`、**`ci` = typecheck + test + build**。

## ✅ 驗證方式

- [x] `npm run test`:22/22 通過
- [x] `npm run ci`:typecheck(node+web)+ test + build 全綠
- [ ] 📡 實機:ERR 觸發時蜂鳴器確實停止;斷線後 History 可見自動收尾的 Session

## 📝 後續待辦

- Phase 1 文件對齊(README §3/§4 改 App-Driven 現況)
- Phase 2 剩餘:ESLint + Prettier、ErrorBoundary、DB migration(`user_version`)
