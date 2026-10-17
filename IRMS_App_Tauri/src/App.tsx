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
import { useT } from './i18n'

// Dashboard is the landing view and stays eagerly bundled; the other three are only needed once
// the user navigates there, so splitting them keeps first paint down to Dashboard's own code.
const ActionsView = lazy(() => import('./views/ActionsView').then((m) => ({ default: m.ActionsView })))
const HistoryView = lazy(() => import('./views/HistoryView').then((m) => ({ default: m.HistoryView })))
const ToolsView = lazy(() => import('./views/ToolsView').then((m) => ({ default: m.ToolsView })))
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })))

export default function App(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const m = useT()
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
            {m.app.demoBanner}
          </div>
        )}
        <TopNav />
        {/* key=view:切換分頁時重建 boundary,讓某一頁崩潰後換頁再換回來能自動復原 */}
        <ErrorBoundary key={view} name={m.nav[view]}>
          <Suspense fallback={null}>
            {view === 'dashboard' && <DashboardView />}
            {view === 'actions' && <ActionsView />}
            {view === 'history' && <HistoryView />}
            {view === 'tools' && <ToolsView />}
            {view === 'settings' && <SettingsView />}
          </Suspense>
        </ErrorBoundary>
        <div className="v3-update-slot">
          <UpdateBanner />
        </div>
        <footer className="v3-footer">
          <span>{m.app.footerBrand}</span>
          <span>{demoMode ? m.app.footerDemo : m.app.footerLocal}</span>
        </footer>
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
    </>
  )
}
