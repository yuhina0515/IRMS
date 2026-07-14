# 智慧復健監測系統 (Intelligent Rehabilitation Monitoring System — IRMS)

> 穿戴式 ESP32 物聯網感測 × Electron 桌面監測端的智慧復健輔助系統。
> 本檔為專案總覽與文件入口;細節請依下方索引進入各文件。

---

## 系統簡介 (Overview)

IRMS 透過配戴於關節兩側的雙 MPU6050 慣性感測器擷取人體運動力學數據,於 ESP32 邊緣端以
**互補濾波器**即時融合姿態,計算大腿 / 小腿 / 膝關節的矢狀面 (Pitch) 與冠狀面 (Roll) 角度,
並以 **BLE** 推播至 **Electron 桌面 App**。App 即時可視化、判定指定復健動作、同步硬體
LED/蜂鳴器回饋,並將復健歷程儲存於本地 **SQLite** 以供量化分析與 CSV 匯出。

## v2 架構一覽 (Architecture at a Glance)

```
  ┌────────────── ESP32 韌體 (v3, FreeRTOS) ──────────────┐
  │  Task_Sensor → Task_Comm / Task_LED(App-Driven)       │
  │  雙 MPU6050 (I2C) · 互補濾波 · CMD 直控回饋             │
  └───────────────┬──────────────────────▲────────────────┘
       BLE Notify │ T,S,K,TR,SR,KR (25Hz) │ BLE Write  CMD: 指令
                  ▼                       │
  ┌──────────── Electron 桌面 App (v2) ───┴────────────────┐
  │  Renderer (React + Zustand + Chart.js + 3D 姿態)       │
  │     判定引擎 TriggerEngine ↕ contextBridge `window.irms`│
  │  Main (IPC + better-sqlite3) → 本地 SQLite             │
  └────────────────────────────────────────────────────────┘
```

- **邊緣端**:ESP32 + 雙 MPU6050,FreeRTOS 多執行緒,6 軸角度推播,I2C 自動復原。
- **應用端 (v2)**:Electron + Vite + React + TypeScript,以 **IPC + contextBridge** 取代舊版
  Express/localhost,資料層改用同步的 **better-sqlite3**,狀態以 **Zustand** 集中。

> **版本說明**:應用端已於 2026-06-27 從 v1(Vanilla JS + Express + sqlite3)**從零重寫**為 v2。
> ESP32 韌體與 BLE 協定不變。歷史細節見 [PROJECT_STATUS.md](doc/PROJECT_STATUS.md)。

---

## 文件索引 (Documentation Index)

| 文件 | 內容 |
| --- | --- |
| [doc/README.md](doc/README.md) | **系統架構與整合技術規格說明書** — 硬體腳位、韌體任務、BLE 協定、SQLite schema、建置指引。 |
| [doc/PROJECT_STATUS.md](doc/PROJECT_STATUS.md) | **專案開發進度與整合報告** — v2 重寫紀錄、已完成階段、E2E 驗證、待辦階段。 |
| [doc/OPTIMIZATION.md](doc/OPTIMIZATION.md) | **功能清單與優化待辦 (活清單)** — 現有功能盤點與 P0–P4 優化 backlog。 |
| [doc/AI_CODING_RULES.md](doc/AI_CODING_RULES.md) | **AI 協同開發與編碼規範** — 行為準則、韌體/App 開發規則、參數速查表。 |
| [doc/coding log/](doc/coding%20log/) | **開發變更日誌** — 每次開發計畫與變更的獨立 log(只增不改)。 |

---

## 快速開始 (Quick Start)

### 邊緣端 (ESP32) 燒錄
1. 以 Arduino IDE / PlatformIO 開啟 [`IRMS_Sensor/IRMS_Sensor.ino`](IRMS_Sensor/IRMS_Sensor.ino)。
2. 安裝並選擇 **ESP32 Arduino Core v3.0.x**,選對開發板與序列埠。
3. 編譯並燒錄。接線檢測可先用 [`I2C_Scanner/I2C_Scanner.ino`](I2C_Scanner/I2C_Scanner.ino)。

### 應用端 (Electron App, v2)
```bash
cd IRMS_App
npm install          # postinstall 會以 electron-rebuild 重建 better-sqlite3
npm run dev          # Vite HMR + Electron
npm run typecheck    # main + renderer 兩端型別檢查
npm run dist         # 打包安裝檔
```
> 完整建置說明見 [doc/README.md §5](doc/README.md#5-開發建置指引-development--build-guide)。

技術棧:Electron 33 · Vite 5 · React 18 · TypeScript 5 · better-sqlite3 11 · Zustand 5 · Chart.js 4。

---

## 倉庫結構 (Repository Layout)

```
IRMS/
├── README.md                 # 本檔:專案總覽與文件入口
├── IRMS_Sensor/              # ESP32 主韌體 (FreeRTOS, BLE, 互補濾波, NVS)
├── I2C_Scanner/              # I2C 接線檢測工具
├── IRMS_App/                 # Electron + React + TS 桌面監測端 (v2)
│   └── src/{shared,main,preload,renderer}
└── doc/                       # 專案文件(見上方文件索引)
    └── coding log/            # 開發變更日誌
```
