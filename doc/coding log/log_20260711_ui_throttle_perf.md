---
tags: [coding-log]
date: 2026-07-11
summary: "UI 效能:25Hz 封包流以 80ms 尾緣節流同步 UI(重繪減半),angles+holdProgress 合併單一 set;rawAngles 維持全速餵校準精靈;71 tests 全綠+dev 煙霧測試"
---

# 2026-07-11 變更日誌 — UI 節流(修復 app 卡頓)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260711_trigger_stability|前置:判定穩定化]]

## 🎯 目的

使用者回饋功能正常但「app 有一點卡」。熱點分析:

- LiveChart 註解自述按 **10Hz** 設計,但韌體實際推 **25Hz**——每筆封包做一次
  chart.update + 整個 Dashboard React 樹重繪 25 次/秒。
- holding 階段 `holdProgress` 每筆再 patch 一次 session → store 寫入翻倍。

## 🔧 變更內容

1. **`services/uiThrottle.ts`(新增)** — `createTrailingThrottle`:尾緣節流,
   推送上限 1000/intervalMs Hz、**最後一筆保證送達**(資料流停止時 UI 不卡舊值)、
   `cancel()` 供邊界事件直寫精確值前丟棄 pending。
2. **`sessionController`** — 單一 UI 同步點:`uiSync`(80ms ≈ 12.5Hz)把
   `angles + pendingHold` 以新 store action `syncLiveFrame` **合併為一次 set**(一次重繪)。
   判定引擎與 DB 緩衝**不經節流,仍吃全速 25Hz**。
   邊界事件維持即時且防蓋回:rep(100)/rest(0)/硬體錯誤/Session start/end 皆
   `uiSync.cancel()` + 清 `pendingHold` + 直寫精確值。
3. **`useStore`** — `setAngles(angles, raw)` 拆為:
   - `setRawAngles(raw)`:**全速**(校準精靈 3 秒內要收 30 筆 rawAngles,不可節流);
   - `syncLiveFrame(angles, hold)`:節流入口;hold 同值時保留 session 物件參照,不觸發重繪。
4. **`bluetooth.ts`** — 每封包:setRawAngles(全速)→ 平滑 → onAnglesReceived(判定管線);
   不再直接寫顯示用 angles。

## 🧠 關鍵決策

- **節流放 sessionController 而非各元件**:單一減壓閥,下游(量表/圖表/3D/教練提示)
  自動受惠;LiveChart/Leg3D 的命令式訂閱不需改。
- **80ms(12.5Hz)**:符合 LiveChart 原設計假設;EMA 平滑後 12.5Hz 顯示肉眼無感;
  maxChartPoints 50 下圖表時間窗由 2s 延長為 4s(視覺上更好讀)。
- **尾緣保證**是安全需求:BLE 停流時最後一筆必須上畫面,否則凍結在舊值。
- 蓋回情境已逐一處理:結束 Session 瞬間節流閥殘留的進度(如 42%)若不 cancel,
  會在 80ms 後蓋回已歸零的畫面——start/end/rep/rest/ERR 五處皆清。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck + **71 tests**(新增 5 節流 + 2 syncLiveFrame)+ build
- [x] `npm run dev` 煙霧測試:開窗正常、無 renderer 錯誤(僅 DevTools 內部雜訊)
- [x] 自我審查情境:End Session 瞬間 pending 進度蓋回(已 cancel)、
      BLE 停流最後一筆送達(trailing 測試鎖定)、精靈取樣速率不受節流影響(rawAngles 全速)
- [ ] 📡 實機:確認卡頓改善;校準精靈 3 秒取樣仍收滿 30 筆;量表/3D 視覺無明顯降格

## 📝 後續待辦

- 若實機仍卡:下一個熱點是 Leg3D(rAF 持續 60fps 渲染 + OrbitControls damping),
  可改 on-demand 渲染;以及 SettingsView 開啟時 rawAngles 25Hz 重繪。
- LiveChart 每點 `toLocaleTimeString`(Intl 呼叫)可換手動格式化(12.5Hz 下影響小)。
