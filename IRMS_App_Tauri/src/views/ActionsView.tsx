// renderer/views/ActionsView.tsx
// UI v3 動作處方 (PROPOSAL §4 Actions): paged list on the left, inspector on the right. The list
// never scrolls the page — page size follows the measured list height; editing happens in the
// inspector (its form body is the view's one scrolling region) instead of a modal.
import { useEffect, useRef, useState } from 'react'
import { usePageSize } from '../hooks/usePageSize'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS, TRIGGER_TYPES, type CustomAction, type CustomActionInput } from '@shared/types'
import { countActions, filterSortGroupActions, type ActionGroupBy, type ActionSortBy } from '../services/actionQuery'
import { GlassDropdown } from '../components/GlassDropdown'
import {
  HOLD_TIME_BOUND,
  TARGET_ANGLE_BOUND,
  TOLERANCE_BOUND,
  clampHoldTimeMs,
  clampTargetAngle,
  clampTolerance,
  clampTriggerParams
} from '@shared/validation'
import { computeMetricSample, metricInfo } from '../services/movementMetric'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { irms } from '../platform/irmsApi'
import { formatNumber, useLocale, useT, type Locale, type Messages } from '../i18n'

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

const ROW_HEIGHT = 84
const HEADING_HEIGHT = 36

function targetText(a: CustomActionInput): string {
  return a.triggerType === 'joint_angle' ? `${a.targetAngle}° ±${a.tolerance}°` : `≥ ${a.targetAngle}°`
}

function holdText(m: Messages, locale: Locale, holdTimeMs: number): string {
  return m.common.seconds({ n: formatNumber(locale, holdTimeMs / 1000) })
}

type ListItem = { kind: 'heading'; key: string; label: string } | { kind: 'action'; action: CustomAction }

