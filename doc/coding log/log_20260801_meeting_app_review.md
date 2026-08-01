---
tags: [coding-log, meeting]
date: 2026-08-01
summary: "App 全面檢視多代理會議:三方(出貨務實派/風險結構派/使用者臨床派)獨立提案 + 交叉詰問。裁決順序為『判定正確性批次 → 桌面燒錄旋轉記錄 → migration + session 收尾』。最重大發現:roll 完全不進入任何判定路徑,而 07-17 整批工作都花在 roll 正負號上;另確認出貨預設動作 Backward Extension 會從靜止不動的腿計出幻影 reps"
---

# 2026-08-01 會議紀錄 — App 全面檢視與優先順序裁決

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260801_project_status_analysis|前置:專案現況解析]] ·
> [[ROADMAP|架構與代碼計畫]] · [[OPTIMIZATION|優化待辦]] ·
> [[log_20260717_calibration_abduction_fix|被本次會議重新評價的 07-17 工作]]

## 📋 議題

**在單人開發者精力有限的前提下,IRMS 接下來該做什麼?並產出一份跨領域的 App 問題清單。**

## 👥 與會者與立場

| 代號 | 觀點 | 初始主張 |
|---|---|---|
| **P** | 出貨務實 / 硬體現實派 | 先燒錄韌體。感測路徑從未驗證,一切軟體精修都是臆測 |
| **R** | 風險 / 結構完整派 | 先做 migration runner + ErrorBoundary。v1.0.1 已在使用者手上而 schema 無法演進 |
| **C** | 使用者 / 臨床操作派 | 先修判定與安全缺陷、讓校準精靈可通過、讓 History 有臨床意義 |

進行方式:三方獨立提案(互不可見)→ 交叉詰問(每份主張交給另一觀點攻擊)→ 主席裁決。
主席針對所有承重主張獨立覆核程式碼,結論如下。

---

## 🔥 三方一致確認的重大發現

以下每一項都經過**至少兩個獨立觀點各自發現、加上主席親自覆核**,視為既成事實。

### F1|roll 完全不進入任何判定路徑 —— 本次會議最重大的發現

```
grep -n "roll\|Roll" services/guidance.ts services/movementMetric.ts services/triggerEngine.ts
→ 無輸出
```

`computeMetricSample`(`movementMetric.ts:76-88`)只讀 `angles.thigh` 與 `angles.knee`;三種
`TriggerType` 全是 pitch 導向;連 `zone.overLimit`(`movementMetric.ts:92`)也是從 `sample.value`
算出——**roll 連安全警報都不參與**。roll 的去向只有:`Leg3D` 3D 模型、詳細數值 tab、
History 疊圖線、CSV 欄位。純顯示與匯出。

**推論**:校準精靈第 5 步(全流程唯一需要單腳站立、對平衡受限患者最困難的一步)所產出的
`thighRollInvert`/`shinRollInvert`,只影響一個**裝飾性數值的正負號**。而 2026-07-17 那整批
工作——逐軸解耦、stdDev 3°→4°、`thighRollVerified`/`shinRollVerified` 持久化旗標、
Dashboard/Settings 的「方向未驗證」警示——全部花在這條路徑上。

更糟的是那個警示本身:它對臨床端宣稱「方向未驗證」,而該畫面的判定根本不讀方向。這是一個
**假的負面訊號**,只會訓練使用者忽略警告。

### F2|出貨預設動作會從一條靜止不動的腿計出幻影 reps

`REST_TOLERANCE` 是寫死的 30°(`movementMetric.ts:17`),`computeMetricZone` 對**所有**
trigger type 無條件回傳 `rest: REST_TOLERANCE`(第 94、96 行),而 `zone.min` 逐動作變動。
狀態機隱含假設「`rest < zone.min` 且有實質間距」,**這個不變式從未被任何地方檢查**。

出貨預設 `Backward Extension (直膝後擺)`:`targetAngle: 20`、`segment_extension`
(`shared/defaults.ts:28-35`)→ `zone.min = 20 ≤ rest = 30`。目標區**整個落在休息區內**。

主席實測狀態機(`triggerEngine.ts:59-92`),迴圈確實閉合:

