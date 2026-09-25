// renderer/components/ModulesPanel.tsx
// 設定頁的「模組」區:列出 IRMS-Modules 已驗證的模組、啟用開關與模組提供的提示。
import { setModuleEnabled, useModulesStore } from '../services/modules'

export function ModulesPanel(): JSX.Element {
  const { modules, warnings, offline, syncing, syncError } = useModulesStore()

  return (
    <div className="panel glass">
      <h3 style={{ marginBottom: 8 }}>Modules 模組</h3>
      <p className="text-text-muted text-sm mb-3">
        第一方功能模組由 IRMS-Modules 發布,啟動時自動下載並驗證簽章;不需要重裝 App 就能更新。
        停用立即生效,重新啟用會在下次開啟 App 時載入。
      </p>
      {syncing && <p className="field-hint">同步模組中…</p>}
      {syncError && <p className="field-hint text-warning">模組同步失敗:{syncError}</p>}
      {offline && <p className="field-hint">目前離線,使用本機已驗證的模組。</p>}
      {warnings.map((w) => (
        <p key={w} className="field-hint text-warning">
          {w}
        </p>
      ))}
      {!syncing && !syncError && modules.length === 0 && <p className="field-hint">沒有可用的模組。</p>}
      <ul className="modules-list">
        {modules.map((m) => (
          <li key={m.id} className="modules-item">
            <div className="modules-item-head">
              <div>
                <strong>{m.name}</strong> <span className="text-text-dim text-xs font-mono">v{m.version}</span>
                {m.status === 'error' && <span className="text-danger text-xs"> · 載入失敗:{m.error}</span>}
              </div>
              <label className="modules-toggle">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => setModuleEnabled(m.id, e.target.checked)}
                  aria-label={`啟用 ${m.name}`}
                />
                {m.enabled ? '啟用' : '停用'}
              </label>
            </div>
            {m.description && <p className="text-text-muted text-sm">{m.description}</p>}
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
