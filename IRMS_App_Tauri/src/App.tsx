// renderer/App.tsx — 外殼:固定命令軌 + 情境命令列 + 唯一可捲動的工作區(設計語言 v2 §7)。
import { lazy, Suspense, useEffect } from 'react'
import { useT } from './i18n'
import { useStore } from './store/useStore'
import { useUiStore } from './store/useUiStore'
import { applyThemeMode } from './services/theme'
import { irms } from './platform/irmsApi'
import { Rail } from './components/Rail'
import { CommandBar } from './components/CommandBar'
import { ToastHost } from './components/ToastHost'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorOverlay } from './components/ErrorOverlay'
import { UpdateBanner } from './components/UpdateBanner'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AlertIcon } from './components/Icons'
import { DashboardView } from './views/DashboardView'

// 監測是開啟後的第一個畫面,維持直接打包;其餘三頁到使用者切過去時才載入
const ActionsView = lazy(() => import('./views/ActionsView').then((m) => ({ default: m.ActionsView })))
const HistoryView = lazy(() => import('./views/HistoryView').then((m) => ({ default: m.HistoryView })))
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })))

export default function App(): JSX.Element {
  const t = useT()
  const view = useUiStore((s) => s.view)
  const demoMode = useUiStore((s) => s.demoMode)
  const themeMode = useStore((s) => s.settings.themeMode)
  const language = useStore((s) => s.settings.language)
  const allowBetaUpdates = useStore((s) => s.settings.allowBetaUpdates)

  useEffect(() => {
    applyThemeMode(themeMode)
  }, [themeMode])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // 送到原生層對應 allowPrerelease——persist 用同步的 localStorage,這裡拿到的已是水合後的值
  useEffect(() => {
    void irms.updates.setAllowPrerelease(allowBetaUpdates)
  }, [allowBetaUpdates])

  return (
    <div className="app">
      {/* 示範模式的全域橫幅,刻意不可關閉、且渲染在最外層:少了它,一張監測畫面的截圖與
          真實量測的截圖完全無法區分——而示範模式存在的理由正是「拿去給人看」。 */}
      {demoMode && (
        <div className="demo-banner" role="status">
          <AlertIcon />
          {t.shell.demoBanner}
        </div>
      )}

      <div className="shell">
        <Rail />
        <section className="workspace">
          <CommandBar />
          <main className="workspace__main">
            {/* key=view:切換分頁時重建 boundary,某一頁崩潰後換頁再換回來能自動復原 */}
            <ErrorBoundary key={view} name={t.workspaces[view].title}>
              <Suspense fallback={null}>
                {view === 'dashboard' && <DashboardView />}
                {view === 'actions' && <ActionsView />}
                {view === 'history' && <HistoryView />}
                {view === 'settings' && <SettingsView />}
              </Suspense>
            </ErrorBoundary>
          </main>
        </section>
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
      <UpdateBanner />
    </div>
  )
}
