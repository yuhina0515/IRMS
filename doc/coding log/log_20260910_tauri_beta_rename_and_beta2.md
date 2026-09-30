---
tags: [coding-log, tauri-migration, release]
date: 2026-09-10
summary: "使用者要求把 Tauri release 的命名風格改成跟既有 Electron release 完全一致(title 純版本號、tag vX.Y.Z-beta.N,不帶 App 名稱前綴)。刪除重建 tauri-preview-v0.1.0 與舊的 v1.2.0-beta.1 兩個 release;因為兩個舊 release 的安裝檔內部版本字串跟新 tag 不一致(一個是 0.1.0、一個是 1.2.0-beta.1,新命名要求變成 1.2.0-beta.1 與 1.2.0-beta.2),沒有直接搬用舊檔案改名,而是各自重新建置一份版本字串正確對應的安裝檔——beta.1 用 git worktree 從加入資料遷移模組前的 commit(d519883)重建(維持它原本『無資料遷移』的內容),beta.2 用目前的程式碼重建(含資料遷移模組)。兩個新 release 現在 tag/title/內部版本字串三者一致。"
---

# 2026-09-10 變更日誌 — Tauri release 命名修正 + 拆成 beta.1/beta.2

> **相關文件**:[[HOME|導覽首頁]] · [[TAURI_MIGRATION_PLAN]] ·
> [[log_20260910_tauri_1.2.0_beta1_release|前一篇:原始 v1.2.0-beta.1 發版記錄]]

## 🎯 目的

使用者看到 GitHub release 列表後指出 Tauri 兩個 release 的命名風格(title 帶
`IRMS_App_Tauri` 前綴、tag 用 `tauri-preview-` 前綴)跟既有 Electron release(純版本號
title、`vX.Y.Z-beta.N` tag)不一致,要求改回一致的格式。確認格式後,使用者進一步指定兩個
release 的新版本號對應關係:原本的 `tauri-preview-v0.1.0`(UI-only 預覽,不含資料遷移
模組)改叫 `1.2.0-beta.1`,原本的 `v1.2.0-beta.1`(含資料遷移模組)改叫 `1.2.0-beta.2`。

## 🔧 動作

1. **不是單純改名,是重新建置**:GitHub release 改名(title)簡單,但改 tag 沒有直接支援
   (要刪掉重建),而且更關鍵的問題是——如果只是把舊安裝檔原封不動掛到新 tag 底下,安裝檔
   **內部的版本字串**會跟 release tag 對不上:
   - 舊的 `tauri-preview-v0.1.0` 安裝檔內部版本是 `0.1.0`,如果直接掛到 `v1.2.0-beta.1`
     這個 tag 下面,使用者裝完打開 Settings 頁看到的版本號會是 `0.1.0`,跟下載頁面看到的
     `1.2.0-beta.1` 對不起來。
   - 舊的 `v1.2.0-beta.1` 安裝檔內部版本是 `1.2.0-beta.1`,如果改掛到 `v1.2.0-beta.2`,
     一樣會有相同的落差。
   判斷這個不一致比多花幾分鐘重新編譯更值得在意,所以選擇兩邊都重新建置,而不是圖快直接
   搬用舊檔案改名了事。
2. **`1.2.0-beta.2`(含資料遷移模組)**:直接在目前的工作目錄把版本號從 `1.2.0-beta.1`
   改成 `1.2.0-beta.2`(`package.json`/`tauri.conf.json`/`Cargo.toml` 三處),重新跑一次
   簽章 release build。
3. **`1.2.0-beta.1`(還原成不含資料遷移模組的原始內容)**:用 `git worktree add` 在
   `E:\Monitoring-and-IoT\IRMS_beta1_build` 開一個獨立工作目錄,checkout 到
   `d519883`(加入 `migrate_electron.rs` **之前**的那個 commit,即 Phase 3+4 剛完成、
   資料遷移模組還不存在的狀態)。在這個獨立目錄裡(不影響 main 分支的實際工作目錄)把版本號
   從 `0.1.0` 改成 `1.2.0-beta.1`,並補上稍後才加的「`bundle.targets` 只留 nsis」修正
   (這個舊 commit 比 MSI 修法還早,直接建置會重現同一個 MSI 版本格式錯誤)。`npm install`
   + 簽章 release build,產出的安裝檔內部版本字串正確對應 `1.2.0-beta.1`,內容維持原本
   「無資料遷移模組」的樣子——這正是使用者要的:beta.1 是最初的 UI-only 預覽,beta.2 才
   加上資料遷移這個新功能,版本號的先後順序跟功能的先後順序一致。
