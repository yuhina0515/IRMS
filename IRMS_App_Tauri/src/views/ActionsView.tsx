// 動作處方(設計語言 v2 §9):協定工具列 + 篩選列 + register rows。
// 安全上限以 danger 小徽章呈現,不再是窄視窗下會被截斷的說明文字。
import { useState } from 'react'
import { JOINT_PROTOCOLS, TRIGGER_TYPES, type CustomAction, type CustomActionInput, type TriggerType } from '@shared/types'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance,
  clampTriggerParams
} from '@shared/validation'
import { metricLabel, useT } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { countActions, filterSortGroupActions, type ActionGroupBy, type ActionSortBy } from '../services/actionQuery'
import { computeMetricSample, metricInfo, OVER_EXTENSION_MARGIN } from '../services/movementMetric'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { irms } from '../platform/irmsApi'
import { Dropdown } from '../components/Dropdown'
import { CloseIcon } from '../components/Icons'

const blankForm = (protocol: CustomAction['protocol']): CustomActionInput => ({
  name: '',
  description: '',
  protocol,
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 3000,
  triggerType: 'joint_angle',
  safetyLimit: null
})

export function ActionsView(): JSX.Element {
  const t = useT()
  const actions = useStore((s) => s.customActions)
  const setCustomActions = useStore((s) => s.setCustomActions)
  const protocol = useStore((s) => s.settings.protocol)
  const setSettings = useStore((s) => s.setSettings)
  const selectedActionId = useStore((s) => s.selectedActionId)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const [editing, setEditing] = useState<CustomAction | null>(null)
  const [form, setForm] = useState<CustomActionInput | null>(null)

  // Record Pose:沒有這個功能,治療師必須在感測器已經綁在患者腿上的情況下「盲打」
  // 一個目標角度——這是臨床上錯誤目標的最大來源。
  const angles = useStore((s) => s.angles)
  const isConnected = useStore((s) => s.isConnected)
  const liveMetric = angles == null || form == null ? null : computeMetricSample(angles, form.triggerType, form.tolerance).value

  useEscapeKey(form ? () => setForm(null) : null)

  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<ActionSortBy>('name')
  const [groupBy, setGroupBy] = useState<ActionGroupBy>('none')

  const inProtocol = actions.filter((a) => a.protocol === protocol)
  const groups = filterSortGroupActions(inProtocol, { query, sortBy, groupBy })
  const total = countActions(groups)
  const triggerLabel = (tt: TriggerType): string => t.triggerTypes[tt]

  const reload = async (): Promise<void> => {
    setCustomActions(await irms.actions.list())
  }

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.name.trim()) {
      showToast(t.actions.nameRequired, 'warning')
      return
    }
    // 儲存前一律鉗制:一個不合法的參數存進去會永久影響每一場用到它的療程
    const safe = clampTriggerParams(form)
    try {
      if (editing) await irms.actions.update(editing.id, safe)
      else await irms.actions.create(safe)
      showToast(editing ? t.actions.updated : t.actions.created, 'success')
      setForm(null)
      await reload()
    } catch {
      showToast(t.actions.saveFailed, 'error')
    }
  }

  const remove = async (a: CustomAction): Promise<void> => {
    const ok = await requestConfirm(t.actions.deleteTitle, t.actions.deleteConfirm(a.name))
    if (!ok) return
    await irms.actions.delete(a.id)
    showToast(t.actions.deleted, 'success')
    await reload()
  }

  const restoreDefaults = async (): Promise<void> => {
    const ok = await requestConfirm(t.actions.restoreTitle, t.actions.restoreConfirm)
    if (!ok) return
    setCustomActions(await irms.actions.restoreDefaults())
    showToast(t.actions.restored, 'success')
  }

  const derivedLimit = (a: { targetAngle: number; tolerance: number }): number => a.targetAngle + a.tolerance + OVER_EXTENSION_MARGIN

  return (
    <section className="view">
      <p className="view__lead">{t.actions.subtitle}</p>

      <div className="toolbar">
        <div className="field" style={{ width: 260 }}>
          <label className="field__label" htmlFor="actions-protocol">
            {t.actions.protocolLabel}
          </label>
          <Dropdown
            id="actions-protocol"
            value={protocol}
            onChange={(v) => setSettings({ protocol: v as CustomAction['protocol'] })}
            options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: t.protocols[p.value] }))}
          />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void restoreDefaults()}>
            {t.actions.restoreDefaults}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setEditing(null)
              setForm(blankForm(protocol))
            }}
          >
            + {t.actions.create}
          </button>
        </div>
      </div>

      {/* 只有這個協定底下真的有動作時才顯示搜尋——對空集合擺搜尋框沒有意義 */}
      {inProtocol.length > 0 && (
        <div className="filter-strip">
          <input
            type="search"
            className="input"
            placeholder={t.actions.search}
            aria-label={t.actions.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Dropdown
            ariaLabel={t.actions.sortLabel}
            value={sortBy}
            onChange={(v) => setSortBy(v as ActionSortBy)}
            options={[
              { value: 'name', label: t.actions.sortName },
              { value: 'target', label: t.actions.sortTarget },
              { value: 'created', label: t.actions.sortCreated }
            ]}
          />
          <Dropdown
            ariaLabel={t.actions.groupLabel}
            value={groupBy}
            onChange={(v) => setGroupBy(v as ActionGroupBy)}
            options={[
              { value: 'none', label: t.actions.groupNone },
              { value: 'triggerType', label: t.actions.groupTrigger }
            ]}
          />
        </div>
      )}

      {total === 0 ? (
        <div className="empty">
          {/* 「沒有動作」與「搜尋不到」是兩件事,給的出口也不同 */}
          {inProtocol.length === 0 ? (
            <>
              <p>{t.actions.emptyProtocol}</p>
              <button type="button" className="btn" onClick={() => void restoreDefaults()}>
                {t.actions.loadDefaults}
              </button>
            </>
          ) : (
            <>
              <p>{t.actions.noMatch(query.trim())}</p>
              <button type="button" className="btn" onClick={() => setQuery('')}>
                {t.actions.clearSearch}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="register">
          {groups.map((group) => (
            <div key={group.key ?? '__all__'} role="list" aria-label={group.key ? triggerLabel(group.key) : undefined}>
              {group.key && <div className="register__group">{triggerLabel(group.key)}</div>}
              {group.actions.map((a) => (
                <div
                  key={a.id}
                  role="listitem"
                  className="register__row"
                  style={a.id === selectedActionId ? { boxShadow: 'inset 3px 0 0 rgb(var(--color-accent))' } : undefined}
                >
                  <div className="register__main">
                    <div className="register__name">
                      <span>{a.name}</span>
                      <span className="badge">{triggerLabel(a.triggerType)}</span>
                      <span className="badge badge--danger">
                        {t.actions.safetyLimit}{' '}
                        {a.safetyLimit != null ? `${a.safetyLimit}°` : t.actions.safetyDerived(derivedLimit(a))}
                      </span>
                    </div>
                    <div className="register__params">{t.actions.params(a.targetAngle, a.tolerance, a.holdTimeMs)}</div>
                    {a.description && <div className="register__desc" title={a.description}>{a.description}</div>}
                  </div>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => {
                        setEditing(a)
                        setForm({ ...a })
                      }}
                    >
                      {t.common.edit}
                    </button>
                    <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => void remove(a)}>
                      {t.common.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="overlay" onClick={() => setForm(null)}>
          <div
            className="dialog dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog__header">
              <h2 id="action-form-title" className="dialog__title">
                {editing ? t.actions.editTitle : t.actions.createTitle}
              </h2>
              <button type="button" className="btn btn--ghost btn--icon" aria-label={t.common.close} onClick={() => setForm(null)}>
                <CloseIcon />
              </button>
            </div>
            <div className="dialog__body">
              <label className="field">
                <span className="field__label">{t.actions.name}</span>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">{t.actions.description}</span>
                <input
                  className="input"
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <div className="field">
                <label className="field__label" htmlFor="action-trigger">
                  {t.actions.triggerType}
                </label>
                <Dropdown
                  id="action-trigger"
                  value={form.triggerType}
                  onChange={(v) => setForm({ ...form, triggerType: v as CustomActionInput['triggerType'] })}
                  options={TRIGGER_TYPES.map((tt) => ({ value: tt.value, label: t.triggerTypes[tt.value] }))}
                />
              </div>
              <div className="fields">
                <label className="field">
                  <span className="field__label">{t.actions.target}</span>
                  <input
                    className="input"
                    type="number"
                    min={TARGET_ANGLE_BOUND.min}
                    max={TARGET_ANGLE_BOUND.max}
                    value={form.targetAngle}
                    onChange={(e) => setForm({ ...form, targetAngle: parseFloat(e.target.value) })}
                    onBlur={(e) => setForm({ ...form, targetAngle: clampTargetAngle(parseFloat(e.target.value)) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t.actions.tolerance}</span>
                  <input
                    className="input"
                    type="number"
                    min={TOLERANCE_BOUND.min}
                    max={TOLERANCE_BOUND.max}
                    value={form.tolerance}
                    onChange={(e) => setForm({ ...form, tolerance: parseFloat(e.target.value) })}
                    onBlur={(e) => setForm({ ...form, tolerance: clampTolerance(parseFloat(e.target.value)) })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t.actions.holdMs}</span>
                  <input
                    className="input"
                    type="number"
                    min={HOLD_TIME_BOUND.min}
                    max={HOLD_TIME_BOUND.max}
                    step={100}
                    value={form.holdTimeMs}
                    onChange={(e) => setForm({ ...form, holdTimeMs: parseInt(e.target.value, 10) })}
                    onBlur={(e) => setForm({ ...form, holdTimeMs: clampHoldTimeMs(parseInt(e.target.value, 10)) })}
                  />
                </label>
              </div>
              {/* 安全上限:獨立於容錯的一個決定。空白 = 沿用舊的導出值,行為與過去相同。 */}
              <label className="field">
                <span className="field__label">{t.actions.safetyLabel(OVER_EXTENSION_MARGIN)}</span>
                <input
                  className="input"
                  type="number"
                  min={TARGET_ANGLE_BOUND.min}
                  max={180}
                  placeholder={t.actions.safetyPlaceholder(derivedLimit(form))}
                  value={form.safetyLimit ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, safetyLimit: e.target.value === '' ? null : parseFloat(e.target.value) })
                  }
                  onBlur={(e) =>
                    setForm({
                      ...form,
                      safetyLimit:
                        e.target.value === ''
                          ? null
                          : Math.min(180, Math.max(form.targetAngle + form.tolerance, parseFloat(e.target.value) || 0))
                    })
                  }
                />
                <span className="field__hint">{t.actions.safetyHint}</span>
              </label>

              {/* Record Pose:讓患者擺出要達成的姿勢,直接把當下數值收成目標角度 */}
              <div className="record-pose">
                {isConnected && liveMetric != null ? (
                  <>
                    <span>
                      {t.actions.recordLive(metricLabel(t, metricInfo(form.triggerType)))}
                      <strong>{liveMetric.toFixed(1)}°</strong>
                    </span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => setForm({ ...form, targetAngle: clampTargetAngle(Math.round(liveMetric)) })}
                    >
                      {t.actions.recordCapture}
                    </button>
                  </>
                ) : (
                  <span className="text-muted">{t.actions.recordHint}</span>
                )}
              </div>
            </div>
            <div className="dialog__footer">
              <button type="button" className="btn" onClick={() => setForm(null)}>
                {t.common.cancel}
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void save()}>
                {t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
