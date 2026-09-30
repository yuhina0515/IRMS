---
tags: [coding-log, ui, tauri-migration, gemini]
date: 2026-09-11
summary: "Installed a virtual display driver on the dev machine to work around its real monitor's small resolution (1024x768@125%), then used it to actually screenshot IRMS_App_Tauri at 1280x820/1600x900/1024x600 for the first time since the Tauri port — confirming the 2026-09-05 Dashboard container-query adaptive layout still works correctly. Found one real, reproducible issue along the way (expanded sidebar overlaps page titles on every screen) and drafted two Gemini design briefs: the user's new progressive-card-density requirement, and the sidebar overlap finding."
---

# 2026-09-11 變更日誌 — 視窗自適應實機驗證 + 兩份 Gemini 需求草稿

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260905_dashboard_container_query_adaptive_layout|前例:Dashboard 自適應系統]] ·
> `doc/gemini-handoff-20260911/`

## 🎯 目的

使用者問「可以加視窗自適應嗎」。查證後發現這件事(至少 Dashboard 的部分)2026-09-05 已經
做過一輪扎實的工程投入,但那是在 Electron 版上驗證的,Tauri 遷移後從未重新拿真機截圖確認
行為沒有跑掉——這台機器的實體螢幕解析度只有 1024×768@125% 縮放(換算下來連 App 自己
1024×600 的最小視窗都放不太下),過去所有嘗試(截圖、WebView2 CDP)都因為畫布太小或
存取受限而失敗。使用者接著問「有辦法裝虛擬螢幕嗎」,補上這個缺口。

## 🔧 動作

### 1. 安裝虛擬螢幕驅動

- 查證後選定 [VirtualDrivers/Virtual-Display-Driver](https://github.com/VirtualDrivers/Virtual-Display-Driver)
  ——基於微軟官方 Indirect Display Driver (IddCx) 框架,x64 已簽章(不需要開測試簽章模式/
  關安全開機),透過 `winget install --id=VirtualDrivers.Virtual-Display-Driver -e` 安裝。
- 安裝驅動本身這一步需要系統管理員權限,這台機器不支援非互動式提權——實際觸發了一個
  「Windows 安全性」對話框,使用者不在電腦前(人在火車站),隔了一段時間用 Google Remote
  遠端連回去點了確認才完成。過程中一度誤判「虛擬螢幕變成主螢幕、實體螢幕可能黑屏」,
  使用者遠端確認後排除疑慮。
- 用 `C:\VirtualDisplayDriver\vdd_settings.xml` 內建的 1920×1080 選項設定虛擬螢幕解析度,
  確認 `Win32_VideoController` 回報虛擬螢幕與實體螢幕(GTX 1070)皆為 `Status: OK`,互不影響。

### 2. 用虛擬螢幕實機驗證 Tauri 版的自適應版面

- 啟動 `irms_app_tauri.exe`(可攜模式,不透過安裝),用 Win32 `SetWindowPos` 依序調整視窗到
  1280×820(預設)、1600×900(寬)、1024×600(地板),`CopyFromScreen` 截圖存證。
- **結果:2026-09-05 的 container-query 自適應系統在 Tauri 版上行為完全一致**——地板尺寸下
  右側「Designated Action」與數值卡片面板正確觸發內部捲軸(`overflow-y:auto`)而非溢出或
  裁切,跟當初的設計文件描述一致。三個尺寸下皆無版面爆版。
- Settings、Actions 兩頁在同樣尺寸下也檢查過,沒有橫向溢出。

### 3. 意外發現:展開側邊欄永久蓋住頁面標題

- 截圖中每一頁的 `<h2>` 標題(如「Guided Monitoring」)左側一截固定被裁掉(只看得到
  「...oring」)——四個尺寸下都一樣,確認不是自適應相關的迴歸,而是側邊欄展開時的既有
  行為:`.app-column` 的 `margin-left: 56px` 永久只保留「收合」寬度,`.sidebar` 展開時的
  220px 用絕對定位疊在內容上而非把內容推開(2026-09-05 的刻意設計,原因是避免側邊欄
  展開/收合過場動畫途中把 Dashboard 的 container-query 寬度斷點掃過去、造成版面閃爍)。
  這是真的、可重現的視覺代價,但屬於 UI/IA 判斷,依專案慣例不由這個角色自行決定要不要改。

## 📐 決策

- **虛擬螢幕驅動視為長期基礎建設保留,不解除安裝**:之後任何需要截圖驗證 UI 的工作都可以
  直接用,不必每次重新克服這台機器實體螢幕過小的限制。
- **不自行修改側邊欄重疊行為**:依 `feedback_irms_ui_design_delegated_to_gemini` 慣例,
  這是視覺/資訊架構判斷,寫成 Gemini 需求草稿(`doc/gemini-handoff-20260911/
  02-sidebar-overlap-with-header.md`)交還使用者,不自己判斷「這樣好不好看/該不該改」。
- **使用者同時提出的「卡片縮小時簡化顯示」新需求,同樣走 Gemini 流程**:整理成
  `01-progressive-card-density.md`,明確列出現有的三個候選卡片類型(Dashboard Stat、
  Actions 卡片、History 列表)、現有的 tier 概念先例(側邊欄收合、Dashboard 數值回退層),
  但不自己決定哪些欄位該在哪個斷點消失——那是 Gemini 的判斷範圍。
- **截圖親自拍好附上,不要求使用者重拍**:過去慣例是請使用者送出前自己重新截圖(確保
  Gemini 看到的是最新狀態),但這次虛擬螢幕剛裝好、程式碼狀態沒有變動,直接用剛拍好的
  截圖附進資料夾,省去使用者重複勞動。

## ✅ 驗證

- [x] `Win32_VideoController`:虛擬螢幕與實體螢幕皆 `Status: OK`,兩者互不影響
- [x] 三個視窗尺寸(1280×820/1600×900/1024×600)截圖確認 Dashboard 零溢出、地板尺寸正確
      觸發內部捲軸後備機制,與 2026-09-05 設計文件描述一致
- [x] Settings/Actions 兩頁在 1024×600 下無橫向溢出
- [x] 側邊欄重疊現象在四個測試尺寸下重現一致,確認是恆定行為而非尺寸相關的迴歸

## Self-review

檢查情境:「裝虛擬螢幕這個動作,有沒有可能影響到使用者原本的實體螢幕與桌面配置?」——
真的發生過一次:驅動裝完那一刻,系統一度回報虛擬螢幕(800×600)變成主螢幕,原本的
`[System.Windows.Forms.Screen]::AllScreens` 只列出一個螢幕。使用者當時人不在電腦前,
先誠實停下來詢問「螢幕現在正常嗎」,而不是自己嘗試切換螢幕配置去「修好」一個看不到後果的
狀態。使用者隔了一段時間用 Google Remote 遠端確認並自己調整好(虛擬螢幕設到 1920×1080、
實體螢幕維持原狀)後才繼續。**PASS**——沒有在看不到實際畫面的情況下自行變更顯示器拓樸,
把判斷權留給看得到螢幕的人。
