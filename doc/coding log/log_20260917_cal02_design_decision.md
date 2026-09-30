---
tags: [coding-log, calibration, cal-02]
summary: CAL-02 formal design decision — measurement semantics, mounting assumptions, capture-flow requirements, and explicit quantitative acceptance thresholds for the next hardware session. Consolidates and supersedes the three scattered 09-16 analysis logs as the single reviewable decision document.
date: 2026-09-17
---

# CAL-02: calibration model design decision

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260916_status_and_task_plan|CAL-02 原始完成標準]] ·
> [[log_20260915_live_calibration_singularity|完整失敗史]] ·
> [[log_20260916_hinge_roll_shared_denominator_fix]] ·
> [[log_20260916_knee_frame_reconciliation_candidate]]

## 狀態

本檔案是任務計畫表 CAL-02 要求的正式決策文件,取代三份 09-16 log 分散的分析,成為單一
可審閱、可反駁的版本。**不含真機驗證**——裝置仍不在身邊,所有數字在標記「待實機驗證」前
都只是合成證明或既有真機觀察的推論,不冒充臨床精度驗收。

## 一、量測語意(每個輸出值實際代表什麼)

| 值 | 定義 | 值域 | 目前信心等級 |
|---|---|---|---|
| **thigh / shin(Pitch)** | 肢段沿其**屈曲軸**(由 `deriveHingeAxis` 從站姿+單一參考動作外積解出)的主要轉動角,`atan2(側軸分量, 基準軸分量)`。0°=站直基準,正負號由校準精靈的 invert 判定決定。 | 數學上 (-180°,180°]。解剖上:大腿抬腿约 0–90°、小腿勾腿/深屈膝可達 ~150°+。 | **高**——外側貼裝下,站姿收斂 ~0°、深屈膝(~150°)在真機上已驗證正確([[log_20260915_live_calibration_singularity]] 的「pitch 已修正」段落)。 |
| **thighRoll / shinRoll** | **2026-09-17 起重新定義**:重力向量偏離「屈曲平面」的角度,`asin(屈曲軸分量 / 向量長度)`,不是繞某個軸轉了幾度。代表屈曲軸估計殘留誤差或軟組織/綁帶耦合——**不是獨立的解剖自由度**,是校準品質/貼裝穩定度的指標。 | 結構性有界 [-90°, 90°](今天以前會退化到 ±180°,已修)。 | **中**——退化 bug 已修,但「多少 roll 算正常、多少算警訊」目前沒有實機資料校準門檻(見下方待補)。 |
| **kneeRoll** | `shortestArcDelta(thighRoll, shinRoll)`,帶符號,正=外翻(valgus)、負=內翻(varus)。 | 隨 roll 收斂到約 [-180°,180°]。 | 同 roll——次要/品質指標,不是主要臨床判定依據。 |
| **knee(膝夾角)** | 兩肢段原始重力向量的夾角(`vectorAngleDeg(raw.thighAccel, raw.shinAccel)`)減站姿夾角(`kneeZeroRaw`)。**不經過 pitch/roll 分解**——2026-09-15 決策,因為深屈膝時動作可能主要落在感測器 x/y 平面,轉回 pitch 再相減會再次丟失資訊。 | [0°, 180°]。 | **中,有已知未修的結構性風險**——見下方「未解決的反例」。這是驅動達標/警報邏輯的**主要**臨床量測值,風險等級高於 roll。 |

