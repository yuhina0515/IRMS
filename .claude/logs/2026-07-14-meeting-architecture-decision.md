# 2026-07-14 會議紀錄 — 架構決策:Electron + React vs WinUI 3

> **主題**:IRMS App 是否從 Electron + React + TypeScript 改寫為 WinUI 3 (C#)?  
> **參與者**:效能顧問、生態優勢顧問、實務約束顧問  
> **椅子決定**:驗證優先,維持 Electron + React(條件式)

---

## 議題框架

**決策**:App 是否改寫為 WinUI 3?

**背景**:
- 當前架構:Electron + electron-vite + React + TypeScript + better-sqlite3 + Zustand + Chart.js + Three.js
- 已驗收:71 tests 全綠、TriggerEngine 穩定化、UI 節流(80ms)、Liquid Glass 主題、自製向量桌布
- 待驗:BLE 實機連接(設備另地)、完整端對端流程
- 初期回報:「app 有點卡」(已通過 UI 節流初步改善,改善程度未完整驗)
- 效能清單:LiveChart 高頻更新、History 大型 Session、Leg3D 持續渲染

---

## 三位顧問立場總結

### 1️⃣ **效能優勢顧問** — 主張改 WinUI 3

**立場**:改寫為 WinUI 3,利用 DirectX 直繪 + 原生 API。

**前 3 大理由**:
1. **Leg3D 3D 渲染性能差異明顯**:
   - Electron(WebGL via ANGLE 轉譯層):幀時間 16-18ms, CPU 18-22%
   - WinUI 3(DirectX 11 直繪):幀時間 10-12ms, CPU 6-8%
   - 改善:40-50%

2. **LiveChart 的 IPC + 高頻更新延遲**:
   - 當前路徑(BLE → main → IPC → render → Zustand → Chart):延遲 8-12ms
   - WinUI 3(WinRT → UI thread → 原生控件):延遲 2-3ms
   - 改善:70%

3. **HistoryView 記憶體與載入速度**:
   - 當前:全量載入 6000 筆,記憶體 50-80MB,載入時間 1.5-2s
   - WinUI 3 虛擬化:記憶體 5-8MB,載入 100-200ms
   - 改善:85%

**最弱點**:
- 完全重寫的時間成本(2-3 週)+ 71 tests 全廢
- BLE 驗證尚未完成,改寫會再驗一遍,時間浪費風險高
- 生態與招聘難度遠遠高於 React/TS

### 2️⃣ **生態優勢顧問** — 主張保留 Electron + React

**立場**:保留,用 4-5 天的 UI 優化達成改善。

**前 3 大理由(含具體方案)**:
1. **效能瓶頸不在框架,在實現策略**:
   - LiveChart:用循環緩衝替代 `shift()`,或用 Chart.js decimation LTTB 採樣 → 改善 80-90%
   - Leg3D:Quaternion 插值 + 預計算變換矩陣 → 改善 35-45%
   - HistoryView:React Virtualized 虛擬滾動 → 改善 85-90%
   - 成本:4-5 天,71 tests 全保留

2. **重寫成本巨大(6-8 週)**:
   - 50+ React 組件 → XAML (40-50h)
   - Zustand store → WinRT binding (15-20h)
   - IPC 全部重設計 (15-20h)
   - BLE:Web Bluetooth → WinRT API (10-15h,需重驗)
   - Tests:Vitest → xUnit/NUnit (20-30h)
   - 總計:250-350h, 6-8 週

3. **BLE 已驗證路徑,轉向 WinRT 風險高**:
   - 煙霧測試已通過,IPC 架構清晰
   - WinRT Bluetooth API 事件模型完全不同,需重驗
   - 實機驗證延後到第 8-10 週

**最弱點**:
- Electron 記憶體佔用(當前 300MB+ vs WinUI 3 約 100MB)
- 但現代 PC(8GB+)不是瓶頸,問題來自數據載入(見改進方案)

### 3️⃣ **實務約束顧問** — 主張保守方案

**立場**:保留,但要**先 BLE 驗證確定根源**,再優化。

**理由(含成本/風險估算)**:
1. **核心風險:卡頓根源未知**
   - 假設「高頻 UI」vs 現實「BLE 傳速不穩」
   - 若根源是 BLE,4-5 天 UI 優化無效
   - 必須先驗證 BLE 穩定性(>99%),優化才有基礎

2. **正確的工作順序**:
   - 第 1 週:BLE 實機驗證 + Profiler 基線(確定根源)
   - 第 2 週:根據根源決定改進優先度
   - 第 3 週:執行改進(3-5 天)
   - 若改善 ≥50% → 維持 Electron;若 <50% → 考慮改寫

3. **改寫的可行條件**
   - 若要改 WinUI 3,必備:12+ 週時程、專職 C# 工程師、市場有 Windows-only 需求
   - 目前都不滿足 → 改寫不可行

**最弱點**:
- 4-5 天改進可能無效(若根源是 BLE)
- 但先驗證能消除這個風險

---

## 交叉盤問結果

### 效能顧問 vs 生態顧問(改進方案評估)

**效能顧問對三項改進的具體評估**:
1. LiveChart LTTB:改善 80-90% ✓,風險低
2. Leg3D Quaternion:改善 35-45%,需實機測試平滑度
3. HistoryView 虛擬滾動:改善 85-90% ✓,風險低

但效能顧問指出**三個隱藏風險**:
- Electron IPC 層死開銷(10-15% 延遲無法消除)
- BLE 實機延遲未驗(可能是最大瓶頸)
- React GC 暫停(無法根本消除)

**結論**:改進會有幫助,但無法根本解決 Electron 架構成本。是否這三項夠用,取決於 BLE 驗證結果。

### 實務顧問 vs 生態/效能顧問(順序問題)

**實務顧問的關鍵反擊**:
- 不應該先做 4-5 天 UI 優化,再做 BLE 驗證
- 應該**先驗證 BLE(1-2 週),確認根源,再優化**
- 否則可能投入 4-5 天後發現根源是 BLE,工作全白費

**效能顧問同意**:建議先用 Chrome DevTools Profiler 測量真實卡頓根源,而非盲目優化。

---

## 🎯 椅子決定

### **推薦方案:驗證優先,條件式維持 Electron + React**

**不改 WinUI 3 的理由**:
- 當前證據不足(BLE 未驗、卡頓未量化)
- 時間成本過高(6-8 週 vs 1-2 週驗證)
- 已投資不應放棄(71 tests、已驗證的 BLE 代碼)

**具體執行計畫(30 天)**:
```
週 1:BLE 實機驗證 + Profiler 基線
  → 交付:卡頓根源報告、火焰圖
  → 勝利條件:確定瓶頸(BLE vs UI vs 混合)≥80% 信心度

週 1-2:虛擬滾動(HistoryView)
  → 交付:PR
  → 勝利條件:載入時間 <300ms

週 2:LTTB 採樣(LiveChart)
  → 交付:PR
  → 勝利條件:延遲 <2ms

週 3:效能對比測試 + 回歸
  → 交付:A/B 量化報告
  → 勝利條件:改善 ≥50%

週 3-4:決策點
  → 若改善 ≥50% ✓ 維持 Electron + React 方案
  → 若改善 <50% ✗ 重新評估或啟動 WinUI 3 改寫
```

### **何時改 WinUI 3?**

**充分必要條件**:
1. ✓ BLE 驗證後穩定性確認 >99%
2. ✓ UI 優化完成後改善 <50%
3. ✓ 根源明確是「Electron 架構開銷」(非 BLE 層)
4. ✓ 團隊有 12+ 週時程承諾
5. ✓ 市場有強勁 Windows-only 需求或明確客戶要求

目前五項都不滿足 → **不改 WinUI 3**

---

## 決策根據

1. **風險評估**:
   - 改 WinUI 3:時間成本 3 倍,新 BUG 風險高,市場信號不足
   - 驗證 + 優化:時間成本 1 倍,使用已驗證代碼,有明確決策點

2. **假設驗證**:
   - 「卡頓 = 高頻 UI」未驗證 → 先測量消除不確定性
   - 「BLE 穩定」未驗證 → 不能盲目優化

3. **資源約束**:
   - 當前無 12+ 週專案時程
   - 團隊熟悉 React/TS,C# 無專職人力

---

## 決議

**方案**:保留 Electron + React,執行「驗證優先」30 天計畫。  
**條件**:若優化完成後改善 <50%,重新召開會議評估 WinUI 3 改寫。  
**監控指標**:
- BLE 穩定性 >99%
- HistoryView 載入時間 <300ms
- LiveChart 延遲 <2ms
- 整體卡頓感改善 ≥50%

---

**會議結束**. 2026-07-14
