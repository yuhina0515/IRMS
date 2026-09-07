---
tags: [coding-log, splash, electron, animation]
summary: 開機動畫 Stage 1 改為線條從螢幕四面八方飛入組成 Logo(游動感 ease-in-out 曲線),splash 視窗同步改為全螢幕透明疊層
date: 2026-09-08
---

# 2026-09-08 變更日誌 — 開機動畫線條從螢幕邊緣飛入

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260907_boot_splash_and_code_splitting|09-07 原始實作日誌]] ·
> [[log_20260907_boot_splash_gemini_review|09-07 Gemini 覆核日誌]]

## 🎯 目的

使用者指出目前的開機動畫(線稿原地畫出)「有點生硬」,並指名要落地 2026-09-07 原始規格裡
一直沒做到的那句:「線條從四面八方組成 Logo」——當時因為 splash 視窗本身只是螢幕正中央
一個 260×260 小方塊,線條沒有真正的螢幕空間可以「從外面飛進來」,只能做成在小方塊裡原地
描邊。同時使用者要求線條的飛入要有「游過來」的感覺,而非目前的直線滑入。

## 🔧 動作

**Splash 視窗改為全螢幕**(`main/splash.ts`):
- `createSplashWindow()` 不再用寫死的 `SPLASH_SIZE=260` 置中小方塊,改用
  `screen.getPrimaryDisplay().workArea`(含 x/y 偏移,非僅 `workAreaSize`)鋪滿整個主螢幕
  工作區。`mainWindow`(`main/index.ts`)本來就沒有指定 x/y,Electron 預設置中在同一顆主
  螢幕上,所以 Logo 的組裝落點(螢幕正中央)與真正視窗的最終中心點本來就是同一個點,
  不需要額外算座標同步。
- 新增 `win.setIgnoreMouseEvents(true, {forward:true})`——視窗蓋滿全螢幕後,不加這行會在
  動畫播放的 ~1.7 秒內擋掉使用者對桌面其他視窗的點擊。

**線條從螢幕邊緣飛入**(`renderer/splash.html` / `splash.ts` / `splash.css`):
- 原本 3 條手指線 + 主幹線是「原地描邊」——`d` 座標就是最終形狀,`pathLength=1` +
  `stroke-dashoffset:1→0` 直接畫出。第一版嘗試直接把這幾條路徑的 `d` 往外延伸一段到螢幕邊緣
  (同一條路徑、同一次 dashoffset 動畫全部畫完就永久顯示)——結果整條延伸線畫完後**永久留在
  畫面上**,變成一個貫穿全螢幕的巨大十字,而不是收斂成一個小 Logo(截圖驗證時發現,不是憑
  程式碼推論看出來的)。
- 改為兩層路徑:新增 4 個空的 `.line-travel` 佔位路徑(`travel-finger-1/2/3`、
  `travel-mainstem`),`splash.ts` 的 `setupFullScreenAssembly()` 在執行時讀出對應真實線條
  (`finger-1/2/3`、`mainstem`)`d` 屬性裡的起點座標,算出一條從螢幕邊緣到該起點的二次貝茲
  曲線寫進 travel 路徑;travel 路徑先用自己的 `draw-in`(ease-in-out,600ms 上下)動畫飛入,
  一畫完就緊接淡出(`travel-fade-out`,~150ms),真正的 finger/mainstem 路徑延後在這個時間點
  才開始它們原有的(未改動的)450/600ms ease-out 描邊——視覺上是「飛入的線交棒給原地的
  Logo 筆畫」,而非同一條路徑硬撐著整段延伸幾何。
- 4 條飛入線分別指定從上/左/下/右四個不同方向進場(對應「四面八方」),曲線用二次貝茲
  (`Q` 指令)搭配一個垂直於行進方向的「側偏」控制點模擬游動的弧線,而非直線滑入。
