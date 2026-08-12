---
tags: [coding-log, housekeeping]
date: 2026-08-12
summary: "專案整頓:把 2026-08-07 已完成但躺在工作樹五天的成果(快速歸零 axisSwap 修復 + 響應式 5 修)分三個 commit 進版控,清掉 .claude 的殘留備份並補 .gitignore;四份核心文件全面對齊現況——OPTIMIZATION 把已完成的 5 項打勾、被會議否決的 3 項改成保留並註明理由(而非刪除,避免同一提案幾個月後再被辯論一次),ROADMAP 補上 08-03 / 08-07 兩次順位覆寫,AI_CODING_RULES 的 SQLite schema 補齊 migration 2–5 加的欄位並修好 4.1 直接跳 4.4 的節號,PROJECT_STATUS 從『只涵蓋到 06-30』的歷史檔改寫成現況快照。寫了一支連結檢查器掃全 vault 198 條連結,揪出 v1 時代四份日誌裡 9 條指向舊路徑 c:/Users/.../Documents/IRMS 的死連結並修正。npm run ci 全綠(144 tests)。"
---

# 2026-08-12 變更日誌 — 倉庫與文件整頓

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] · [[OPTIMIZATION|優化待辦]] · [[ROADMAP]] · [[log_20260807_meeting_calibration_bug_and_responsive_layout|2026-08-07 會議]]

## 🎯 目的

使用者要求「針對此專案進行整頓計畫,完成後自動執行」。盤點後發現問題集中在**紀錄與實況脫節**,
而非程式本身:

1. 2026-08-07 那批已完成、已驗證、已打包的成果整批躺在工作樹裡未 commit(共 8 個修改檔 + 2 新檔)。
2. `.claude/` 有 Claude Code 自動留下的 `settings.local.json.bak`,以及專案規則已停用的空 `logs/` 目錄。
3. `OPTIMIZATION.md` / `ROADMAP.md` 仍把早已完成或已被會議否決的項目列為待辦。
4. `AI_CODING_RULES.md` §4 的 SQLite schema 停在 migration 前的形狀,少了三個欄位與整套 migration 機制。
5. `PROJECT_STATUS.md` 開頭自述「內容僅涵蓋至 2026-06-30」,等於是一份自知過期卻仍掛在 README 入口的文件。

**範圍刻意受限**:只做「倉庫與文件對齊」,不動被會議明確延後的工作(ESLint 35 項、i18n、
多關節泛化)。依據是專案第 2 條規則「修缺陷、不擴大議程」——整頓不該變成夾帶重構的藉口。

## 🔧 變更內容

### 一、版控整頓

分三個 commit,依「一個 commit 一件事」拆:

| commit | 內容 |
|---|---|
| `2481f8d` | `fix:` 快速歸零漏套 axisSwap(`buildQuickZeroPatch` 純函式 + 3 個 vitest) |
| `ffef1f5` | `fix:` 響應式 5 修(視窗尺寸、兩處 aspect-ratio viewport、Dashboard 斷點、`env(titlebar-area-*)`)+ `vite.browsertest.config.ts` |
| `a070ce9` | `docs:` 2026-08-07 會議紀錄 |

- 刪除 `.claude/settings.local.json.bak`(未進版控的本機權限設定備份;內容比現行檔多 3 條
  一次性指令的允許項,無保留價值)。
- 刪除空的 `.claude/logs/`——專案 `.claude/CLAUDE.md` 已明文停用該路徑,留著只會誘導後續誤寫。
- `.gitignore` 新增 `.claude/settings.local.json*`。原本只有使用者的**全域** git ignore
  蓋到 `settings.local.json`,換一台機器 clone 就會漏;`.bak` 則從頭到尾沒被任何規則蓋到,
  這就是它會出現在 `git status` 的原因。

### 二、文件對齊現況

- **`HOME.md`**:狀態速記補上 2026-08-07 條目(先前停在 08-03)。
- **`OPTIMIZATION.md`**:
  - 打勾 5 項實際已完成:LiveChart 節流(`UI_SYNC_MS = 80`)、History LTTB、ErrorBoundary、
    migration runner、electron-builder 圖示與 metadata。每一項都先 grep 程式碼確認才打勾。
  - 2 項被會議否決的改為「保留 + 註明否決理由」:`qualityScore`(協定無陀螺通道)、
    rAF 聚合(已被 `UI_SYNC_MS` 實作)。**不刪除**——刪掉的提案會在幾個月後被原封不動
    重新提出、重新辯論一次。(第三項「Profile 下發至韌體」早在 2026-07-03 就已依 D1 註記,
    沿用其寫法作為此處的格式範本。)
  - 修好 §7 與 §8 標題順序顛倒(檔案裡「8. 引導式監測」排在「7. 基礎建設」前面)。
  - 新增「二之二、專案規則」節,把散在三次會議紀錄裡的 3 條規則集中到活清單上。
  - 校準精靈「五步」更正為六步——UI 實際標示 1/6–6/6。
- **`ROADMAP.md`**:Phase 2/3 狀態更新、`qualityScore` 標記否決、新增第五節(08-03 順位覆寫)
  與第六節(08-07 校正 bug 與響應式)。
