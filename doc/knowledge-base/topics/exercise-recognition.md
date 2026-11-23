# 運動辨識、計次與品質

分類、計次與品質標籤如何避免資料洩漏並評估？

本主題 9 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/triggerEngine.ts](../../../IRMS_App_Tauri/src/services/triggerEngine.ts)
- [IRMS_App_Tauri/src/services/moduleFeatures.ts](../../../IRMS_App_Tauri/src/services/moduleFeatures.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-41469404** [GAITEX: Human motion dataset of impaired gait and rehabilitation exercises using inertial and optical sensors.](../sources/PMID-41469404.md) (2025；abstract) — GAITEX 同步 IMU 與光學並提供動作品質及分段標記，適合測試分段、品質評估與運動學。
- **PMID-37051835** [Evaluation of at-home physiotherapy.](../sources/PMID-37051835.md) (2023；abstract) — 居家運動辨識把非運動片段納入訓練後改善偵測，患者特定方案依賴資料品質。
- **PMID-35998014** [Detection of Low Back Physiotherapy Exercises With Inertial Sensors and Machine Learning: Algorithm Development and Validation.](../sources/PMID-35998014.md) (2022；abstract) — 低背復健運動的 IMU 辨識研究提供多平面與姿勢分類方法，仍需另建膝部標籤與資料。
- **PMID-33842052** [Incorporating Internal and External Training Load Measurements in Clinical Decision Making After ACL Reconstruction: A Clinical Commentary.](../sources/PMID-33842052.md) (2021；abstract) — ACL 復健的臨床評論提出內外部負荷量測觀點，屬於實務討論而非療效試驗。
- **PMID-34892643** [Measuring Movement Quality of the Stroke-Impaired Upper Extremity with a Wearable Sensor: Toward a Smoothness Metric for Home Rehabilitation Exercise Programs.](../sources/PMID-34892643.md) (2021；abstract) — 中風上肢的平滑度候選指標可由腕部訊號取得，需區分訊號平滑與動作品質。
- **PMID-32854288** [Recognition and Repetition Counting for Local Muscular Endurance Exercises in Exercise-Based Rehabilitation: A Comparative Study Using Artificial Intelligence Models.](../sources/PMID-32854288.md) (2020；abstract) — 以 CNN 同時進行肌耐力運動辨識與次數計算，提供公開資料與兩種任務的評估範例。
- **PMID-33024831** [Enabling precision rehabilitation interventions using wearable sensors and machine learning to track motor recovery.](../sources/PMID-33024831.md) (2020；abstract) — 穿戴與機器學習估計中風上肢恢復及動作品質，支持指標建模概念但非膝部證據。
- **PMID-30440989** [Towards the Ambulatory Assessment of Movement Quality in Stroke Survivors using a Wrist-worn Inertial Sensor.](../sources/PMID-30440989.md) (2018；abstract) — 腕部慣性訊號與上肢功能量表關聯提供品質估計案例，量表關聯不證明介入療效。
- **PMID-28421180** [Usability Evaluations of a Wearable Inertial Sensing System and Quality of Movement Metrics for Stroke Survivors by Care Professionals.](../sources/PMID-28421180.md) (2017；abstract) — 照護人員的使用性評估指出指標需要活動與情境資訊，脫離任務的數值可能難以解讀。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
