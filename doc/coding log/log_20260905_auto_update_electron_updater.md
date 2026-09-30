---
tags: [coding-log, electron, ci-cd]
summary: "electron-updater 自動更新實作完成並驗證成功。過程中連續發現兩個真實的架構性問題(而非程式碼邏輯錯誤):IRMS repo 原本 private 導致 Releases API 404(使用者選擇改 public 解決)、手動 gh release create 上傳的 beta 資產缺少 electron-builder 自動產生的 latest.yml 且檔名格式不一致(改用 electron-builder --publish 重新發布解決)。修完後隔離啟動打包後的 exe 實測拿到正確的 not-available 結果,證實整條檢查→比對版本的流程真的能動"
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

## ✅ 使用者決策:repo 改為 public

三條路(repo 改 public / App 內嵌可反解的唯讀 token / 換一個不需要公開 repo 的
發布機制)列給使用者,**由使用者選擇**,不是我自己決定——選了「repo 改 public」。

**動手前先做安全掃描,不是選了就直接切**:公開後任何原本存在的洩漏都算是曝光過了,
所以先掃過整個 git 歷史再執行:
- `git log --all --pretty=format: --name-only --diff-filter=A` 找有沒有可疑檔名
  (`.env`/`secret`/`credential`/`token`/`.pem`/`.key`/`password`)——沒有。
- `git log --all -p` 對常見金鑰格式(AWS `AKIA...`、`BEGIN PRIVATE KEY`、
  Discord webhook URL、Slack `xox...`、GitHub PAT `ghp_.../github_pat_...`)全文掃描
  ——沒有。
- 發現歷史上曾經誤 commit 過一份 `IRMS_App/irms.sqlite`(早期 `.gitignore` 還沒排除
  `*.sqlite` 之前留下的)。抓出該次 commit 的檔案內容檢查:`sessions`/`sensor_data`
  兩張表都是 0 筆,`custom_actions` 只有 4 筆通用運動範本(二頭肌彎舉等),沒有任何
  患者/個人資料。確認乾淨後才執行 `gh repo edit --visibility public`。

`gh repo view` 確認 `isPrivate:false`,`curl` 不帶任何驗證的請求也能正常取得
release 資料——repo 可見性這個問題到此解決。

## 🐛 第二個真實問題:手動發布的 beta release 缺 `latest.yml`

repo 轉 public 後重新實測,404 變成一個新錯誤:
```
Cannot find latest.yml in the latest release artifacts
(.../releases/download/v1.1.0-beta.1/latest.yml): 404
```
追查發現:09-04 那次 beta 發版是手動 `gh release create` + 手動上傳 `.exe`/
`.exe.blockmap`,從來沒有跑過 `electron-builder --publish`——後者才會自動產生並
上傳 `latest.yml`(electron-updater 比對版本、下載檔案都靠這份中繼資料,不是只看
有沒有 `.exe`)。順帶發現另一個命名不一致:本地檔名帶空白
(`IRMS Dashboard Setup 1.1.0-beta.1.exe`),`gh release create` 上傳後 GitHub 把
空白換成句點,而 `latest.yml` 裡宣告的又是連字號版本——三種命名互不相同,就算補上
`latest.yml` 也對不上實際資產檔名。

**修法**:`gh release delete v1.1.0-beta.1 --yes --cleanup-tag` 刪掉這個手動拼湊的
release,改用 `GH_TOKEN=$(gh auth token) npx electron-builder --publish always
-c.publish.releaseType=prerelease` 整個重新發布——這個指令會一次把 build、簽章
(跳過,未簽章)、打包、上傳 `.exe`/`.exe.blockmap`/`latest.yml` 三個檔案都用同一套
命名規則做完,不會再有三種命名互不匹配的問題。**這連帶更正了 09-04 才剛定案的 beta
發版慣例**([[irms-project-conventions]] memory 那條)——往後包含 beta 在內的所有
發版都必須用 `electron-builder --publish`,不能再用手動 `gh release create` +
手動上傳檔案這個路徑,即使只是為了讓人先裝來測都不行,因為那樣產生的 release 沒有
`latest.yml`,之後即使 repo 是 public,自動更新一樣抓不到。

## ✅ 驗證方式

- [x] `npm run ci`(typecheck + 285 tests + build)全綠。
- [x] `npm run dist` 打包,確認 `release/win-unpacked/resources/app-update.yml` 存在。
- [x] 隔離 Playwright 啟動**真正打包後的 exe**(而非開發模式的 `out/main/index.js`
      ——`is.dev` 判斷依賴 `app.isPackaged`,兩種啟動方式行為不同)分三輪量測:
      1. repo 還是 private 時:量到真實的 404,訊息指向 `releases.atom`。
      2. repo 轉 public、但 release 資產是手動上傳的:量到不同的 404,訊息指向
         `latest.yml` 找不到。
      3. 用 `electron-builder --publish` 重新發布後:`{"state":"checking"}` →
         `{"state":"not-available"}`——正確結果(目前安裝的就是最新版,理應回報
         沒有更新),不是憑空假設「這樣應該會動」。
- [x] 用 `curl` + `gh auth token` 交叉驗證第一個 404 的成因確實是 repo 可見性,
      不是程式碼設定錯誤。
- [x] `gh repo view`/`gh release view` 確認最終狀態:repo public、release 資產
      三個檔案(`.exe`/`.exe.blockmap`/`latest.yml`)命名一致。
- [ ] 「真的有新版本可下載」這條路徑(`state: 'available'` → `'downloading'` →
      `'downloaded'` → 按重啟套用)尚未實測——需要真的發一個更新版本並用舊版啟動
      才測得出來,會多留一次測試用的 release 在正式歷史裡,目前判斷不值得為了這次
      驗證多做,等下一次真的要發版時自然會走到這條路徑。

## 📝 後續待辦

- 下次真的發布下一個版本(無論 beta 或正式)時,順便驗證一次完整的
  下載→通知→重啟→套用迴圈——這是目前唯一還沒實測過的路徑。
- [[irms-project-conventions]] memory 的 beta 發版慣例已更正為
  「一律用 `electron-builder --publish`,不要手動 `gh release create` + 手動上傳」。
