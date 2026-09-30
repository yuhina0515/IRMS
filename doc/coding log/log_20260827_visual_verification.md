---
tags: [coding-log]
summary: "把 Stage 1/2 兩批 UI 改動實際用眼睛看過一次,關掉兩份日誌都留下的『UI 未經目視驗收』缺口。以 Playwright 的 _electron 在打包後的 app 上開一支拋棄式驅動腳本(裝在 --no-save,用完解除安裝,腳本本身也刪除,從未進版控),跑完整條路徑:冷開機 → 進 Settings 開示範模式(含確認對話框)→ 開內外翻曲線 → 播放 rep-cycle 情境 → Dashboard 即時量表與教練提示 → Actions 搜尋(含空結果與清除)→ 真的按 Start Session/End Session → History 示範徽章 → 分析 modal 常駐橫幅 → CSV 匯出檔名。全數截圖比對,四個示範模式讀取面標記(徽章/橫幅/CSV 表頭/檔名)首次得到實機證據而非僅靠元件測試推論。過程中發現我第一版驅動腳本的按鈕文字寫錯(中文 vs 實際的英文 nav 標籤)與一個空指標(未 guard 的 setter.call),兩者都是腳本本身的錯,不是 app 的缺陷。"
date: 2026-08-27
---

# 2026-08-27 變更日誌 — Stage 1/2 UI 目視驗收

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] ·
> [[log_20260827_ingest_seam_simulator_demo_mode|Stage 1:ingest 接縫與示範模式]] ·
> [[log_20260827_stage2_ux_backlog|Stage 2:P2 使用者體驗 backlog]]

## 🎯 目的

前兩份日誌都留下同一句話:「UI 仍未經目視驗收」。這不是一個可以無限期擱置的但書——
示範模式的四個讀取面標記(History 徽章、分析 modal 橫幅、CSV 表頭、CSV 檔名)存在的
唯一理由就是「有沒有被看見」,而元件測試斷言的是 DOM 結構,不是「這東西真的長那樣」。
本次工作把這個缺口關掉。

