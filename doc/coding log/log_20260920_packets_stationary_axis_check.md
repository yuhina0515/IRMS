---
tags: [coding-log, calibration, cal-02, data-analysis]
summary: Ran the low-priority 09-17 task-schedule idea — statistical stationary-segment detection on packets.txt to indirectly check the hinge-axis-parallel assumption without timestamps/labels. Result is inconclusive (9 candidates split ~half near-parallel, half substantially non-parallel); does not change CAL-02/CAL-03's standing decision that real hardware A/B validation is required. Closes out the last item on the offline queue.
date: 2026-09-20
---

# packets.txt stationary-segment hinge-axis check

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260917_next_session_task_schedule|09-17 任務排程]] ·
> [[log_20260917_cal02_design_decision|CAL-02 決策文件]] ·
> [doc/calibration-evidence/20260915/README.md](../calibration-evidence/20260915/README.md)

## 🎯 目的

使用者離線佇列的最後一項,09-17 排程原文評為「機率不高,不確定值得投入」:
`packets.txt`(66,927 筆既有 trace)有沒有辦法在缺乏時間戳記/動作標籤的情況下,用統計方式
抓出「兩肢段同步不動的站姿段落」,間接檢驗 `reconcileToReferenceFrame` 依賴的髖屈/膝屈軸
平行假設在這批真實資料上站不站得住腳。決定實際跑一次而非繼續擱置猜測——低成本(純資料分析,
不改動任何程式碼),且答案本身(即使是負面結果)也值得記錄下來,避免之後同一個問題被重新
猶豫一次。

## 🔧 方法與結果

完整方法、程式碼與逐條結果記在
[doc/calibration-evidence/20260915/README.md](../calibration-evidence/20260915/README.md)
新增的「Statistical stationary-segment check」小節,腳本本身是
`doc/calibration-evidence/20260915/stationary-segment-axis-check.mjs`(放在證據目錄而非
`IRMS_App_Tauri/scripts/`——這是綁定單一份既有 trace 的一次性分析,不是可重複使用的 App
工具,擺錯目錄會讓人誤以為它是正式工具鏈的一部分)。

簡述:滾動視窗偵測「兩肢段同時靜止」的段落(118 段),取最長段落當站姿基準,篩出與基準相差
>15° 的候選姿勢(9 段),用與 `deriveHingeAxis` 相同的外積法各自算出大腿、小腿的候選軸,
比較兩軸夾角。**結果不乾淨**:9 個夾角中 4 個接近平行(2.0°–6.3°),其餘明顯不平行
(23.3°–94.1°,最後一個接近正交)。

## ⚠ 為什麼這個結果不能拿來下結論

- 這批資料是連續、無結構的擷取(很可能是深屈膝測試,不是校準精靈那種「一次只動一個關節」
  的隔離式擷取),候選姿勢的夾角差異可能反映真實的髖部/軀幹複合轉動,不是單純測「大腿軸
  vs 小腿軸平不平行」這個乾淨問題。
- 66,560 筆封包裡只有 9 個可用候選,部分僅 22–39 個取樣點(~1–1.5 秒),證據量很薄。
- 與這份 trace 已知的限制一致(缺少對應的 hinge-axis/zero-accel 設定,見 `provenance.json`
  與 09-16 review log):這批資料本來就不能取代一次真正帶標籤的精靈擷取。

## ✅ 結論

**不改變 CAL-02/CAL-03 既有的裁決**——`reconcileToReferenceFrame` 是否接上生產路徑仍然
需要真機 A/B 比較(見 [[log_20260917_cal02_design_decision]] 第五節),這次分析既沒有
支持也沒有推翻那個決定,只是把「這條路值不值得走」的懸而未決問題實際回答掉:**值得花十分鐘
跑一次,但答案是「跑不出乾淨結論」**,不需要再花更多時間在這個方向上。

離線佇列(09-16/09-17 排程表)至此四項全部處理完畢:CAL-02 決策文件、CON-01 IPC 契約稽核、
DOC-01 PROJECT_STATUS 重寫、以及這次的低優先統計分析。剩餘工作全部卡在裝置可用性上
(issue #3、Roll/Knee 真機驗收、OTA 硬體三步),使用者已指示暫時擱置。

## 📝 後續待辦

無新增待辦。若之後真的取得一批帶完整 `*HingeAxis`/`*ZeroAccel` 設定與動作標籤的真機擷取,
這份分析應該被那份新證據取代,不需要回頭修這次的結論。