```
腿靜止停在 25°:
  idle   → strictIn (25≥20) → holding
  holding → relaxedIn 恆真 → percent 到 100 → restPending + onRepCompleted()
  下一封包 → 25 ≤ 30 → idle + onRestCompleted()
  下一封包 → strictIn → holding … 週期約 2 個封包閉合
```

每 `holdTimeMs`(預設 2000ms)產生一次 rep + 一次 `CMD:GOAL` 雙響。遲滯只會**擴大**區間讓
迴圈更穩固;`EXIT_GRACE_MS` 只在離區時作用,而這裡永遠不離區。

Session 進行中,這些捏造的 reps 會寫進 `sessions.repsCompleted`,督導端看到「40 reps」而那條
腿從未移動過。**一個看起來合理的錯誤數字,比一個明顯壞掉的數字更有害。**

範圍比單一預設值更廣:**任何** `zone.min ≤ 30` 的動作都會迴圈,包含 `joint_angle` 只要
`targetAngle - tolerance ≤ 30`(如 target 35 / tol 10)。使用者在 ActionsView 自建溫和的
早期復健動作會頻繁踩到,而沒有任何驗證阻擋。其餘四個出貨預設(Squat min 80、SLR min 45、
Elbow min 88、Shoulder min 90)已覆核為安全。

### F3|警報有三個獨立缺陷

1. **未與 session 綁定**:`sessionController.ts:134` 無條件呼叫 `engine.handle(...)`。
   `onRepCompleted` 有 `session.running` 檢查(第 58-61 行),`onOverExtension`(第 70-74 行)
   **沒有**。連線但未開始 Session 時,坐上椅子(膝約 90-120°)就能觸發預設 Squat 的
   `overLimit = 90+10+10 = 110°` 長鳴。
2. **UI 完全無法靜音**:`grep BleCommand|ALARM src/renderer/` 只命中 `sessionController.ts`。
   沒有任何按鈕能送出 `CMD:ALARM_OFF`。患者腿上綁著蜂鳴器,唯一出路是把腿移到 App 滿意的
   姿勢,或拔掉連線。
3. **短暫重連後不重新武裝**:`TriggerEngine.alarmActive` 只在 `reset()` 清除
   (`triggerEngine.ts:114-117`),而 `reset()` 只由 `handleHardwareError` / `startSession` /
   `endSession` 觸達。斷線訂閱器(`sessionController.ts:83-89`)只重設 `lastLed`/`lastAlarm`。
   BLE 短暫中斷、第 2 次重連成功、患者仍超限 → `overExtended === alarmActive` → 不發事件 →
   `ALARM_ON` 永不重送。硬體端 `feedbackAllOff()` 已自行靜音,所以裝置真的不響。

   R 的修正(採納):不是「永久解除武裝」。患者一旦降回安全範圍,`onOverExtension(false)`
   就會觸發並恢復正常。**解除武裝的區間恰好是「跨越重連的那一次超限事件」**——也就是警報
   唯一有保護價值的那個窗口。而且它會自我痊癒,因此永遠不會在除錯時重現。

### F4|角度數學對 ±180° 換行不安全(P 發現,C 承認漏掉並提升為其第一順位)

主席覆核韌體原始碼確認:`imu.h:55-56` 兩軸皆為 `atan2f(_, az)`,值域 −180…+180,且共用 `az`
分母。下游全部以普通實數處理,無任何 wrap 感知:

- `calibration.ts:32-37` — 算術平均與變異數
- `smoothing.ts:34-37` — 線性 EMA `x += α(new − x)`
- `useStore.ts:293-301` — `raw * ±1 + offset`,以及 `knee: Math.abs(thigh - shin)`

失效情境:若某塊板子綁成站直時落在 ±180 分支切點,樣本在 179.6 / −179.8 間抖動,
`computeCaptureStats` 回傳平均約 0、stdDev 約 180 > `CAPTURE_STD_LIMIT`(3),精靈永遠回報
「偵測到晃動,請保持靜止後重試」——**校準永遠無法完成,而錯誤訊息叫使用者做唯一沒用的事**。
EMA 跨越切點時走長路經過 0,`knee` 會短暫讀到約 360°,超過任何 `overLimit` → `CMD:ALARM_ON`。
配合 F3-2(無法靜音),就是一支沒有軟體開關的蜂鳴器。