export function ActionsView(): JSX.Element {
  const actions = useStore((s) => s.customActions)
  const setCustomActions = useStore((s) => s.setCustomActions)
  const protocol = useStore((s) => s.settings.protocol)
  const setSettings = useStore((s) => s.setSettings)
  const selectAction = useStore((s) => s.selectAction)
  const running = useStore((s) => s.session.running)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)
  const setView = useUiStore((s) => s.setView)
  const m = useT()
  const locale = useLocale()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<CustomAction | null>(null)
  const [form, setForm] = useState<CustomActionInput | null>(null)

  // Record Pose:讓患者擺出要達成的姿勢,直接把當下數值收成目標角度——
  // 否則治療師只能在感測器已綁上的情況下「盲打」目標,這是錯誤目標的最大來源。
  const angles = useStore((s) => s.angles)
  const isConnected = useStore((s) => s.isConnected)
  const liveMetric = angles == null || form == null ? null : computeMetricSample(angles, form.triggerType, form.tolerance).value

  useEscapeKey(form ? () => setForm(null) : null)

  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<ActionSortBy>('name')
  const [groupBy, setGroupBy] = useState<ActionGroupBy>('none')
  const [page, setPage] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const pageRows = usePageSize(listRef, ROW_HEIGHT)

  const inProtocol = actions.filter((a) => a.protocol === protocol)
  const groups = filterSortGroupActions(inProtocol, { query, sortBy, groupBy })
  const total = countActions(groups)

  // Flatten into rows; group headings consume page capacity (PROPOSAL: no new page scroll).
  const items: ListItem[] = groups.flatMap((g) => [
    ...(g.key ? [{ kind: 'heading' as const, key: g.key, label: m.clinical.triggerShort[g.key] }] : []),
    ...g.actions.map((a) => ({ kind: 'action' as const, action: a }))
  ])
  const capacity = Math.max(1, pageRows)
  const pages: ListItem[][] = []
  let used = 0
  for (const it of items) {
    const cost = it.kind === 'heading' ? HEADING_HEIGHT / ROW_HEIGHT : 1
    if (pages.length === 0 || used + cost > capacity) {
      pages.push([])
      used = 0
    }
    pages[pages.length - 1].push(it)
    used += cost
  }
  const pageCount = Math.max(1, pages.length)
  const currentPage = Math.min(page, pageCount - 1)
  useEffect(() => setPage(0), [query, sortBy, groupBy, protocol])

  const selected = inProtocol.find((a) => a.id === selectedId) ?? null

  const reload = async (): Promise<void> => {
    setCustomActions(await irms.actions.list())
  }
  const openCreate = (): void => {
    setEditing(null)
    setForm(blankForm(protocol))
  }
  const openEdit = (a: CustomAction): void => {
    setEditing(a)
    setForm({ ...a })
  }

  const save = async (): Promise<void> => {
    if (!form) return
    if (!form.name.trim()) {
      showToast(m.actions.nameRequired, 'warning')
      return
    }
    // 儲存前一律鉗制:一個不合法的參數存進去會永久影響每一場用到它的療程
    const safe = clampTriggerParams(form)
    try {
      if (editing) await irms.actions.update(editing.id, safe)
      else await irms.actions.create(safe)
      showToast(editing ? m.actions.updated : m.actions.created, 'success')
      setForm(null)
      await reload()
    } catch {
      showToast(m.actions.saveFailed, 'error')
    }
  }

  const remove = async (a: CustomAction): Promise<void> => {
    const ok = await requestConfirm(m.actions.deleteTitle, m.actions.deleteBody({ name: a.name }))
    if (!ok) return
    await irms.actions.delete(a.id)
    showToast(m.actions.deleted, 'success')
    setSelectedId(null)
    await reload()
  }

  const restoreDefaults = async (): Promise<void> => {
    const ok = await requestConfirm(m.actions.restoreTitle, m.actions.restoreBody)
    if (!ok) return
    setCustomActions(await irms.actions.restoreDefaults())
    showToast(m.actions.restored, 'success')
  }

  const useNow = (a: CustomAction): void => {
    selectAction(a.id)
    setView('dashboard')
  }

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>{m.actions.title}</h1>
          <p>{m.actions.subtitle}</p>
        </div>
        <div className="v3-page-actions">
          <div style={{ width: 200 }}>
            <GlassDropdown
              value={protocol}
              onChange={(v) => setSettings({ protocol: v as CustomAction['protocol'] })}
              options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: m.clinical.protocol[p.value] }))}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
            {m.actions.restore}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            {m.actions.add}
          </button>
        </div>
      </div>

      {/* has-detail: narrow widths show list OR inspector (master/detail), never both squeezed */}
      <section className={`v3-sheet v3-actions${form || selected ? ' has-detail' : ''}`}>
        <div className="v3-actions-list">
          {/* 只有這個協定底下真的有動作時才顯示搜尋——在空集合上方擺搜尋框沒有意義 */}
          {inProtocol.length > 0 && (
            <div className="v3-actions-toolbar">
              <input
                type="search"
                placeholder={m.actions.searchPlaceholder}
                aria-label={m.actions.searchAria}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div style={{ width: 140 }}>
                <GlassDropdown
                  value={sortBy}
                  onChange={(v) => setSortBy(v as ActionSortBy)}
                  options={[
                    { value: 'name', label: m.actions.sortName },
                    { value: 'target', label: m.actions.sortTarget },
                    { value: 'created', label: m.actions.sortCreated }
                  ]}
                />
              </div>
              <div style={{ width: 140 }}>
                <GlassDropdown
                  value={groupBy}
                  onChange={(v) => setGroupBy(v as ActionGroupBy)}
                  options={[
                    { value: 'none', label: m.actions.groupNone },
                    { value: 'triggerType', label: m.actions.groupTrigger }
                  ]}
                />
              </div>
            </div>
          )}
          <div className="v3-actions-rows" ref={listRef}>
            {total === 0 ? (
              <div className="v3-empty">
                {/* 「沒有動作」與「搜尋不到」是兩件事,出口也不同 */}
                {inProtocol.length === 0 ? (
                  <>
                    <p>{m.actions.emptyProtocol}</p>
                    <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
                      {m.actions.loadDefaults}
                    </button>
                  </>
                ) : (
                  <>
                    <p>{m.actions.noMatch({ query: query.trim() })}</p>
                    <button className="btn btn-secondary" onClick={() => setQuery('')}>
                      {m.actions.clearSearch}
                    </button>
                  </>
                )}
              </div>
            ) : (
              (pages[currentPage] ?? []).map((it) =>
                it.kind === 'heading' ? (
                  <h3 key={`h-${it.key}`} className="v3-actions-heading">
                    {it.label}
                  </h3>
                ) : (
                  <button
                    key={it.action.id}
                    className="v3-action-row"
                    aria-pressed={it.action.id === selectedId}
                    onClick={() => {
                      setSelectedId(it.action.id)
                      setForm(null)
                    }}
                  >
                    <span className="v3-action-name">
                      <span className="v3-action-title">{it.action.name}</span>
                      <span className="v3-chip neutral">{m.clinical.triggerShort[it.action.triggerType]}</span>
                    </span>
                    <span className="v3-action-cells">
                      <span>
                        <em>{m.actions.target}</em>
                        {targetText(it.action)}
                      </span>
                      <span>
                        <em>{m.actions.hold}</em>
                        {holdText(m, locale, it.action.holdTimeMs)}
                      </span>
                    </span>
                  </button>
                )
              )
            )}
          </div>
          <div className="v3-pager">
            <span>
              {m.actions.pager({ total, page: currentPage + 1, pages: pageCount })}
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                {m.common.prevPage}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                {m.common.nextPage}
              </button>
            </span>
          </div>
        </div>

        <aside className="v3-inspector" aria-label={m.actions.inspectorAria}>
          {form ? (
            <>
              <header className="v3-inspector-head">
                <h2>{editing ? m.actions.editTitle : m.actions.newTitle}</h2>
              </header>
              <div className="v3-inspector-body v3-scroll">
                <div className="field">
                  <label htmlFor="act-name">{m.actions.name}</label>
                  <input id="act-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="act-desc">{m.actions.description}</label>
                  <input
                    id="act-desc"
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>{m.actions.triggerRule}</label>
                  <GlassDropdown
                    value={form.triggerType}
                    onChange={(v) => setForm({ ...form, triggerType: v as CustomActionInput['triggerType'] })}
                    options={TRIGGER_TYPES.map((t) => ({
                      value: t.value,
                      label: `${m.clinical.triggerShort[t.value]} · ${m.clinical.triggerLong[t.value]}`
                    }))}
                  />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="act-target">{m.actions.targetDeg}</label>
                    <input
                      id="act-target"
                      type="number"
                      min={TARGET_ANGLE_BOUND.min}
                      max={TARGET_ANGLE_BOUND.max}
                      value={form.targetAngle}
                      onChange={(e) => setForm({ ...form, targetAngle: parseFloat(e.target.value) })}
                      onBlur={(e) => setForm({ ...form, targetAngle: clampTargetAngle(parseFloat(e.target.value)) })}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="act-tol">{m.actions.tolerance}</label>
                    <input
                      id="act-tol"
                      type="number"
                      min={TOLERANCE_BOUND.min}
                      max={TOLERANCE_BOUND.max}
                      value={form.tolerance}
                      onChange={(e) => setForm({ ...form, tolerance: parseFloat(e.target.value) })}
                      onBlur={(e) => setForm({ ...form, tolerance: clampTolerance(parseFloat(e.target.value)) })}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="act-hold">{m.actions.holdSec}</label>
                    <input
                      id="act-hold"
                      type="number"
                      min={HOLD_TIME_BOUND.min / 1000}
                      max={HOLD_TIME_BOUND.max / 1000}
                      step={0.1}
                      value={form.holdTimeMs / 1000}
                      onChange={(e) => setForm({ ...form, holdTimeMs: Math.round(parseFloat(e.target.value) * 1000) })}
                      onBlur={(e) =>
                        setForm({ ...form, holdTimeMs: clampHoldTimeMs(Math.round(parseFloat(e.target.value) * 1000)) })
                      }
                    />
                  </div>
                </div>
                <div className="record-pose">
                  {isConnected && liveMetric != null ? (
                    <>
                      <span className="record-pose-live">
                        {m.actions.currentMetric({ label: metricInfo(form.triggerType, locale).label })}
                        <strong>{formatNumber(locale, liveMetric)}°</strong>
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setForm({ ...form, targetAngle: clampTargetAngle(Math.round(liveMetric)) })}
                      >
                        {m.actions.capture}
                      </button>
                    </>
                  ) : (
                    <span className="field-hint">{m.actions.captureHint}</span>
                  )}
                </div>
              </div>
              <footer className="v3-inspector-foot">
                <button className="btn btn-secondary" onClick={() => setForm(null)}>
                  {m.common.cancel}
                </button>
                <button className="btn btn-primary" onClick={() => void save()}>
                  {m.common.save}
                </button>
              </footer>
            </>
          ) : selected ? (
            <>
              <header className="v3-inspector-head">
                <button className="btn btn-secondary btn-sm v3-inspector-back" onClick={() => setSelectedId(null)}>
                  {m.common.backToList}
                </button>
                <h2>{selected.name}</h2>
                <span className="v3-chip neutral">{m.clinical.triggerShort[selected.triggerType]}</span>
              </header>
              <div className="v3-inspector-body v3-scroll">
                <dl className="v3-facts">
                  <div>
                    <dt>{m.actions.target}</dt>
                    <dd>{targetText(selected)}</dd>
                  </div>
                  <div>
                    <dt>{m.actions.hold}</dt>
                    <dd>{holdText(m, locale, selected.holdTimeMs)}</dd>
                  </div>
                </dl>
                {selected.triggerType !== 'joint_angle' && (
                  <p className="field-hint">
                    {m.clinical.segmentKneeHint({ max: String(Math.max(15, selected.tolerance)) })}
                  </p>
                )}
                <p className="v3-inspector-desc">{selected.description || m.actions.noDescription}</p>
              </div>
              <footer className="v3-inspector-foot">
                <button className="btn btn-danger-ghost" onClick={() => void remove(selected)}>
                  {m.common.delete}
                </button>
                <button className="btn btn-secondary" onClick={() => openEdit(selected)}>
                  {m.common.edit}
                </button>
                <button className="btn btn-primary" disabled={running} onClick={() => useNow(selected)}>
                  {m.actions.useLive}
                </button>
              </footer>
            </>
          ) : (
            <div className="v3-empty">
              <p>{m.actions.emptyInspector}</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