**未解決的反例(不在今晚修復範圍內)**:上面的 `knee` 公式直接比較兩顆獨立貼裝 IMU 的原始
向量,而兩顆 IMU 的座標系彼此獨立、未知——`calibration.redesign.test.ts` 的合成反例證明,
即使兩肢段真實同步轉動(真實相對角為零),只要遠端感測器的貼裝方向與近端不同,直接比較就會
算出假的相對角,且扣除站姿夾角(純量)無法補償。`reconcileToReferenceFrame`(`angleMath.ts`,
2026-09-16)是一個合成驗證過的候選修法,**刻意未接上**——它依賴「髖屈軸與膝屈軸方向平行」
這個假設(見下方「貼裝假設」),而這個假設從未在真機上獨立驗證過,且 knee 是主要臨床量測值,
本專案已有兩次「幾何看似正確卻出真實 bug」的前科(GitHub issue #3)。**這是 CAL-03 必須先解決、
而非可以跳過的項目**——見下方驗收門檻。

## 二、貼裝假設(明文化,過去只是隱含在公式裡)

1. **單一鉸鏈假設**:每個肢段的參考動作(大腿前抬、小腿勾腿)應為單一鉸鏈的純轉動,
   `deriveHingeAxis` 的外積解法才成立。真實違反時(綁帶滑動、動作不夠「純」)沒有內建的
   冗餘檢查機制——外積法只用「站姿」與「參考動作終點」兩個平均點解軸,沒有第三個點可以
   交叉驗證。這是 [[log_20260915_live_calibration_singularity]] 已指出、**至今仍未修補**
   的已知弱點。
2. **感測器貼裝方向任意,但單一參考動作內固定**:外積法允許任意 3D 貼裝方向,但要求同一次
   擷取內感測器沒有相對滑動。
3. **(新增,`reconcileToReferenceFrame` 專屬)髖屈軸與膝屈軸方向平行**:假設近端(髖屈)與
   遠端(膝屈)兩個獨立參考動作實際上繞的是同一個真實世界方向(矢狀面內外側軸)。這是**現有
   pitch/roll 正負號慣例與 kneeRoll 內外翻判定已經隱含依賴的同一個假設**,不是新引入的,
   但從未被獨立驗證過是否在真實解剖/貼裝條件下成立。

## 三、擷取流程與現行品質門檻(已在程式碼裡,今天首次整理成表)

| 常數 | 值 | 把關對象 |
|---|---|---|
| `CAPTURE_STD_LIMIT` | 3° | 站姿/前抬大腿/勾小腿三步的環形標準差上限,超過視為不穩定、拒絕擷取 |
| `CAPTURE_STD_LIMIT_ABDUCTION` | 4° | 選配外展步驟的標準差上限(較寬鬆,單腳站立本身較難完全靜止) |
| `CAPTURE_DELTA_MIN` | 20° | 站姿與參考動作終點的最小角位移,太小則外積法退化成雜訊主導,拒絕擷取 |
| `CAPTURE_ROLL_DELTA_MIN` | 15° | 外展步驟判定 roll 反相方向所需的最小 roll 位移,不足則不更新 roll invert 判定 |
| `COUPLING_RESIDUAL_RATIO_WARN` | 0.4 | 外展步驟中 pitch 殘留 / roll 位移比例,超過門檻顯示耦合殘留提示(非阻斷) |
| `baselineIsObservable`(`|az| >= 0.1`) | — | 站姿基準向量的奇異區保護:太接近奇異點時拒絕擷取,避免產生看似成功實則不可信的校正 |

這些門檻是既有實作,不是今天新設計的,但**過去分散在程式碼各處、從未整理成單一表格**,是
CAL-02 完成標準要求的「repeated/multi-sample capture」「quality rejection」項目的既有答案。
**評估結論:這些門檻設計時針對的是 pitch/hinge-axis 品質,沒有一項直接檢查「這次擷取出來的
roll 語意是否合理」**——這是下一節的缺口。

**選配動作可及性**:外展步驟維持選配(2026-09-15 裁決維持,避免犧牲單腳站立可及性設計)。
大腿/小腿主要兩步(站姿、前抬、勾腿)非選配——沒有它們就沒有 hinge axis 可用。

**獨立肢段重校準**:目前**不存在**,`buildCalibrationPatch` 架構上要求大腿與小腿的參考動作
一起送入才能產生 patch。`OPTIMIZATION.md` 已記錄這是待做項但未排入時程、UI 位置留給 Gemini
覆核。**CAL-02 的裁決:明確排除在本輪範圍外**,不是本次 Roll/knee 修復的驗收條件,留待
之後有明確排程時再展開為獨立任務。

## 四、即時信心/品質指標——已知缺口,今晚不新增程式碼,只記錄決策

Roll 退化到 ±180° 這件事,雖然是 bug,但客觀上也是使用者(或督導者)一眼就能看出「這裡有問題」
的訊號。修好之後 roll 永遠落在看起來「正常」的 [-90°,90°] 區間——**這代表原本靠「數字爆炸」
間接提供的品質警訊消失了**,而目前沒有任何顯式機制取代它:App 裡沒有任何地方讀取 roll 的
即時大小來標記「這個肢段讀數可能不可信」。

**決策**:這是一個真實的設計缺口,但**不在今晚新增具體門檻數字**——`COUPLING_RESIDUAL_RATIO_
WARN=0.4` 是擷取時的門檻,不是即時串流時的。既有真機記錄裡只有質性描述(「thighRoll 全程
維持小幅度」),沒有足夠精確的數字可以負責任地訂出「即時 roll 超過多少度算低信心」——擅自
發明一個數字違反 CAL-02 本身的規則(「do not invent accuracy claims from visual
plausibility」)。**目標設計方向記錄如下,留給下次真機資料校準**:串流角度中加入一個衍生的
「肢段信心」指標,以即時 |roll| 相對某個門檻的比例表示,門檻本身需要用下次真機 session 的
標籤化資料(哪些時刻是已知良好貼裝、哪些時刻是刻意鬆脫測試)反推,不能用這次沒有動作標籤的
舊 trace 湊數。

## 五、下次真機驗收的明確量化門檻

裝置可用時,依序執行以下驗收,每項都要有具體數字紀錄,不接受「看起來正常」這種質性結論:

1. **Pitch 迴歸**:站姿 thigh/shin pitch 應收斂至 0° ± 5°(既有已驗證行為,此為回歸測試,
   非新驗收)。深屈膝(目視/量角器讀數 ≥ 140°)時,App pitch 讀數與量角器讀數差異應
   ≤ 10°——沿用先前真機驗證已確認的量級,此次重點是確認 Roll 修復沒有意外影響 pitch 路徑
   (理論上不會,`projectOntoHingeFrame` 的 pitch 公式本次未變動,但**未變動不等於不用測**)。
2. **Roll 有界性**:同一段深屈膝動作中,thighRoll/shinRoll 全程不得出現跳變(相鄰取樣點差
   超過 30°/40ms 視為跳變,沿用既有 `HYSTERESIS_DEG` 量級作為參考尺度,非正式門檻),且絕不
   超出 [-90°,90°] 結構性邊界(理論保證,驗收目的是確認實作與理論一致,不是發現新邊界)。
3. **Knee 反例驗證(P0,新增,對應「未解決的反例」)**:錄製同一段 session 的完整 `V:` 向量
   trace 與完整校準設定(`proximal/distalHingeAxis`、`proximal/distalZeroAccel`)——**這次
   務必一起存,上次遺失設定導致 66,927 筆 trace 無法逐點驗證**。離線重播比較「現行 raw-vector
   公式」vs `reconcileToReferenceFrame` 候選公式的 knee 讀數:
   - 若兩者在同一段 session 中的差異 ≤ 5°(全程),暫時判定兩者等效,現行公式風險可接受,
     `reconcileToReferenceFrame` 可以不必立即接上。
   - 若兩者差異 > 5° 且候選公式與量角器/目視參考動作更吻合,啟動 CAL-03 接上候選公式。
   - 若兩者差異 > 5° 但候選公式**沒有**更接近參考動作(即髖屈/膝屈軸平行假設本身站不住腳),
     兩個公式都不可信,需要另外設計——不能因為「已經寫了候選公式」就預設它是答案。
4. **重複擷取一致性**:同一人同一次穿戴,重跑校準精靈 3 次,比較三次算出的 `proximalHingeAxis`
   /`distalHingeAxis` 彼此夾角。若標準差 > 10°,代表 `CAPTURE_STD_LIMIT`/`CAPTURE_DELTA_MIN`
   現有門檻不足以保證 hinge axis 估計的擷取間一致性,需要重新檢討門檻數字或擷取流程本身
   (例如改成多次參考動作取平均,而非單次)。

**驗收記錄格式**:比照 issue #3 既有慣例,每項寫明確切數字、裝置韌體版本、App 版本(build
identifier)、環境條件(貼裝位置、使用者),不是「測過了、正常」這種結論句。

