# 硬體、固定與即時韌體

感測器規格、模組板規格與實際佩戴性能分屬不同層次。MPU6050 的量程、靈敏度與輸出配置不能只靠模組商品頁；也不能從晶片規格推論綁帶後的關節角精度。兩份 TDK 原始文件在本次查核無法取得完整 PDF，已標為僅目錄；數值規格採用前需補齊版本與原文。

| 層次 | 待記錄項目 | 參考 |
|---|---|---|
| 晶片與模組 | 型號、供電、電位、實際初始化 | [ESP32 規格](../sources/DOC-ESP-DATASHEET.md)、[TDK 目錄卡](../sources/DOC-MPU-DATASHEET.md) |
| I2C | 上拉、線長、容量、速率、地址與錯誤 | [NXP 規格](../sources/DOC-I2C.md)、[IDF 驅動](../sources/DOC-ESP-I2C.md) |
| 採集 | 硬體設定、DLPF、採樣與 dt | 韌體 `config.h/imu.h` |
| 固定 | 綁帶、衣物、部位、質量與滑動 | [附件偽影](../sources/PMID-18401071.md) |
| 排程 | 優先權、共享資料、最長阻塞與恢復 | [IDF FreeRTOS](../sources/DOC-ESP-FREERTOS.md) |

50 Hz 感測與 25 Hz 傳輸是本次源碼設定，不代表每次都在準確的 20／40 ms 發生。應記錄採樣時間間隔、最長延遲與錯誤期間的資料有效性；單純夾限 dt 可以避免數值尖峰，卻無法重建漏掉的運動。

跨核心共享的兩側讀值與時間戳應形成一致快照；互斥與臨界區的範圍要足夠保護資料，但不能把長時間 I2C、網路或更新等待放在不必要的鎖內。多核心 IDF 行為需按實際 Arduino Core／IDF 版本對照，官方 stable 文件的版本不等於韌體目前依賴版本。

偽影評估可依序採剛性固定平臺、帶彈性附件的平臺，再做人體佩戴。這有助區分電子／演算法、附件與人體因素；高精度臺架結果也不能省略人體測試。[轉臺方法](../sources/PMID-21715167.md)、[DIODEM](../sources/PMID-40702014.md)、[軟組織穩定性](../sources/PMID-29933568.md)

OTA 驗證需涵蓋映像大小、分區空間、傳輸、驗證、切換、重啟與版本確認。斷電或中止應在各階段測試，不是只看到下載成功就算通過。看門狗、省電與更新行為需要一併考慮。[OTA](../sources/DOC-ESP-OTA.md)、[分區](../sources/DOC-ESP-PARTITIONS.md)、[看門狗](../sources/DOC-ESP-WATCHDOG.md)

韌體來源與固定 commit 記錄見 [專案對照](../IRMS_MAPPING.md)。App 倉庫的 [IRMS_Sensor/README](../../../IRMS_Sensor/README.md) 是移轉入口，不是現役韌體源碼。
