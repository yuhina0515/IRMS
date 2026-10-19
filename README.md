# 智慧復健監測系統 (Intelligent Rehabilitation Monitoring System — IRMS)

> 穿戴式 ESP32 物聯網感測 × Tauri 桌面監測端的智慧復健輔助系統。
> 本檔為專案總覽與文件入口;細節請依下方索引進入各文件。

---

## 系統簡介 (Overview)

IRMS 透過配戴於關節兩側的雙 MPU6050 慣性感測器擷取人體運動力學數據,於 ESP32 邊緣端以
**互補濾波器**即時融合姿態,計算大腿 / 小腿 / 膝關節的矢狀面 (Pitch) 與冠狀面 (Roll) 角度,
並以 **BLE** 推播至 **Tauri 桌面 App**。App 即時可視化、判定指定復健動作、同步硬體
LED/蜂鳴器回饋,並將復健歷程儲存於本地 **SQLite** 以供量化分析與 CSV 匯出。

## 架構一覽 (Architecture at a Glance)

```
  ┌────────────── ESP32 韌體 (v3, FreeRTOS) ──────────────┐
  │  Task_Sensor → Task_Comm / Task_LED(App-Driven)       │
  │  雙 MPU6050 (I2C) · 互補濾波 · CMD 直控回饋             │
  └───────────────┬──────────────────────▲────────────────┘
       BLE Notify │ 角度封包 (25Hz)       │ BLE Write  CMD: 指令 / OTA
                  ▼                       │
  ┌──────────── Tauri 桌面 App (IRMS_App_Tauri) ──────────┐
  │  React/TS 前端 (Zustand · Chart.js · three.js)        │
  │     判定引擎 TriggerEngine ↕ Tauri IPC `invoke()`      │
  │  Rust 後端:btleplug (BLE) · rusqlite (SQLite)         │
  │     韌體 OTA · 模組同步 · App 自動更新                 │
  └────────────────────────────────────────────────────────┘
```

