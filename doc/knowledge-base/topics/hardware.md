# IMU、I2C 與電氣規格

晶片、模組板與接線是否符合實際電氣與採樣條件？

本主題 4 筆交叉索引。

## 專案對照

- [I2C_Scanner/I2C_Scanner.ino](../../../I2C_Scanner/I2C_Scanner.ino)
- [IRMS_Sensor/README.md](../../../IRMS_Sensor/README.md)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **DOC-ESP-DATASHEET** [ESP32 Series Datasheet](../sources/DOC-ESP-DATASHEET.md) (持續文件；primary-page-excerpt) — 確認實際晶片型號的腳位、電源與無線能力，ESP32 家族名稱不能代替型號規格。
- **DOC-I2C** [UM10204 I2C-bus specification and user manual](../sources/DOC-I2C.md) (持續文件；primary-page-excerpt) — I2C 時序與匯流排規格用於檢查上拉、速率、電容與錯誤恢復的電氣條件。
- **DOC-MPU-DATASHEET** [MPU-6000/MPU-6050 Product Specification](../sources/DOC-MPU-DATASHEET.md) (持續文件；metadata-only) — 原廠規格用於量程、噪聲、電氣與介面條件；模組板的穩壓與接線仍需另行確認。
- **DOC-MPU-REGISTERS** [MPU-6000/MPU-6050 Register Map and Descriptions](../sources/DOC-MPU-REGISTERS.md) (持續文件；metadata-only) — 暫存器定義是初始化、DLPF、採樣除頻、量程與 burst 讀取的依據。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
