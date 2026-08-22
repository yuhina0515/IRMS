---
tags: [coding-log]
summary: "落地 2026-08-12 會議裁決第 2、3 項——Session 進行中凍結校準,並把當場生效的轉換以單一 JSON 欄位快照在 sessions 列上(migration 6)。CALIBRATION_KEYS 定義哪些設定參與 (raw − zeroRaw) × sign,setSettings 在 session.running 時丟棄並留下日誌,UI 端把精靈入口/快速歸零/進階手動欄位一併停用並顯示原因;sessionController 於開場擷取一次快照,db 層只當字串存放。History 分析 modal 比對漂移並警示、CSV 帶出快照,比對刻意只涵蓋會改變算式的欄位以免「重跑精靈得到相同數值」誤報。CALIBRATION_KEYS 與 CalibrationSnapshot 由編譯期斷言鎖成等價。147→163 tests,npm run ci 全綠;尚未實機驗證。"
date: 2026-08-22
---

# 2026-08-22 變更日誌 — Session 中凍結校準 + 校準快照(migration 6)

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[ROADMAP|架構與代碼計畫]] ·
> [[log_20260812_meeting_calibration_ui_plan|2026-08-12 校正與 UI 計畫會議]] ·
> [[log_20260814_offset_zeroraw_reparam|2026-08-14 offset 重新參數化]]

## 🎯 目的

接續 [[log_20260814_offset_zeroraw_reparam|08-14]],把 [[log_20260812_meeting_calibration_ui_plan|08-12 會議]]
裁決順序的第 2、3 項一次做完:**先凍結,再快照**。

`sensor_data` 只存校準後的數值,而產生那些數值的仿射轉換活在 localStorage,會被下一次校準
就地覆蓋。後果不是資料變髒,是資料**變得無法解讀**:錄了 20 場,第 21 場才發現 `shinInvert`
反了、重跑精靈,前 20 場沒有任何東西說明它們由哪一組轉換算出,連「往前抬還是往後擺」都無法
回推。

凍結是快照的**前提而非潔癖**。`sessions.calibration` 是「一場一個」的單一快照,唯有轉換在
一場之內不可變,它才為真;08-12 會議對兩段式串流實測過,允許中途改校準時單一快照最壞可差
**57°**。

對應 GitHub issue [#4](https://github.com/yuhina0515/IRMS/issues/4)(已關閉)。

## 🔧 變更內容

- **`store/useStore.ts`——凍結**
  - 新增 `CALIBRATION_TRANSFORM_KEYS`:真正參與 `(raw − zeroRaw) × sign` 的 10 個欄位
    (四軸的 `*ZeroRaw` / `*Invert` 加兩個 `*AxisSwap`)。
  - 新增 `CALIBRATION_KEYS = [...TRANSFORM_KEYS, thighRollVerified, shinRollVerified,
    lastCalibratedAt]`:凍結與快照的完整集合,後三者不改變算式但屬於「這場是怎麼校出來的」
    存證。`protocol` / `maxChartPoints` / `flushIntervalSec` 刻意不在此列——它們不改變角度算法。
  - 抽出 `splitCalibrationPatch(patch)` 純函式,把一筆 patch 拆成 `allowed` / `frozen`。
  - `setSettings` 在 `session.running` 時丟棄 `frozen` 欄位並 **`log()` 說明丟了哪些**,而非
    靜默忽略——靜默失敗正是本專案反覆抓到的那類缺陷。
- **`views/SettingsView.tsx`——真正的防線在 UI**
  - `calibrationLocked = session.running`:精靈入口、快速歸零、全部進階手動欄位在進行中停用
    並顯示原因,比照既有的「未連線」停用樣式。store 的守衛是最後一道,擋繞過 UI 的路徑。
- **`main/migrations.ts`——migration 6**
  - `ALTER TABLE sessions ADD COLUMN calibration TEXT;`
  - 刻意用**單一 JSON 欄位**而非逐欄位攤平:校準欄位仍在演進(v1.0.1 的 `offset` → v4 的
    `zeroRaw` 就是一次),攤平會讓每次改欄位都得再開一個 migration;這個欄位是存證,不是
    查詢維度。
  - **舊列留 NULL**:那些 session 確實沒有轉換紀錄,回填今天的設定等於斷言一件沒有根據的事。
  - 08-12 會議否決的 `sensor_data` 四個原始角度欄位維持否決:三方實跑證明轉換可逆,
    +54MB/百場買到零資訊。
- **`services/sessionController.ts` / `main/db.ts`——寫入**
  - 開場擷取一次 `buildCalibrationSnapshot(state.settings)`;凍結保證這對整場成立。
  - db 層只把它 `JSON.stringify` 後存放,主進程不解讀內容。序列化放在 db 層而非呼叫端,
    是為了讓 renderer 送出的仍是型別化物件而不是誰都能塞的 string。
- **`services/calibration.ts`——型別鎖與比對**
  - `buildCalibrationSnapshot` 從 `CALIBRATION_KEYS` 迴圈填值,不手抄第二份清單。
  - `_AssertKeysMatch` 編譯期斷言把 `CALIBRATION_KEYS` 與 `CalibrationSnapshot` 鎖成等價:
    只加其中一邊會變成 build error,而不是一個安靜漏掉某個會動到角度的欄位的快照。
  - `calibrationDrift(snapshot, settings)` **只比 `CALIBRATION_TRANSFORM_KEYS`**。
- **`views/HistoryView.tsx`——存了沒人讀就不改變任何決定**
  - 分析 modal 在漂移時警示「這場的校準與目前設定不同(…),曲線的零點或正負方向可能…」。
  - CSV 匯出帶出 `# calibration,…` 供離線分析。
- **`shared/types.ts`**:`Session.calibration: string | null`,新增 `CalibrationSnapshot` 介面。

## 🧠 關鍵取捨

**漂移比對為何排除 `lastCalibratedAt` 與 `*Verified`?** 把它們算進差異,會讓「重跑一次精靈、
結果數值完全一樣」這個最常見的情況每次都跳出「校準已改變」。一個不存在的問題每次都響,真正
的方向錯位就會被當成雜訊略過。已附迴歸測試,對著天真的整物件比較會失敗。

## ✅ 驗證方式

- [x] `npm run ci` 全綠:typecheck(node + web)、`vitest run` **163 passed / 14 files**、
      `electron-vite build` 成功。**147 → 163 tests**。
- [x] 編譯期斷言確實會擋:刪掉 `CALIBRATION_KEYS` 其中一個 key,build 失敗。
- [x] 漂移比對的迴歸測試:對著「比整個 snapshot」的天真實作會失敗,只比 transform keys 才過。
- [ ] **尚未實機驗證**。凍結的 UI 停用態與 History 警示都只在 vitest / 純函式層驗過,
      未在真裝置連線的 session 中操作過(見 issue [#3](https://github.com/yuhina0515/IRMS/issues/3))。

## 📝 後續待辦

- 08-12 會議裁決的第 4 項「縮小版零位檢查」尚未動工。
- 實機:在真 session 中確認校準入口確實不可按、結束後 History 讀得到快照。
