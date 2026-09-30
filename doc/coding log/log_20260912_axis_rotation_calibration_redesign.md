---
tags: [coding-log, calibration, axis-rotation]
date: 2026-09-12
summary: 落地 2026-09-08 會議裁決「單顆 IMU 獨立判定安裝軸向」的前三項桌前工作——axisSwap:boolean 換成連續值 axisRotationDeg:number、原始向量旋轉法（非角度輸出）解出貼裝角、合成資料掃過 φ×α 驗證不重蹈提案 A 的退化 bug；過程中發現並修正一個推導中的真實 bug（az 正負號遺失，導致 |pitch|>90° 時恆等式失效）與一個測試技巧本身的 bug，皆靠實際跑測試而非手算發現。
---

# 2026-09-12 校準軸向重新設計 — axisSwap:boolean → axisRotationDeg:number

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION]] ·
> [[log_20260908_meeting_single_imu_axis_orientation|09-08 會議:方案設計]] ·
> [[log_20260911_meeting_dynamic_module_system|09-11 會議:與模組系統拆成兩條軌道]]

## 背景

09-11 裁決會議把「App 端執行期動態模組系統」拆成兩條互不依賴的軌道,其中一條是
「校正精靈重新設計 → 現在就做,走傳統非模組化路線」,採用 09-08 會議已診斷的
raw-vector rotation + `atan2` 方案。09-08 會議的「後續行動」列了四項,前三項不需要
硬體:

1. 桌前:寫合成資料驗證組(planted φ × 掃過的動作幅度 α)
2. `calibration.ts`:抽出 `recalibrateAxis(limb)` 獨立函式,精靈步驟改呼叫同一份邏輯
3. 資料模型:`axisSwap:boolean` → `axisRotationDeg:number` migration,舊資料標記
   `legacy/unverified`
4. 真機驗證(需要裝置,本次不做)

本次做完 1–3。目標平台確認是 `IRMS_App_Tauri`(09-11 會議已定案,Electron 版
`IRMS_App` 準備退役)。

## 物理推導

韌體(`IRMS_Sensor/imu.h`)以 `accPitch = atan2(ay,az)`、`accRoll = atan2(ax,az)`
算出角度——同一個共用分母 `az`,不是同一個向量的兩個線性分量,所以不能對「角度輸出」
本身做旋轉(已否決的提案 A 的錯誤)。正確做法是先反推原始向量方向,旋轉後再重新算
`atan2`。

`rotationDeg` 定義為感測器貼裝繞自身法向量偏轉的角度:0°=正貼、90°=貼歪整
90°(對應舊版 `axisSwap` 的 false/true)。旋轉是真旋轉(行列式 +1),舊版二元 swap
是不變號的純交換(行列式 -1、屬於反射)——兩者在拓樸上不可能連續重合,因此 90° 邊界
必然有一軸出現舊版沒有的變號,這不是實作疏漏,是兩種操作的本質差異,由既有的
`invert` 欄位吸收。

`recalibrateAxis`(取代舊版二元 `detectAxisSwap`)用精靈既有的單一參考動作(前抬
大腿/後勾小腿)的站直基準+動作終點兩點,解出精確解(非小角度近似):
`tanφ = (ax_m·az_b − ax_b·az_m) / (ay_m·az_b − ay_b·az_m)`(下標 m/b 為動作終點/基準)。

## 過程中發現並修正的兩個真實 bug

**Bug 1(生產代碼,靠 `npm run test` 抓到,不是手算發現)**:第一版
`rotateRawAxes` 用 `az=1` 固定代表值反推向量,`tan()` 以 180° 為週期
(`tan(30°)=tan(210°)`),會遺失 `atan2` 原本用分母正負號記下的象限資訊。結果是
`rotationDeg=0`(理論上該是恆等變換)在 `|pitch|>90°` 時完全不是恆等——`poseForKnee(120)`
被算成 60、`poseForKnee(179)` 被算成 1。這正是這個 App 的核心量測範圍(膝彎曲可達
150°+),不是邊緣案例。修法:用 `cos(pitch)` 的正負號還原 `az` 的正負號
(`reconstructTiltVector`,`angleMath.ts`)。修完後又發現向量沒有單位化會讓
`recalibrateAxis` 的基準/終點兩點尺度不一致(靜止擷取時重力量值恆為 1g,單位化才是
物理上該有的長度),改用單位化向量 + 精確的交叉項公式(見上)。

