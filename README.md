# 智慧復健監測系統 (Intelligent Rehabilitation Monitoring System - IRMS)

> 系統架構設計文件 (System Architecture Design Document)

## 1. 系統概述 (System Overview)

本系統旨在提供一套精準、即時且具備互動回饋機制的智慧復健輔助方案。透過穿戴式物聯網 (IoT) 裝置擷取人體運動力學數據，結合邊緣運算 (Edge Computing) 與雲端數據分析，協助物理治療師監控患者復健進度，同時降低患者居家復健的錯誤姿勢風險。

## 2. 硬體架構 (Hardware Architecture)

硬體端以低功耗、高整合度的微控制器為核心，搭配高精度慣性感測器，組成穿戴式感測節點。

- **核心運算單元 (MCU)**: ESP32 (雙核心 32-bit 處理器，支援 Wi-Fi & BLE 5.0)
- **姿態感測單元 (IMU)**: 雙 MPU6050 (六軸加速度計與角速度計)，分別配戴於關節兩側(如上下臂)，透過 I2C (位址 0x68 與 0x69) 與 MCU 通訊，計算相對夾角。
- **警示回饋單元 (Actuator)**: 蜂鳴器 (Buzzer) 與 LED 指示燈，提供即時的聽覺與視覺防呆回饋。
- **電源管理模組 (Power Management)**: 3.7V 鋰電池搭配充放電保護電路，並實作 ESP32 Deep Sleep 降低待機功耗。

## 3. 韌體與軟體架構 (Firmware & Software Architecture)

系統採分層架構設計，將即時感測與非即時的網路傳輸解耦。

### 3.1 邊緣運算韌體 (Edge Firmware - ESP32)

基於 FreeRTOS 實作多執行緒架構：

- **感測任務 (Task_Sensor)**: 高頻率 (如 50Hz) 讀取 MPU6050 數據，實作互補濾波器 (Complementary Filter) 或卡爾曼濾波器 (Kalman Filter) 進行姿態融合 (Sensor Fusion)，輸出尤拉角 (Euler Angles)。
- **邏輯任務 (Task_Logic)**: 負責狀態機轉換，比對當前角度與「情境設定檔 (Profile)」的容錯區間，觸發蜂鳴器警示或達標事件。
- **通訊任務 (Task_Comm)**: 低優先權，負責將打包好的 JSON 格式數據透過 Wi-Fi (MQTT/HTTP) 或 BLE 傳輸至終端設備。
- **儲存任務 (Task_Storage)**: 利用 NVS (Non-Volatile Storage) 儲存使用者的客製化情境參數，確保斷電不遺失。

### 3.2 應用端介面與後端 (Application & Backend)

- **前端儀表板 (Frontend UI)**: 提供即時角度可視化、剩餘時間倒數、以及歷史復健數據的圖表分析。
- **業務邏輯層 (Backend API)**: 處理情境設定檔的 CRUD 操作、使用者驗證 (Authentication) 與歷史數據聚合 (Aggregation)。
- **資料庫層 (Database)**: 關聯式或時序資料庫，儲存病患資料、復健履歷與各項動作平穩度指標。

## 4. 通訊與資料流 (Communication & Data Flow)

- **設備內部流 (Internal)**: MPU6050 `↔ (I2C, 400kHz Fast Mode)` ESP32
- **近端互動流 (Interaction)**: ESP32 `→ (PWM)` 蜂鳴器
- **遠端數據流 (Telemetry)**: ESP32 `→ (Wi-Fi/MQTT over TLS)` 雲端 Broker `→` 後端伺服器 `→` 前端儀表板

## 5. 核心功能模組 (Core Functional Modules)

### 5.1 情境設定引擎 (Scenario Engine)

- 支援動態載入不同復健協議 (Protocol)，參數包含：目標關節、基準向量、目標角度 (Target Angle)、維持時間 (Hold Time)、容錯區間 (Tolerance)、角速度上限 (Speed Limit)。

### 5.2 異常偵測機制 (Anomaly Detection)

- **動作代償偵測**：當非目標關節發生異常晃動時，判定為姿勢代償。
- **超限警報 (Over-extension Alert)**：當角度超過安全閾值，立即中斷計時並發出急促警示音以防止二次傷害。

### 5.3 數據評估模型 (Evaluation Model)

- **綜合評分系統**：依據動作完成度、平穩度 (角速度變異數)、以及容錯範圍內的偏移量，產出單次復健的品質分數，供醫療人員參考。