依專案規則,i18n / ESLint / 簽章 / 多關節泛化維持延後,實機硬體工作(issue #3)不動。
這是本次唯一的、合理的、桌前可做的下一步。

## 🔨 做法

沒有現成的 project skill 能開這個 app 做視覺驗證,所以現場搭一支**拋棄式**驅動腳本:
`playwright-core` 以 `npm install --no-save` 裝(不動 `package.json`/`package-lock.json`),
用 `_electron.launch()` 直接開打包後的 `out/` 產物(Windows 不需要 xvfb),
腳本本身放在專案根目錄暫時借用 `node_modules` 解析路徑,**用完立即刪除、
`npm uninstall --no-save` 解除安裝、螢幕截圖存在專案外的 `E:\Temp`**——這一切都不打算
進版控,純粹是這次驗收的工具,如同 2026-08-03 會議記載的瀏覽器測試工作流精神一致。

跑過的路徑:冷開機首頁(校準警告 + 量表 `--`)→ Settings → 啟用示範模式(含確認對話框
文案)→ 打開內外翻曲線切換 → 選 `rep-cycle` 情境開始播放 → Dashboard 看即時量表從
休息位爬升、進區變綠、教練提示「保持!1.0s / 3.0s」、離區後「再彎曲 76.6°」→ Actions
搜尋(輸入「膝」→ 三個預設動作全部命中,因為三個中文名稱都含「膝」;輸入不存在的字串
→「找不到符合⋯的動作」+「清除搜尋」)→ **真的按下 Start Session**、等 rep-cycle
情境跑完一段、**按 End Session**(Toast「Session ended and saved.」)→ History 列表
出現帶「示範資料」徽章的列 → 開分析 modal(標題旁徽章 + 常駐橙色警語橫幅)→
**匯出 CSV**,攔截 `HTMLAnchorElement.click()` 讀出實際檔名。

## ✅ 驗證結果(逐項核對截圖)

| 讀取面 | 結果 |
|---|---|
| 冷開機量表 | `--` 且無過期警告(2026-08-03 迴歸鎖,MetricGauge.test.tsx 已鎖,實機外觀一致) |
| Demo 進入確認對話框 | 文案完整、danger 色「確認」鈕正確 |
| 全域橫幅 | 出現在 TopHeader 上緣、跨視圖持續存在,`⚠ 示範模式 — ...` |
| TopHeader 連線鈕 | 「示範模式中」文字 + 視覺停用樣式 |
| Roll 曲線切換 | Checkbox 可勾選,說明文字完整渲染 |
| 即時量表 + 教練提示 | 依情境角度正確反應(進區變綠、達標保持倒數、離區提示還差幾度) |
| Actions 搜尋 | 命中/無結果兩種空狀態文案與出口按鈕皆正確 |
| **History 徽章** | `示範資料` 徽章正確顯示在動作名稱旁 |
| **分析 modal 橫幅** | 標題徽章 + 橙色常駐警語,與既有的校準漂移提示不互斥(各自出現) |
| **CSV 檔名** | 實際攔截到 `irms_DEMO_session_1.csv` |

四個示範模式讀取面標記(徽章/橫幅/表頭/檔名)中,徽章、橫幅、檔名三項**首次拿到
實機證據**,不再只靠元件測試推論其存在。

## 🔍 自我審查

**場景:第一版驅動腳本沒抓到任何按鈕,是 app 壞了還是腳本錯了?**

第一輪跑完,所有 `clickText('設定')`、`clickText('動作設定')`、`clickText('即時監測')`
全部 `NOT_FOUND`。沒有先假設是 app 的 bug,而是先看截圖——冷開機畫面完全正常,
只是底部導覽用的是**英文**標籤(`Dashboard` / `Actions` / `History` / `Settings`),
我寫腳本時憑印象猜了中文。修正按鈕文字後全部命中。

第二個問題是 `Illegal invocation`:清空搜尋框的那段 `evaluate` 沒有對
`document.querySelector('.action-search')` 回傳 `null` 的情況做 guard,
在跑到 History 分頁(該頁沒有這個 class)時對 `null` 呼叫 `setter.call` 直接炸掉。
兩者都是腳本本身的邏輯錯,與 app 程式碼無關——記錄下來是因為這正是「先看證據、
不要先假設哪一邊錯」的實例。

## 📌 附帶發現(非缺陷,記錄避免日後誤判)

`rep-cycle` 情境的握持段落是 2500ms,而畫面上實際選取的預設動作「Squat(深蹲屈膝)」
`holdTimeMs` 是 3000ms——兩者不吻合是因為情境是依 `REFERENCE_ACTION`(自訂的 2000ms
測試動作)設計的參考基準,不保證等於出貨預設動作的參數。這次目視驗收因此沒能讓
`rep-cycle` 情境在預設動作上真的計出一下(History 顯示 0 reps),但這不影響本次要驗證
的四個讀取面標記——它們在 Session 開始/結束當下就已戳定,與 reps 是否 >0 無關。
純函式層的 `sessionController.test.ts`(T1–T6)使用自建的、與 `REFERENCE_ACTION`
吻合的動作物件,不受此影響。

## ⚠ 仍未驗證

- **實機**(issue #3)完全未動,一如既往。
- 重連進度軌道(2.1)無法在示範模式下觸發(它只在真實 GATT 斷線事件下發生),
  這次目視驗收沒有涵蓋到——若要看到它仍然需要真裝置。
- 校準精靈的六步視覺本身(此前僅確認**可達**,見 1.8)這次未展開逐步截圖。

## 📌 下一步

Stage 1、Stage 2、以及本次目視驗收三份工作完成後,`doc/OPTIMIZATION.md` 已清空的
P0(元件測試/指令稽核)與 P2 清單目前沒有已知的、合理的、桌前可做的剩餘項目。
下一個有價值的動作是拿到裝置跑那份 ~30 分鐘驗證腳本(見 Stage 1 日誌)。
