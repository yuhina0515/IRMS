# 膝部疾病與功能追蹤背景

ROM、功能、癥狀與負荷分別衡量什麼？

本主題 19 筆交叉索引。

## 專案對照

- [IRMS_App_Tauri/src/services/angleRange.ts](../../../IRMS_App_Tauri/src/services/angleRange.ts)
- [IRMS_App_Tauri/src/services/sessionAnalysis.ts](../../../IRMS_App_Tauri/src/services/sessionAnalysis.ts)

## 來源導讀

優先順序是與 IRMS 的關聯及閱讀價值，不是證據品質評分。

- **PMID-34820464** [Knee Hyperextension Greater Than 5° Is a Risk Factor for Failure in ACL Reconstruction Using Hamstring Graft.](../sources/PMID-34820464.md) (2021；full-text-sections) — 初次膝膕旁肌腱自體移植 ACL 重建：以麻醉下對側膝的被動過伸（量角器）分組，>5° 組 102 人與配對對照 102 人；移植物失敗 14.7% vs 2.9%，Lysholm 分數略低。討論指出文獻切點有 10°（Beighton）也有 5°、6°，並說明以護具把術後過伸限制在 5° 以下是否改善結果，目前沒有資料完全支持。
- **PMID-29882693** [Physiologic Preoperative Knee Hyperextension Is a Predictor of Failure in an Anterior Cruciate Ligament Revision Cohort: A Report From the MARS Group.](../sources/PMID-29882693.md) (2018；abstract) — 多中心 ACL 翻修前瞻世代 1,145 人（2 年追蹤率 91%）：術前被動生理性過伸 ≥5° 佔 33%；迴歸中 HE ≥5° 為移植物再斷裂的獨立預測因子（OR 2.12，95% CI 1.1–4.7），兩組失敗率為 3.2% 與 2.9%。
- **PMID-19059893** [Minimum 10-year results after anterior cruciate ligament reconstruction: how the loss of normal knee motion compounds other factors related to the development of osteoarthritis after surgery.](../sources/PMID-19059893.md) (2009；abstract) — ACL 重建後至少 10 年追蹤 502 人；「正常膝活動」定義為伸直（含過伸）與健側相差 2° 內、屈曲相差 5° 內；伸直不足（包括失去 3–5° 的過伸）與較差的主觀分數及放射學變化相關。
- **PMID-9580896** [Genu recurvatum syndrome.](../sources/PMID-9580896.md) (1998；abstract) — 臨床綜述把 genu recurvatum（膝反屈／過伸）操作定義為膝伸直超過 5°；描述可能的膝痛、伸直型步態及末端伸直的本體感覺控制不佳，並提出肌力不平衡矯正、本體感覺、步態與功能訓練，以及初期貼紮或護具的治療進程。
- **PMID-42391637** [Sensor-Based Monitoring of Knee Osteoarthritis Symptoms in Free-Living Settings: Scoping Review.](../sources/PMID-42391637.md) (2026；abstract) — 自由生活膝骨關節炎感測研究偏重活動與生物力學，主觀癥狀與主動回饋整合仍有缺口。
- **PMID-41125612** [A Dataset of Clinical Gait Signals with Wearable Sensors from Healthy, Neurological, and Orthopedic Cohorts.](../sources/PMID-41125612.md) (2025；abstract) — 臨床步態資料涵蓋健康、神經與骨科群體並提供臨床評分，可用於跨族群演算法研究。
- **PMID-36099732** [Objective gait assessment in individuals with knee osteoarthritis using inertial sensors: A systematic review and meta-analysis.](../sources/PMID-36099732.md) (2022；abstract) — 膝骨關節炎的時空步態參數較有支持，特定膝或軀幹運動適應的證據仍不足。
- **PMID-34372377** [Remote Patient Monitoring with Wearable Sensors Following Knee Arthroplasty.](../sources/PMID-34372377.md) (2021；abstract) — 膝置換後遠距 IMU 資料可呈現活動與 ROM，與患者結果的臨床關聯仍需直接研究。
- **PMID-31916999** [Measuring markers of aging and knee osteoarthritis gait using inertial measurement units.](../sources/PMID-31916999.md) (2020；abstract) — 比較健康及膝骨關節炎、年齡與速度群的 IMU 指標，提供跨情境量測設計參考。
- **PMID-32039192** [A Machine Learning and Wearable Sensor Based Approach to Estimate External Knee Flexion and Adduction Moments During Various Locomotion Tasks.](../sources/PMID-32039192.md) (2020；abstract) — 機器學習由穿戴訊號估計膝屈伸及內收力矩，兩顆 IMU 的推估仍有準確度限制。
- **PMID-30970538** [Estimation of the Knee Adduction Moment and Joint Contact Force during Daily Living Activities Using Inertial Motion Capture.](../sources/PMID-30970538.md) (2019；abstract) — 估計膝內收力矩及接觸力使用慣性動作捕捉與模型，不能從單一膝角直接得到負荷。
- **PMID-31888943** [Current clinical utilisation of wearable motion sensors for the assessment of outcome following knee arthroplasty: a scoping review.](../sources/PMID-31888943.md) (2019；abstract) — 膝置換術後穿戴感測回顧指出評估程序不一致，追蹤指標仍需要標準化。
- **PMID-28241434** [Data Collection and Analysis Using Wearable Sensors for Monitoring Knee Range of Motion after Total Knee Arthroplasty.](../sources/PMID-28241434.md) (2017；abstract) — 膝置換後的穿戴 ROM 監測展示連續追蹤方法，屬於特定感測方案的支持。
- **PMID-27371547** [Validation of Quantitative Measures of Rotatory Knee Laxity.](../sources/PMID-27371547.md) (2016；abstract) — pivot-shift 的慣性與影像方法可區分誘發測試分級，不能據此由日常膝角診斷 ACL 損傷。
- **PMID-25886558** [Gait assessment as a functional outcome measure in total knee arthroplasty: a cross-sectional study.](../sources/PMID-25886558.md) (2015；abstract) — 術後步態功能可能與其他改善不同步，支持採多指標追蹤，不能只以單一 ROM 判定恢復。
- **PMID-26032657** [Patient-reported outcome measures versus inertial performance-based outcome measures: A prospective study in patients undergoing primary total knee arthroplasty.](../sources/PMID-26032657.md) (2015；abstract) — 患者回報與慣性功能表現量測可互補，兩類結果衡量的功能面向並不完全相同。
- **PMID-22153947** [Function and quality of life in patients with recurvatum deformity after primary total knee arthroplasty: a review of our joint registry.](../sources/PMID-22153947.md) (2012；abstract) — 2,587 例初次 TKA 的 2 年登錄追蹤：術後過伸分為 0°、1–5°、6–10°、>10°；1–5° 的功能分數與 0° 相近，>5° 的部分 SF-36 分項較差，且與內外側移位 >5 mm 的整體鬆弛相關。
- **PMID-22459239** [Inertial sensor-based feedback can reduce key risk metrics for anterior cruciate ligament injury during jump landings.](../sources/PMID-22459239.md) (2012；abstract) — 即時慣性回饋訓練改變部分 ACL 風險相關動作指標；風險指標改善不等同傷害發生率降低。
- **PMID-23110821** [Inertial sensor motion analysis of gait, sit-stand transfers and step-up transfers: differentiating knee patients from healthy controls.](../sources/PMID-23110821.md) (2012；abstract) — 步行、坐站與階梯轉移的慣性測試可補充完成時間，提供多任務功能評估思路。

[首頁](../README.md) · [引用主張](../CLAIMS.md)