**Bug 2(測試技巧本身的 bug,不是生產代碼)**:第一版驗證測試用「以 `-θ` 反旋轉出
raw 姿勢、再以 `+θ` 正向驗證」的技巧複驗零位不變式,這個技巧假設 `rotateRawAxes` 是
可組合的(`R(θ)·R(-θ)=I`),但 `az` 正負號是每次呼叫依當下輸入的 `cos(pitch)` 現場
推導,不是跨呼叫追蹤的狀態——真實 App 從不會把 `rotateRawAxes` 的輸出餵給另一次呼叫
(`effectiveRaw` 只餵真正的 raw 讀值),所以這個組合性質不是生產代碼需要的性質,是
測試自己引入的多餘假設。改為直接指定 raw 姿勢、算出對應 zeroRaw(與
`buildQuickZeroPatch` 的真實用法同構),不再依賴反旋轉。

兩個 bug 都是靠**實際跑 `npx vitest run`** 抓到,不是讀程式碼發現——第一次跑出
`poseForKnee(179)` 算成 1 的結果時才回頭重新推導,證實了「evidence beats plan」。

## 合成資料驗證(2026-09-08 會議的強制前提)

新增 `calibration.axisRotationSweep.test.ts`:不獨立重新推導三角函數(那樣抄錯的
風險和被驗證的公式一樣高),而是直接呼叫 App 自己的 `rotateRawAxes` 反向合成
「感測器在貼裝旋轉 φ、真實動作幅度 α 下會讀到什麼」。掃過 φ ∈
{-80,-45,-10,0,10,30,45,60,80,90}° × α ∈ {10,25,40,55,70,85,89}°(涵蓋提案 A 的
已知退化區間),驗證:

- 同一個 φ,不同 α 解出的結果彼此一致(散佈 < 0.001°)——這正是提案 A 在大幅度動作
  下會失敗的地方(退化成恆定 45°,與真實 φ 無關)
- 對照組:直接對角度輸出做 `atan2(Δroll,Δpitch)`(提案 A 的手法)在 α=85° 時確實
  偏離真實 φ 超過 5°,而新公式在同一組資料下仍準確
- φ=0°/90° 邊界與 `migrateSettings` v12 的 `false→0/true→90` 數字映射一致

## 資料模型 migration(v11→v12)

`Settings`:`proximalAxisSwap/distalAxisSwap: boolean` →
`proximalAxisRotationDeg/distalAxisRotationDeg: number` +
`proximalAxisRotationVerified/distalAxisRotationVerified: boolean`(仿照既有
`proximalRollVerified` 的存證欄位模式)。`migrateSettings` 把舊布林映射為
0°/90° 並標記 `verified:false`(legacy/unverified)——**唯一已知的實機校準值是
`axisSwap:false/false`,`rotationDeg=0` 時是精確恆等式,不受這次遷移影響**;
真正的「符號歧異」只會發生在未來若有裝置是 `axisSwap:true` 時,但那種資料本來就
無法在新舊模型間精確互轉,標記未驗證是誠實的做法,不是假裝已解決。

`CalibrationSnapshot`(`sessions.calibration` JSON 快照)同步改欄位。`HistoryView`
的分析 modal 新增第三種提示:漂移(數值真的變了)/ 未驗證(舊資料換算而來,尚未
用新方法重新驗證)/ 一致,三者分開表示,語氣不同——這是 09-08 會議「先只在
`calibrationDrift` 接上這個旗標」的具體落地範圍,manifest 之類的更大範圍改動不在
這次動工。

## 驗證

- `npx vitest run`:26 files / 282 tests 全綠(含新增的 12 個合成資料掃描測試)
- `npm run typecheck`:乾淨無錯誤
- `npm run build`:成功,bundle 大小無異常變化

## 尚未做的(留給下次)

- 09-08 會議行動項第 4 項:真機驗證(同一動作重覆擷取 2–3 次比較 φ 一致性當弱驗證
  信號,並人工核對解出的 φ 是否落在物理合理範圍)——需要裝置,本次不做
- 「獨立於精靈之外的單肢段重校準入口」(09-08 會議提到但 UI 位置待定)——UI/IA
  決策依既有慣例交給 Gemini,這次不擅自設計
- `doc/README.md` §2.1 六軸方向定義的正式文字——依會議裁決留到真機驗證通過後再回頭改
