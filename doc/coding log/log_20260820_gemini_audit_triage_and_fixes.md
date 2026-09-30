---
tags: [coding-log]
summary: "Gemini 3.1 Pro 對 [[log_20260820_gemini_ui_handoff|UI 交接包]]回饋 4 項 UI/UX 建議,逐項對照實際 CSS/截圖與既有設計決策後只採納 2 項:(1) 新增 `.btn-danger-ghost`,把「刪除範本列」「中斷連線」「結束 Session」等例行/已有二次確認的操作降級為外框紅字,實心 --danger 只留給 alarmActive 靜音鈕與 ConfirmDialog 的不可逆確認鈕——過程中發現並修正一個潛在的 CSS specificity 陷阱(`button.btn` 的 `color:#fff` 會蓋掉單純 class 選擇器,`.btn-secondary` 早就中招但因深色模式 --text 剛好也是白色而沒顯形)。(2) 新增 `input::placeholder` 明確樣式,修正瀏覽器預設 placeholder 對比度不足的問題。**否決**校準警示 banner 改實心填色(現有對比度其實足夠,且會違反 2026-08-01 會議「非阻斷性警告不該視覺化成緊急」的既有決議)、empty-state 置中與 help text line-height(兩者現狀已符合甚至優於 Gemini 建議值,不是真問題)。Z 軸深度分層(依重要性給不同透明度/陰影)判定為與現有「所有卡片統一 Liquid Glass 材質」設計語言直接衝突的大改,未動,留給使用者裁決是否要推翻該設計決議。回覆寫成 `doc/gemini-handoff-20260820/07-response-to-gemini-audit.md`(否決項附 WCAG 對比度實測數據,Z 軸議題改提「只做單一主卡片 `.glass-elevated` 修飾類別」的折衷方案反問 Gemini)供使用者貼回網頁版。147 tests 全綠,typecheck 乾淨。"
date: 2026-08-20
---

# 2026-08-20 變更日誌 —Gemini UI 稽核意見分診與落地

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260820_gemini_ui_handoff|UI 交接包]] · [[PROJECT_STATUS|開發進度]]

## 🎯 目的

使用者把 Gemini 3.1 Pro 看過 [[log_20260820_gemini_ui_handoff|交接包]]後的回饋貼回來,
四點都框成「Issue / Solution」的稽核格式。任務不是照單全收,而是逐項對照實際
`global.css` 數值與畫面截圖驗證是否成立,只落地真的站得住腳的部分。

## 🔧 變更內容

**採納並實作:**