**關鍵爭點**:P 主張這證明「必須先燒錄」。C 反駁得更有力且被主席採納——這個缺陷是
**掛載方向相依**的,燒一次只能取樣一種掛載方向,無法定案;而 App 第 1 步明文承諾
「方向與角度不必在意」(`CalibrationWizard.tsx:170-172`),`detectAxisSwap` 就是為了吸收
90° 旋轉而存在。**一個宣稱掛載無關的 App,不可能用單一掛載方向驗證 wrap 行為。**
真正的修法完全不需要硬體,而且今天就能用 Vitest 對合成序列證明:圓形統計量、最短弧 EMA、
最短弧 knee 差 + 送出 `CMD:ALARM_ON` 前的物理範圍鉗制。

### F5|schema 無法演進 + session 孤兒列

`db.ts:29-69` 只有 `CREATE TABLE IF NOT EXISTS`;`grep user_version|ALTER TABLE` → 0 命中。
`repsCompleted` 只在 `db.ts:151-156` 的 `end()` 寫入一次,預設 0(`db.ts:52`);
`grep beforeunload|before-quit|will-quit` → **0 命中**。

- 加任何新欄位:全新安裝正常,v1.0.1 升級則 `IF NOT EXISTS` 空轉,欄位不存在,
  第一次 `INSERT` 拋 `no such column` → `session:start` reject → 使用者看到
  `Failed to start session.`,必須刪掉整個資料庫(連同歷史)才能再錄。開發者用自己的 dev DB
  永遠看不到。
- Session 中途關窗:`end()` 從未執行 → `endTime NULL`、`repsCompleted 0`,而 `sensor_data`
  裡有整場資料。HistoryView 對一場真實的 12 reps session 顯示 `Reps: 0`,且無法回推。

**R 對 C 的致命一擊(主席採納)**:C 的 History 改造計畫要新增 `sessions` 欄位(peak、
時長摘要)與 `session_reps` 資料表。**在 migration runner 存在之前,那個計畫根本無法部署**——
新表會建起來,新欄位不會,得到一個半套 schema,比兩者都沒做更糟。這不是競爭優先項,
是 C 沒有計價的相依性。

### F6|判定參數輸入零驗證(兩個獨立觀點各自發現)

`ActionsView.tsx:163-181`、`SessionControlPanel.tsx:59-83` 是裸 `type="number"` +
`parseFloat(...) || 0`,無 `min`/`max`;`db.ts:31-40` 無 `CHECK`。

- **負的 tolerance**:`zone.min > zone.max`(`movementMetric.ts:94`)→ `strictIn`
  (`triggerEngine.ts:68`)永不為真 → **rep 計數靜默永不前進**,且超限門檻反而縮小。
- **`holdTimeMs = 0`**:`(elapsed / 0) * 100`。第一個封包 `elapsed === 0` 時是 `0/0 = NaN`
  流入 `session.holdProgress`;之後 `Infinity` → `Math.min(100, Infinity) = 100` →
  **每次進區立即完成一下**,裝置變成計數吃角子老虎。(兩方各說對一半,主席合併。)

這與 F2 是**同一類**缺陷:判定參數的不變式無人強制。應以單一驗證模組 + 單一測試檔一次修完。

---

## ⚖️ 交叉詰問中被推翻或修正的主張

