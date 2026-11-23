# 核心文獻品質與外推域評估

查核：2026-10-06

同一代理第二次核對，非獨立雙人審查；五篇系統回顧與兩篇質性部分使用 JBI 2017 歷史清單作教育性單人評讀。七篇工程方法／示例／統計教程使用明示的自訂域檢查，未經驗證，不能稱臨床偏誤工具。沒有跨設計品質總分或療效等級。

yes／no／unclear 是對單項報告的判讀；unclear 不等於方法必然沒有執行。reported／concern 是自訂工程域狀態。正式 JBI 系統回顧要求獨立評讀及共識，此庫尚未做到。

[JBI 原始工具入口](https://jbi.global/critical-appraisal-tools) · [資料](data/quality-appraisals.json) · [全文精讀](FULL_TEXT_REVIEW.md)

- JBI-SR-2017：[版本入口](https://jbi.global/sites/default/files/2019-05/JBI_Critical_Appraisal-Checklist_for_Systematic_Reviews2017_0.pdf)；archived published checklist, single educational appraisal。
- JBI-QUAL-2017：[版本入口](https://jbi.global/sites/default/files/2019-05/JBI_Critical_Appraisal-Checklist_for_Qualitative_Research2017_0.pdf)；archived published checklist, qualitative component only。
- IRMS-METHOD-DOMAINS-v1：[版本入口](https://github.com/yuhina0515/IRMS)；custom non-validated reporting/transferability domains, not a clinical RoB instrument。

## PMID-31991862

[Inertial Sensor-Based Lower Limb Joint Kinematics: A Methodological Systematic Review.](reviews/PMID-31991862.md)

JBI-SR-2017；方法性系統回顧；以歷史 JBI 清單做教育性單人評讀，非原研究逐篇重評。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 問題清楚 | yes | 明確聚焦本回顧的量測／校準問題。（Introduction、Methods） |
| Q02 納入條件相符 | yes | 納入條件依原研究問題、輸入與參考限定；仍有語言／方法報告選擇偏差。（Eligibility criteria／§2） |
| Q03 搜尋策略 | yes | 正文提供資料庫、時間與相關搜尋詞或附錄入口。（Search strategy／§2） |
| Q04 搜尋來源涵蓋 | unclear | 多資料庫與參考文獻追查已描述，但灰色文獻涵蓋未完整確認。（Search strategy／§2） |
| Q05 品質評估方法 | unclear | 本次查閱正文未見正式偏誤評估工具；不能以報告研究設定替代品質評估。（Methods、Results） |
| Q06 獨立品質評讀 | unclear | 未見兩位獨立品質評讀者的明確報告；篩選人數不能代替此資訊。（Methods） |
| Q07 擷取錯誤防範 | unclear | 列明擷取項目與三表，但沒有擷取者數及獨立核對的明確敘述。（§2.3 Data extraction） |
| Q08 研究合併方法 | yes | 以描述性分類處理異質方法，未硬合併成共同精度。（Results、Discussion） |
| Q09 出版偏誤 | unclear | 查閱正文未見出版偏誤檢查；未逐一核對所有補充資料，不能推定已做。（Methods、Discussion） |
| Q10 實務建議依據 | yes | 保留不同方法和任務的適用限制；不據此宣稱 IRMS 效能。（Discussion、Conclusions） |
| Q11 後續研究方向 | yes | 提出標準化、重測或代表性等與研究缺口相符的方向。（Discussion、Conclusions） |

## PMID-32545227

[Sensor-to-Segment Calibration Methodologies for Lower-Body Kinematic Analysis with Inertial Sensors: A Systematic Review.](reviews/PMID-32545227.md)

JBI-SR-2017；校準方法回顧；單人篩選及缺少品質流程報告降低可依賴範圍。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 問題清楚 | yes | 明確聚焦本回顧的量測／校準問題。（Introduction、Methods） |
| Q02 納入條件相符 | yes | 納入條件依原研究問題、輸入與參考限定；仍有語言／方法報告選擇偏差。（Eligibility criteria／§2） |
| Q03 搜尋策略 | yes | 正文提供資料庫、時間與相關搜尋詞或附錄入口。（Search strategy／§2） |
| Q04 搜尋來源涵蓋 | unclear | 多資料庫與參考文獻追查已描述，但灰色文獻涵蓋未完整確認。（Search strategy／§2） |
| Q05 品質評估方法 | unclear | 本次查閱正文未見正式偏誤評估工具；不能以報告研究設定替代品質評估。（Methods、Results） |
| Q06 獨立品質評讀 | unclear | §2.3 明說單人篩選；未報告獨立品質評讀，不將兩件事混同。（§2.3、§2.4） |
| Q07 擷取錯誤防範 | unclear | 列出校準、誤差與重測擷取項目，未報獨立擷取核對。（§2.4 Data extraction） |
| Q08 研究合併方法 | yes | 以描述性分類處理異質方法，未硬合併成共同精度。（Results、Discussion） |
| Q09 出版偏誤 | unclear | 查閱正文未見出版偏誤檢查；未逐一核對所有補充資料，不能推定已做。（Methods、Discussion） |
| Q10 實務建議依據 | yes | 保留不同方法和任務的適用限制；不據此宣稱 IRMS 效能。（Discussion、Conclusions） |
| Q11 後續研究方向 | yes | 提出標準化、重測或代表性等與研究缺口相符的方向。（Discussion、Conclusions） |

## PMID-32580394

[Robust Plug-and-Play Joint Axis Estimation Using Inertial Sensors.](reviews/PMID-32580394.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 無人體樣本；同一機械資料各情境重跑 100 次，屬演算法估計回合。（§7.1、§7.4） |
| Q02 設備／校準 | reported | 兩顆 Xsens MTw、50 Hz，量程加速度 ±160 m/s²、陀螺儀 ±21 rad/s。；靜止、獨立旋轉、剛性共同旋轉等；去除轉換段，以靜止資料扣陀螺偏移，選擇資訊樣本。（§7.1、§5、§7.1） |
| Q03 參考與獨立性 | concern | 裝置插槽使鉸鏈軸與兩 IMU 正 y 軸平行，提供軸方向真值；測的是軸方向，不是人體膝角。（§7.1） |
| Q04 前處理／調參 | concern | AD／RMSAE／MAXAE；接受閾值 Emax 與連續估計數 nmin，並測人工偏移。；重排與重跑評估數值穩健性，但不提供跨裝置、跨人體的獨立樣本證據。（§6、§7.4–7.5） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。Emax=3°、nmin=10 時，4 種情境各 100 回合的接受估計均低於該軸誤差閾值。（§8.3） |
| Q06 重現與外推 | concern | 剛性機械系統，沒有皮膚與肌肉移動；人體非剛性系統的可靠性列為未來工作。；未在 IRMS 目標硬體或族群重現。（§10） |

## PMID-24743160

[IMU-based joint angle measurement for gait analysis.](reviews/PMID-24743160.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 一位 40 歲經股截肢者，K-Level 4；六個步態試次不是六位受試者。（§4、Table 1） |
| Q02 設備／校準 | reported | 六顆 Xsens MTw，60 Hz；Vicon V612 十臺相機，120 Hz，標記在解剖位置。；約 10 秒各肢段環繞校準，再以自選速度重複走約 10 公尺；遠離磁干擾。（§4、§4） |
| Q03 參考與獨立性 | concern | 光學步態參考；人工側的剛性固定與人體側的皮膚／肌肉附著不同。（§4） |
| Q04 前處理／調參 | concern | 比較屈伸角 RMSE，角度融合與關節位置修正；並討論不同側的誤差來源。；可支持模型與驗證設計；代表性及表列數值一致性有限。參考依賴與因果實作須另外核對。（§3.2、§4） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。Table 1 作者報告膝角平均 RMSE：人工側 0.71°、對側 3.30°；屬單一受試者及指定參考條件。（Table 1） |
| Q06 重現與外推 | concern | 一位受試者、特定任務與硬體；人膝不完全符合鉸鏈，參考也含軟組織誤差。；未在 IRMS 目標硬體或族群重現。（§3.3–4） |

## PMID-29933568

[Validity, Test-Retest Reliability and Long-Term Stability of Magnetometer Free Inertial Sensor Based 3D Joint Kinematics.](reviews/PMID-29933568.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 28 人，15 女／13 男，年齡 24±2.70 歲；健康年輕樣本。（§2.1） |
| Q02 設備／校準 | reported | 七顆 Xsens MTw Awinda、十二臺 OptiTrack Prime 13，60 Hz，TTL 同步。；暖機至少 20 分鐘，靜止至少 10 秒扣陀螺偏移；IEKF 不用磁力計，同段資料處理兩次，轉彎段排除。（§2.1、§2.1） |
| Q03 參考與獨立性 | concern | 條件 1 用剛性 IMU 外殼標記，條件 2 用解剖皮膚標記；校準、模型與初始幀來自光學。（§2.1） |
| Q04 前處理／調參 | concern | 分段 RMSE、ROM 誤差、BA、CMC、跨日 ICC 與六分鐘漂移。；共同模型與光學初值降低了部分實際部署的不確定性；不代表獨立居家校準達相同誤差。（§2.2） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。外殼標記條件各關節平均 RMSE 低於 2.40°；皮膚標記條件則低於 6.00°。（§3.1–3.2、Tables 1–2） |
| Q06 重現與外推 | concern | CMC 出現複數的受試者被排除於平均；光學校準與初始化依賴仍需處理。；未在 IRMS 目標硬體或族群重現。（§2.1–2.2、§4.2） |

## PMID-35408159

[Body-Worn IMU-Based Human Hip and Knee Kinematics Estimation during Treadmill Walking.](reviews/PMID-35408159.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 12 人，4 男／8 女，24.6±3.0 歲；排除影響步行能力的下肢或健康問題。（§3.1） |
| Q02 設備／校準 | reported | APDM Opal IMU 與十三相機 Vicon，均 200 Hz，時序脈衝同步。；自選速度 1.13±0.18 m/s；30 分鐘切成 60 段約 30 秒，以 GTSAM／LM 最佳化並作髖旋轉漂移啟發式修正。（§3.2、§3.2、§3.5） |
| Q03 參考與獨立性 | concern | 解剖標記經 OpenSim gait2392 得角度；參考膝為 1-DOF，因此另兩膝平面未被驗證。（§3.5、§4.2） |
| Q04 前處理／調參 | concern | absolute RMSE、將 IMU 均值對齊光學的 relative RMSE，以及 relative 峰值誤差，左右腿取平均。；參考均值校正不能在沒有參考系統的部署中免費取得；30 秒批次最佳化不是即時逐封包處理。（§3.6、Tables 1–3） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。步行膝屈伸：absolute RMSE 7.87±3.27°；reference-mean-adjusted relative RMSE 3.77±1.21°；表列 Mean±Std。（Tables 1–2） |
| Q06 重現與外推 | concern | 小且年輕的樣本；髖向量需校準、骨盆垂直假設與軟組織影響；非矢狀膝角沒有相應參考驗證。；未在 IRMS 目標硬體或族群重現。（§4.1–4.2） |

## PMID-22319365

[Estimating three-dimensional orientation of human body parts by inertial/magnetic sensing.](reviews/PMID-22319365.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 頭部試次以單一 subject 描述，沒有正式樣本招募及總樣本量報告；不視為大型人體研究。（Head Motion Tracking Trial） |
| Q02 設備／校準 | reported | Xsens MTx 與六臺相機 Vicon，100 Hz；IMU 與四標記固定於頭盔平板，觸發同步。；校準後先靜止，原地自由轉頭略超過半分鐘；Matlab 離線 EKF，參數最佳化。（Head Motion Tracking Trial、Head Motion Tracking Trial、Table 1） |
| Q03 參考與獨立性 | concern | 平板光學姿態作參考，沒有膝關節或肢段解剖模型。（Head Motion Tracking Trial） |
| Q04 前處理／調參 | concern | Quaternion 姿態誤差及 Euler 各角 RMSE，比較加速度／磁力計援助的有無。；可作融合推導與估計量定義的依據；示例誤差不構成通用硬體或演算法保證。（Filter Performance Assessment、Table 2） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。頭部示例 EKF 姿態 RMSE 1.62°；兩類援助皆關閉時 6.19°。數值只適用本示例與參數。（Table 2） |
| Q06 重現與外推 | concern | 有限示例、短試次及固定於外殼的光學參考，不驗證人體膝角或磁干擾下的 IRMS。；未在 IRMS 目標硬體或族群重現。（Head Motion Tracking Trial） |

## PMID-33916432

[Analysis of the Accuracy of Ten Algorithms for Orientation Estimation Using Inertial and Magnetic Sensing under Optimal Conditions: One Size Does Not Fit All.](reviews/PMID-33916432.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | 非人體試驗；三組各兩顆裝置固定於木板，操作者轉動板子。（§2.3–2.4） |
| Q02 設備／校準 | reported | Xsens MTx、APDM Opal、Shimmer3 與十二相機 Vicon；IMU 100／128 Hz，光學 100 Hz。；暖機 10 分鐘、靜止 1 分鐘扣陀螺偏移；約 20°C，角速度 RMS 120／260／380°/s，低磁干擾。（§2.3–2.4、§2.4） |
| Q03 參考與獨立性 | concern | 剛性板標記的光學姿態；既用於驗證，也用來逐情境調參。（§2.1、§2.5） |
| Q04 前處理／調參 | concern | 最佳與預設參數的絕對姿態誤差、情境統計及桌機運算時間。；同段資料調參與報誤差提供最佳情境下界，不能用作獨立測試集的泛化結果。（§2.6、Table 3） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。各演算法的平均最佳誤差落在 3.8–7.1°；未找到跨情境通用最佳法，硬體與速率影響誤差。（§5） |
| Q06 重現與外推 | concern | 尚未覆蓋平移、長時間連續運動及磁干擾；最佳參數需要已知參考姿態。；未在 IRMS 目標硬體或族群重現。（§4.1、§5） |

## PMID-32393301

[Validity and reliability of wearable inertial sensors in healthy adult walking: a systematic review and meta-analysis.](reviews/PMID-32393301.md)

JBI-SR-2017；健康成人步態信效度回顧；研究者內部品質分數不轉成 IRMS 證據等級。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 問題清楚 | yes | 明確聚焦本回顧的量測／校準問題。（Introduction、Methods） |
| Q02 納入條件相符 | yes | 納入條件依原研究問題、輸入與參考限定；仍有語言／方法報告選擇偏差。（Eligibility criteria／§2） |
| Q03 搜尋策略 | yes | 正文提供資料庫、時間與相關搜尋詞或附錄入口。（Search strategy／§2） |
| Q04 搜尋來源涵蓋 | unclear | 多資料庫與參考文獻追查已描述，但灰色文獻涵蓋未完整確認。（Search strategy／§2） |
| Q05 品質評估方法 | yes | 使用適應穿戴心理計量的 12 項 CASP 修改工具；不同於本庫的評分。（Methodological quality） |
| Q06 獨立品質評讀 | yes | 兩位獨立品質評讀者，遮蔽身分、試評及第三者仲裁均有描述。（Methodological quality） |
| Q07 擷取錯誤防範 | yes | 一位擷取，第二位核對正確性。（Data extraction） |
| Q08 研究合併方法 | yes | 按估計量及位置分組、Fisher z 隨機效應；多數小組只有少數研究，非普遍精度。（Data synthesis and analysis、Discussion） |
| Q09 出版偏誤 | unclear | 查閱正文未見出版偏誤檢查；未逐一核對所有補充資料，不能推定已做。（Methods、Discussion） |
| Q10 實務建議依據 | yes | 保留不同方法和任務的適用限制；不據此宣稱 IRMS 效能。（Discussion、Conclusions） |
| Q11 後續研究方向 | yes | 提出標準化、重測或代表性等與研究缺口相符的方向。（Discussion、Conclusions） |

## PMID-34063355

[Wearable Devices for Biofeedback Rehabilitation: A Systematic Review and Meta-Analysis to Design Application Rules and Estimate the Effectiveness on Balance and Gait Outcomes in Neurological Diseases.](reviews/PMID-34063355.md)

JBI-SR-2017；神經疾病介入 RCT 的回顧；評的是回顧，非直接逐篇 RCT RoB 2。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 問題清楚 | yes | 明確聚焦本回顧的量測／校準問題。（Introduction、Methods） |
| Q02 納入條件相符 | yes | 納入條件依原研究問題、輸入與參考限定；仍有語言／方法報告選擇偏差。（Eligibility criteria／§2） |
| Q03 搜尋策略 | yes | 正文提供資料庫、時間與相關搜尋詞或附錄入口。（Search strategy／§2） |
| Q04 搜尋來源涵蓋 | yes | 五資料庫，另手查試驗登錄與灰色文獻，但只納英文。（§2.1 Search strategy） |
| Q05 品質評估方法 | yes | RCT 以 Cochrane 六域工具分類原研究偏誤。（§2.6 Risk of bias assessment） |
| Q06 獨立品質評讀 | unclear | 明說雙人獨立篩選，未明確報告獨立雙人風險評估。（§2.3、§2.6） |
| Q07 擷取錯誤防範 | unclear | 擷取欄位完整，但未明述獨立雙人擷取／核對。（§2.3 Study selection and data extraction） |
| Q08 研究合併方法 | unclear | 以 add-on 與運動成分分組；疾病／裝置異質且圖／正文檢定衝突需限制解讀。（§2.4–2.5、§3.6.3、Figure 6） |
| Q09 出版偏誤 | unclear | 查閱正文未見出版偏誤檢查；未逐一核對所有補充資料，不能推定已做。（Methods、Discussion） |
| Q10 實務建議依據 | unclear | 建議受多數原研究不清楚的偏誤風險、族群及裝置混合限制。（§4、Figure 8） |
| Q11 後續研究方向 | yes | 提出標準化、重測或代表性等與研究缺口相符的方向。（Discussion、Conclusions） |

## PMID-30669657

[Wearable Sensor-Based Exercise Biofeedback for Orthopaedic Rehabilitation: A Mixed Methods User Evaluation of a Prototype System.](reviews/PMID-30669657.md)

JBI-QUAL-2017；只評訪談質性部分；SUS／uMARS 量化部分不以此清單認證。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 哲學與方法一致 | unclear | 採 grounded-theory 主題分析，但未充分明示哲學立場。（§2.3–2.4） |
| Q02 問題與方法一致 | yes | 訪談適合了解預期、接受度及經驗，不適合因果療效估計。（Introduction、Methods） |
| Q03 資料收集一致 | yes | 半結構訪談、錄音與轉錄配合主題分析；便利樣本限制代表性。（§2.3–2.4） |
| Q04 分析呈現一致 | yes | 初始編碼模板、恆常比較、兩研究者核對與受訪者引語有呈現。（§2.3–2.4、Results） |
| Q05 結果解釋一致 | yes | 結果以主題與受訪者看法解釋，須限於需求或使用經驗。（Results、Discussion） |
| Q06 研究者定位 | unclear | 報研究者職業背景，但未充分說明文化／理論位置與開發者角色的影響。（§2.3–2.4） |
| Q07 研究者影響／反思 | unclear | 交叉編碼不等同反思性；未充分描述研究者與參與者關係的影響。（§2.3–2.4、Limitations） |
| Q08 參與者聲音 | yes | 結果以直接引語支持不同主題。（Results） |
| Q09 倫理 | yes | Beacon 倫理審查 BEA0065，並描述適用同意程序。（Participants／Ethics approval） |
| Q10 結論由資料推得 | yes | 主題結論有資料支持；不能將正向預期或 SUS 轉成客觀療效。（Results、Conclusions） |

## PMID-30366919

[Clinician perceptions of a prototype wearable exercise biofeedback system for orthopaedic rehabilitation: a qualitative exploration.](reviews/PMID-30366919.md)

JBI-QUAL-2017；只評訪談質性部分；SUS／uMARS 量化部分不以此清單認證。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 哲學與方法一致 | unclear | 採 grounded-theory 主題分析，但未充分明示哲學立場。（Methods／Data analysis） |
| Q02 問題與方法一致 | yes | 訪談適合了解預期、接受度及經驗，不適合因果療效估計。（Introduction、Methods） |
| Q03 資料收集一致 | yes | 半結構訪談、錄音與轉錄配合主題分析；便利樣本限制代表性。（Methods／Data analysis） |
| Q04 分析呈現一致 | yes | 初始編碼模板、恆常比較、兩研究者核對與受訪者引語有呈現。（Methods／Data analysis、Results） |
| Q05 結果解釋一致 | yes | 結果以主題與受訪者看法解釋，須限於需求或使用經驗。（Results、Discussion） |
| Q06 研究者定位 | unclear | 報研究者職業背景，但未充分說明文化／理論位置與開發者角色的影響。（Methods／Data analysis） |
| Q07 研究者影響／反思 | unclear | 交叉編碼不等同反思性；未充分描述研究者與參與者關係的影響。（Methods／Data analysis、Limitations） |
| Q08 參與者聲音 | yes | 結果以直接引語支持不同主題。（Results） |
| Q09 倫理 | yes | Beacon 倫理審查 BEA0065，並描述適用同意程序。（Participants／Ethics approval） |
| Q10 結論由資料推得 | yes | 主題結論有資料支持；不能將正向預期或 SUS 轉成客觀療效。（Results、Conclusions） |

## PMID-26110027

[Understanding Bland Altman analysis.](reviews/PMID-26110027.md)

IRMS-METHOD-DOMAINS-v1；工程方法、示例或統計教程的報告／外推域檢查；自訂且未驗證，非臨床偏誤工具或品質總分。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 樣本／試次單位 | reported | Table 1 為 30 對假想量測，不是 30 位病人或 IRMS 試次。（Table 1） |
| Q02 設備／校準 | reported | 假想 Method A／B，沒有特定硬體。；差值對均值，檢視偏移、分布與隨量級改變的誤差；另討論百分比表示。（Table 1、The analysis of differences、Bland and Altman method: plot difference as percentage） |
| Q03 參考與獨立性 | concern | 配對方法比較，不假設任一方法必然是真值。（Introduction、The analysis of differences） |
| Q04 前處理／調參 | concern | 近似常態差值時 mean difference ±1.96 SD，以及偏移／界限的信賴區間。；只採用一致性分析的相關段落；不將本文所有相關係數或顯著性解讀當作統計規範。（Bias and agreement limits、Precision of estimated limits of agreement） |
| Q05 誤差與不確定性 | reported | 結果與原文位置已保存；樣本／條件內數值不等於跨裝置精度。假想示例 r=0.996，平均差約 −27.2 units，LoA 約 −95.4 至 41.1 units，顯示相關不保證一致。（Table 1、Figures 1–5） |
| Q06 重現與外推 | concern | 基本獨立配對教學不能直接處理同一人的自相關封包；IRMS 需對受試者／重複試次設計適當統計。；未在 IRMS 目標硬體或族群重現。（Precision of estimated limits of agreement（IRMS 外推）） |

## PMID-41088368

[Concurrent validity of wearable IMUs for sagittal plane lower-limb range of motion during walking and estimated ground reaction forces: a systematic review and meta-analysis.](reviews/PMID-41088368.md)

JBI-SR-2017；近期 ROM／GRF 統合；不重評 27 原始研究，不將 QUADAS-2 分數套至 IRMS。

| 項目 | 判讀 | 理由與原文位置 |
|---|---|---|
| Q01 問題清楚 | yes | 明確聚焦本回顧的量測／校準問題。（Introduction、Methods） |
| Q02 納入條件相符 | yes | 納入條件依原研究問題、輸入與參考限定；仍有語言／方法報告選擇偏差。（Eligibility criteria／§2） |
| Q03 搜尋策略 | yes | 正文提供資料庫、時間與相關搜尋詞或附錄入口。（Search strategy／§2） |
| Q04 搜尋來源涵蓋 | unclear | 多資料庫與參考文獻追查已描述，但灰色文獻涵蓋未完整確認。（Search strategy／§2） |
| Q05 品質評估方法 | yes | 以 QUADAS-2 的四域評驗證研究；量測連續值的適用調整與高異質性須保留。（Data collection process／Risk of bias assessment） |
| Q06 獨立品質評讀 | unclear | 明說雙人篩選與擷取，但正文未明確另述雙人獨立 QUADAS-2 評讀。（Selection process、Data collection process） |
| Q07 擷取錯誤防範 | yes | 兩位獨立擷取、預先設計表格及仲裁流程。（Data collection process） |
| Q08 研究合併方法 | yes | REML／Hartung–Knapp／I² 分析與敏感度方法有描述；I² 高不能用平均值作裝置門檻。（Statistical synthesis、Results） |
| Q09 出版偏誤 | yes | 至少十研究時採 funnel plot／Egger 檢查；小組不能排除出版偏誤。（Statistical synthesis） |
| Q10 實務建議依據 | unclear | ≤5° 的實務解讀框架與健康樣本、高異質性有外推疑慮，不作普遍臨床門檻。（Clinical context and sources of variability、Limitations） |
| Q11 後續研究方向 | yes | 提出標準化、重測或代表性等與研究缺口相符的方向。（Discussion、Conclusions） |
