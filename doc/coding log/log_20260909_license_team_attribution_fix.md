---
tags: [coding-log, legal, docs]
summary: LICENSE 版權人由個人 GitHub 帳號改為 IRMS Team,修正先前假設 IRMS 是個人專案的錯誤
date: 2026-09-09
---

# 2026-09-09 變更日誌 — LICENSE 版權歸屬修正為 IRMS Team

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260909_license_and_disclaimer|同日 LICENSE/免責聲明日誌]]

## 🎯 目的

[[log_20260909_license_and_disclaimer|前一份日誌]]新增 LICENSE 時,誤把版權人寫成使用者
個人 GitHub 帳號 `yuhina0515`。使用者接著問「有沒有需要提醒標註來自這個團隊」,查證
[[log_20260716_meeting_discord_server_structure|07-16 Discord 架構會議日誌]]確認 IRMS
實際是「個位數到十幾人」的真實團隊專案,與 `package.json` 的 `author: "IRMS Team"` 相符,
而非使用者一人掛名的個人專案。個人版權人的寫法會不當地把隊友的貢獻併入使用者個人所有。

## 🔧 動作

1. 與使用者確認 LICENSE 版權人寫法,使用者選擇「改成 IRMS Team」(而非保留個人名義或
   列出所有隊友真實帳號)。
2. `LICENSE` 版權人由 `yuhina0515` 改為 `IRMS Team`。
3. README「免責聲明」節的敘述主體由「學生自主開發」改為「IRMS Team 開發」、責任歸屬
   由「作者」改為「IRMS Team」。
4. README「授權」節新增著作權歸屬(IRMS Team)與具體引用來源連結
   (`github.com/yuhina0515/IRMS`),明確提醒衍生使用者標註來源。

## 🧠 決策

- 選 "IRMS Team" 而非列出所有真實隊友帳號:與 `package.json` 既有的 `author` 欄位一致,
  且不需要每次隊友異動就改 LICENSE,新加入的協作者自動視為共同權利人,不用簽署額外文件。
- 沒有列出個別隊友姓名/帳號:降低其他隊友身份被動公開曝光的風險,對齊
  [[log_20260909_license_and_disclaimer|前一份日誌]]對使用者個人身份採取的同一種保守
  揭露原則。

## ✅ 驗證

讀取修改後的 `LICENSE`、`README.md`,確認版權人、免責聲明責任主體、授權節三處用詞
一致改為 IRMS Team,未殘留 `yuhina0515` 個人名義的版權宣告。未另外執行自動化測試,
純文件變更。

## 🔍 自我檢查

情境:若有人 fork 這個 repo 並在自己的 README 引用,是否能單靠授權節文字就知道要
標註「IRMS Team」而非誤植使用者個人帳號?→ 重讀授權節文字,已同時包含團隊名稱與可點擊
的來源連結,結果:通過。
