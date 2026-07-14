# 2026-07-14 — UI 設計:側欄拖拉晃動、玻璃選單扭曲、下拉選單改版

## Request

會議決議「WinUI 3 暫緩」後,使用者指示:
1. 側邊選單改為側邊點擊與可拖拉式,拖動需對應晃動
2. 所有選單「模糊背景」+「不規則扭曲」達成 Liquid Glass 效果
3. 下拉式選單改為點擊彈出,需要彈出細節與晃動
4. 找出所有潛在問題並修復,重複直到 0 問題

## Actions

1. **`GlassDropdown.tsx`(新增)**:取代原生 `<select>` 的自訂下拉元件。點擊觸發(非
   hover),`document` 層級 pointerdown/Escape 監聽處理外部關閉,彈出面板套用
   `dropdown-pop` keyframe(scale+rotate+translateY 的彈簧回彈,模擬晃動)。
   套用至 `SessionControlPanel`(指定動作)、`SettingsView`(預設協定)、
   `ActionsView`(協定篩選 + Trigger Type)共 4 處。
2. **側欄拖拉調寬(`Sidebar.tsx` + `useUiStore.ts`)**:新增 `sidebarWidth` /
   `sidebarDragging` state;右緣 `.sidebar-resize-handle` 用 Pointer Events API
   拖曳調寬(180–360px 範圍,低於 110px 門檻視同收合),拖曳中依瞬時速度寫入
   `--wobble` CSS 變數,放開後以 `cubic-bezier(0.34,1.56,0.64,1)` 彈簧曲線回正。
3. **玻璃扭曲(`global.css` + `App.tsx`)**:`App.tsx` 掛載零尺寸 SVG,定義
   `feTurbulence` + `feDisplacementMap` 濾鏡(`#glass-warp-filter`)。新增
   `.glass-warp` modifier class:把背景色與 `backdrop-filter` 移到 `::before`
   偽元素套用扭曲濾鏡,本體只留邊框/陰影,文字與按鈕維持在未扭曲層——
   折射會晃但字永遠清晰。刻意只套在「選單」語意元件(側欄、下拉彈出面板),
   不套用到每張卡片,避免大量元素在版面變動時重跑 `feDisplacementMap` 拖累效能
   (2026-07-13 桌布工作已記錄過 feTurbulence 的光柵化效能地雷)。

## Decisions

- **拖拉寬度用自由值而非兩段式 snap**:比照 macOS Finder 側欄手感,180–360px
  間任意停留,< 110px 才吸附收合,而非只有「展開/收合」兩態。
- **扭曲濾鏡走 `::before` 分層而非直接套在 `.glass` 本體**:若直接對整個元件套
  `filter: url(...)`,連文字內容都會被扭曲變形。分層後扭曲只影響折射底色,
  可讀性不受影響,也讓濾鏡強度(`scale`)可以給得比預期更明顯而不必擔心文字糊掉。
- **`.glass-warp` 範圍限縮在「選單」而非全部 `.glass`**:使用者原話是「所有選單」,
  且前次桌布工作已驗證全螢幕動態 turbulence 的效能風險;這次選擇只套用在側欄與
  下拉彈出面板兩處,數量少、且多半是短暫存在或不常重排版面的元素。

## Verification

- `npm run ci`(typecheck + 71 tests + build)全綠,修復前後各跑一次確認未迴歸。
- 啟動 `npm run dev`,用瀏覽器面板連到 Vite renderer(`localhost:5173`)做 DOM
  層級驗證(`window.irms` 在純瀏覽器環境下不存在,BLE/DB 相關呼叫預期會記一筆
  「Failed to load actions」log,不影響 UI 邏輯驗證):
  - 下拉選單點擊後 `.glass-dropdown-popup` 正確掛載,`animationName: dropdown-pop`、
    `::before` 的 `filter`/`backdropFilter` 皆命中預期值。
  - 側欄拖拉:模擬 pointerdown→pointermove→pointerup 序列,確認寬度依速度/位移
    正確更新、`--wobble` 在放開後重置為 `0deg`。
  - 無法用 `computer` 截圖(本 session 該工具持續逾時,非本次改動導致),改用
    `read_page` / `javascript_tool` 做結構化驗證取代視覺截圖。

## Self-review

跑完第一版後主動做程式碼審查(而非只信任「typecheck 過 = 沒問題」),找到 3 個
真實缺陷並修復:

1. **`onResizeMove` 每次 pointermove 都無條件呼叫 `setCollapsed()`**——即使值未變,
   zustand 的 `set()` 仍會觸發全域重繪,拖曳時每秒觸發數十次不必要重繪,正是
   先前 UI 節流工作要消除的那類問題。改為只在 `shouldCollapse !== collapsed`
   時才 dispatch。
2. **晃動被 CSS transition 吃掉**——`.sidebar` 的 `transform` transition 沒有在
   拖曳中關閉,導致 `--wobble` 的即時速度值被 0.35s 緩動平滑掉,晃動觀感會遲鈍
   而非跟手。補上 `.app.sidebar-dragging .sidebar { transition: none; }`。
3. **拖拉把手被自己遮住一半**——`.sidebar-resize-handle` 用 `right: -8px` 讓一半
   跨出 `.sidebar` 邊界,但 `.sidebar` 有 `overflow: hidden`,超出邊界的部分會被
   裁掉,實際可點擊區域只剩設計寬度的一半。改為 `right: 0`,把手完全落在
   `.sidebar` 自己的右側 padding 內,不再被裁切;瀏覽器驗證 `handleRight <=
   sidebarRight` 成立。

