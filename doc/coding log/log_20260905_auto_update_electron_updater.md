---
tags: [coding-log, electron, ci-cd]
summary: "electron-updater 自動更新實作完成(靜默背景下載、無安裝精靈、重啟套用),但實機驗證發現卡在一個架構性問題:IRMS repo 是 private,已發佈的 App 沒有 token,GitHub Releases API 對它一律回 404——需要使用者決定要不要開公開 repo 或接受內嵌 token 的風險,不是程式碼問題"
date: 2026-09-05
---

# 2026-09-05 變更日誌 — App 自動更新(electron-updater)

> **相關文件**:[[HOME|導覽首頁]] · [[OPTIMIZATION#⚪ P4 — 打包與部署|OPTIMIZATION P4]]

## 🎯 目的

使用者要求「IRMS App 支援透過 GitHub 自動更新,並且可以不用再跑安裝畫面,而是在 App
中完成更新後重啟就可以快速更新並投入使用」——對應 `OPTIMIZATION.md` P4 原本就列著、
一直沒動工的「自動更新 (electron-updater)」項目。

## 🔧 實作內容

- `electron-builder.yml` 新增 `publish: {provider: github, owner: yuhina0515, repo: IRMS}`。
- 新檔 `main/updater.ts`:`electron-updater` 的 `autoUpdater` 設定
  `autoDownload:true`、`autoInstallOnAppQuit:true`——開機 5 秒後靜默檢查一次(不做
  輪詢,這是療程監測工具,不想在使用中途無預警彈通知),背景下載,不用
  `checkForUpdatesAndNotify()`(那個 helper 會跳原生系統通知,改成自己的事件監聽
  讓 renderer 畫符合 App 視覺語言的 UI)。
- 新 IPC(比照 `window:*` 視窗控制鈕的既有模式):`update:getCurrentVersion`、
  `update:checkNow`(invoke/handle)、`update:statusChanged`(main→renderer 推播)、
  `update:restartNow`。**版本查詢與手動檢查兩個 handler 刻意不跟著 dev 模式一起跳過**
  ——Settings 面板在 `npm run dev` 下呼叫這兩個 channel 時,沒有 handler 會直接
  reject 而不是「這功能在 dev 下不能用」的可預期行為。
- `UpdateBanner.tsx`:只有 `state === 'downloaded'` 才顯示,固定在畫面下方,附
  「立即重新啟動」按鈕;Session 進行中鎖定這顆按鈕(比照 09-04 幫 OTA 面板補的同一種
  Session 鎖定慣例——重啟 App 会弄丟正在進行的 Session 狀態)。
- Settings 新增「Software Update」面板:顯示目前版本、手動「立即檢查更新」按鈕。

## 🐛 實機驗證發現的架構性阻塞(不是程式碼 bug)

**沒有停在 `npm run ci` 綠燈就宣稱完成**——用 `npm run dist` 打包後,拿真正的
`release/win-unpacked/IRMS Dashboard.exe`(而非開發模式的 `out/main/index.js`,兩者
`app.isPackaged` 不同,`electron-updater` 只有在真正打包的狀態下才會真的動作)透過
隔離 Playwright 啟動實測,量到真實的更新檢查結果:

```
{"state":"checking"} → {"state":"error", "message":"404 ... method: GET
url: https://github.com/yuhina0515/IRMS/releases.atom ..."}
```

追查發現:**`IRMS` 這個 GitHub repo 是 private**(`gh repo view` 確認
`isPrivate:true`)。手動用 `curl` 分別測試有無夾帶 `gh auth token`——沒有 token 時
`api.github.com/repos/yuhina0515/IRMS/releases/latest` 回 404,夾帶 token 後正常回傳
release 資料。這證實了根本原因:**`electron-updater` 的 GitHub provider 對外發行的
App 二進位檔裡沒有(也不該有)任何驗證憑證**,而 private repo 的 Releases API 沒有
驗證一律視為不存在(回 404 而非 403,GitHub 對 private 資源的一貫行為,避免洩漏
「這個資源存在但你不能看」這個資訊本身)。這不是我的設定錯誤或程式碼 bug——程式碼
邏輯完全正確,只是 electron-updater 這個機制的前提(GitHub Releases 要嘛公開、要嘛
App 端內嵌一組有讀取權限的憑證)在目前的 repo 設定下不成立。

## 📝 待使用者決定,未擅自選擇

三條路都有明顯代價,选哪一條是使用者的商業/風險判斷,不是技術對錯問題:

1. **把 repo 改成 public**——最簡單、電洞不需要多做任何事,electron-updater 原生
   支援。代價:原始碼(含所有 commit 歷史)公開。
2. **在 App 裡內嵌一組 fine-grained PAT**(只給 Releases 讀取權限、無其他 scope)
   ——repo 保持 private,但 App 二進位檔可被任何人反解出這組 token,等於這組 token
   實質上是半公開的,只能靠「scope 夠窄」限制風險,不能真的防止洩漏。
3. **換一個不需要公開 repo 的發布機制**(例如自架一個小型更新伺服器、用 S3 之類的
   物件儲存搭配 `generic` provider)——repo 保持完全 private 且不內嵌任何憑證,但要
   自己維運另一個服務,是比前兩者都大的額外工程。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + 285 tests + build)全綠。
- [x] `npm run dist` 打包,確認 `release/win-unpacked/resources/app-update.yml` 存在
      (electron-updater 運作必須的中繼資料檔)。
- [x] 隔離 Playwright 啟動**真正打包後的 exe**(非開發模式,`is.dev` 判斷依賴
      `app.isPackaged`,兩種啟動方式的行為不同,這次特地換成打包後的路徑測試):
      `window.irms.updates.getCurrentVersion()` 正確回傳 `1.1.0-beta.1`;`checkNow()`
      觸發真實的網路請求並收到上述 404,而非假設「應該會動」。
  - [x] 用 `curl` + `gh auth token` 交叉驗證 404 的真正成因是 private repo 而非
        程式碼設定錯誤(有 token 時同一個 API 端點正常回傳)。
- [ ] 更新流程的下載/安裝/重啟完整迴圈——需要 repo 可被存取後才有意義驗證,目前卡在
      上述架構決策,暫不執行。

## 📝 後續待辦

- 等待使用者選擇上述三條路其中之一,再繼續驗證完整的下載→重啟→套用迴圈。
- 這個發現也回頭影響 2026-09-04 剛建立的 beta 發版慣例
  ([[irms-project-conventions]] memory 記錄的那條)——beta prerelease 目前是
  `gh release create`,如果 repo 未來改成 public,beta 版仍然預設不會被
  `electron-updater` 自動抓到(`allowPrerelease` 預設 false),這點不受今天的發現影響。
