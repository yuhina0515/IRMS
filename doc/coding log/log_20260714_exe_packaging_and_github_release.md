---
tags: [coding-log]
date: 2026-07-14
summary: "打包成 Windows NSIS 安裝檔(修好 winCodeSign symlink 權限問題,需 Developer Mode)並實測可正常啟動;用 gh CLI 建立 v1.0.0 GitHub Release,附上安裝檔"
---

# 2026-07-14 變更日誌 — 打包 exe 與 GitHub Release 發布

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260714_doc_cleanup_and_release|前置:發布前文件清理]]

## 🎯 目的

使用者要的不是單純的 git tag,而是 GitHub 上正式的 **Release**(附發布說明與可
下載安裝檔)。先前只推送過 annotated tag,這次要:裝好 `gh` CLI、把 App 打包成
真正的 Windows exe、附在 Release 裡一起發布。

## 🔧 變更內容

1. **刪除先前的 `v1.0.0` tag**(本機 + 遠端)——使用者明確表示不要單純的 tag。
2. **打包 Windows 安裝檔**:`npm run dist`(`electron-vite build && electron-builder`,
   設定檔 `electron-builder.yml` 早就存在,target 為 NSIS)。
3. **建立 `v1.0.0` GitHub Release**:用 `gh release create` 從 `main` 建立,標題
   `v1.0.0`,附上打包好的 `IRMS Dashboard Setup 1.0.0.exe`,發布說明涵蓋韌體/
   App/修復/測試四大段。

## 🐛 打包過程踩到的坑

**`winCodeSign` 解壓縮失敗(`Cannot create symbolic link`)**:electron-builder
即使不簽章,NSIS 打包流程仍會下載 `winCodeSign` 工具包(內含 `signtool.exe`
等),但這個壓縮檔裡混了 macOS 用的符號連結檔案(`darwin/10.12/lib/*.dylib`)。
Windows 一般帳號預設沒有 `SeCreateSymbolicLinkPrivilege`,7-Zip 解不開這些
symlink,整個打包就卡死重試四次後失敗。

**確認根因**:查 `HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock`
的 `AllowDevelopmentWithoutDevLicense` 值為 `0`,證實 Developer Mode 確實關閉。
先試過設定 `CSC_IDENTITY_AUTO_DISCOVERY=false` 環境變數,想跳過 winCodeSign
下載——沒用,NSIS 流程本身就需要這包,跟簽章與否無關。

**修法**:請使用者自行開啟 Windows Developer Mode(設定→隱私權與安全性→開發
人員專用),這是系統設定變更,不由我代為執行。開啟後(`AllowDevelopmentWithoutDevLicense`
變成 `1`)重跑 `npm run dist` 一次就過,無需清快取以外的額外處理。

## 🧠 關鍵決策

- **不自己開 Developer Mode 或用系統管理員權限硬跑**——這屬於系統設定變更,
  交由使用者自己決定與執行。
- **`gh auth login` 同理不代為處理**——OAuth 登入流程涉及帳號憑證,請使用者
  自行在終端機完成後再繼續。
- **`gh` CLI 剛裝好時這個 shell session 的 PATH 是安裝前快取的**,直接找到
  `C:\Program Files\GitHub CLI\gh.exe` 用完整路徑呼叫,不強求重啟 session。

## ✅ 驗證

- `npm run dist` 完整跑完,產出 `release/IRMS Dashboard Setup 1.0.0.exe`
  (87MB)與 `release/win-unpacked/IRMS Dashboard.exe`(188MB 未壓縮版)。
- **實機啟動測試**:直接執行 `release/win-unpacked/IRMS Dashboard.exe`,
  確認進程持續存活(非啟動即崩潰)、視窗標題正確顯示「IRMS | 智慧復健監測系統」
  (代表 renderer 有正常載入,不是空白/崩潰畫面),測試後正常關閉進程。
- `gh release view v1.0.0` 確認:`draft: false`、`tag: v1.0.0`、附件
  `IRMS.Dashboard.Setup.1.0.0.exe` 正確掛上、發布說明內容正確渲染。
- `git fetch --tags` 確認本機 tag 與遠端(`gh release create` 建立的)同步。

## 📝 後續待辦

- 目前 exe 未簽章(`no signing info identified, signing is skipped`),使用者
  首次執行會被 Windows SmartScreen 攔截提示「未識別的發行者」——若要正式對外
  發布,之後可考慮申請程式碼簽章憑證。
- 應用程式圖示仍是 Electron 預設圖示(`electron-builder.yml` 未設 `win.icon`),
  屬於 `doc/OPTIMIZATION.md` P4 既有待辦,非本次範圍。
- BLE/資料庫等執行期功能只在 dev 模式下驗證過,打包後的 exe 僅驗證「能啟動、
  UI 正常載入」,實機 BLE 連線流程仍待使用者在包裝版上實測。
