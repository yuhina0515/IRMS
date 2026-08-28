---
tags: [coding-log]
date: 2026-08-28
summary: "v1.0.3 的單例鎖修好了『重複點擊疊出多個 process』,但使用者立刻回報『跟剛剛一樣,完全沒有畫面』——同一個症狀還在。追下去才發現這是兩個完全獨立的缺陷疊在一起:單例鎖修的是『多個 process 搶同一個 DB』,而『視窗打不開』的真正根因是 titleBarOverlay(無邊框視窗疊在網頁上的原生控制鈕)依賴 DWM 合成,在使用者這個 RDP session 裡合成會直接卡死——renderer 都載入完了(did-finish-load 有觸發),ready-to-show 永遠不來。加上 SESSIONNAME=RDP-Tcp 偵測,RDP session 一律退回一般視窗框(犧牲滿版標題列外觀換取打得開)。連續 6 輪『開啟→關閉(force-kill)→再開啟』壓力測試全部成功(先前的程式碼在同樣測試下持續失敗)。同時發現先前用來驗證『GPU 加速是不是根因』的假設(disableHardwareAcceleration)本身沒解決問題,但作為次要防線保留。發布 v1.0.4。"
---

# 2026-08-28 變更日誌 — RDP titleBarOverlay 卡死 hotfix(v1.0.4)

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260828_single_instance_lock_hotfix|前一版:v1.0.3 單例鎖 hotfix]]

## 🎯 目的

v1.0.3 發布後,使用者照著新安裝檔測,回報「跟剛剛一樣,完全沒有畫面」。乍看像是
v1.0.3 的修復無效,追查後發現是**兩個完全獨立的缺陷疊在同一個症狀上**。

## 🔧 變更內容

### 排查過程(記錄下來,因為繞了不少彎路)

1. 先發現使用者機器上實際安裝的還是 **v1.0.1**——`AppData\Local\Programs\IRMS
   Dashboard\IRMS Dashboard.exe` 的 `VersionInfo.ProductVersion` 顯示 `1.0.1.0`,
   註冊表 uninstall 項目也只有一筆 v1.0.1。用本機建置好的
   `release\IRMS Dashboard Setup 1.0.3.exe` 以 `/S`(NSIS 靜默安裝)裝上去,
   確認裝好後版本正確變成 `1.0.3.0`。
2. 裝好後單發啟動:透過 `powershell.exe -Command "& '...\IRMS Dashboard.exe'"`
   啟動,4 個 process、**沒有一個有視窗標題**。改用 bash 直接啟動同一支 exe 卻正常
   顯示視窗——一度誤以為是啟動方式的差異(後來證明是雜訊,問題本身就是間歇性的)。
3. 用力做了幾輪「快速關閉又重開」的迴圈測試,結果從偶爾失敗變成**每次都失敗**,
   一度懷疑是自己的測試手法(重複 force-kill、重複用同一個 profile 目錄)把
   Chromium/Electron 的內部狀態弄髒了。
4. 中途 `query session` 意外發現使用者的 RDP session 當下顯示 **Disc(已斷線)**,
   一度以為找到根因,請使用者確認連線;確認 **Active** 後重測,**問題依然存在**——
   排除了單純的斷線干擾。
5. 加診斷 log(`console.log` 埋在 `createWindow` 各關鍵點、
   `did-finish-load`/`did-fail-load`/`ready-to-show` 事件)重新打包測試,用
   PowerShell `Start-Process -RedirectStandardOutput/-RedirectStandardError`
   才真正穩定拿到輸出(先前用 bash `>` 重導向拿到的檔案是空的,GUI subsystem
   的 exe 從 bash 背景啟動時 stdout 沒有確實接上)。log 顯示:
   `initDatabase done` → `registerIpcHandlers done` → `createWindow` 各步驟都跑完
   → `did-finish-load` 觸發(renderer 頁面確實載入完成)→ **`ready-to-show` 永遠
   不觸發**。這把問題精準定位在「合成出第一張畫面」這一步,而不是資料庫、IPC 或
   renderer 本身。
6. 懷疑 `titleBarStyle:'hidden'` + `titleBarOverlay`(疊在網頁上的原生視窗控制鈕,
   2026-07-14 做的無邊框視窗改版)依賴 DWM 合成,而 DWM 在這個 RDP session 合成
   這個疊層時卡死。暫時拿掉這兩個選項重測——**`ready-to-show` 立刻觸發,視窗正常
   顯示**。根因確認。

### 修法