- **危險色語意過載(Gemini #2)**——`02-actions.jpg` 的 Delete 按鈕確實用實心
  `--danger` 膠囊,和真正的臨床警報視覺上同一份量。全域搜尋 `btn-danger` 用量後
  發現不只 Actions 一處,還有兩個更嚴重但 Gemini 沒看到的例子(截圖沒拍到那個
  狀態):`SessionControlPanel` 的「End Session」每場 Session 結束都會按、
  `TopHeader` 的「Disconnect」只要裝置連著就常駐畫面——若 Session 進行中觸發
  真正的超限警報,畫面上會同時出現 3 個實心紅色按鈕(靜音鈕 + End Session +
  Disconnect),稀釋掉「現在真的有安全問題」這個信號,比 Gemini 原本指出的
  問題還嚴重。新增 `button.btn-danger-ghost`(透明底 + `--danger` 外框/文字),
  套用到這三處;**保留實心 `--danger`** 給 `DashboardView` 的「🔕 靜音 30 秒」
  (真正 alarmActive 時)與 `ConfirmDialog` 的「確認」鈕(不可逆操作二次確認,
  Gemini 自己在建議裡也點名這是該留實心的例外)
  - 過程中踩到一個既有的 CSS specificity 陷阱:`button.btn { color:#fff }`
    的特異度(0,1,1)比單純 `.btn-secondary { color:var(--text) }`(0,1,0)高,
    白色字永遠贏。深色模式下 `--text` 剛好也是 `#ffffff` 所以肉眼看不出來,
    但這代表淺色模式下 `.btn-secondary` 的文字色其實從沒真的生效過(潛在
    既有缺陷,不在本次範圍內,未動,留意即可)。為了不讓新的 ghost 按鈕重蹈
    覆轍,選擇器改用 `button.btn-danger-ghost`(特異度追平 `button.btn`,
    靠原始碼順序—後寫的贏)強制蓋掉
- **表單 placeholder 對比度(Gemini #3B)**——Safety Limit 欄位空值時顯示的
  「未設定(目前導出為 110°)」確實吃 Chromium 預設 placeholder 顏色(~40% alpha
  灰),在深色玻璃底上偏難讀。新增 `input::placeholder { color: var(--text-dim) }`,
  沿用 App 其他地方本來就用來表示「次要但看得清楚」的 token

**核對後否決,附理由:**

- **校準警示 banner 對比度(Gemini #3A)**——重看 `01-dashboard.jpg` 原圖,
  深色模式 `--warning: #ff9f0a` 亮橘字疊在暗色系背景上實測對比度足夠,肉眼
  清晰可讀,不是「insufficient for immediate clinical parsing」。改成「實心
  warning 底 + 純黑字」還會直接牴觸 [[log_20260807_meeting_calibration_bug_and_responsive_layout|
  2026-08-01 會議]]已經做過的決議——`SettingsView.tsx` 裡有明確註解說明
  「非阻斷性警告不該做得像判定風險」,刻意把 roll 未驗證這類提示降到不搶眼。
  把校準提示 banner 升級成實心警示色會是同一份設計判斷的倒退
- **Empty state 置中 / help text line-height(Gemini #4)**——`.empty` 早就是
  `flex-direction:column; align-items:center; text-align:center`,`03-history.jpg`
  看起來偏上是因為容器本身就是內容自撐高度的小卡片,不是沒置中;
  `.field-hint` 的 `line-height` 現狀已經是 `1.5`,剛好等於 Gemini 建議的下限。
  兩點都不是真問題,維持原狀,不做「為了回應而回應」的空改動
- **Z 軸深度分層(Gemini #1,可變透明度/陰影做卡片重要性分層)**——這是
  四點裡唯一「有道理但代價最大」的一項:要落地必須重寫 `global.css` 裡
  `.glass`/`.panel` 這個貫穿全部 4 個畫面 + 所有 modal 的共用材質類別,而且
  直接推翻 CSS 檔頭本來就寫明的設計決定(「元件一律引用語意 token」「所有
  玻璃面板統一材質」)。這屬於使用者該裁決的美術方向取捨,不是憑代碼或既有
  決議能單方推導的答案,本次未動,留待使用者確認是否要推翻既有的統一材質決定

**回覆 Gemini(供使用者貼回網頁版)**:寫成
`doc/gemini-handoff-20260820/07-response-to-gemini-audit.md`——把上面兩項採納、
兩項否決各附證據(否決 banner 對比度那項,額外從 `01-dashboard.png` 實際取樣
像素算出 WCAG 對比度 5.26:1,不是憑印象),Z 軸深度分層改成反問:能不能只在
「每個畫面唯一的主卡片」加一個 `.glass-elevated` 修飾類別做局部分層,而不是
整個 `.glass` 材質系統重寫,把決定權留給抓總體美術方向的人。同時補拍
`06-actions-after-fix.png`(降級後的 Delete 外框鈕實際渲染)供 Gemini 對照。

## ✅ 驗證方式

- [x] `npm run typecheck` 全綠(node + web)
- [x] `npm run test` → **147 tests 全綠**(純樣式/class 名變更,預期無行為影響,
      實測確認)
- [x] dev build 熱重載後重新截圖驗證:Actions 頁 Delete 鈕實際渲染為紅字外框
      (非白字,確認 specificity 修正生效)、Create Action modal 的 Safety Limit
      placeholder 對比度肉眼可見提升
- [x] 全域搜尋 `btn-danger` 用量(7 處),逐一讀取呼叫端上下文分類「例行/已
      二次確認」vs「真正的即時警報」,而非只改 Gemini 截圖裡看到的那一顆

## 📝 後續待辦

- `button.btn` vs `.btn-secondary` 的既有 specificity 陷阱(淺色模式下次要
  按鈕文字色從未真的生效)未修——記在這裡,之後若有人動到按鈕樣式系統再一併處理
- 校準警示 banner 的「實體場域環境光」疑慮(Gemini 回應,見下)需要真機在真實
  診所光照下驗證,不是 CSS 能單方解的問題——比照韌體那邊的慣例,之後應開
  GitHub issue 而非留在這裡,本次未開(等使用者確認要不要開)

## 🔁 第二輪:Gemini 回應與 `.glass-elevated` 落地(同日)

Gemini 對第一輪回覆表態:WCAG 5.26:1 對比度數據認可、排版爭議結案認可、
`.btn-danger-ghost` 認可;但保留一個無法用 CSS 驗證的疑慮——實體診所環境光
漫射可能讓臨界對比度在極端視角下劣化(需要真機真場域測試,不是本次能做的)。
Z 軸深度分層採納「單一主卡片 `.glass-elevated` 修飾類別」的折衷方案,並給了
一版鎖定深色模式數值的 CSS 草稿。

**落地**:沒有直接貼 Gemini 給的 raw rgba 值,改寫成這個專案既有的「語意 token
+ 淺/深雙主題覆寫」架構(`--glass-elevated-sheen/-border-top/-border-bottom/
-shadow`),深色維持 Gemini 給的數值不動,淺色依現有 `--glass-highlight`/
`--shadow-card` 淺深比例反推(淺色本來就用強白高光 + 輕陰影,深色反過來),
避免只有深色模式套過而淺色模式沒人推導出合理值。套用範圍嚴格照約定只給
Dashboard 唯一的主卡片(`DashboardView.tsx` 包 `MetricGauge` 的那個
`panel glass` div,加上 `glass-elevated`),沒有擴散到其他卡片。

回覆寫成 `doc/gemini-handoff-20260820/08-glass-elevated-followup.md`,附
`08-dashboard-elevated.png` 渲染結果供比對,環境光疑慮回覆為「這是要開
issue 等真機驗證的問題,CSS 端此次不動」。

**驗證**:`npm run typecheck` 全綠、`npm run test` 147/147 全綠;截圖時意外
發現視窗曾被某次自動化點擊撞到放大到 1920×1080(標題列原生放大鈕的誤觸),
用 `MoveWindow` 校正回 1280×820 標準尺寸後重新截圖,確認 Dashboard 主卡片
比旁邊的 reps/hold 卡片多了頂緣光澤與更明顯的陰影分離,效果如預期但克制、
沒有過度搶眼。
