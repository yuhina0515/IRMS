// renderer/components/ModulesPanel.tsx
// 設定頁的「模組」區:只做管理——列出 IRMS-Modules 已驗證的模組、啟用開關、檢查更新。
// 模組的操作介面在「工具」頁(views/ToolsView.tsx)。
import { irms } from '../platform/irmsApi'
import { modulePage } from '../services/moduleFeatures'
import { checkModuleUpdates, setModuleEnabled, useModulesStore } from '../services/modules'
import { useUiStore } from '../store/useUiStore'
import { TIME_SECONDS, formatDateTime, useLocale, useT } from '../i18n'

export function ModulesPanel(): JSX.Element {
  const { modules, warnings, offline, syncing, syncError, checking, pendingUpdates, lastChecked } = useModulesStore()
  const openModuleTool = useUiStore((s) => s.openModuleTool)
  const tx = useT()
  const locale = useLocale()

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 8 }}>{tx.modules.heading}</h3>
      <p className="text-text-muted text-sm mb-3">{tx.modules.intro}</p>
      <div className="row" style={{ gap: 12, alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" disabled={checking || syncing} onClick={() => void checkModuleUpdates(() => irms.modules.sync())}>
          {checking ? tx.common.checking : tx.modules.check}
        </button>
        {lastChecked && !checking && !syncError && (
          <span className="field-hint" role="status">
            {pendingUpdates.length === 0
              ? tx.modules.upToDate({ time: formatDateTime(locale, new Date(lastChecked), TIME_SECONDS) })
              : tx.modules.updatesFound({
                  count: pendingUpdates.length,
                  list: pendingUpdates
                    .map((u) => `${u.name} ${u.from ? `v${u.from} → ` : tx.modules.newInstall}v${u.to}`)
                    .join(tx.common.listSeparator)
                })}
          </span>
        )}
      </div>
      {syncing && <p className="field-hint">{tx.modules.syncing}</p>}
      {syncError && <p className="field-hint text-warning">{tx.modules.syncFailed({ error: syncError })}</p>}
      {offline && <p className="field-hint">{tx.modules.offline}</p>}
      {warnings.map((w) => (
        <p key={w} className="field-hint text-warning">
          {w}
        </p>
      ))}
      {!syncing && !syncError && modules.length === 0 && <p className="field-hint">{tx.modules.none}</p>}
      <ul className="modules-list">
        {modules.map((m) => (
          <li key={m.id} className="modules-item">
            <div className="modules-item-head">
              <div>
                <strong>{m.name}</strong> <span className="text-text-dim text-xs font-mono">v{m.version}</span>
                {m.status === 'error' && <span className="text-danger text-xs">{tx.modules.loadFailed({ error: m.error ?? '' })}</span>}
              </div>
              <label className="modules-toggle">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => void setModuleEnabled(m.id, e.target.checked)}
                  aria-label={tx.modules.enableAria({ name: m.name })}
                />
                {m.enabled ? tx.modules.enabled : tx.modules.disabled}
              </label>
            </div>
            {m.description && <p className="text-text-muted text-sm">{m.description}</p>}
            {m.status === 'loading' && <p role="status">{tx.modules.loading}</p>}
            {m.status === 'active' && modulePage(m.id) && (
              <button className="btn btn-secondary btn-sm" onClick={() => openModuleTool(m.id)}>
                {tx.modules.openModule({ name: m.name })}
              </button>
            )}
            {m.tips.length > 0 && (
              <ul className="modules-tips">
                {m.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
