// renderer/App.tsx
import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { useUiStore } from './store/useUiStore'
import { applyThemeMode } from './services/theme'
import { TopHeader } from './components/TopHeader'
import { Sidebar } from './components/Sidebar'
import { SegmentedControl } from './components/SegmentedControl'
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
  const themeMode = useStore((s) => s.settings.themeMode)

  // 套用主題:含初次載入(讀取持久化設定)與使用者切換時。
  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

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

      <div className="app">
        <Sidebar />
        <div className="app-column">
          <TopHeader />
          <div className="segmented-row">
            <SegmentedControl />
          </div>
          <main className="main">
            {/* key=view:切換分頁時重建 boundary,讓某一頁崩潰後換頁再換回來能自動復原 */}
            <ErrorBoundary key={view} name={VIEW_NAMES[view]}>
              {view === 'dashboard' && <DashboardView />}
              {view === 'actions' && <ActionsView />}
              {view === 'history' && <HistoryView />}
              {view === 'settings' && <SettingsView />}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
    </>
  )
}
