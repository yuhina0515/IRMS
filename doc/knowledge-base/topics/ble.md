# BLE 協定與時間完整性

封包完整性、MTU、延遲與重連如何驗證？

本主題 4 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/shared/protocol.ts](../../../IRMS_App_Tauri/src/shared/protocol.ts)
- [IRMS_App_Tauri/src-tauri/src/ble.rs](../../../IRMS_App_Tauri/src-tauri/src/ble.rs)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-BLE-ATT** [Bluetooth Core 6.2: Attribute Protocol (ATT)](../sources/DOC-BLE-ATT.md) (持續文件；primary-page-excerpt) — ATT 定義請求、回應、通知與 MTU；通知承載必須扣除協定開銷並確認實際協商值。
- **DOC-BLE-GATT** [Bluetooth Core 6.2: Generic Attribute Profile (GATT)](../sources/DOC-BLE-GATT.md) (持續文件；primary-page-excerpt) — GATT 定義服務與特徵程序，Notify 與 Indicate 具不同確認語意；此規格不代表裝置支持全部新版功能。
- **DOC-ESP-BLE** [Bluetooth LE stack overview](../sources/DOC-ESP-BLE.md) (持續文件；primary-page-excerpt) — 依目標晶片與協定堆疊檢查 BLE 能力，區分硬體支持與軟體堆疊設定。
- **DOC-ESP-GATT** [GATT Server API](../sources/DOC-ESP-GATT.md) (持續文件；primary-page-excerpt) — GATT server API 用於服務、特徵與事件生命週期；必須對照韌體所用 Arduino BLE 實作。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
