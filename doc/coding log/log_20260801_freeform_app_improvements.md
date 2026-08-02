---
tags: [coding-log]
date: 2026-08-01
summary: "自由修改批次:獨立安全上限(migration 5)、guidance 的 -Infinity、endSession 謊報「已儲存」、斷線後量表殘值、刪除死碼、校準精靈免手擷取 + 上一步、四個 modal 支援 Esc、elbow/shoulder 協定明確擋下;硬體工作移至 GitHub issues #2–#4;126 tests,npm run ci 全綠"
---

# 2026-08-01 變更日誌 — 自由修改批次

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260801_meeting_app_review|會議意見清單]] ·
> [[log_20260801_review_fixes_implementation|前一批:裁決實作]] · [[ROADMAP]]

## 🎯 請求

「將實機測試移動到 issues,現在只要對 app 進行瘋狂的修改,你想改甚麼就改什麼。」

## 🔧 已完成

### 硬體工作移出文件

開了三個 GitHub issue 並把 ROADMAP 指過去:
[#2](https://github.com/yuhina0515/IRMS/issues/2) 桌面燒錄 + ±180° 旋轉記錄、
[#3](https://github.com/yuhina0515/IRMS/issues/3) 完整實機 E2E、
[#4](https://github.com/yuhina0515/IRMS/issues/4) 每場校準快照 migration(相依於 #2)。

**新慣例**:需要實機的工作一律開 issue,不寫進 ROADMAP。會議指出這個專案在
「被授權的 backlog 被硬體卡住」時會漂移去做視覺打磨;讓 ROADMAP 只留桌面可做的事,
漂移就會變得可見,而不是躲在一個打不了勾的方框後面。

### 安全性:獨立的安全上限(意見清單 #19,migration 5)

`overLimit` 原本是 `target + tolerance + 10` 導出的。治療師為了讓患者容易達標,把容錯
從 10° 放寬到 25°,會**在毫無察覺的情況下把警報門檻一併外推 15°**。容錯回答「算不算
達標」,安全上限回答「這個關節不該超過幾度」——後者由解剖決定,與處方寬鬆與否無關。

- `custom_actions.safetyLimit` / `sessions.safetyLimit`,NULL = 沿用導出值(既有資料行為不變)
- 出貨預設帶上明確的解剖上限(Squat 135°、SLR 80°、後擺 30°、肘 145°、肩 160°)
- 低於達標上限時抬高——一達標就警報的話,警報等於沒有意義
- Dashboard 量表也帶上 safetyLimit,否則畫的刻線與引擎實際判定的門檻不一致
- 測試含**對照組**:沒有 safetyLimit 時,同樣的容錯放寬會讓門檻整整外推 15°

### 四個正確性缺陷

- **`guidance.ts` 的 `-Infinity`**:segment 類 `zone.max = Infinity`,fall-through 會算出
  `value - Infinity`,渲染成「回降 -Infinity° 進入目標區」。可達路徑:保持中結束 Session,
  引擎 reset 而腿仍抬高。改為回報「保持」。
- **`endSession` 謊報**:早退時仍無條件顯示「Session ended and saved」(雙擊、或與斷線
  自動收尾競爭),且早退跳過 `stopTimers()` 讓已結束 Session 的時鐘繼續跑。改為回傳
  boolean,`stopTimers()` 移到早退之前。
- **斷線後量表顯示殘值**:`angles` 斷線時不會清掉,量表在長達 15 秒的重連期間繼續把
  最後一筆數值當即時值顯示。改為灰階 + 標示「斷線中 · 數值已過期」。
- **死碼與錯誤註解**:刪除 `buildSyncCommand` / `buildProfilePayload`(零呼叫端,卻仍在
  文件化一份韌體不實作的協定);更正 bluetooth.ts 宣稱「指令不可帶換行」的註解——
  韌體 v3 已 `trim()`,錯的安全註解比沒有註解更危險。

### 患者可用性

- **免手擷取**(#16):精靈原本要求「維持姿勢」同時「按滑鼠」,而第 3/4/5 步正是
  拿不到滑鼠的姿勢,伸手去按這個動作本身就會破壞剛擺好的姿勢。改為姿勢穩定 1.5 秒
  自動觸發,預設開啟。
- **上一步/重捕**(#17):原本捕錯只能整套重來。
- **Esc 關閉**(#33):校準精靈、動作編輯、歷史分析、確認對話框都只能用滑鼠點 ×。
  確認對話框另外把初始焦點放在「取消」而非「確認」,並加上 `role="alertdialog"`。

### 誠實面對範圍(#18)

elbow / shoulder 協定原本可選、可建動作、可按開始,產生一場看起來完全正常的 Session,
但 `computeMetricSample` 永遠讀腿部感測器,量表標籤寫死「大腿仰角」。等於把腿的資料
錄成一場「肩關節」紀錄。新增 `SUPPORTED_PROTOCOLS`,下拉標示「尚未支援」,開始按鈕
明確擋下並說明原因。泛化順序仍依 ROADMAP 決策 D3。

## 🧠 關鍵決策

- **免手觸發不能只看「穩定」**:第 2–5 步若在患者還站直不動時觸發,會把站姿當成抬腿
  姿勢捕捉,接著必然以「幅度不足」失敗。因此除了穩定,還要求姿勢相對站直基準確實
  移動過該步驟自己的門檻。這個守衛同時讓「站著不動」不會誤觸外展步驟——也正因為有它,
  才敢在第 5 步(唯一拿不到滑鼠的那步)也開自動。
- **擷取倒數期間不吃 Esc**:誤觸會讓倒數靜默作廢而使用者不知道發生什麼事。
- **擋下 elbow/shoulder 而非隱藏**:資料模型支援,使用者可能想先把動作建好;
  隱藏會讓人以為功能不存在,擋下並說明原因才是準確的。
- **安全上限低於達標上限時抬高而非拒絕**:拒絕會讓使用者卡在表單上;抬高是保守且
  仍然安全的行為,而且量表上看得到。

## ✅ 驗證

- [x] `npm run ci` 全綠:typecheck(node + web)+ **126 tests** + build
- [x] safetyLimit 測試含對照組,證明舊的耦合行為(放寬容錯 → 門檻外推 15°)確實存在
      且新行為消除了它
- [x] migration 5 的欄位新增沿用既有 runner,已有的 migration 測試涵蓋升級路徑
- [ ] **免手擷取未經真實感測資料驗證**:穩定判定用的是 `computeCaptureStats` 的環形
      標準差,門檻沿用各步驟既有值。真實訊號的雜訊底噪未知(見 issue #2),
      1.5 秒的窗口與門檻可能過嚴(永遠不觸發)或過鬆(手還在動就觸發)。
      這是本批次中最需要實機調整的一項。
- [ ] **未目視確認畫面**:螢幕存取仍未取得。安全上限欄位、精靈工具列、量表的
      「斷線中」樣式、協定擋下的說明文字皆未經人眼確認。

## 📝 後續待辦

- 免手擷取的窗口/門檻需依 issue #2 的實測 stdDev 調整。
- 仍未處理:狀態僅以顏色區分(色盲不可辨)、modal 無 focus trap、Electron 33 升級、
  `CMD:ZERO` 重新歸零(需改韌體)、BLE 改用 service UUID filter。
- ESLint/Prettier:會議明確延後,維持延後。
