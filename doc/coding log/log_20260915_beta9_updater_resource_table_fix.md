# v1.2.0-beta.9 Updater Resource Table 修復

日期：2026-09-15

## 實機回報

`1.2.0-beta.7` 在 Settings 按「立即檢查更新」後顯示：

```text
檢查失敗:The resource id 4096318551 is invalid.
```

這代表 endpoint、manifest 與版本比較其實已成功：只有在找到新版、建立 `Update` resource 並進入下載時才會使用該 resource ID。

## 根因

專案的自訂 `update_check` 使用 `AppHandle.resources_table().add(update)`，將 `Update` 存入 App 全域 resource table；但 `tauri-plugin-updater 2.11.0` 的官方 `download`、`install` 與 `download_and_install` 命令全部使用 `Webview.resources_table()` 解析 ID。兩張表各自有效，卻不能跨表查找，因此下載階段回報 invalid resource id。

先前只驗證到 manifest 能解析、狀態能顯示，沒有完成真實 App 內下載，因而漏掉這個跨 command resource lifecycle 缺陷。beta8 未修改 updater，同樣受影響。

## 修復

- `update_check` 的 Tauri command state 由 `AppHandle<R>` 改為呼叫來源的 `Webview<R>`。
- updater builder 由 WebView 建立。
- `Update` resource 加入該 WebView 的 resource table，與官方 updater `check` 命令實作一致。
- 版本提升至 `1.2.0-beta.9`。

## 升級影響

beta7 與 beta8 都無法透過有缺陷的下載路徑自我修復，必須手動安裝 beta9 一次。安裝 beta9 後，下一版開始才可再次驗證與使用 App 內更新。

## 驗證

- 對照本機 cargo registry 中 `tauri-plugin-updater 2.11.0/src/commands.rs`：官方 check/add 與 download/get 均使用 `webview.resources_table()`。
- `npm run ci` 通過：27 files／285 frontend tests、60 Rust tests、TypeScript、Vite build、rustfmt、Clippy warnings-as-errors 全綠。
- 編譯通過同時驗證 `Webview<R>` 可由 Tauri command 注入且可建立 channel-specific updater builder。

## 尚待實機關閉的驗證

安裝 beta9 後，需以 beta9 對下一個更高測試版本實際完成「檢查 → 下載 → 顯示重新啟動套用 → 安裝」全鏈路，不能再只以 manifest 回應視為 updater E2E 通過。
