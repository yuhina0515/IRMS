# 姿態融合與濾波

偏移、動態加速度與因果延遲如何影響輸出？

本主題 16 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/smoothing.ts](../../../IRMS_App_Tauri/src/services/smoothing.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **ALG-VQF2023** [VQF: Highly accurate IMU orientation estimation with bias estimation and magnetic disturbance rejection](../sources/ALG-VQF2023.md) (2023；abstract) — 四元數姿態融合包含偏移估計、磁干擾排除與離線版本，作者使用多個資料集比較演算法。
- **ALG-MADGWICK2010** [An efficient orientation filter for inertial and inertial/magnetic sensor arrays](../sources/ALG-MADGWICK2010.md) (2010；full-text-sections) — 作者技術報告提出四元數梯度下降姿態濾波，分別討論六軸與含磁力計輸入的實作。
- **PMID-33916432** [Analysis of the Accuracy of Ten Algorithms for Orientation Estimation Using Inertial and Magnetic Sensing under Optimal Conditions: One Size Does Not Fit All.](../sources/PMID-33916432.md) (2021；abstract) — 比較多種姿態演算法與硬體，誤差隨轉速與 IMU 型號改變，沒有對所有條件皆最佳的單一方法。
- **PMID-32117943** [Drift-Free Foot Orientation Estimation in Running Using Wearable IMU.](../sources/PMID-32117943.md) (2020；abstract) — 跑步足部姿態估計使用專門校正，顯示步行的零速假設不宜直接移植至跑步。
- **PMID-29283432** [How Magnetic Disturbance Influences the Attitude and Heading in Magnetic and Inertial Sensor-Based Orientation Estimation.](../sources/PMID-29283432.md) (2017；abstract) — 比較磁擾動對傾角與航向的不同影響，可用於建立磁力計方案的干擾測試矩陣。
- **PMID-27455266** [On Inertial Body Tracking in the Presence of Model Calibration Errors.](../sources/PMID-27455266.md) (2016；abstract) — 感測器到肢段的方向校準誤差可傳播至肢段姿態，模型與感測誤差需分別分析。
- **PMID-27612100** [On the Orientation Error of IMU: Investigating Static and Dynamic Accuracy Targeting Human Motion.](../sources/PMID-27612100.md) (2016；abstract) — 比較靜態、動態與收斂行為，支持將運動速度與初始化時間納入姿態濾波驗證。
- **PMID-30407416** [Dealing with Magnetic Disturbances in Human Motion Capture: A Survey of Techniques.](../sources/PMID-30407416.md) (2016；abstract) — 比較人體動作捕捉的磁干擾處理方法與測試平臺，支持分開驗證傾角與航向。
- **PMID-25775483** [A Novel Kalman Filter for Human Motion Tracking With an Inertial-Based Dynamic Inclinometer.](../sources/PMID-25775483.md) (2015；abstract) — 動態傾角的卡爾曼方法處理加速度中的重力與運動分量，適合理解動態傾角估計的限制。
- **PMID-25302810** [Estimating orientation using magnetic and inertial sensors and different sensor fusion approaches: accuracy assessment in manual and locomotion tasks.](../sources/PMID-25302810.md) (2014；abstract) — 不同動作、靜止片段與測試期間影響姿態估計誤差，濾波器名稱不是性能的唯一決定因素。
- **PMID-21715167** [Quantification of inertial sensor-based 3D joint angle measurement accuracy using an instrumented gimbal.](../sources/PMID-21715167.md) (2011；abstract) — 以儀器化轉臺量化三維關節角精度，提供人體測試前先驗證感測器與演算法的方法。
- **PMID-22319365** [Estimating three-dimensional orientation of human body parts by inertial/magnetic sensing.](../sources/PMID-22319365.md) (2011；abstract) — 回顧三維人體姿態融合與濾波方法，提供演算法選擇與實作背景。
- **PMID-17894280** [Estimating body segment orientation by applying inertial and magnetic sensing near ferromagnetic materials.](../sources/PMID-17894280.md) (2007；abstract) — 鐵磁材料附近的姿態誤差可明顯增加，磁干擾模型可減輕影響但需情境驗證。
- **PMID-15865139** [Measuring orientation of human body segments using miniature gyroscopes and accelerometers.](../sources/PMID-15865139.md) (2005；abstract) — 以加速度與陀螺儀的卡爾曼估計追蹤肢段姿態，並在試驗期間估計陀螺儀偏移。
- **PMID-16200762** [Compensation of magnetic disturbances improves inertial and magnetic sensing of human body segment orientation.](../sources/PMID-16200762.md) (2005；abstract) — 磁干擾補償改善姿態估計，顯示加入磁力計也必須處理環境擾動。
- **DOC-VQF-IMPLEMENTATION** [VQF: Versatile Quaternion-based Filter documentation](../sources/DOC-VQF-IMPLEMENTATION.md) (持續文件；primary-page-excerpt) — 作者實作文件區分線上與離線版本，離線非因果性能不能直接宣稱為即時系統性能。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
