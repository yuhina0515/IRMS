# 佩戴與肢段校準

重戴、操作者、姿勢與激發動作如何影響校準？

本主題 14 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/calibration.ts](../../../IRMS_App_Tauri/src/services/calibration.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-32545227** [Sensor-to-Segment Calibration Methodologies for Lower-Body Kinematic Analysis with Inertial Sensors: A Systematic Review.](../sources/PMID-32545227.md) (2020；abstract) — 整理手動、靜態、功能與解剖校準四類方法；異質的驗證參考使單一最佳方法難以成立。
- **PMID-32580394** [Robust Plug-and-Play Joint Axis Estimation Using Inertial Sensors.](../sources/PMID-32580394.md) (2020；abstract) — 提出關節軸即插即用估計與樣本選擇、品質判斷，機械關節測試提供辨識與可信度設計參考。
- **PMID-40702014** [DIODEM - A Diverse Inertial and Optical Dataset of kinEmatic chain Motion.](../sources/PMID-40702014.md) (2025；abstract) — DIODEM 以已知機械鏈與固定差異系統化研究慣性追蹤問題，可分離感測、模型與附件偽影。
- **PMID-37766040** [Inertial Measurement Unit Sensor-to-Segment Calibration Comparison for Sport-Specific Motion Analysis.](../sources/PMID-37766040.md) (2023；abstract) — 運動專項 ROM 驗證比較多種校準動作，結論支持依動作與量測變數選擇校準。
- **PMID-35590949** [Inertial Sensor-to-Segment Calibration for Accurate 3D Joint Angle Calculation for Use in OpenSim.](../sources/PMID-35590949.md) (2022；abstract) — 將肢段校準整合到 OpenSim 工作流程，提供模型、感測與光學參考之間對齊的實作案例。
- **PMID-35957218** [Three-Dimensional Lower-Limb Kinematics from Accelerometers and Gyroscopes with Simple and Minimal Functional Calibration Tasks: Validation on Asymptomatic Participants.](../sources/PMID-35957218.md) (2022；abstract) — 以加速度與陀螺儀及簡化功能校準估計下肢三維運動學；去除偏移後的波形誤差與絕對角度誤差不同。
- **PMID-33859720** [Inertial-Based Human Motion Capture: A Technical Summary of Current Processing Methodologies for Spatiotemporal and Kinematic Measures.](../sources/PMID-33859720.md) (2021；abstract) — 整理慣性動作捕捉的基本資料處理步驟，適合檢查校準、姿態、運動學與時空指標之間的依賴。
- **PMID-34167019** [IMU-based knee flexion, abduction and internal rotation estimation during drop landing and cutting tasks.](../sources/PMID-34167019.md) (2021；abstract) — 落地與切向運動的膝外展及內旋估計受初始肢段姿態影響，三維結果依賴初始化品質。
- **PMID-32012906** [Lower Limb Kinematics Using Inertial Sensors during Locomotion: Accuracy and Reproducibility of Joint Angle Calculations with Different Sensor-to-Segment Calibrations.](../sources/PMID-32012906.md) (2020；abstract) — 不同感測器到肢段校準在不同關節與運動平面有取捨，應依目的比較準確度與重複性。
- **PMID-31151200** [Estimation of 3D Knee Joint Angles during Cycling Using Inertial Sensors: Accuracy of a Novel Sensor-to-Segment Calibration Procedure Based on Pedaling Motion.](../sources/PMID-31151200.md) (2019；abstract) — 踩踏動作加站姿的校準改善騎車膝角估計，說明校準動作的適用性具有任務依賴。
- **PMID-31771263** [Validation of Novel Relative Orientation and Inertial Sensor-to-Segment Alignment Algorithms for Estimating 3D Hip Joint Angles.](../sources/PMID-31771263.md) (2019；abstract) — 髖部相對姿態與肢段對齊演算法顯示 ROM 誤差可小於絕對角度誤差，兩種性能應分開報告。
- **PMID-28113331** [Alignment-Free, Self-Calibrating Elbow Angles Measurement Using Inertial Sensors.](../sources/PMID-28113331.md) (2017；abstract) — 以自校準方式估計肘角，示範避免精準人工對齊的可能性；肘部結果需另行驗證才能套用至膝部。
- **PMID-28813947** [Exploiting kinematic constraints to compensate magnetic disturbances when calculating joint angles of approximate hinge joints from orientation estimates of inertial sensors.](../sources/PMID-28813947.md) (2017；abstract) — 利用近似鉸鏈限制修正磁干擾，並處理接近奇異姿態的退化；主要評估包括模擬情境。
- **PMID-19665712** [Functional calibration procedure for 3D knee joint angle description using inertial sensors.](../sources/PMID-19665712.md) (2009；abstract) — 以 IMU 資料進行功能校準，將相對姿態轉成可解讀的三維膝角，並比較校準重複性與參考系統誤差。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