- 開機時偵測 `SESSIONNAME` 是否以 `RDP-Tcp` 開頭(Windows 對 RDP session 的標準
  慣例命名),存成 `IS_RDP_SESSION`。
- `createWindow()` 的 `BrowserWindow` 選項改成條件式:**RDP session 一律不開
  `titleBarStyle:'hidden'`/`titleBarOverlay`**,退回一般視窗框(有原生標題列,
  非滿版)。本機主控台使用者不受影響,外觀維持 2026-07-14 版本的無邊框設計。
- `nativeTheme.on('updated', ...)` 裡呼叫 `setTitleBarOverlay` 的部分一併加上
  `if (!IS_RDP_SESSION)` 守衛——對沒開啟該功能的視窗呼叫這個 API 是無效呼叫,
  雖非致命錯誤但沒有意義。
- 保留 v1.0.3 排查時加的 `disableHardwareAcceleration()`(RDP session 下關閉
  Chromium 自己的 GPU 加速)作為次要防線——**這個選項單獨存在時沒有解決問題**
  (拿掉 titleBarOverlay 前,關了它視窗一樣卡死),但它便宜、無害,對 RDP 環境下
  Chromium 渲染的一般穩定性仍有正面幫助,故保留而非移除。
- 移除排查過程加的所有 `[diag]` 診斷 log。

## 🧠 關鍵取捨

**為什麼不乾脆全面關掉 titleBarOverlay,不分本機/RDP?** 2026-07-14 的無邊框視窗
是刻意的設計決策(見 `log_20260714_drag_fix_dropdown_anim_titlebar`),本機主控台
使用這個 app 從未出過這個問題——問題單純是 DWM 在**這個特定 RDP session**
合成這個特定疊層的方式。全面關掉是用犧牲所有人的外觀去修一個只有遠端桌面使用者
會踩到的坑,範圍不對稱。條件式偵測讓修復精準對應到實際受影響的族群。

**為什麼把 `disableHardwareAcceleration()` 留著,即使它沒解決問題?** 它是
v1.0.3 排查時的假設性修復,這次確認它「無害但不是主因」而非「錯誤」——單獨測試
時視窗仍然卡死,但拿掉 titleBarOverlay 之後兩者疊加測試(6/6 輪成功)並未出現
副作用。與其為了敘事乾淨而移除一個仍在提供防禦價值的變更,不如誠實記下它的
實際角色調整為次要而非主要修復。

**為什麼這次的診斷比 v1.0.3 花更多力氣才找到根因?** v1.0.3 那次是先看程式碼
就直接確認了「從未實作單例鎖」這個具體、靜態可驗證的事實,根因和修法幾乎同時
浮現。這次的症狀(`ready-to-show` 不觸發)本質上是執行期的合成器狀態問題,
在程式碼裡讀不出來,必須靠實際加 log、逐步排除(斷線干擾、GPU 加速、測試手法
本身的雜訊)才收斂到 titleBarOverlay——這正是「不要在第一個看起來合理的解釋上
停下來」在真實除錯情境裡的樣子。

## ✅ 驗證方式

- [x] `npm run ci`:typecheck + 284 tests + build 全綠(改動不影響任何被測邏輯)
- [x] 連續 6 輪「啟動 → 3 秒後檢查視窗 → 關閉 → force-kill → 0.5 秒後再啟動」
      壓力測試,**6/6 輪視窗正確顯示**(標題「IRMS | 智慧復健監測系統」),
      process 數穩定在 4 個不疊加。同樣的測試迴圈在修復前的程式碼上持續失敗
      (0/N 成功或間歇性失敗,取決於測試批次)
- [x] 同時驗證單例鎖與這次修復共存無副作用:第二次啟動嘗試不新增 process、
      不影響已顯示的視窗

## 📝 後續待辦

- 這次的排查過程再次證明「打包後 exe 實機啟動測試」需要涵蓋真實使用情境
  (RDP)而非只在本機主控台測——本機主控台從未重現過這兩個 hotfix 修的任一個
  缺陷。若之後有穩定的 RDP 測試環境,建議把「RDP session 下開關機」納入固定
  驗收項目。
- v1.0.2 到 v1.0.4 之間發布間隔以分鐘計,這是可接受的代價(硬體時間窗與使用者
  即時回饋的組合),但也提醒:發布前的「打包後啟動測試」目前只驗證了單次啟動
  成功,沒有涵蓋這次踩到的兩種情境(重複啟動、RDP session)——已個別記在
  v1.0.3/v1.0.4 的待辦裡。