| 主張 | 裁決 |
|---|---|
| R:BLE 監聽器堆疊(`bluetooth.ts:52,75` 從未 `removeEventListener`)導致 N 個競速重連迴圈 | **駁回。** `onDisconnected`/`handleNotification` 都是 class arrow property,參考位址穩定。DOM 規範對相同 (target, type, callback) 三元組會去重,重複註冊是 no-op。主席與 P 各自獨立得出同一結論。 |
| C:「重連後警報永久解除武裝」 | **修正為**「解除武裝僅限跨越重連的那一次超限事件」——見 F3-3。範圍較小但更陰險(會自我痊癒,無法重現)。 |
| C:「靜止的腿會永遠嗶嗶叫」 | **修正。** 未開始 Session 時 `onRepCompleted` 早退(第 58-61 行),不會發 `CMD:GOAL`。幻影 reps + 嗶聲只發生在**錄製中**——也就是唯一會寫進資料庫的情況,結論不變。 |
| C:`acceptAllDevices: true` 讓患者面對原生 Chromium 選擇器 | **部分駁回。** `main/index.ts:92-116` 已 `preventDefault()` 並自動挑選名稱含 IRMS 的裝置,選擇器不會出現。仍值得改用 filter(15 秒掃全部 vs 掃目標),但不是使用者可見缺陷。 |
| P:FILTER_ALPHA 誤調會使遲滯/門檻常數失效 | **弱化。** τ=0.113s 確實偏短,但 App 端 `AngleSmoother` 是第二層濾波,雜訊經過兩層;且修法是 `config.h:34` 改一個 float 再燒錄,是調參不是架構風險,不足以凍結整份 backlog。 |
| P:「硬體驗證前一小時都不該花在別處」 | **推翻(P 自行撤回)。** 見下方裁決理由。 |
| R:「migration runner 是最高優先」 | **推翻(R 自行撤回)。** 捏造的 rep 數(寫入永久儲存的假臨床數字)嚴重度高於「無法寫入新數字」,且修法更小。 |
| Electron 主進程權限處理器無條件回傳 true(`index.ts:82-85`) | **非問題。** R 自行查證後清除:CSP 嚴格、無任何外部來源、`contextIsolation` 開啟、preload 只暴露固定 11 個方法。沒有遠端內容能發出權限請求。 |

R 另外主動清除的假警報:FK cascade 真的生效(`foreign_keys=ON` 在建表前設定)、
flush 失敗回補的順序正確(舊→新後截尾,丟最舊的)、production 依賴 `npm audit --omit=dev`
**0 漏洞**(19 項全來自 dev-only 的 `electron-rebuild → node-gyp → tar`)、
韌體 `onDisconnect` 會呼叫 `feedbackAllOff()` 所以 App 掛掉不會讓蜂鳴器卡住。

---

## 🏛 主席裁決

### 三方最終都收斂到幾乎相同的順序

交叉詰問後,P 把「燒錄」重新定義為**不需要受試者的桌面工作**;R 把 migration 降到第二;
C 把 wrap 數學提到第一。三份修正後的 top 3 高度重疊。裁決採納這個收斂結果:

**第一順位|判定正確性批次(桌面工作,全部可單元測試,約 2 天)**

一個 commit,一個驗證模組,一個測試檔:

1. `zone.rest` 不變式:`rest = Math.min(REST_TOLERANCE, zone.min - REST_MARGIN)`(margin 約 5),
   並在動作儲存時驗證。殺掉 F2 的整個缺陷類別。
2. wrap-safe 角度數學:`computeCaptureStats` 改圓形平均/變異數(`atan2(Σsinθ, Σcosθ)`);
   `AngleSmoother` 改最短弧 EMA(`d = ((new−x+180) mod 360) − 180`);`knee` 改最短弧差,
   並在任何值能觸達 `CMD:ALARM_ON` 之前加物理範圍鉗制。
3. 警報三修:`onOverExtension` 加 `session.running` 閘門;斷線訂閱器補 `engine.reset()`;
   新增「靜音警報」按鈕(目前 UI 完全無法送 `ALARM_OFF`)。
4. 數值輸入鉗制 + `min=` 屬性(F6)。
5. 單一 `resetFeedbackState()` 供所有 reset 路徑呼叫——順帶修掉
   `handleHardwareError` 補 `holdProgress: 0` 卻沒清 `inZone` 的問題。
6. `ErrorOverlay` 改為非阻擋(或加上「結束並儲存 Session」「中斷連線」按鈕)。
   目前是 `position:fixed; inset:0` 且無任何按鈕,I2C 故障時 End Session 實體上按不到。

**理由**:這批全部**只能在桌面證明,硬體無法證明**(wrap 是掛載相依、rest 不變式是純算術),
而現有 74 tests 只跑 415ms,新增測試幾乎免費。而且先修完,實機測試量到的才是感測器的真實
行為,不是 App 的算術 bug。

