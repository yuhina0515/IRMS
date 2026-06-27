// renderer/App.tsx
import { useUiStore } from './store/useUiStore'
import { Sidebar } from './components/Sidebar'
import { ToastHost } from './components/ToastHost'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ErrorOverlay } from './components/ErrorOverlay'
import { DashboardView } from './views/DashboardView'
import { ActionsView } from './views/ActionsView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'

export default function App(): JSX.Element {
  const view = useUiStore((s) => s.view)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)

  return (
    <>
      <div className={`app${collapsed ? ' collapsed' : ''}`}>
        <Sidebar />
        <main className="main">
          {view === 'dashboard' && <DashboardView />}
          {view === 'actions' && <ActionsView />}
          {view === 'history' && <HistoryView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      <ToastHost />
      <ConfirmDialog />
      <ErrorOverlay />
    </>
  )
}