4. **刪除重建兩個 release**:`gh release delete <tag> --yes --cleanup-tag`(連 git tag 一併
   刪除,不留孤兒 tag),再用 `gh release create` 建立新的 `v1.2.0-beta.1`/`v1.2.0-beta.2`,
   title 改成純版本號(不帶 `IRMS_App_Tauri` 前綴),notes 內容比照既有 Electron release 的
   語氣與段落結構(✅ 可以做什麼 / ⚠️ 做不到什麼 / 安裝方式)。
5. **清理**:建置完成後 `git worktree remove --force` 移除暫用的
   `IRMS_beta1_build` 目錄(裡面有 `npm install`/`cargo build` 產生的未追蹤檔案,
   已經確認需要的安裝檔都已經上傳到 release,強制移除不會遺失任何東西)。main 分支
   工作目錄的版本號變動(`1.2.0-beta.1` → `1.2.0-beta.2`)正常 commit。

## 📐 決策

- **寧可多等一次完整編譯(worktree 那次是全新環境,冷編譯 2 分 32 秒),也不用舊檔案改名
  蒙混過去**——這台專案是健康/復健資料相關的 App,版本號是使用者/開發者之後除錯時會拿來
  對照的關鍵資訊,安裝檔實際版本跟 release 標籤對不上,之後排查「這台裝置到底裝的是哪個
  版本」會變得不可靠。
- **用 `git worktree` 而不是 `git stash` + `git checkout`**——這樣可以在不影響 main 分支
  當前工作目錄(`1.2.0-beta.2` 的建置正在或即將進行)的情況下,同時準備另一個版本的建置
  環境,兩者互不干擾,也不需要在兩個版本號之間反覆切換工作目錄狀態。
- **beta.1 的重建刻意維持「不含資料遷移模組」的內容,不是也一併加上這個功能**——如果
  beta.1 跟 beta.2 建置內容完全一樣、只差版本字串,兩個 release 的存在就失去意義。維持
  歷史真實的功能邊界(beta.1 = 最初預覽,beta.2 = 加上資料遷移),讓版本號本身能反映真實的
  變更歷史,而不只是重新編號的標籤。

## ✅ 驗證

- 兩次簽章 release build 都完整跑完(`npm run ci` 隱含在 `beforeBuildCommand` 裡,build
  失敗會讓整個 `tauri build` 中止,兩次都順利產出 `.exe` + `.sig`)。
- `gh release list` 確認刪除動作真的生效(舊的兩個 tag 從列表消失),新建立的兩個 release
  title/tag 格式與既有 Electron release 一致:

  ```
  1.2.0-beta.2   Pre-release   v1.2.0-beta.2
  1.2.0-beta.1   Pre-release   v1.2.0-beta.1
  1.1.0-beta.4   Pre-release   v1.1.0-beta.4
  ...
  ```
- `git worktree list` 確認暫用的 worktree 已經移除乾淨,沒有留下孤兒工作目錄。

## Self-review

檢查情境:「`git worktree remove --force` 會不會不小心把還沒上傳的檔案一起刪掉?」——
追蹤實際操作順序:先完成 `gh release create` 成功上傳兩個檔案(`.exe` + `.sig`)並拿到
release 網址確認成功,**之後**才執行 `worktree remove --force`。上傳與刪除之間沒有任何
會修改該目錄內容的操作,刪除前已經確認過檔案存在且上傳成功(`gh release create` 的
回傳網址本身就是上傳完成的信號,失敗會回傳非 0 exit code 而不是網址)。**PASS**——但這個
PASS 依賴的是操作順序記得正確,不是有程式碼層級的保護(例如上傳前後的雜湊比對),下次如果
同樣流程要交給腳本自動化,值得補上一個「上傳後驗證 asset 存在再刪除來源」的顯式檢查,
而不是只靠操作順序本身的記憶。