- 曲線的 easing 刻意選了 `cubic-bezier(0.77,0,0.175,1)`(強 ease-in-out)取代 `.line`
  既有的強 ease-out——真正在移動距離的東西用「推出→滑行→收尾」讀起來才像游過去,原地描邊
  那種「雷射雕刻感」的 ease-out 保留給還在原地顯形的訊號弧與圓點。這是本專案動畫語彙
  (`doc/gemini-handoff-20260905/03-animations.md` 的 `--motion-ease-mechanical` 系統)
  唯一一處刻意不遵守的地方——那套語彙管的是使用者會重複操作的介面互動,這是開機前、
  沒有任何按鍵觸發的一次性畫面,不適用「精密儀器不過衝」的規則。
- `#mark` 的 `viewBox` 改由 JS 在載入時讀 `window.innerWidth/innerHeight` 動態設定為真實
  螢幕像素尺寸,原本手繪的小尺寸幾何(指節/主幹/弧線/圓點/orbit)全部包進新的
  `#mark-group`,用一個 `translate(dx,dy)` 把同一份沒有改過的局部座標重新置中到螢幕正中央
  ——沒有改任何既有元素的座標本身。
- **踩到一個 SVG 座標系陷阱**:`#orbit` 的 CSS `transform-origin`(`transform-box:view-box`)
  一開始也一起包進 `#mark-group` 裡,並把座標從 `(95,105)` 改算成
  `(dx+95,dy+105)`——結果截圖顯示 orbit 圓弧甩到螢幕角落轉圈,不是繞著 Logo 轉。原因是
  `transform-box:view-box` 的參考座標系是「巢狀祖先群組轉換之前」的局部座標系,不是
  螢幕實際像素;把它塞進一個已經有 `translate` 的祖先群組底下,座標系統跟親生子代的
  幾何座標系錯開,補的偏移量反而是錯的。改法:把 `#orbit` 移出 `#mark-group`、變成同層
  的手足,兩者各自拿到**同一組** `translate(dx,dy)`(JS 直接對兩個 SVG 元素分別設定
  `transform` 屬性),`transform-origin` 維持原本沒動過的 `95px 105px`——orbit 又回到跟
  修改前完全一樣的親子關係(自己扛自己的 transform,不寄生在別人的座標系底下),行為
  隨即恢復正確。這個坑只有截圖比對才抓得出來,單看程式碼推論不出座標系被複合的問題。
- `SPLASH_ASSEMBLY_DONE_MS`(`shared/splashTiming.ts`)從 1100 調到 1220——新的瓶頸元素
  變成 mainstem 的「最終」筆畫(610ms 延遲 + 600ms 描邊 = 1210ms),取代原本的最後一顆圓點
  (1080ms)。`SPLASH_ASSEMBLY_FLOOR_MS` 是用公式算的,不用另外改。

## 📐 決策

- **兩層路徑(travel + final)而非延伸同一條路徑**:第一版直接延伸原路徑的做法更簡單,但
  `pathLength=1` 正規化的 dashoffset 動畫畫完後整條路徑永久顯示,飛入的那一大段離螢幕邊緣
  的線會跟最終 Logo 一起永遠留在畫面上。兩層路徑用一次 opacity 淡出讓「飛入」的視覺效果
  結束後消失,只留下跟修改前一模一樣的小 Logo——多了 4 個 SVG 元素,但沒有動任何既有的
  Gemini 覆核過的 Logo 幾何/描邊時序。
- **只讓 3 條手指線+主幹飛入,訊號弧與圓點維持原地顯形**:弧線是連接手掌區域的短小連接
  元件,硬要延伸到螢幕邊緣會讓形狀認不出來是同一條弧;圓點本來就沒有「線」的方向性可言。
  只挑「讀起來本來就像一條線」的元素做飛入,不是每個元素都要有這個效果。
- **ease-in-out 只給飛入線,原地描邊維持原本的強 ease-out**:見上方「動作」段落——這是
  唯一刻意偏離本專案動畫語彙的地方,原因是這個時刻沒有使用者操作可以被「不過衝」的規則
  保護,也沒有必要套用管理重複互動的那套規則。
