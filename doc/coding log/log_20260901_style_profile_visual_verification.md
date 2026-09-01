---
tags: [coding-log]
summary: "補上 2026-08-31 外觀風格設定檔系統遺留的 UI 目視驗收:build out/ 產物、暫裝 playwright-core(--no-save,用完解除安裝)以隔離 --user-data-dir 啟動,截圖+讀 <html> inline style/computed style 交叉比對 System/Liquid Glass Light/Dark 三種設定檔。確認深色在 Settings 頁尚未切換畫面就已套用 inline custom property(非靠重新掛載)、切到 Dashboard 後 Three.js 場景背景與卡片材質確實跟著變黑、切回「跟隨系統」時 inline 屬性清空並正確退回 stylesheet 規則(本機現行 OS 為淺色,畫面與手動選淺色時一致)。驗收通過,連同 08-31 的程式碼與四份核心文件一併進版控。"
date: 2026-09-01
---

# 2026-09-01 變更日誌 — 外觀風格設定檔系統目視驗收

> **相關文件**:[[HOME|導覽首頁]] · [[PROJECT_STATUS|開發進度]] ·
> [[log_20260831_style_profile_system|2026-08-31 外觀風格設定檔系統(本次驗收的對象)]]

## 🎯 目的

08-31 日誌完成外觀風格設定檔系統的實作與自動化驗證(typecheck+284 tests+build 全綠),
但留下「UI 目視驗收留待下次」——整批修改因此在工作樹上放了一天沒進版控。本次補上目視驗收,
通過後才 commit。

## 🛠 驗收方式

沿用本專案既有慣例(比照 08-27/08-29 的拋棄式 Playwright 驅動腳本):

1. `npm run ci` 先確認工作樹狀態與 08-31 記錄一致(typecheck+284 tests+build 全綠,見下方驗證)。
2. `npm install --no-save playwright-core` 暫裝(不進 `package.json`),寫一支一次性驅動腳本
   啟動 `out/` 打包產物,帶隔離 `--user-data-dir`(本功能本身不寫 session/sensor_data,但仍照
   專案慣例隔離,不動使用者真實 DB)。
3. 依序:截圖初始 Dashboard → 切到 Settings 選「Liquid Glass — 深色」(**不切換畫面**,原地讀
   `<html>` 的 inline style + `getComputedStyle`)→ 切到 Dashboard 截圖 → 改選「淺色」→
   Dashboard 截圖 → 改選「跟隨系統」→ Dashboard 截圖。每一步都讀 `--leg3d-bg`/`--bg-0`
   的 inline 值與 computed 值,不只靠肉眼看截圖。
4. 用完腳本、截圖、`playwright-core` 全部清掉,`git status` 確認除了一行無關的 `package-lock.json`
   噪音(`vitest` 依賴補上 `"peer": true`,與 playwright-core 無關的既有 npm 正常化行為)其餘
   工作樹分毫未動,該行 revert 掉。

## ✅ 結果

| 階段 | inline `--leg3d-bg` | computed `--leg3d-bg` | inline `--bg-0` |
|---|---|---|---|
| 初始(未動設定) | `null` | `#e2e7f2`(淺色) | `null` |
| 選深色(仍在 Settings 頁,未切換畫面) | `#12172a` | `#12172a` | `#0b0f1f` |
| 切到 Dashboard(無 reload) | `#12172a` | `#12172a` | `#0b0f1f` |
| 選淺色 → Dashboard | `#e2e7f2` | `#e2e7f2` | `#eef2fb` |
| 選「跟隨系統」→ Dashboard | `null` | `#e2e7f2` | `null` |

三項各自對照日誌中的設計意圖確認成立:

- **inline 立即生效、不需重新掛載**——「選深色」那一步是在 Settings 頁面本身讀到的,還沒切去
  Dashboard,證實是 `settings.styleProfileId` 變更 → `App.tsx` 的 `useEffect` 依賴陣列抓到 →
  當場呼叫 `applyStyleProfile()`,不是靠畫面重新掛載才套用。
- **切換畫面後值持續**,截圖(`Leg3D` 卡片、`Guided Monitoring` 背景、底部導覽列)肉眼可見從淺色
  漸層玻璃變成深色玻璃,`Leg3D.tsx:78` 的 `scene.background = new THREE.Color(themeToken('--leg3d-bg'))`
  讀的正是這個 token,程式碼與畫面結果一致。
- **「跟隨系統」正確退回 stylesheet,不是巧合停住上一個值**——切回系統後 inline 值變回 `null`
  (`applyStyleProfile.ts` 的 `removeProperty` 路徑),但 computed 值仍是 `#e2e7f2`,因為本機
  OS 目前是淺色主題——這代表退回的是 `global.css` 的 `:root` 規則本身在生效,不是應用層還留著
  舊值沒清乾淨(若是後者,inline 應該不是 `null`)。
- `LiveChart.tsx:86` 的 `onThemeChange` 訂閱與 `Leg3D.tsx:99` 走同一個事件來源
  (`applyStyleProfile()` 觸發的 `irms:theme-changed` CustomEvent),本次未逐色核對 Chart.js
  dataset 顏色,以程式碼比對取代(兩處消費端結構相同、同一次改動加上)。

## 🔎 自我審查

檢查情境:**如果 `App.tsx` 的 `useEffect` 只在元件初次掛載時執行一次、依賴陣列沒抓到
`settings.styleProfileId` 的後續變更,使用者在 Settings 手動切換風格會沒有反應,要重新整理
或跳轉畫面才看得到新風格**——這正是 08-31 日誌明確點出「theme.ts 需要額外訂閱 CustomEvent」
的那個問題的另一面(消費端沒監聽只是其中一種死法,觸發端沒依賴陣列是另一種)。

驗證:上表「選深色」那一列是在**still on Settings**(尚未點擊切到 Dashboard)那一刻讀到的,
inline `--leg3d-bg` 已經是 `#12172a`。若 effect 只綁初次掛載,這裡應該仍是 `null`。結果符合
預期——確認 effect 正確依賴 `styleProfileId`,每次切換都會重新套用,不需要畫面重新掛載當副作用
觸發器。

## 📌 後續

- 目視驗收通過,08-31 的實作(`styles/profiles/` 全部檔案、`App.tsx`/`Leg3D.tsx`/`LiveChart.tsx`/
  `theme.ts`/`useStore.ts`/`SettingsView.tsx`/`global.css` 與四份核心文件)本次一併 commit。
- 驗收腳本、暫裝的 `playwright-core`、截圖全部用完即刪,未進版控(比照專案既有慣例)。
- issue #3(達標回饋/超限警報/斷線收尾/abandoned session 復原的實機 E2E)仍等待下次裝置時間窗,
  與本次工作無關,不受影響。
