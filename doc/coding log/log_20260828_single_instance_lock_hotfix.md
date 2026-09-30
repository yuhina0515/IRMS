---
tags: [coding-log]
date: 2026-08-28
summary: "使用者剛裝完 v1.0.2、關閉視窗後就再也打不開,重複點擊會在工作管理員裡疊出多個背景 process。根因:主進程從來沒有 app.requestSingleInstanceLock(),每次啟動都是全新、互不相干的 process,全部搶著開同一個 better-sqlite3 (WAL) 檔;initDatabase() 撞鎖拋出的例外原本沒有任何地方接住,後果是視窗開不出來、process 卻留在背景不退出。補上單例鎖(第二個 process 立刻自我了斷並把已存在的視窗叫到前景)與 whenReady 鏈的 .catch()(啟動失敗至少跳錯誤對話框、保證 process 會結束)。用隔離 --user-data-dir 啟動兩次驗證:process 數維持 4 個不再疊加。發布 v1.0.3 頂替。"
---

# 2026-08-28 變更日誌 — 單例鎖 hotfix(v1.0.3)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260828_v1.0.2_release|前一版:v1.0.2 發布]]

## 🎯 目的

v1.0.2 發布後幾分鐘,使用者回報:用安裝介面的「啟動 IRMS」可以正常開啟,但關閉視窗後
就再也打不開——工作管理員截圖顯示點擊會疊出第二個、第三個「背景處理程序」,
從未變成有視窗的「應用程式」。

## 🔧 變更內容

### 根因:從未實作 single-instance lock

`grep -rn "SingleInstance\|second-instance"` 全 repo 零命中——`src/main/index.ts`
從第一版起就沒有這段。後果鏈:

1. 每次點捷徑都會開一個全新、互不相干的 Electron process,全部呼叫
   `new Database(dbPath)` 開同一個 `irms.sqlite`(WAL 模式)。
2. 第一個 process 若還在跑(或視窗關閉後真正退出前那個短暫窗口),第二個
   process 的 `initDatabase()` 撞上檔案鎖會拋出例外。
3. 這個例外發生在 `app.whenReady().then(() => {...})` 裡,**原本沒有 `.catch()`
   接住**——變成一個 unhandled rejection,`createWindow()` 永遠不會被呼叫(它排在
   `initDatabase()` 之後),但 process 本身沒有崩潰、也沒有呼叫 `app.quit()`,
   於是停留在背景,呈現「點了沒反應」的假象,使用者只會繼續點,疊出更多同樣
   卡住的 process。

### 修法

- `app.requestSingleInstanceLock()` 放在檔案最前面(在任何其他 `app.*` 呼叫
  之前)。拿不到鎖立刻 `app.quit()`,不等 `whenReady`——晚了就已經在跟第一個
  process 搶 DB 檔的路上。
- `second-instance` 事件:把既有視窗 `restore()`/`show()`/`focus()`,而不是
  讓第二次點擊悄悄消失——單靠鎖本身只解決「不再疊 process」,不解決「使用者
  點了兩次卻毫無反饋」。
- `app.whenReady().then(...).catch(...)`:啟動鏈任何一步拋出例外(不只是這次
  的 DB 鎖衝突),至少跳 `dialog.showErrorBox` 並 `app.quit()`,不會再有
  「視窗沒開、process 卻賴著不走」的隱形殭屍。

## 🧠 關鍵取捨

**為什麼 dev 模式從來沒踩到這個坑?** `electron-vite dev` 一次只會啟動一個
electron 進程,沒有「使用者連續點兩次捷徑」這個情境,這條路徑從 v1.0.0 到
v1.0.2 的所有測試(含每次「打包後 exe 實機啟動測試」)都只啟動一次、確認開得起來
就結束,從未測試過「開了又關、再開一次」——這正是這次事故的成因,也是為什麼
拖到 v1.0.2 才第一次被人踩到。

## ✅ 驗證方式

- [x] `npm run ci`:typecheck + 284 tests + build 全綠(本次改動不影響任何被測邏輯,
      測試數不變)
- [x] `npx electron-builder --dir` 產出 unpacked build,以隔離
      `--user-data-dir` 啟動兩次(非預設 profile):
      - 第一次啟動後:`(Get-Process -Name 'IRMS Dashboard').Count` = 4
      - 立即第二次啟動後:仍是 4(**沒有疊加**),主視窗標題
        「IRMS | 智慧復健監測系統」仍在,第二個 process 正確自我了斷
- [ ] 未測試「第二個 process 啟動時第一個視窗被最小化」情境下 `second-instance`
      是否正確 restore——現場只驗證了視窗停留在正常大小的情況

## 📝 後續待辦

- 這條路徑(重複啟動)此前從未被納入任何一次打包後驗證,建議往後的「打包後 exe
  實機啟動測試」固定加一步:啟動→關閉→再啟動,而不是只驗證「開得起來」。
