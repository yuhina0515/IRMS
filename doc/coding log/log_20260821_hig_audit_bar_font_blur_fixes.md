---
tags: [coding-log]
summary: "使用者發現目前的「Apple Liquid Glass」觀感不夠道地,要求對照 Apple 官方 HIG 規格逐項核對。查證發現三個真實落差:(1) 顏色/飽和度/圓角量級其實早就對得上 Apple 慣例,不是問題所在;(2) 最大落差是字型——這台 Windows 機器沒裝 SF Pro/San Francisco,SF Pro 又是 Apple 授權字型不能合法塞進 Windows build,現有 font-stack 實際落點是 Segoe UI(英文)+ Microsoft JhengHei(中文),不管其他數值調多準都沒用;(3) TopHeader/BottomBar 兩條導覽 bar 用的是內容卡片的通用 18px 圓角,不是 iOS 26 Liquid Glass 規定的膠囊(capsule)形狀——而且 bar 內部的 LiquidKnob 滑動指示塊自己早就是正膠囊,等於「方角外框包膠囊」裡外反著。落地三項修正:裝 @fontsource-variable/inter 自架 Inter 頂替 SF Pro(SIL OFL 授權免費可商用)、--glass-blur 20px→30px 對齊社群量測的 Apple 材質模糊量級、html 根字級 106.25%(17/16)讓全站 rem 字級對齊 Apple body text 17pt 慣例、.top-header/.bottom-bar 圓角改 999px 做成真正的巢狀膠囊。147 tests 全綠,typecheck 乾淨,截圖驗證四項改動視覺上都看得出來。第三項「特效追加」使用者澄清為「收斂現有裝飾效果」——玻璃扭曲濾鏡 feDisplacementMap scale 18→5、LiquidKnob 液態黏滯濾鏡模糊 4→2、拉伸回彈 keyframe 1.22→1.08、背景 blob 不透明度淺色 0.35→0.22/深色 0.3→0.18,三項效果全部調輕但保留機制本身,不是整組砍掉。147 tests 全綠,截圖確認背景色塊明顯收斂。"
date: 2026-08-21
---

# 2026-08-21 變更日誌 —HIG 規格核對:字型/模糊/字級/導覽列膠囊形狀

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260820_gemini_ui_handoff|Gemini UI 交接包]] ·
> [[log_20260820_gemini_audit_triage_and_fixes|Gemini 稽核分診]]

## 🎯 目的

使用者看過套用 Gemini 稽核建議後的畫面,直覺「很多地方不像 Apple」,問要不要動用
Gemini Canvas 重新設計。沒有直接跳去生圖,先對照 Apple 官方 Human Interface
Guidelines 規格,逐項核對現有 CSS 數值是不是真的偏離,分清楚「真的做錯」跟
「主觀觀感落差」。

## 🔧 變更內容

**先核對,分清楚哪些其實沒問題**:
- 系統色 `--accent/--success/--danger/--warning` 淺色+深色兩組數值,逐一比對
  Apple systemBlue/Green/Red/Orange 的官方色 + 社群量測的深色模式變體,**完全
  吻合**,不是問題
- `saturate(1.8)` = 180%,對得上 Apple 材質常見的 backdrop saturation 慣例
- 卡片 `--radius: 18px`、按鈕 `border-radius: 999px` 都在 Apple 慣例區間內

**找到的真實落差 1:字型(影響最大)**——用 `System.Drawing.Text.
InstalledFontCollection` 直接查這台機器裝了什麼字型,確認**沒有 SF Pro、San
Francisco、PingFang TC**,只有 Segoe 系列。現有 font-stack 開頭的
`-apple-system, BlinkMacSystemFont, 'SF Pro Text'` 在 Windows Chromium 上全部
不命中,英文字實際落到 `system-ui`→Segoe UI,中文字落到 Microsoft JhengHei。
SF Pro 是 Apple 授權字型,無法合法內嵌進 Windows build,這條路直接鎖死——不管
其他 CSS 數值調得多準,畫面上每個字仍然是微軟的字。**解法**:裝
`@fontsource-variable/inter`(SIL OFL,免費可商用,業界公認離 SF Pro 幾何比例
最近的開源替身),只引入 `wght.css`(App 全程無斜體,不需要 index.css 的 italic
子集),`main.tsx` 直接 side-effect import 自架,不吃使用者本機有沒有裝。
`--font` token 裡插在 `'SF Pro Text'` 之後、`system-ui` 之前

**落差 2:玻璃模糊量級偏薄**——`--glass-blur` 原本 `blur(20px)`,社群量測 Apple
材質常見落在 ~30px 上下,調整為 `blur(30px)`(saturate 不動,本來就對)

