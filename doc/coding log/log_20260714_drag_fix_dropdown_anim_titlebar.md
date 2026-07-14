---
tags: [coding-log]
date: 2026-07-14
summary: "修復選單拖曳無法切換(改用 window 層級監聽取代 pointer capture)、下拉選單改成長大/縮小動畫、指示塊拖曳時依速度拉伸、視窗改無邊框(titleBarOverlay)滿版;71 tests 綠"
---

# 2026-07-14 變更日誌 — 拖曳修復、下拉動畫、指示塊拉伸、無邊框視窗

> **相關文件**:[[HOME|導覽首頁]] · [[log_20260714_bottombar_layout|前置:底部導覽列改版]]

## 🎯 目的

使用者回報四項:
1. 選單滑動無法切換頁面(點擊正常)
2. 下拉選單希望是由小長大/由大縮小的動畫(Liquid Glass 風格),不要只有抖動
3. 選單(除下拉式)的滑動指示塊拖曳時希望能被拉伸,比照 Liquid Glass
4. 移除視窗最上面的黑邊與標題,讓介面滿版

## 🐛 項目1根因與修復

舊版 `useLiquidKnob` 把 `onPointerMove`/`onPointerUp` 直接掛在目前 active 的按鈕上,
靠 `setPointerCapture` 讓後續事件不論指標移到哪都持續打在該按鈕。但真實拖曳中
指標很容易一次 move 就滑出小按鈕的範圍,一旦 capture 沒能穩定讓按鈕收到後續事件,
`pointermove`/`pointerup` 就收不到了,拖曳卡在半途(沒有視覺回饋也沒有完成),
但單純點擊(按下放開沒有位移)不受影響——正好對應回報的症狀。

**修法**:`pointerdown` 當下改為手動在 `window` 掛原生 `pointermove`/`pointerup`/
`pointercancel` 監聽(依 `pointerId` 對應),拖曳結束才移除。`setPointerCapture`
仍保留當輔助,但 window 監聽才是真正的權威追蹤機制,指標飄出按鈕範圍不再影響。

驗證方式特意模擬「pointerdown 在按鈕上、pointermove/pointerup 卻發在 window 上」
(模擬指標離開按鈕範圍),確認拖曳仍能完成且畫面確實切換。

## 🎨 項目2:下拉選單成長/縮小動畫

原本 `open` 一變 false 彈出面板立刻消失,沒有退場動畫的餘地。新增三段狀態:
`open`(邏輯狀態)、`mounted`(DOM 是否存在)、`closing`(觸發縮小 keyframe 的
class)。關閉時先播 160ms 的 `dropdown-shrink` 動畫,播完才真的卸載 DOM;開啟播
`dropdown-grow`。兩者都是單純 `scale()`,拿掉原本的 `rotate()` 晃動——依使用者
原話「不要只有抖動」。`transform-origin: top center` 維持不變,視覺上仍是從
觸發按鈕頂端長出來。

## 🖐 項目3:拖曳中拉伸

新增 `dragStretch` 計算,做法跟今天稍早側欄晃動同一套:抓連續 `pointermove` 之間
的 `(位移/時間)` 當瞬時速度,映射成 `scaleX`/`scaleY`(上限 1.4 倍),拖曳中以
inline style 套用在 `.liquid-knob-shape` 上。放開後 inline 覆寫消失,CSS
transition(拖曳中用 `.dragging` 後代選擇器關閉,放開後恢復)把它彈簧回正到 1。
原本的一次性 `.morph` keyframe(單擊觸發用)維持不動,兩者不會真的打架——CSS
animation 在播放期間本來就會蓋過 transition,實際觀感反而像「拉伸完再彈一下」
的複合效果,不是視覺 bug。

## 🪟 項目4:無邊框滿版視窗

`main/index.ts` 從預設有邊框視窗改成 `titleBarStyle: 'hidden'` +
`titleBarOverlay`(Windows 支援的混合模式——移除標題列與文字,但保留右上角原生
最小化/最大化/關閉鈕以系統疊層方式呈現,不用像 `frame: false` 那樣得自己刻控制鈕
再接 IPC)。疊層顏色跟系統主題;既然都動了這段程式碼,順手把 `nativeTheme.on
('updated', ...)` 接上,讓疊層顏色跟 `backgroundColor` 在主題切換時都能即時更新
(`backgroundColor` 原本只在視窗建立當下設一次,是個順手補上的既有小缺口)。

視窗沒有標題列可以拖動了,`global.css` 幫 `.top-header` 加
`-webkit-app-region: drag`(裡面的按鈕各自標記 `no-drag` 拿回可點擊),並留右側
padding 避開原生疊層按鈕的位置。

