// renderer/App.tsx
import { lazy, Suspense, useEffect } from 'react'
import { useStore } from './store/useStore'
import { useUiStore } from './store/useUiStore'
import { applyThemeMode } from './services/theme'
import { irms } from './platform/irmsApi'
import { TopNav } from './components/TopNav'
import { ToastHost } from './components/ToastHost'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorOverlay } from './components/ErrorOverlay'
import { UpdateBanner } from './components/UpdateBanner'
import { DashboardView } from './views/DashboardView'
import { ErrorBoundary } from './components/ErrorBoundary'

// Dashboard is the landing view and stays eagerly bundled; the other three are only needed once
// the user navigates there, so splitting them keeps first paint down to Dashboard's own code.
const ActionsView = lazy(() => import('./views/ActionsView').then((m) => ({ default: m.ActionsView })))
const HistoryView = lazy(() => import('./views/HistoryView').then((m) => ({ default: m.HistoryView })))
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })))

const VIEW_NAMES: Record<string, string> = {
  dashboard: '即時監測',
  actions: '動作處方',
  history: '療程紀錄',
  settings: '設定'
}

export default function App(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const demoMode = useUiStore((s) => s.demoMode)
  const themeMode = useStore((s) => s.settings.themeMode)
  const allowBetaUpdates = useStore((s) => s.settings.allowBetaUpdates)

  // 套用主題:含初次載入(讀取持久化設定)與使用者切換時。
  useEffect(() => applyThemeMode(themeMode), [themeMode])

  // 送到 main 對應 autoUpdater.allowPrerelease——zustand persist 用同步的 localStorage,
  // 這裡拿到的已經是水合後的值,遠早於 updater.ts 的 5 秒啟動檢查延遲。
  useEffect(() => {
    void irms.updates.setAllowPrerelease(allowBetaUpdates)
  }, [allowBetaUpdates])

  return (
    <>
      <div className={`v3-shell${demoMode ? ' has-banner' : ''}`}>
        {/* 示範模式的全域橫幅,刻意不可關閉、且渲染在最外層而非任何單一視圖裡。
            少了它,一張 Dashboard 的截圖與真實量測的截圖完全無法區分。 */}
        {demoMode && (
          <div className="demo-banner" role="status">
            ⚠ 示範模式 — 畫面上的資料由模擬器產生,不是真實量測
          </div>
        )}
        <TopNav />
        {/* key=view:切換分頁時重建 boundary,讓某一頁崩潰後換頁再換回來能自動復原 */}
        <ErrorBoundary key={view} name={VIEW_NAMES[view]}>
          <Suspense fallback={null}>
            {view === 'dashboard' && <DashboardView />}
            {view === 'actions' && <ActionsView />}
            {view === 'history' && <HistoryView />}
            {view === 'settings' && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
        <footer className="v3-footer">
          <span>IRMS 智慧復健監測 · BETA</span>
          <span>{demoMode ? '示範資料 · 不是真實量測' : '本機紀錄 · 遙測預設關閉'}</span>
        </footer>
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
      <UpdateBanner />
    </>
  )
}