## 六、明確排除在本輪 CAL-02 範圍外(留待之後,不是遺忘)

- 獨立肢段重校準入口(見上,架構與 UI 皆未設計)。
- 即時信心/品質指標的具體門檻數字(見上,需要真機標籤化資料才能負責任地訂)。
- 擷取階段的多次參考動作平均/冗餘檢查(第五節第 4 項驗收若失敗才需要展開設計)。
- `reconcileToReferenceFrame` 是否接上生產路徑——這是**下次真機驗收的直接結果**,不是這份
  文件能單方面決定的事。

## ✅ 本文件的驗證方式

- [x] 表格中的常數/公式逐一回頭核對對應原始碼(`angleMath.ts`、`calibration.ts`、
  `useStore.ts`),而非憑記憶轉述——數值截自今晚實際讀取的程式碼。
- [x] 「未解決的反例」與「貼裝假設」章節直接對應 `calibration.redesign.test.ts` 現有的兩個
  合成測試,可執行驗證(`npx vitest run src/services/calibration.redesign.test.ts`)。
- [ ] 真機驗收:見第五節,尚未執行,裝置不在身邊。

## 📝 後續待辦

CAL-03(真正的實作/wizard 行為改動)在裝置可用、且完成第五節第 3 項 knee 反例驗證後才能
啟動——這是本文件唯一設定為「阻塞」的驗收項,其餘(pitch/roll 迴歸、重複擷取一致性)是
確認性質,預期通過但仍需要真的測。
