# 下肢運動學與 IMU 效度

哪些任務、族群與運動平面有量測支持？

本主題 15 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/movementMetric.ts](../../../IRMS_App_Tauri/src/services/movementMetric.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-41088368** [Concurrent validity of wearable IMUs for sagittal plane lower-limb range of motion during walking and estimated ground reaction forces: a systematic review and meta-analysis.](../sources/PMID-41088368.md) (2025；full-text-extracted) — 膝矢狀 ROM 合併 RMSE 4.60°，但 I²=96%；不能把平均結果當成 IRMS 的通用通過線。
- **PMID-31991862** [Inertial Sensor-Based Lower Limb Joint Kinematics: A Methodological Systematic Review.](../sources/PMID-31991862.md) (2020；full-text-extracted) — 31 篇研究的方法與族群差異很大，跨研究誤差範圍不能當作單一裝置規格。
- **PMID-29476427** [Wearable Inertial Sensor Systems for Lower Limb Exercise Detection and Evaluation: A Systematic Review.](../sources/PMID-29476427.md) (2018；abstract) — 將下肢運動研究區分為辨識、品質分類與量測驗證；截至該回顧期間，使用者評估與臨床試驗仍不足。
- **PMID-41901917** [Validity, Reliability and Interpretability of an IMU-Based System to Measure 3D Lower Limb Kinematics of Patients with Heterogeneous Gait Disorders.](../sources/PMID-41901917.md) (2026；abstract) — 異質步態疾病的 IMU 波形、絕對角與整體步態分數表現不同，去中心化誤差較小不能替代絕對準確度。
- **PMID-39622186** [Validity of an inertial measurement system to measure lower-limb kinematics in patients with hip and knee pathology.](../sources/PMID-39622186.md) (2025；abstract) — 髖膝病變患者的矢狀面較有一致性，冠狀、橫斷平面與嚴重變形情境需要更審慎解讀。
- **PMID-37210922** [Concurrent validation of the Xsens IMU system of lower-body kinematics in jump-landing and change-of-direction tasks.](../sources/PMID-37210922.md) (2023；abstract) — 跳落地與變向的矢狀面波形較一致，冠狀面與橫斷面的系統間一致性變動較大。
- **PMID-37448005** [Evaluation of Upper Body and Lower Limbs Kinematics through an IMU-Based Medical System: A Comparative Study with the Optoelectronic System.](../sources/PMID-37448005.md) (2023；abstract) — 復健裝置與光學系統的比較納入誤佩戴測試，支持把擺放誤差列為獨立驗證條件。
- **PMID-35161609** [Reliability and Validity of an Inertial Measurement System to Quantify Lower Extremity Joint Angle in Functional Movements.](../sources/PMID-35161609.md) (2022；abstract) — 商用 IMU 的功能動作驗證同時比較波形與離散指標，誤差依任務與平面而異。
- **PMID-34833766** [Validity and Sensitivity of an Inertial Measurement Unit-Driven Biomechanical Model of Motor Variability for Gait.](../sources/PMID-34833766.md) (2021；abstract) — 關節角變異性的不同指標具有不同效度與敏感性，不能把 ROM 的驗證結果套用到熵或長程波動指標。
- **PMID-33322187** [Wearable Inertial Sensors for Gait Analysis in Adults with Osteoarthritis-A Scoping Review.](../sources/PMID-33322187.md) (2020；abstract) — 骨關節炎步態研究使用多種佩戴位置與指標；需要縱向、自由生活情境與患者特定模型來補足證據。
- **PMID-30935116** [Validity and Reliability of Wearable Sensors for Joint Angle Estimation: A Systematic Review.](../sources/PMID-30935116.md) (2019；abstract) — 關節角效度受動作複雜度與關節種類影響，重測信度研究相對不足；程序標準化仍是必要工作。
- **PMID-29096266** [Mobile assessment of the lower limb kinematics in healthy persons and in persons with degenerative knee disorders: A systematic review.](../sources/PMID-29096266.md) (2018；abstract) — 膝退化與置換研究常忽略髖與軀幹代償；單看膝角不足以涵蓋完整功能表現。
- **PMID-29495600** [Inertial Measurement Units for Clinical Movement Analysis: Reliability and Concurrent Validity.](../sources/PMID-29495600.md) (2018；abstract) — 商用 Xsens 系統在步行、蹲與跳躍的量測中，矢狀面表現較穩定；同日評估者與跨日重測應分開分析。
- **PMID-27833057** [25 years of lower limb joint kinematics by using inertial and magnetic sensors: A review of methodological approaches.](../sources/PMID-27833057.md) (2017；abstract) — 整理下肢慣性感測的儀器、運算與方法學問題，適合建立從感測器姿態到關節運動學的整體架構。
- **PMID-22163542** [The use of wearable inertial motion sensors in human lower limb biomechanics studies: a systematic review.](../sources/PMID-22163542.md) (2010；abstract) — 早期下肢 IMU 系統性回顧盤點感測器、採集、研究設計與驗證方法，提供技術發展背景。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
