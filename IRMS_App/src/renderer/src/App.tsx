// renderer/App.tsx
import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { useUiStore } from './store/useUiStore'
import { applyStyleProfile } from './styles/applyStyleProfile'
import { TopHeader } from './components/TopHeader'
import { BottomBar } from './components/BottomBar'
import { ToastHost } from './components/ToastHost'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorOverlay } from './components/ErrorOverlay'
import { DashboardView } from './views/DashboardView'
import { ActionsView } from './views/ActionsView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { ErrorBoundary } from './components/ErrorBoundary'

const VIEW_NAMES: Record<string, string> = {
  dashboard: '即時監測',
  actions: '動作設定',
  history: '歷史紀錄',
  settings: '設定'
}

export default function App(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const demoMode = useUiStore((s) => s.demoMode)
  const styleProfileId = useStore((s) => s.settings.styleProfileId)

  // 套用外觀風格設定檔:含初次載入(讀取持久化設定)與 Settings 頁面切換時。
  // 'system' 會清掉所有覆寫,交回 global.css 的 :root/媒體查詢自行處理。
  useEffect(() => {
    applyStyleProfile(styleProfileId)
  }, [styleProfileId])

  return (
    <>
      {/* 示範模式的全域橫幅,刻意不可關閉、且渲染在最外層而非任何單一視圖裡。
          少了它,一張 Dashboard 的截圖與真實量測的截圖完全無法區分——而 demo 模式
          存在的理由正是「拿去給人看」,所以截圖被誤認的機率不是理論風險。 */}
      {demoMode && (
        <div className="demo-banner" role="status">
          ⚠ 示範模式 — 畫面上的資料由模擬器產生,不是真實量測
        </div>
      )}

      {/* Liquid Glass 背景:色彩 blob 網格,極慢漂移(transform-only,GPU 合成) */}
      <div className="bg-scene" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
      </div>

      {/* 選單類玻璃面板的不規則扭曲濾鏡定義,串進 backdrop-filter(見 global.css
          .glass-warp)。扭曲只作用於背景折射,元素本身內容不受影響。
          feGaussianBlur 把 turbulence 雜訊抹平,扭曲才會像液體波動而非顆粒抖動。
          零尺寸 SVG,只提供 filter 定義,不佔版面、不渲染任何可見內容。
          2026-08-21:scale 從 18 收斂到 5——真正的 Liquid Glass 折射是穩定的
          透鏡效果,不是會晃動的液態噪點扭曲,原本的量級讀起來比較像「融化的
          玻璃」而不是「光學材質」。保留極輕微的不規則感(而非完全拉直變回
          普通 blur),留一點「這是玻璃不是霧面壓克力」的質感差異。 */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
        <defs>
          <filter id="glass-warp-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="1.5" result="smoothNoise" />
            <feDisplacementMap in="SourceGraphic" in2="smoothNoise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* 液態黏滯濾鏡:套在滑動指示塊(LiquidKnob.tsx)本身,讓 knob-stretch
              拉伸時邊緣呈現有機的液態感,而非硬邊縮放。做法:先模糊再用
              feColorMatrix 把 alpha 拉回陡峭閾值(只留高於閾值的部分),
              最後 feComposite atop 疊回原始色彩,只借 blur+threshold 重塑輪廓、
              不讓顏色本身變模糊。
              2026-08-21:stdDeviation 4→2——真正 iOS 26 的分頁「玻璃膠囊高亮塊」
              只是平滑縮放/位移,沒有卡通式的融邊;這裡改成只留可以感覺到「不是
              死板矩形在滑」的極輕微邊緣柔化,不再是明顯的果凍質感。 */}
          <filter id="liquid-gooey-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div className="app">
        <TopHeader />
        <main className="main">
          {/* key=view:切換分頁時重建 boundary,讓某一頁崩潰後換頁再換回來能自動復原 */}
          <ErrorBoundary key={view} name={VIEW_NAMES[view]}>
            {view === 'dashboard' && <DashboardView />}
            {view === 'actions' && <ActionsView />}
            {view === 'history' && <HistoryView />}
            {view === 'settings' && <SettingsView />}
          </ErrorBoundary>
        </main>
        <BottomBar />
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
    </>
  )
}
