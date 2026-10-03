# ESP32 即時系統與 OTA

感測、排程、錯誤恢復與更新是否維持可預測狀態？

本主題 7 筆交叉索引。

## 專案對照

- [IRMS_Sensor/README.md](../../../IRMS_Sensor/README.md)
- [IRMS_App_Tauri/src-tauri/src/firmware.rs](../../../IRMS_App_Tauri/src-tauri/src/firmware.rs)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-ESP-FREERTOS** [FreeRTOS (IDF)](../sources/DOC-ESP-FREERTOS.md) (持續文件；primary-page-excerpt) — IDF 的多核心排程與臨界區不同於單核心範例；跨核心共享資料需明確同步。
- **DOC-ESP-I2C** [Inter-Integrated Circuit (I2C)](../sources/DOC-ESP-I2C.md) (持續文件；primary-page-excerpt) — 官方 I2C 驅動文件提供交易、超時及錯誤處理依據；Arduino 包裝層需對照實際版本。
- **DOC-ESP-OTA** [Over The Air Updates (OTA)](../sources/DOC-ESP-OTA.md) (持續文件；primary-page-excerpt) — OTA 官方流程涵蓋映像與分區切換，更新完成、重開機與新版本運行應各自驗證。
- **DOC-ESP-PARTITIONS** [Partition Tables](../sources/DOC-ESP-PARTITIONS.md) (持續文件；primary-page-excerpt) — 分區配置約束韌體映像與 OTA 空間，可用於更新邊界與故障恢復測試。
- **DOC-ESP-POWER** [Power Management](../sources/DOC-ESP-POWER.md) (持續文件；primary-page-excerpt) — 省電策略會影響時序與周邊，需以真實感測、連線與喚醒行為測試續航。
- **DOC-ESP-TIMER** [ESP Timer (High Resolution Timer)](../sources/DOC-ESP-TIMER.md) (持續文件；primary-page-excerpt) — 高解析計時與回呼限制提供感測 dt、時間戳與排程量測基礎。
- **DOC-ESP-WATCHDOG** [Watchdogs](../sources/DOC-ESP-WATCHDOG.md) (持續文件；primary-page-excerpt) — 區分中斷與任務看門狗，感測恢復及更新程序不應讓排程與餵狗失效。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