- **邊緣端**:ESP32 + 雙 MPU6050,FreeRTOS 多執行緒,角度推播,I2C 自動復原。
  韌體原始碼在獨立儲存庫 [IRMS-Firmware](https://github.com/yuhina0515/IRMS-Firmware)。
- **應用端 (現役)**:`IRMS_App_Tauri/` — Tauri 2 + Rust 後端 + React 18 / TypeScript / Tailwind / Vite 前端。
  BLE、SQLite、OTA、更新器由 Rust 負責;前端負責介面與療程判定。
- **可選模組**:簽章的執行期模組發布在 [IRMS-Modules](https://github.com/yuhina0515/IRMS-Modules)。

> **版本說明**:應用端世代為 v1(Vanilla JS + Express)→ v2(Electron,已退場)→ 現行 Tauri 版
> (版本號 `1.2.0-beta.x` 系列)。ESP32 韌體與 BLE 協定在世代之間維持相容。
> 舊 Electron 版原始碼 `IRMS_App/` 僅保留供歷史參考,不再開發。歷史細節見
> [PROJECT_STATUS.md](doc/PROJECT_STATUS.md)。

---

## 文件索引 (Documentation Index)

| 文件 | 內容 |
| --- | --- |
| [doc/README.md](doc/README.md) | **系統架構與整合技術規格說明書** — 硬體腳位、韌體任務、BLE 協定、SQLite schema、建置指引。 |
| [專業知識與文獻資料庫](doc/knowledge-base/README.md) | **202 筆來源、22 個主題、12 篇導讀** — 校準、量測驗證、復健背景、工程依據、離線搜尋及引用匯出。 |
| [doc/PROJECT_STATUS.md](doc/PROJECT_STATUS.md) | **專案開發進度與整合報告** — 世代沿革、已完成階段、驗證、待辦。 |
| [doc/OPTIMIZATION.md](doc/OPTIMIZATION.md) | **功能清單與優化待辦 (活清單)** — 現有功能盤點與優化 backlog。 |
| [doc/AI_CODING_RULES.md](doc/AI_CODING_RULES.md) | **AI 協同開發與編碼規範** — 行為準則、韌體/App 開發規則、參數速查表。 |
| [doc/coding log/](doc/coding%20log/) | **開發變更日誌** — 每次開發計畫與變更的獨立 log(只增不改)。 |

---

## 快速開始 (Quick Start)

### 邊緣端 (ESP32) 燒錄
韌體在 [IRMS-Firmware](https://github.com/yuhina0515/IRMS-Firmware)。以 Arduino IDE / PlatformIO 開啟其中的
`IRMS_Sensor/IRMS_Sensor.ino`,安裝 **ESP32 Arduino Core v3.0.x**,選對開發板與序列埠後編譯燒錄。
也可在 App 連線且無進行中療程時,經 BLE OTA 安裝簽章的官方韌體。

### 應用端 (Tauri App)
需求:Node.js 24、stable Rust(含 `rustfmt`、`clippy`)、Windows WebView2。
```bash
cd IRMS_App_Tauri
npm ci
npm run tauri dev        # 開發模式
npm run ci               # typecheck + vitest + build + cargo fmt/test/clippy
```
> 詳見 [IRMS_App_Tauri/README.md](IRMS_App_Tauri/README.md) 與 [doc/README.md §5](doc/README.md#5-開發建置指引-development--build-guide)。

技術棧:Tauri 2 · Rust (btleplug · rusqlite) · React 18 · TypeScript 5 · Vite · Tailwind CSS 3 · Zustand 5 · Chart.js 4 · three.js。

---

## 倉庫結構 (Repository Layout)

```
IRMS/
├── README.md                 # 本檔:專案總覽與文件入口
├── IRMS_App_Tauri/           # 現役桌面監測端 (Tauri 2 + React/TS)
│   ├── src/                  #   前端:views · components · services · store · i18n
│   └── src-tauri/src/        #   Rust:ble · db · migrations · firmware_update · update · modules
├── IRMS_App/                 # 舊 Electron 版 (v2),已退場,僅供歷史參考
├── IRMS_Sensor/              # 韌體已移至 IRMS-Firmware,此處僅留指引
├── I2C_Scanner/              # I2C 接線檢測工具
├── IRMS_Telemetry/           # 選用的遙測收集服務 (Node.js)
├── tools/                    # 輔助工具
└── doc/                      # 專案文件(見上方文件索引)
    └── coding log/           # 開發變更日誌
```

---

## 免責聲明 (Disclaimer)

IRMS 是 **IRMS Team** 開發的**教育 / 展示型專案**,用於驗證穿戴式 IMU 感測與姿態判定的
工程實作,**並非醫療器材,未經任何醫療器材法規審核或臨床驗證**。感測數據與動作判定結果僅供
技術展示與自我練習參考,**不構成醫療診斷、治療建議或復健處方**。若有實際復健需求,請諮詢
物理治療師或醫療專業人員,勿以本系統的輸出結果作為醫療決策依據。

本軟硬體以「現狀」(AS IS) 提供,不附帶任何明示或默示的擔保(包含但不限於適售性、特定用途
適用性)。使用者依本專案之程式碼、電路或文件進行複製、修改、燒錄或穿戴使用所生之任何風險與
後果,均由使用者自行承擔,IRMS Team 不負任何責任。

## 授權 (License)

自 `v1.2.0-beta.19` 之後的新內容改採 [IRMS Source-Available License](LICENSE)(草稿,待法律審閱):
可閱讀原始碼、個人非商業使用官方版本;未經書面許可不得複製、修改、散布或商用,
且**不授予任何專利授權**,專利權利均予保留。`v1.2.0-beta.19`(含)以前已發布的內容
仍依 [MIT License](LICENSE-MIT-HISTORICAL) 授權,已取得者不受影響。著作權歸 **IRMS Team** 所有。
