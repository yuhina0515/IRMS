// views/ToolsView.tsx
// 「工具」頁:已安裝且啟用的模組提供的操作介面。設定 → 模組只負責管理(啟用、更新)。
import { useState } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'
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
  const [menuOpen, setMenuOpen] = useState(false)
  useEscapeKey(menuOpen ? () => setMenuOpen(false) : null)

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
          <div className="v3-tools-bar">
            <button
              type="button"
              className="v3-tools-menu"
              aria-label={m.tools.groupAria}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ☰
            </button>
            <span>{current?.name}</span>
          </div>
          {menuOpen && <div className="v3-tools-scrim" onClick={() => setMenuOpen(false)} />}
          <div className={`v3-segmented${menuOpen ? ' is-open' : ''}`} role="group" aria-label={m.tools.groupAria}>
            {tools.map((t) => (
              <button
                key={t.id}
                aria-pressed={t.id === current?.id}
                onClick={() => {
                  setToolModule(t.id)
                  setMenuOpen(false)
                }}
              >
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