## ✅ 驗證

- `npm run ci`(typecheck+71 tests+build)四項改完後皆綠
- 項目1-3 透過瀏覽器對 Vite dev server 做結構化驗證(見下)
- **項目4 無法用這個方式視覺驗證**——`titleBarStyle`/`titleBarOverlay` 只影響
  真正的 Electron `BrowserWindow` 外框,純瀏覽器分頁載入同一個網址看不到。
  只確認了 main process 正常啟動無錯誤、typecheck 接受新的 Electron API
  (`titleBarOverlay`/`setTitleBarOverlay`);實際視覺效果需要使用者在真正的
  Electron 視窗裡自己看。

### 驗證中的一個插曲:Hook 順序警告

測試拖曳時 React 跳出「Hooks 順序改變」警告(`DashboardView`/`BottomBar`)。
沒有直接當作「沒事」或「壞了」下結論,而是先回頭逐行重讀 `useLiquidKnob`,
確認所有 hook 呼叫都在唯一的提早 return 之前無條件執行——程式碼本身沒有結構性
的 hook 順序問題。接著清掉本 session 累積下來的一堆 `electron.exe` 殘留進程,
完全重啟 dev server,開一個全新瀏覽器分頁(而非只是 navigate 舊分頁,排除任何
殘留的模組/Fiber 狀態)重跑同一個拖曳測試——警告消失,運作正常。證實這是本
session 反覆修改 `LiquidKnob.tsx`/`useLiquidKnob` 過程中 hook 數量改變導致的
React Fast Refresh 已知限制,不是真正的缺陷——沒有在查清楚前就回報「已驗證」。

## 🔁 補充:拖曳後又彈回原狀的第二個 bug(同日,使用者附截圖回報)

使用者附截圖回報:把指示塊從 Dashboard 拖到 Actions,視覺上看起來拖過去了,
放開後卻彈回 Dashboard 的狀態。這次先查證機制再下手,不是照著感覺亂猜:

**機制**(用一次獨立研究查證 W3C Pointer Events Level 3 規範確認,不是憑猜):
`beginDrag` 還留著上一輪修復時順手加的 `setPointerCapture` 呼叫(當時只是想當
輔助,實際追蹤已經改靠 window 監聽)。規範明確寫著:一旦指標被 capture,
`pointerup` 後補發的相容性 `click` 事件會鎖定在「當初呼叫 capture 的元素」上,
而不是依放開位置做一般的 hit-test(那套邏輯只在未被 capture 時才適用)。
於是實際發生的順序是:拖曳 Dashboard→Actions、在 Actions 上放開 →
`finishDrag()` 正確算出 `nearestKey='actions'` 並呼叫 `onSelect('actions')` →
**但緊接著**瀏覽器還是會在原本的 Dashboard 按鈕上補發一個 `click`(因為它持有
capture)→ Dashboard 自己的 `onClick={() => setView('dashboard')}` 在拖曳邏輯
「之後」觸發,把剛設好的值蓋回去。

**修法**:整段移除 `setPointerCapture` 呼叫。它本來就是多餘的——上一輪的修復
已經讓 window 層級的 pointermove/pointerup 監聽變成真正的追蹤機制,capture
沒有實質作用,只留下這個副作用當炸彈。沒有 capture 的指標,click 合成走一般
hit-test 邏輯,放開位置在別的元素上時自然不會在 Dashboard 上補發。

**老實說明驗證限制**:這個 bug(以及這次的修法)**沒辦法**用本 session 慣用的
`dispatchEvent(new PointerEvent(...))` 瀏覽器測試重現或確認——`pointerup` 後的
click 相容事件合成,是瀏覽器「受信任(trusted)事件」管線的一部分,腳本發出的
合成事件(untrusted)不會觸發它,已經用一個暫時的全域 click 監聽器實測確認
(合成拖曳期間完全沒有記到任何 click)。所以跟本 session 其他修復不同,這次
的把握來自:(a) 查到吻合症狀的權威規範依據,(b) 移除 capture 後回歸測試確認
拖曳選取功能沒有壞掉——但沒辦法在這個沙盒裡真的重現「壞掉→修好」的前後對比。
最終還是要使用者在真正的 app 裡重新試一次拖曳,才能完全確認修好了。

## 📝 後續待辦

- 項目4 的實際視覺效果(疊層按鈕位置、顏色是否協調)需要使用者在真正的 app 裡看
- 回到 2026-07-14 架構會議的「驗證優先」30 天計畫:BLE 實機驗證 + Profiler 基線