- **`AI_CODING_RULES.md`**:
  - §4 節號修正(原本 4.1 直接跳到 4.4,4.2/4.3 標題不見了)。
  - §4.3 schema 依 `migrations.ts` 重寫:補上 `custom_actions.safetyLimit` 與 CHECK 約束、
    `sessions.abandoned` / `triggerType` / `safetyLimit`,並寫明「**嚴禁修改既有 migration**」
    這條只有踩過才知道的規則。權威來源指標從已不存在的 `db.ts::createSchema()` 改指 `migrations.ts`。
  - §4.4 判定邏輯改寫:原文只寫「膝角 vs 目標」,但實際上判定變數依 `triggerType` 經
    movementMetric 正規化決定(SLR / 後擺看的是 `angles.thigh`);超限門檻也已改為獨立
    `safetyLimit` 而非 `target+tol+10` 導出值。補上遲滯/寬限/EMA 與 rest 不變式。
- **`PROJECT_STATUS.md`**:整份改寫為現況快照(一句話現況 + 能力盤點 + 風險表 + 已完成驗證
  + 壓縮歷史 + 檔案地圖),不再是一份自我宣告過期的文件。

### 三、死連結修正

寫了一支一次性連結檢查器掃過全 vault 的 48 份 markdown、198 條連結(相對連結與
`[[wikilink]]` 都查)。揪出 9 條死連結,全在 v1 時代的四份日誌裡,指向專案搬家前的絕對路徑
`file:///c:/Users/Yuhina/Documents/IRMS/...`:

- 指向仍存在的檔案(`IRMS_Sensor.ino`、`PROJECT_STATUS.md`、`AI_CODING_RULES.md`)→ 改為倉庫相對連結。
- 指向 `IRMS_App/public/app.js` 的 → 該檔已於 v2 重寫移除,連結無論怎麼改都是死的,
  故降級為行內程式碼並註明「v1 檔案,已於 2026-06-27 v2 重寫移除」。

## ⚖ 決策

1. **動到「只增不改」的歷史日誌是否正當?** 專案慣例是歷史 log 不覆寫。判斷:此處只改連結
   **指標**,一個字的敘述都沒動(已用 diff 逐行確認),指向的仍是同一個邏輯目標,
   與 2026-06-30 那次修 `AI_CODING_RULES.md` 舊路徑的先例同性質。falsify 歷史的是改敘述,
   不是修好一個指不到東西的箭頭。
2. **被否決的 backlog 項目:註記而非刪除。** 刪除會讓否決理由跟著消失,幾個月後同一個提案
   會以「這不是還沒做嗎」的姿態回來。2026-08-03 會議裁定 rAF 項「應刪除」——這裡的處理是
   刪掉它的**待辦身分**(改成已完成/已否決)而非刪掉那一行,理由同上。
3. **`.bak` 直接刪除而非合併。** 它比現行檔多的 3 條是一次性指令的允許項
   (某次 `git diff` 特定檔案、某次 grep),留著只是噪音。
4. **不擴大到程式碼整理。** ESLint 的 35 項、i18n、多關節泛化全部留在原地。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + test + build)→ **144 tests / 14 files 全綠**,build 成功,exit 0。
- [x] 連結檢查器複跑 → **198 條連結、0 broken**。
- [x] 打勾的每一項 backlog 都先在程式碼裡驗證存在後才打勾:`UI_SYNC_MS` (`sessionController.ts:18`)、
      `lttb` (`db.ts:157`)、`ErrorBoundary.tsx`、`electron-builder.yml` 的 `icon`/`appId`/`productName`。
- [x] schema 敘述逐欄位對照 `migrations.ts` 的 5 個版本,非憑既有文件轉抄。
- [x] 校準精靈步數以 `grep "步驟 [0-9]/6"` 實際數出 6 個畫面,才改文件與程式註解。
- [x] 全部 38 份 coding log 檢查 frontmatter 與 `summary` 欄位齊備(`coding-logs.base` 依賴它)→ 全數通過。

## 🔍 自我審查

**設想的失效情境**:新增的 `.gitignore` 規則 `.claude/settings.local.json*` 用了萬用字元,
若匹配過寬,會把**應該進版控**的 `.claude/CLAUDE.md`(專案層級規則,新機器 clone 後少了它
就會退回全域規則、把工作日誌寫進 `.claude/logs/`)一起排除掉,而且這種失效在原機器上完全
看不出來——檔案已經被追蹤了,ignore 規則對已追蹤檔案無效。

**實際驗證**:`git check-ignore -v .claude/CLAUDE.md` → exit 1(未被忽略),
`git ls-files .claude/` → 仍列出 `.claude/CLAUDE.md`。規則範圍正確。

## 📝 後續待辦

- 本專案最大風險仍未變:**整條硬體迴路從未在真實裝置上驗證**(issues
  [#2](https://github.com/yuhina0515/IRMS/issues/2) / [#3](https://github.com/yuhina0515/IRMS/issues/3))。
- 元件層測試缺口(2026-08-07 的缺陷正是死在這裡)已升格記入 OPTIMIZATION P0 與 ROADMAP Phase 2。
- `minHeight` 修正的前提(1366×768@125% 筆電放不下 680)仍是算術推導,未在該機型實測。
