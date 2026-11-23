// hooks/useToolModules.ts
// Active modules that contribute a page to the 工具 tab. Lives in hooks/ (not views/ToolsView) so the
// top navigation can read it without statically importing the lazily loaded ToolsView.
import { modulePage } from '../services/moduleFeatures'
import { useModulesStore } from '../services/modules'

export function useToolModules(): { id: string; name: string }[] {
  const modules = useModulesStore((s) => s.modules)
  return modules.flatMap((m) => {
    const page = m.status === 'active' ? modulePage(m.id) : undefined
    return page ? [{ id: m.id, name: page.title }] : []
  })
}