**第二順位|燒錄 v3 + 桌面旋轉記錄(一個晚上,不需要受試者)**

P 在詰問中把最小現實接觸單位重新定義,這是本次會議最有價值的一次讓步:
**不是「焊接 + 綁帶 + 找人測試」,而是「USB 燒錄,然後手拿兩塊板子在桌上各轉一圈 ±180°,
同時記錄 serial」**。先確認 Arduino-ESP32 core 版本(`IRMS_Sensor.ino:75` 對 `getValue()`
使用 `String` 方法,只在 core 3.x 編得過)。60 秒的記錄一次定案:MTU 是否真的協商到 128
(否則 6 軸封包截斷,`parseAnglePacket` 靜默降級)、FILTER_ALPHA 是否振鈴、以及各姿勢的
真實 stdDev——也就是 `CAPTURE_STD_LIMIT_ABDUCTION = 4` 本來就該用來設定的那個數字。
把記錄 commit 成測試 fixture。

再加上 F1:既然 roll 不進判定,而 `buildCalibrationPatch` 已接受 `abduction: null`
(主席覆核 `calibration.ts:118` 確認),**第一次實機試跑可以直接跳過第 5 步**——不需要一個
能單腳站立的受試者。實機的門檻比原本以為的低得多。

**第三順位|migration runner + session 收尾 + 頂層 ErrorBoundary(半天到一天)**

`PRAGMA user_version` + `migrations[]`,既有安裝 seed 為 version 1;`db.test.ts` 對
`:memory:` 證明 v1 形狀的 DB 升級後資料完整。加上 `beforeunload` flush 與孤兒 session
finalizer。頂層 ErrorBoundary 一個 class component 約 30 行。

**內容須由第二順位決定**(P 的洞見,採納):`sensor_data` 寫入的是**校準後 + EMA 後**的值
(`sessionController.ts:146-154`),原始值丟棄,而當時生效的校準設定存在 localStorage 而非
session 列上(`db.ts:42-53` 無校準欄位)。錄 20 場之後發現 `shinInvert` 反了、重跑精靈 →
前 20 場永久無法解讀。所以 **migration #1 應該是「每場 session 的校準快照 + 原始角度欄位」**,
而這個 schema 要長什麼樣,得先看過真實資料才知道。

**明確延後(三方一致,不進本月)**:ESLint/Prettier、逐 view ErrorBoundary、History LTTB
抽樣、i18n、快捷鍵、Record Pose 回補、復健評分模型、`proximal/distal` 多關節泛化。

### 最強的殘存反對意見(需持續監控)

**C 的行事曆批判**,主席認為三份文件裡最有說服力的一段,且**未被解決**:

> 這個專案的實證紀錄是 07-12 至 07-14 六篇連續的視覺打磨日誌,然後 07-17,然後兩週靜置。
> 那不是懶惰,那是「開發者坐在桌前、有時間、但沒有被授權的工作項」的典型特徵。如果規則是
> 「硬體沒好之前什麼都別做」,而焊點是冷的或這週沒人有空,被授權的 backlog 就是空的。
> 開發者還是會坐下來。產出的不會是「什麼都沒有」,而是第三個 `feDisplacementMap` 濾鏡——
> 而且有了「我卡在硬體」的道德掩護。

**緩解方式**(已內建於上述順序):第一順位整批都是桌面工作,所以硬體滑期時**永遠有被授權的
工作可做**。若第二順位真的滑出這一週,C 指定的正當替代品是 History 臨床輸出改造與 Record
Pose 回補——但兩者都必須排在第三順位的 migration runner 之後(F5)。

### 會議的元層級發現(R 提出,主席採納為決議)

> 這個專案挑工作的方式是「視覺上相鄰且局部可解」,而不是「輸出實際依賴什麼」。
> 診斷不是「優先順序錯了」,而是**根本沒有優先順序函數**。

證據就是 F1 與 F2 的並置:最近一批實質工程工作(07-17)謹慎、有測試、防禦性推理充分,
卻花在一個**裝飾性數值**的正負號慣例上;與此同時,一個出貨預設動作正在捏造 rep 數,
而安全警報會在重連時靜默解除武裝。

