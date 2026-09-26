// renderer/views/ActionsView.tsx
// UI v3 動作處方 (PROPOSAL §4 Actions): paged list on the left, inspector on the right. The list
// never scrolls the page — page size follows the measured list height; editing happens in the
// inspector (its form body is the view's one scrolling region) instead of a modal.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import { computeMetricSample, computeMetricZone, metricInfo, OVER_EXTENSION_MARGIN } from '../services/movementMetric'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { irms } from '../platform/irmsApi'
import { TRIGGER_SHORT } from './actionLabels'

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

/** Effective over-limit threshold the engine will use — never the raw field alone. */
function effectiveLimit(a: CustomActionInput): number {
  return computeMetricZone({ ...a, safetyLimit: a.safetyLimit ?? null }).overLimit
}

function targetText(a: CustomActionInput): string {
  return a.triggerType === 'joint_angle' ? `${a.targetAngle}° ±${a.tolerance}°` : `≥ ${a.targetAngle}°`
}

/** Measures how many rows fit in the list body so the page never grows past the window. */
function usePageSize(ref: React.RefObject<HTMLElement>): number {
  const [size, setSize] = useState(4)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setSize(Math.max(1, Math.floor(el.clientHeight / ROW_HEIGHT)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
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
  const pageRows = usePageSize(listRef)

  const inProtocol = actions.filter((a) => a.protocol === protocol)
  const groups = filterSortGroupActions(inProtocol, { query, sortBy, groupBy })
  const total = countActions(groups)

  // Flatten into rows; group headings consume page capacity (PROPOSAL: no new page scroll).
  const items: ListItem[] = groups.flatMap((g) => [
    ...(g.key ? [{ kind: 'heading' as const, key: g.key, label: TRIGGER_SHORT[g.key] }] : []),
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
      showToast('動作名稱不可為空', 'warning')
      return
    }
    // 儲存前一律鉗制:一個不合法的參數存進去會永久影響每一場用到它的療程
    const safe = clampTriggerParams(form)
    try {
      if (editing) await irms.actions.update(editing.id, safe)
      else await irms.actions.create(safe)
      showToast(editing ? '動作已更新' : '動作已建立', 'success')
      setForm(null)
      await reload()
    } catch {
      showToast('儲存失敗', 'error')
    }
  }

  const remove = async (a: CustomAction): Promise<void> => {
    const ok = await requestConfirm('刪除動作', `確定要刪除「${a.name}」嗎?此操作不可撤銷。`)
    if (!ok) return
    await irms.actions.delete(a.id)
    showToast('動作已刪除', 'success')
    setSelectedId(null)
    await reload()
  }

  const restoreDefaults = async (): Promise<void> => {
    const ok = await requestConfirm('還原預設', '這將清除所有自訂動作並重建預設範本,確定嗎?')
    if (!ok) return
    setCustomActions(await irms.actions.restoreDefaults())
    showToast('已還原預設動作範本', 'success')
  }

  const useNow = (a: CustomAction): void => {
    selectAction(a.id)
    setView('dashboard')
  }

  return (
    <div className="v3-page">
      <div className="v3-page-head">
        <div>
          <h1>動作處方</h1>
          <p>每個動作都寫清楚目標、保持時間與超限門檻。</p>
        </div>
        <div className="v3-page-actions">
          <div style={{ width: 200 }}>
            <GlassDropdown
              value={protocol}
              onChange={(v) => setSettings({ protocol: v as CustomAction['protocol'] })}
              options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </div>
          <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
            還原預設
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + 新增動作
          </button>
        </div>
      </div>

      <section className="v3-sheet v3-actions">
        <div className="v3-actions-list">
          {/* 只有這個協定底下真的有動作時才顯示搜尋——在空集合上方擺搜尋框沒有意義 */}
          {inProtocol.length > 0 && (
            <div className="v3-actions-toolbar">
              <input
                type="search"
                placeholder="搜尋名稱或說明…"
                aria-label="搜尋動作"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div style={{ width: 140 }}>
                <GlassDropdown
                  value={sortBy}
                  onChange={(v) => setSortBy(v as ActionSortBy)}
                  options={[
                    { value: 'name', label: '依名稱' },
                    { value: 'target', label: '依目標角度' },
                    { value: 'created', label: '依建立順序' }
                  ]}
                />
              </div>
              <div style={{ width: 140 }}>
                <GlassDropdown
                  value={groupBy}
                  onChange={(v) => setGroupBy(v as ActionGroupBy)}
                  options={[
                    { value: 'none', label: '不分組' },
                    { value: 'triggerType', label: '依判定型別' }
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
                    <p>此協定尚無動作範本</p>
                    <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
                      載入預設範本
                    </button>
                  </>
                ) : (
                  <>
                    <p>找不到符合「{query.trim()}」的動作</p>
                    <button className="btn btn-secondary" onClick={() => setQuery('')}>
                      清除搜尋
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
                      {it.action.name}
                      <span className="v3-chip neutral">{TRIGGER_SHORT[it.action.triggerType]}</span>
                    </span>
                    <span className="v3-action-cells">
                      <span>
                        <em>目標</em>
                        {targetText(it.action)}
                      </span>
                      <span>
                        <em>保持</em>
                        {(it.action.holdTimeMs / 1000).toFixed(1)} 秒
                      </span>
                      <span>
                        <em>超限</em>
                        {effectiveLimit(it.action).toFixed(0)}°{it.action.safetyLimit == null ? '(導出)' : ''}
                      </span>
                    </span>
                  </button>
                )
              )
            )}
          </div>
          <div className="v3-pager">
            <span>
              共 {total} 個動作 · 第 {currentPage + 1} / {pageCount} 頁
            </span>
            <span className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                上一頁
              </button>
              <button
                className="btn btn-secondary btn-sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                下一頁
              </button>
            </span>
          </div>
        </div>

        <aside className="v3-inspector" aria-label="動作內容">
          {form ? (
            <>
              <header className="v3-inspector-head">
                <h2>{editing ? '編輯動作' : '新增動作'}</h2>
              </header>
              <div className="v3-inspector-body v3-scroll">
                <div className="field">
                  <label htmlFor="act-name">動作名稱</label>
                  <input id="act-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor="act-desc">說明</label>
                  <input
                    id="act-desc"
                    value={form.description ?? ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>判定規則</label>
                  <GlassDropdown
                    value={form.triggerType}
                    onChange={(v) => setForm({ ...form, triggerType: v as CustomActionInput['triggerType'] })}
                    options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: `${TRIGGER_SHORT[t.value]} · ${t.label}` }))}
                  />
                </div>
                <div className="row">
                  <div className="field" style={{ flex: 1 }}>
                    <label htmlFor="act-target">目標 (°)</label>
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
                    <label htmlFor="act-tol">容許 (±°)</label>
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
                    <label htmlFor="act-hold">保持 (秒)</label>
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
                {/* 安全上限獨立於容錯:空白 = 沿用導出值 target + tolerance + margin */}
                <div className="field">
                  <label htmlFor="act-limit">安全上限 (°) — 留空則沿用 目標 + 容許 + {OVER_EXTENSION_MARGIN}</label>
                  <input
                    id="act-limit"
                    type="number"
                    min={TARGET_ANGLE_BOUND.min}
                    max={180}
                    placeholder={`未設定(目前導出為 ${form.targetAngle + form.tolerance + OVER_EXTENSION_MARGIN}°)`}
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
                  <p className="field-hint">
                    超過此角度會觸發長鳴警報。這是解剖上的上限,與「算不算達標」無關——放寬容許時<b>不應</b>連帶外推。
                  </p>
                </div>
                <div className="record-pose">
                  {isConnected && liveMetric != null ? (
                    <>
                      <span className="record-pose-live">
                        目前 {metricInfo(form.triggerType).label}:<strong>{liveMetric.toFixed(1)}°</strong>
                      </span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setForm({ ...form, targetAngle: clampTargetAngle(Math.round(liveMetric)) })}
                      >
                        擷取目前角度為目標
                      </button>
                    </>
                  ) : (
                    <span className="field-hint">連線裝置後,可讓患者擺出目標姿勢並一鍵擷取角度,不必憑空輸入</span>
                  )}
                </div>
              </div>
              <footer className="v3-inspector-foot">
                <button className="btn btn-secondary" onClick={() => setForm(null)}>
                  取消
                </button>
                <button className="btn btn-primary" onClick={() => void save()}>
                  儲存
                </button>
              </footer>
            </>
          ) : selected ? (
            <>
              <header className="v3-inspector-head">
                <h2>{selected.name}</h2>
                <span className="v3-chip neutral">{TRIGGER_SHORT[selected.triggerType]}</span>
              </header>
              <div className="v3-inspector-body v3-scroll">
                <dl className="v3-facts">
                  <div>
                    <dt>目標</dt>
                    <dd>{targetText(selected)}</dd>
                  </div>
                  <div>
                    <dt>保持</dt>
                    <dd>{(selected.holdTimeMs / 1000).toFixed(1)} 秒</dd>
                  </div>
                  <div>
                    <dt>超限門檻</dt>
                    <dd>
                      {effectiveLimit(selected).toFixed(0)}°{selected.safetyLimit == null ? '(導出)' : ''}
                    </dd>
                  </div>
                </dl>
                {selected.triggerType !== 'joint_angle' && (
                  <p className="field-hint">肢段動作另需膝蓋保持近直(≤ {Math.max(15, selected.tolerance)}°)。</p>
                )}
                <p className="v3-inspector-desc">{selected.description || '沒有說明。'}</p>
              </div>
              <footer className="v3-inspector-foot">
                <button className="btn btn-danger-ghost" onClick={() => void remove(selected)}>
                  刪除
                </button>
                <button className="btn btn-secondary" onClick={() => openEdit(selected)}>
                  編輯
                </button>
                <button className="btn btn-primary" disabled={running} onClick={() => useNow(selected)}>
                  用於即時監測
                </button>
              </footer>
            </>
          ) : (
            <div className="v3-empty">
              <p>選擇左側的動作查看內容,或新增一個動作。</p>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