**落差 3:body 字級沒校準**——原本沒設根字級,吃瀏覽器預設 16px;Apple body
text 慣例是 17pt。全站字級都用 rem,不用逐一改每個 `font-size`,直接在 `html`
加 `font-size: 106.25%`(17/16)讓所有 rem 數值等比例對齊

**落差 4:導覽列不是膠囊形狀**——查證 iOS 26 Liquid Glass 對「浮動導覽/工具列」
的規格明確:capsule 形狀、離螢幕邊緣內縮、選中分頁用「玻璃膠囊高亮塊」表示。
`TopHeader`/`BottomBar` 兩個都只掛 `.glass`,繼承內容卡片的通用 `--radius:
18px`,不是膠囊——而且兩條 bar 裡面 `LiquidKnob` 的滑動指示塊本來就已經是
`border-radius: 999px` 的正膠囊(`global.css` 原 line 986/1000 一帶),等於現況
是「方角外框包一顆膠囊」,跟 Apple 真正的「膠囊外框包膠囊」裡外反著。**沒有**
把所有「看起來像 bar」的元素都改成膠囊——`.record-pose`/`.wizard-toolbar`/
`.calib-chip` 這類卡片內部資訊條維持原本 10–14px 中等圓角是對的,Apple 把膠囊
形狀專門保留給控制項跟 OS 層級浮動導覽列,不是任何一條橫向色塊。只改
`.top-header`、`.bottom-bar` 兩處的 `border-radius: 999px`

## ✅ 驗證方式

- [x] `npm run typecheck` 全綠(node + web)
- [x] `npm run test` → **147 tests 全綠**
- [x] `npm install @fontsource-variable/inter` 成功,`main.tsx` import 後重新
      啟動 dev build 截圖(`09-dashboard-after-hig-fixes.png`)——英文字型明顯
      換成 Inter(跟原本 Segoe UI 比對字形幾何感不同)、頂部/底部 bar 都是完整
      膠囊形狀跟卡片圓角有視覺區隔、玻璃模糊更厚、整體字級略放大,四項改動
      同時在同一張截圖裡都看得到,不是憑印象
- [x] 用 `System.Drawing.Text.InstalledFontCollection` 實際查詢本機字型清單,
      而不是假設 Windows 沒有 SF Pro——證據先於結論

## 🔁 第二輪:收斂裝飾效果(同日)

用 `AskUserQuestion` 澄清「3. 特效追加」範圍,使用者選「收斂現有裝飾效果」而非
新增動態反光。三處調輕,機制保留、只降強度(不是整組砍掉,方便之後再依觀感
微調):

- `App.tsx` 的 `#glass-warp-filter`(`GlassDropdown`/`BottomBar` 的玻璃扭曲):
  `feDisplacementMap scale` 18→5——原本的量級讀起來比較像「融化的玻璃」而不是
  穩定的光學透鏡折射,真正的 Liquid Glass 折射是穩定的,收斂但不拉直變回普通
  blur,留一點「這是玻璃不是霧面壓克力」的質感差異
- `#liquid-gooey-filter`(`LiquidKnob` 滑動指示塊):`feGaussianBlur stdDeviation`
  4→2、`knob-stretch-x/y` keyframe 拉伸峰值 1.22→1.08——iOS 26 真正的分頁玻璃
  膠囊高亮塊只是平滑縮放/位移,沒有卡通式彈跳融邊
- 背景 blob 不透明度:淺色 `--blob-opacity` 0.35→0.22、深色 0.3→0.18——blob
  存在是因為 Electron 視窗背後沒有真的桌面內容可以讓玻璃取樣,純粹補一點動態
  視覺,不該搶過內容本身

**驗證**:`npm run typecheck` 全綠、`npm run test` 147/147 全綠;dev build 熱
重載後截圖(`11-dashboard-toned-down-effects.png`)比對,背景色塊明顯比
`09-dashboard-after-hig-fixes.png` 收斂,不再那麼搶眼。滑動拉伸/玻璃扭曲兩項
效果本質上是動畫/背後折射,靜態截圖驗證有限,已憑數值改動本身(單純數字調小,
typecheck/test 都過)判斷風險低,沒有額外用影片或逐格截圖驗證。

**附帶觀察(非本次改動造成)**:截圖時意外發現 App 顯示「Connected to
IRMS_Device」且有即時角度資料(此前一直是 Disconnected),推測附近有實體
ESP32 裝置或某種開發模式重新自動連上——與這次的 CSS/濾鏡調整無關,提醒使用者
留意,未進一步排查。

## 📝 後續待辦

- App 意外顯示已連線到 `IRMS_Device` 且有即時角度資料——確認是否真的有實體
  裝置在附近,還是開發模式的殘留連線狀態,非本次範圍未排查
- `button.btn` vs `.btn-secondary`(同 [[log_20260820_gemini_audit_triage_and_fixes|前一份日誌]]
  記錄過)的既有 specificity 陷阱仍未修,持續觀察
