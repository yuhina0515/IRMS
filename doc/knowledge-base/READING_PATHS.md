# 閱讀路徑

「優先閱讀」代表與 IRMS 問題的關聯，不是證據品質排名。先讀本庫導讀，再讀來源摘要；需要引用詳細方法或數值時，取得原始全文。

## 寫專題與研究背景

依序閱讀 [復健背景](guides/07-rehabilitation-context.md)、[下肢 IMU 方法回顧](sources/PMID-31991862.md)、[下肢運動評估回顧](sources/PMID-29476427.md)、[骨科使用者評估](sources/PMID-30669657.md)、[遠距整體證據與限制](sources/PMID-31679511.md)。寫作時使用 [引用主張表](CLAIMS.md)，把背景需求、工程可行性與尚待驗證的效果分開。

## 改善角度與佩戴校準

先讀 [量測模型](guides/01-measurement-model.md) 與 [校準](guides/02-calibration.md)，再讀 [Seel 的關節角方法](sources/PMID-24743160.md)、[校準回顧](sources/PMID-32545227.md)、[軸估計](sources/PMID-32580394.md)、[軟組織／穩定性](sources/PMID-29933568.md)、[運動學串擾](sources/PMID-10828334.md)。接著把文獻需要的輸入與 `RawAngles` 逐欄對照。

## 研究濾波與即時回饋

閱讀 [訊號與延遲](guides/03-signal-fusion.md)、[Madgwick 作者報告](sources/ALG-MADGWICK2010.md)、[VQF](sources/ALG-VQF2023.md)、[演算法比較](sources/PMID-33916432.md)、[回饋導讀](guides/06-feedback-and-learning.md)。先建立同資料、同因果模式的比較，再測完整 LED／蜂鳴器鏈。

## 規劃量測驗證與研究

閱讀 [統計導讀](guides/04-validation-statistics.md)、[Bland–Altman](sources/PMID-26110027.md)、[ICC](sources/PMID-27330520.md)、[SEM](sources/PMID-15705040.md)、[SPIRIT 2025](sources/PMID-40294593.md)、[CONSORT 2025](sources/PMID-40228499.md)。採用 [驗證計畫](VALIDATION_PLAN.md) 建立版本與資料包，先定主要問題及可接受范圍。

## 開發辨識與新模組

閱讀 [辨識導讀](guides/05-gait-and-recognition.md)、[居家運動與非運動資料](sources/PMID-37051835.md)、[計次比較](sources/PMID-32854288.md)、[GAITEX](sources/PMID-41469404.md)、[DIODEM](sources/PMID-40702014.md)。按受試者／試次分割，再依 [模組契約](../MODULE_CONTRACT.md) 設計生命週期。

## 支持可靠硬體與資料鏈

閱讀 [硬體](guides/08-hardware-and-firmware.md)、[BLE](guides/09-ble-and-timing.md)、[數據](guides/10-data-and-reproducibility.md)、[生命週期與安全](guides/11-security-and-lifecycle.md)。官方文件按使用中的晶片、平臺與版本核對；參考 stable／latest 不等於已升級依賴。
