// views/ToolsView.tsx
// 「工具」頁:已安裝且啟用的模組提供的操作介面。設定 → 模組只負責管理(啟用、更新)。
import { ModulePanelMount } from '../components/ModulePanelMount'
import { modulePage } from '../services/moduleFeatures'
import { useModulesStore } from '../services/modules'
import { useUiStore } from '../store/useUiStore'
import { useT } from '../i18n'

export function useToolModules(): { id: string; name: string }[] {
  const modules = useModulesStore((s) => s.modules)
  return modules.flatMap((m) => {
    const page = m.status === 'active' ? modulePage(m.id) : undefined
    return page ? [{ id: m.id, name: page.title }] : []
  })
}

export function ToolsView(): JSX.Element {
  const tools = useToolModules()
  const selected = useUiStore((s) => s.toolModuleId)
  const setToolModule = useUiStore((s) => s.setToolModule)
  const setView = useUiStore((s) => s.setView)
  const m = useT()
  const current = tools.find((t) => t.id === selected) ?? tools[0]

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{m.tools.title}</h1>
          <p>{m.tools.subtitle}</p>
        </div>
      </div>
      {tools.length === 0 ? (
        <section className="v3-sheet v3-scroll">
          <div className="v3-empty">
            <p>{m.tools.empty}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => setView('settings')}>
              {m.common.goToSettings}
            </button>
          </div>
        </section>
      ) : (
        <section className="v3-sheet work-tools">
          <div className="v3-segmented" role="group" aria-label={m.tools.groupAria}>
            {tools.map((t) => (
              <button key={t.id} aria-pressed={t.id === current?.id} onClick={() => setToolModule(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
          {current && <ModulePanelMount key={current.id} id={current.id} />}
        </section>
      )}
    </div>
  )
}
