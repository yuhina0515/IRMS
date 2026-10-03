# 步態分段與時空指標

哪種訊號與佩戴位置支持哪種步態事件及指標？

本主題 14 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/shared/protocol.ts](../../../IRMS_App_Tauri/src/shared/protocol.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-32393301** [Validity and reliability of wearable inertial sensors in healthy adult walking: a systematic review and meta-analysis.](../sources/PMID-32393301.md) (2020；abstract) — 健康成人步行的平均時空參數通常較有支持，變異性與對稱性指標需更嚴格程序。
- **PMID-37316858** [Assessing real-world gait with digital technology? Validation, insights and recommendations from the Mobilise-D consortium.](../sources/PMID-37316858.md) (2023；abstract) — 真實生活步態驗證顯示短步行段與慢速會降低性能，演算法選擇具有族群依賴。
- **PMID-33924403** [Wearable Sensor-Based Real-Time Gait Detection: A Systematic Review.](../sources/PMID-33924403.md) (2021；abstract) — 即時步態事件回顧指出規則式方法常見，但病理步態實測與統一評估標準仍不足。
- **PMID-34857567** [Technical validation of real-world monitoring of gait: a multicentric observational study.](../sources/PMID-34857567.md) (2021；abstract) — 這是多中心真實生活步態驗證的研究計畫，描述方法與倫理安排，不能當作已完成的效能結果。
- **PMID-31470423** [Validity of Mobility Lab (version 2) for gait assessment in young adults, older adults and Parkinson's disease.](../sources/PMID-31470423.md) (2019；abstract) — 商用步態平臺對不同族群與指標的參考一致性不同，步速有效不能代表支撐時間也有效。
- **PMID-30583508** [Towards Inertial Sensor Based Mobile Gait Analysis: Event-Detection and Spatio-Temporal Parameters.](../sources/PMID-30583508.md) (2018；abstract) — IMU 的事件與部分時空參數表現良好，步寬等側向空間指標誤差較大。
- **PMID-28572784** [Inertial Sensors to Assess Gait Quality in Patients with Neurological Disorders: A Systematic Review of Technical and Analytical Challenges.](../sources/PMID-28572784.md) (2017；abstract) — 神經疾病步態回顧強調程序異質與臨床解讀不足，區分病群並非功能追蹤的全部。
- **PMID-28666178** [A systematic review of gait analysis methods based on inertial sensors and adaptive algorithms.](../sources/PMID-28666178.md) (2017；abstract) — 慣性步態與自適應演算法研究缺乏一致採集與報告方式，健康樣本的結果仍需患者驗證。
- **PMID-28928711** [Validation of a Step Detection Algorithm during Straight Walking and Turning in Patients with Parkinson's Disease and Older Adults Using an Inertial Measurement Unit at the Lower Back.](../sources/PMID-28928711.md) (2017；abstract) — 下背單 IMU 的直走與轉彎步數演算法分別以光學及類居家影片驗證。
- **PMID-26751449** [Gait Partitioning Methods: A Systematic Review.](../sources/PMID-26751449.md) (2016；abstract) — 回顧步態分期的感測器、演算法、位置與相位粒度，可用於決定可辨識事件的範圍。
- **PMID-26805847** [A Machine Learning Framework for Gait Classification Using Inertial Sensors: Application to Elderly, Post-Stroke and Huntington's Disease Patients.](../sources/PMID-26805847.md) (2016；abstract) — 使用 HMM 特徵與 SVM 分類病理步態，採受試者留一驗證，提供跨人泛化評估案例。
- **PMID-28113185** [Toward Pervasive Gait Analysis With Wearable Sensors: A Systematic Review.](../sources/PMID-28113185.md) (2016；abstract) — 穿戴式步態分析回顧提出方法與性能指標，適合作為院外步態量測架構的導讀。
- **PMID-22391334** [Estimation of spatial-temporal gait parameters in level walking based on a single accelerometer: validation on normal subjects by standard gait analysis.](../sources/PMID-22391334.md) (2012；abstract) — 單顆軀幹加速度計可估計部分步態參數，但支撐階段等指標的表現需獨立確認。
- **PMID-22778632** [Inertial sensor-based methods in walking speed estimation: a systematic review.](../sources/PMID-22778632.md) (2012；abstract) — 步速估計回顧按感測器、位置、試驗設計與演算法分類，方便比對硬體需求。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