另外在用合成 `PointerEvent` 測試拖曳時發現 `setPointerCapture` 對假造的
pointerId 會拋錯;查證後確認這是測試手法的限制(真實使用者互動的 pointerId
必定有效,規範保證成功),非產品缺陷,但仍補上 try/catch 防呆,避免任何極端
輸入環境讓整個拖曳把手失效。

## Addendum — simpler distortion technique (same day, post-review)

User supplied a reference snippet showing the SVG filter chained directly inside
`backdrop-filter: blur(4px) url(#filter)`, with `feGaussianBlur` smoothing the
turbulence noise before `feDisplacementMap`. Adopted this in place of the
`::before`-layering approach:

- **Before**: `.glass-warp` moved `background`/`backdrop-filter` to a `::before`
  pseudo-element and applied `filter: url(...)` there, keeping the real element
  free of distortion (worked, but needed `isolation: isolate`, `z-index: -1`,
  and an extra painted layer).
- **After**: `backdrop-filter: var(--glass-blur) url(#glass-warp-filter)` directly
  on `.glass-warp` — `backdrop-filter` only ever touches what's *behind* the
  element, so text/children were never at risk either way; chaining the SVG
  filter onto the existing blur+saturate pipeline gets the same "content never
  warps" guarantee with no extra DOM layer, no isolation/z-index bookkeeping.
- Filter tuned per the reference's technique: `baseFrequency` 0.012/0.018 → 0.008
  (coarser, single value), added `feGaussianBlur stdDeviation="1.5"` to smooth
  the turbulence before displacing (liquid ripple instead of grainy jitter),
  `scale` 6 → 18 (reference used 110, dialed down since our panels are compact
  UI menus, not full-bleed art).
- Verified via computed style: both `.sidebar` and `.glass-dropdown-popup` report
  `backdrop-filter: blur(20px) saturate(1.8) url("#glass-warp-filter")`; CI still
  green (71 tests); no console errors after the swap.

## Addendum 2 — liquid sliding-knob indicator (same day, third reference)

User found a third reference: a "gooey" SVG filter (`feGaussianBlur` → `feColorMatrix`
alpha-threshold → `feComposite atop`) driving a sliding indicator knob in a segmented
control, with an elastic stretch on transition. Asked where to apply it; user chose
"both" — Dashboard's secondary tabs (`chart/3d/2d/detail`) and the Sidebar's main nav.

- **New `components/LiquidKnob.tsx`**: reusable for both, parameterized by
  `orientation` ('horizontal' for tabs — tracks left/width; 'vertical' for nav —
  tracks top/height). Measures the active button via `[data-knob-key]` +
  `getBoundingClientRect`, positions a `.liquid-knob-track` (smooth `transition`)
  containing a `.liquid-knob-shape` (one-shot `scaleX`/`scaleY` keyframe on real
  selection changes only, not on first mount or on `resize`-triggered remeasures).
  Position/shape are deliberately on two different elements so the continuous
  "glide to new spot" transition and the one-shot "elastic overshoot" animation
  don't fight over the same `transform` property.
- **Second SVG filter** (`#liquid-gooey-filter`) added alongside `#glass-warp-filter`
  in `App.tsx`. Tuned down from the reference's values (`stdDeviation` 12 → 4,
  matrix intercept -9 → -8) since our knob is a small nav/tab pill, not a big blob.
- **Fixed a bug in the reference before adopting it**: the pasted example set
  `knob.style.transform = translateX(...)` (inline) right after adding a class that
  sets `transform: scaleX(1.3)` — inline style always wins over a class selector at
  equal/higher specificity regardless of add-order, so the stretch would never have
  visually applied. Solved by splitting position (outer track, `transition`) from
  shape (inner element, `animation`) so they're two different elements/properties,
  not one fighting over itself.
- **Wired into `Sidebar.tsx`** (`.nav`, activeKey = `view`) and `DashboardView.tsx`
  (`.tabs`, activeKey = `tab`), each with its own ref + `data-knob-key` per button.
- **Removed the now-redundant static active-state background** from `.nav-item.active`
  / `.tab-btn.active` (kept only the text-color change) since the knob supplies the
  highlight visually.

### Bug caught before shipping: stacking order hid the labels

`.liquid-knob-track` is `position: absolute`. Per CSS stacking rules, a positioned
element always paints above **all** static-positioned siblings regardless of DOM
order — only among siblings that are *also* positioned does DOM order decide who's
on top. Since `.nav-item`/`.tab-btn` were plain `position: static` buttons, the knob
(rendered first in JSX, intending to sit "behind") would have painted over the
button labels instead. Fixed by adding `position: relative; z-index: 1;` to both
`.nav-item` and `.tab-btn` — makes them "positioned" too, so DOM order (knob first)
correctly puts them behind the buttons.

### Verification

Browser DOM-level checks against the running Vite renderer (same limitation as
above — no working screenshot tool this session):
- `.nav`/`.tabs` knob tracks found with correct initial `transform`/size.
- Clicking a different nav item: track re-positions (`translateY` matching the new
  button's offset), `morph` class present during the transition window, removed
  after ~500ms wait.
- Clicking a different dashboard tab: same, with `translateX`/`width`.
- Dispatched a synthetic `resize` event: track remeasures but `morph` class is
  **not** re-added (confirms morph only fires on genuine selection changes).
- No console errors after all interactions. `npm run ci` (71 tests) green.

## Next

- 使用者尚未親眼驗收晃動手感與扭曲濾鏡強度是否符合預期;`WOBBLE_MAX_DEG`(4°)、
  `WOBBLE_VELOCITY_SCALE`(40)、SVG 濾鏡的 `scale`(6)都只是幾個常數,回饋後
  可微調。
- `GlassDropdown` 目前無鍵盤上下鍵導覽選項(僅 Tab 循序 + Escape 關閉),視需求
  再補上完整 combobox 鍵盤語意。
