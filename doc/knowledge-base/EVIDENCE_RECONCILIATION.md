# 文獻更正與數值疑點查核

查核日：2026-10-06。比對出版商、作者機構公開 PDF、PMC／Europe PMC XML；本庫沒有聯絡作者，未取得正式更正的地方不自行代替作者修訂。

| 來源 | 查核結果 | 本庫採用方式 |
|---|---|---|
| ICC 指引，PMID 27330520 | 官方 2017 更正通知確認 Table 3 的 ICC(1,1) 分母項應由 `(k + 1)` 改為 `(k − 1)`。更正文字已核對；原始指引完整 XML 仍無法取得。 | 採用已確認的更正提醒；保留原始指引摘要閱讀層級。不能把這項更正套到所有 ICC 模型。 |
| Olsson，PMID 32580394 | 作者機構公開的 PDF（含封面共 31 頁）第 23／28 頁，對應印刷頁 22／27，與 XML 同樣在 §8.3 報 81%、§9.3 報 88%。 | 確認不是本次 XML 擷取造成的差異。缺少正式更正或原始估計結果，不能選定其中一值；禁止把此子組成功率作精度門檻。 |
| Seel，PMID 24743160 | 作者機構 PDF 第 16 頁、印刷頁 6906 的 Table 1 同樣列對側膝試次 3.25、2.76、3.10、3.16、0.40、3.83°，報告 Average 3.30°。六數平均約 2.75°。 | PDF 與 XML 相符，屬原文內部矛盾。保留「作者報告 3.30°」及疑點，不猜哪個試次誤植；不把 2.75° 當作者修正結論。 |
| Bowman，PMID 34063355 | 出版商 PDF 第 16 頁 Figure 6C：子組整體效果 Z=2.41、p=0.02；異質性 χ²=0.55、p=0.91、I²=0%。§3.6.3 把子組效果寫成 p=0.91，並另寫異質性 p=0.81。 | 已能區分圖內的兩種檢定。引用時明寫「Figure 6C 報告」與正文衝突，不把正文靜默改正；全部裝置的 Figure 6A 效果 p=0.06，不能與壓力感測子組混用。 |

## 原始入口與追溯

- ICC：[出版商更正文字](https://www.sciencedirect.com/science/article/abs/pii/S155637071730130X)、[PMC 更正通知](https://pmc.ncbi.nlm.nih.gov/articles/PMC5731844/)。
- Olsson：[作者機構公開 PDF](https://repository.tudelft.nl/file/File_9187181b-65c7-48ee-ba4a-a2085ea3a505)、[出版商正文](https://www.mdpi.com/1424-8220/20/12/3534)、[版本紀錄](https://www.mdpi.com/1424-8220/20/12/3534/notes)。版本紀錄中的檔案更新不等同正式更正。
- Seel：[作者機構公開 PDF](https://pure.mpg.de/rest/items/item_2032537_9/component/file_2032538/content)、[PMC 表格](https://pmc.ncbi.nlm.nih.gov/articles/PMC4029684/)。
- Bowman：[出版商 PDF](https://mdpi-res.com/d_attachment/sensors/sensors-21-03444/article_deploy/sensors-21-03444-v3.pdf?version=1622457266)、[PMC 正文](https://pmc.ncbi.nlm.nih.gov/articles/PMC8156914/)。

機器可讀查核、PDF 雜湊及採用規則見 [reconciliation.json](data/reconciliation.json)。原始 PDF／XML 只保留在本次暫存區；此 repo 不重新散布全文。PDF 關鍵頁已渲染並目視核對。

## Claude 文件中的現有 IRMS 證據

[2026-09-25 真機紀錄](../coding%20log/log_20260925_realdevice_fixes_autopush_ui_v3.md) 報告 CAL-03 A/B 在 run `51e7fcbe` 的真實資料上完成，非平行佩戴下鉸鏈路徑比舊向量扣零路徑接近使用者觀察，並指出殘留小腿軸誤差。這可支持問題定位與修正理由，但沒有獨立已知角參考、重戴樣本矩陣及其不確定性，不能視為 V01／V02 已完成。

較舊的 [PROJECT_STATUS](../PROJECT_STATUS.md) 仍說 CAL-03 未開始，與較新日誌及目前程式不同。本庫對照採較新日誌及源碼；保留版本差異，不修改歷史紀錄。現有原始資料見 [2026-09-15 校準資料包](../calibration-evidence/20260915/README.md)。資料包的適用範圍須依其 provenance 解讀。

[2026-09-08 校準設計紀錄](../coding%20log/log_20260908_meeting_single_imu_axis_orientation.md) 記載當時沒有外部量角治具，僅以動作內一致性作弱驗證。因此 V01 的獨立已知角證據目前仍缺少；不能將零器材重複動作測試改稱絕對準確度驗證。

[全文精讀](FULL_TEXT_REVIEW.md) · [IRMS 證據對照](EVIDENCE_MAP.md) · [驗證計畫](VALIDATION_PLAN.md)