**採納為專案規則**:

> 動任何 UI 或校準工作之前,先指出它餵給哪一條判定路徑的輸入。
> 如果指不出來,它就是裝飾性的,排到清單最後面。

### 連帶決議

- **刪除**(而非繼續精修)`thighRollVerified`/`shinRollVerified` 的警示 chip。它對臨床端
  宣稱「方向未驗證」,而該畫面的判定不讀方向——移除一個誤導性警告,比讓它變準確更便宜,
  而且移除本身就是準確的。旗標本身可留給 3D/CSV 用途,但不應出現在 Dashboard 警示位。
- 校準精靈第 5 步移出必經階梯,改為 Settings 內的選配「3D 顯示方向校正」。

---

## 📌 綜合意見清單(依嚴重度)

三方原始清單共 54 項,去重、覆核、剔除假警報後的合併結果。

### 🔴 高

| # | 位置 | 問題 | 處置 |
|---|---|---|---|
| 1 | `movementMetric.ts:17,94,96` + `defaults.ts:28-35` | `rest` 寫死 30 與 `zone.min` 無不變式檢查;出貨預設 Backward Extension 從靜止的腿計出幻影 reps 並寫入 DB | 見裁決第一順位 |
| 2 | `sessionController.ts:70-74` | 超限警報未與 `session.running` 綁定;坐上椅子即長鳴 | 加閘門 |
| 3 | 全 App | 沒有任何 UI 能送 `CMD:ALARM_OFF`,患者腿上的蜂鳴器無軟體開關 | 加「靜音警報」按鈕 |
| 4 | `sessionController.ts:83-89` | 短暫重連後警報不重新武裝,恰好在最需要的窗口失效且會自我痊癒 | 補 `engine.reset()` |
| 5 | `calibration.ts:32-37`、`smoothing.ts:34-37`、`useStore.ts:293-301` | ±180° wrap 不安全:可致精靈永遠無法通過、knee 短暫讀到 360° 觸發長鳴 | 圓形統計 + 最短弧 EMA + 範圍鉗制 |
| 6 | `ErrorOverlay.tsx:10-20` | 全螢幕遮罩無任何按鈕,I2C 故障時 End Session 按不到;強殺 App → 該場記錄變 0 reps | 改非阻擋或加操作按鈕 |
| 7 | `db.ts:29-69` | 無 `user_version`,schema 無法演進;下一次加欄位會讓 v1.0.1 升級者無法錄製 | migration runner |
| 8 | 全 App(0 個 unload hook) | 中途關窗 → `endTime NULL`、`repsCompleted 0`,真實 session 顯示 0 reps 且不可回推 | `beforeunload` + 孤兒 finalizer |
| 9 | `ActionsView.tsx:163-181`、`SessionControlPanel.tsx:59-83` | 判定參數零驗證:負 tolerance 讓 rep 靜默永不前進;`holdTimeMs=0` 讓每次進區立即完成 | 鉗制 + `min=` + `CHECK` |
| 10 | `IRMS_Sensor/`(從未燒錄) | 感測路徑從未產生過一個真實樣本 | 桌面燒錄 + 旋轉記錄 |

### 🟡 中