- **splash 只鋪滿主螢幕,不跨多螢幕**:維持與修改前一致的 `getPrimaryDisplay()` 範疇,
  沒有嘗試處理多螢幕拼接與不同 DPI 縮放的邊界情況——那是另一個量級的問題,這次沒人要求。

## ✅ 驗證

- `npm run typecheck` 全綠,`npm run build` 正常產出。
- `npm run test`:**286/286 全綠**——這次改動沒有觸及任何有測試覆蓋的程式碼路徑(splash
  相關檔案本來就在測試範圍外,純視覺/主行程視窗邏輯),用來確認沒有意外波及別處。
- **截圖驗證(拋棄式 Playwright 腳本,`--no-save` 裝在系統暫存目錄,用完整個資料夾刪除,
  從未進版控)**:對打包後的 `out/renderer/splash.html` 起本機 http server 用 Chromium
  跑真正的動畫時間軸,在 1600×900 視窗下逐階段截圖:
  - 250/550ms:確認 4 條線分別從上/左/下/右四個方向、走曲線(非直線)飛向畫面中央。
  - 700–850ms:確認飛入線淡出、真正的手指/主幹筆畫同時原地畫出,交接處看不出接縫或閃爍。
  - 1220ms 之後:確認畫面收斂回跟修改前**視覺上一致**的小 Logo(220px 量級,螢幕正中央),
    **不是**永久留著螢幕邊緣到中心的巨大十字(第一版的真實 bug,靠這個截圖才抓到)。
  - orbit 圓弧修正前後對照:修正前甩到螢幕角落轉圈,修正後正確貼著 Logo 轉——第一版明明
    typecheck/build 全過,問題完全在執行期的座標系複合,不看畫面看不出來。
  - `page.evaluate` 讀實際 DOM/computed style 交叉驗證(非只看像素):`viewBox`、
    `#mark-group`/`#orbit` 的 `transform` 屬性值、`travel-*` 路徑的 `d` 座標、
    `body.ready` 是否正確加上。
  - `reducedMotion:'reduce'` context 下重跑:100ms 截圖畫面就已經是完整組裝好的小 Logo
    (沒有巨大飛入線的閃現),`travel-*` 元素 computed opacity=0、`mainstem` 的
    `stroke-dashoffset` 已經是 `0px`——確認 `!important` 覆寫規則正確蓋掉新的
    `.line-travel` 兩段式動畫。

## Self-review

檢查情境:「如果 `setupFullScreenAssembly()` 因為某個未預期的邊界情況(例如
`document.getElementById` 找不到某個元素)在中途拋出例外,整條開機動畫會不會卡死或永久
不顯示?」——用 Playwright 攔截 `splash.html` 的 response、把 `id="mark-group"` 改名成
`id="mark-group-renamed"` 讓 `getElementById('mark-group')` 真的找不到元素(而非事後用
`evaluate` 補刀,那樣測到的是「刪除已生效之後」而非「一開始就找不到」),重新載入頁面
實測:
- `console.error` 確實印出降級訊息(`splash: full-screen assembly setup failed...`)。
- `document.body.classList.contains('ready')` 為 `true`——`finally` 區塊確實執行,
  `.line-travel`/`.line`/`.dot` 的 pause 閘門有解除,沒有卡死。
- 900ms 截圖:手指/主幹路徑維持它們原本沒被覆寫的小尺寸 `d`,**確實畫得出來**——但因為
  `#mark-group` 的 `transform` 沒被設定(拋例外發生在設定之前),整個 Logo 停留在 SVG 左上角
  (viewBox 也沒被設定,退回無 viewBox 時 1 單位=1px 的預設座標系),而不是螢幕正中央。
  PASS 的部分是「沒有卡死、沒有永久空白、沒有擋住 IPC 監聽或 orbit 計時器」;誠實補充一點
  修正前想像的樂觀:退化畫面本身是「小 Logo 出現在左上角」而非「跟以前一模一樣置中顯示」,
  這是可接受的降級(比較好過永久看不到動畫),但不是完全無感的退場。
