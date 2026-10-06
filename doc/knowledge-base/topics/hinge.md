# 關節軸與無磁力計估計

鉸鏈限制與六軸訊號何時足以辨識相對角度？

本主題 6 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/angleMath.ts](../../../IRMS_App_Tauri/src/services/angleMath.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-29933568** [Validity, Test-Retest Reliability and Long-Term Stability of Magnetometer Free Inertial Sensor Based 3D Joint Kinematics.](../sources/PMID-29933568.md) (2018；full-text-extracted) — 參考外殼標記與皮膚標記的誤差不同；光學初始化與兩次處理也影響能否部署。
- **PMID-24743160** [IMU-based joint angle measurement for gait analysis.](../sources/PMID-24743160.md) (2014；full-text-extracted) — 一位截肢者的人工與人體側誤差不同，說明固定條件和參考模型的重要性。
- **PMID-35408159** [Body-Worn IMU-Based Human Hip and Knee Kinematics Estimation during Treadmill Walking.](../sources/PMID-35408159.md) (2022；full-text-extracted) — 步行膝角的絕對 RMSE 7.87°，參考扣偏移後 3.77°；兩個數字衡量不同問題。
- **PMID-33276492** [Body-Worn IMU Human Skeletal Pose Estimation Using a Factor Graph-Based Optimization Framework.](../sources/PMID-33276492.md) (2020；abstract) — 因子圖最佳化結合人體模型與限制條件，示範無磁力計骨架姿態與膝屈伸估計。
- **PMID-28846613** [Method for Estimating Three-Dimensional Knee Rotations Using Two Inertial Measurement Units: Validation with a Coordinate Measurement Machine.](../sources/PMID-28846613.md) (2017；full-text-extracted) — 已知角機械基準可辨別共同座標與漂移問題；臺架RMS誤差不能代替人體STA或三維膝角效度。
- **PMID-19632882** [Feasibility of using inertial sensors to assess human movement.](../sources/PMID-19632882.md) (2010；abstract) — 初期慣性感測可行性研究提供人體運動量測案例；可行性本身不能替代完善的參考對照驗證。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