| # | 位置 | 問題 | 處置 |
|---|---|---|---|
| 11 | `CalibrationWizard.tsx:214-232` | 第 5 步要求單腳站立,只為校準顯示用的正負號 | 移出必經階梯 |
| 12 | `DashboardView.tsx:87-91`、`SettingsView.tsx:83-91` | 「方向未驗證」警示是假的負面訊號,訓練使用者忽略警告 | 刪除 |
| 13 | `HistoryView.tsx:24-25` | 分析圖只畫 knee + 內外翻;SLR/後擺是用 `angles.thigh` 判定的,督導看到一條平坦的線,看不出腿有沒有抬起來 | 依 `triggerType` 畫實際判定的指標,疊目標帶與 rep 標記(需先做 #7) |
| 14 | `db.ts:164`、`HistoryView.tsx:15,22-25` | `getData` 無上限;10 分鐘 session 約 15,000 列全量過 IPC + 15,000 次 `Intl` 呼叫 | 主進程 LTTB 抽樣,CSV 保留全量 |
| 15 | `db.ts:42-53`、`sessionController.ts:146-154` | 只存校準後的值,不存原始值也不存當時的校準設定;日後重新校準會讓所有歷史永久無法解讀 | 列為 migration #1 |
| 16 | `CalibrationWizard.tsx:142-146` | 每步都要求「維持姿勢」同時「按滑鼠」,第 3/4/5 步是拿不到滑鼠的姿勢 | 加免手觸發(穩定 2 秒自動擷取) |
| 17 | `CalibrationWizard.tsx:181-212` | 無單步返回/重捕;誤觸 × 丟棄全部 captures | 加上一步/重捕此步 |
| 18 | `ActionsView.tsx`、`types.ts:5-25` | elbow/shoulder 協定可選且看起來能用,但 `computeMetricSample` 永遠讀腿部感測器,量表標籤寫「大腿仰角」 | 泛化前先隱藏或明確擋下 |
| 19 | `movementMetric.ts:92` | 超限門檻由 `target + tolerance + 10` 導出,治療師放寬容錯會同時把安全上限往外推 | 加獨立的 `safetyLimit` 欄位 |
| 20 | `ActionsView.tsx:159-184` | v1 的「Record Pose」在 v2 重寫時遺失,治療師只能盲打目標角度 | 回補(延後,但價值高且工程量小) |
| 21 | `package.json` | Electron 33 已過支援窗口;升級成本隨時間單調上升(`better-sqlite3` 每個大版本要重建 ABI) | 在 `electron-updater` 之前處理 |
| 22 | `IRMS_Sensor.ino:279` | 廣播未 `addServiceUUID()`;若名稱只落在 scan response,Electron 可能回報 `(no name)` 而 15 秒逾時失敗 | 加 service UUID,主進程也依 UUID 比對 |
| 23 | `protocol.ts:105-140` | `parseAnglePacket` 只要 ≥3 個逗號欄位就接受;MTU 截斷會讓 6 軸包靜默降級成 `thighRoll=shinRoll=0` | 宣稱 6 軸時強制檢查 `TR:`/`SR:` 欄位存在 |
| 24 | `imu.h:67-85` | 陀螺零點只在開機時校準一次,且無 `CMD:ZERO` 可重來;綁在動作中的腿上開機 = 整場漂移 | 加重新歸零指令 |
| 25 | `imu.h:55-56` | pitch/roll 共用 `az` 分母,肢段接近垂直(`az→0`)時 roll 數值不穩、可能逐幀翻號 | 因 F1 降為中等(只影響 3D 與 CSV);改用標準 roll 式或在 \|pitch\|>70° 時停用 roll 顯示 |
| 26 | `main/index.ts` | 無 `db.close()`,`-wal` 檔從不 checkpoint(非資料遺失,WAL 已耐久) | `app.on('will-quit')` 一行 |

### 🟢 低

| # | 位置 | 問題 |
|---|---|---|
| 27 | `main/index.ts:57-60` | `shell.openExternal` 無 scheme allowlist。目前無法觸發(無外部內容),但兩行就能防住 |
| 28 | `guidance.ts:47` | segment 型別 `zone.max === Infinity`,fall-through 會算出 `value - Infinity`,可渲染出「回降 -Infinity°」 |
| 29 | `bluetooth.ts:96-127` | 斷線後 `angles` 未清除,量表繼續顯示最後數值長達 15 秒重連期,像是即時值 |
| 30 | `sessionController.ts:204-206` | `endSession` 早退時 `stopTimers()` 被跳過,而 UI 無條件顯示「已儲存」toast |
| 31 | `protocol.ts:42-53` | `buildSyncCommand`/`buildProfilePayload` 是 `@deprecated` 死碼,仍在文件化韌體不實作的協定 |
| 32 | `bluetooth.ts:175` | 註解宣稱韌體以 `==` 精確比對所以 `\n` 會壞事,但 v3 已 `trim()`。錯的安全註解比沒有更糟 |
| 33 | 全 App | 無障礙:`role`/`aria-*` 只出現在 GlassDropdown;三個 modal 都無 Esc 與 focus trap;狀態僅以顏色區分 |
| 34 | `package.json` | `electron-rebuild` 是 `@electron/rebuild` 的棄用別名,是 `npm audit` 全部 19 項的唯一來源,使 audit 失去訊號價值 |
| 35 | `main/ipc.ts:152-175` | 所有 handler 都是裸 pass-through,DB 例外跨 IPC 後變成不透明字串,會讓 #7 的失效在現場幾乎無法診斷 |
| 36 | `bluetooth.ts:48` | `acceptAllDevices: true`(主進程已自動挑選,使用者看不到選擇器,但等於掃描全部而非目標) |

### 三方一致認定「已經做對」的地方

- 韌體 `ServerCallbacks::onDisconnect` 呼叫 `feedbackAllOff()`——App 掛掉不會讓蜂鳴器卡在患者腿上。
- `handleConnectionLost` → 自動 End Session + flush,走出訊號範圍的患者仍保有紀錄。
- `onRepCompleted` 有 `session.running` 閘門,不會出現「還沒開始就有 reps」。
- 校準精靈「套用前預覽」的形狀正確;引擎的遲滯 + 出區寬限確實防住邊界抖動。
- 重連後的指令去重快取有重設(`sessionController.ts:86-89`),是作者自己抓到並修掉的細微 bug。
- 安全姿態實際上是好的:CSP 嚴格、`contextIsolation` 開啟、preload 只暴露固定 11 個方法、
  production 依賴 0 漏洞、FK cascade 真的生效。

---

## ✅ 驗證

- [x] `npm run test` 實跑:8 files / 74 tests 全綠(415ms)
- [x] 主席獨立覆核所有承重主張,未採信任何代理的轉述:
      `triggerEngine.ts` 全文(確認 F2 迴圈閉合、F3-3 的 `alarmActive` 只在 `reset()` 清除)、
      `sessionController.ts:50-150,195-234`(確認 `onOverExtension` 無閘門、`endSession` 有
      `engine.reset()`、`repsCompleted` 只在 `end()` 寫入)、`imu.h:45-61`(確認兩軸皆
      `atan2f(_, az)`)、`useStore.ts:287-310`(確認線性 offset 與 `Math.abs` knee)、
      `defaults.ts:7-35`(確認 Backward Extension target 20 / segment_extension)、
      `calibration.ts:105-130`(確認 `abduction: null` 可接受)、`ErrorOverlay.tsx` 全文
      (確認無任何按鈕)、`bluetooth.ts:40-134`(確認監聽器為穩定 arrow property)
- [x] `grep` 覆核:`user_version`/`ErrorBoundary`/`beforeunload` 皆 0 命中;roll 在
      `movementMetric.ts`/`triggerEngine.ts`/`guidance.ts` 0 命中
- [x] 主席獨立推翻 R 的 BLE 監聽器堆疊主張(DOM 對相同函式參考去重),與 P 的詰問結論一致
- [ ] **未執行任何程式碼修改**。本文為決策紀錄,所有裁決項目尚待實作。
- [ ] **未接實機**。F4(wrap)、F1 的實務影響、MTU 協商結果皆待第二順位的桌面燒錄記錄確認。

## 🗣 主席對自身裁決的自我審查

**設想一個會讓這份裁決出錯的情境**:如果桌面燒錄後發現真實訊號品質極差(例如互補濾波
在真實動作下振鈴 ±10°),那麼第一順位裡精修 `rest` 邊界與遲滯常數的工作,可能是在為一個
即將被重寫的層打磨。

**評估結果:裁決仍成立。** 第一順位的六項中,只有 `rest` 不變式與訊號品質有間接關聯,
而它修的是**邏輯不變式**(`rest < min`)而非**經驗常數**(不是在調 30 這個數字該是多少),
邏輯不變式不會因訊號變髒而失效。其餘五項(wrap 數學、警報三修、輸入鉗制、reset 統一、
遮罩可操作)全部與訊號品質正交。反倒是**先修完再燒錄**,才能確保旋轉記錄量到的是感測器,
不是 App 的算術缺陷——這正是把燒錄放在第二而非第一的理由。
