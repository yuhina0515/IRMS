// renderer/views/ActionsView.tsx
import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { JOINT_PROTOCOLS, TRIGGER_TYPES, type CustomAction, type CustomActionInput } from '@shared/types'
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

const blankForm = (protocol: CustomAction['protocol']): CustomActionInput => ({
  name: '',
  description: '',
  protocol,
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 3000,
  triggerType: 'joint_angle'
})

export function ActionsView(): JSX.Element {
  const actions = useStore((s) => s.customActions)
  const setCustomActions = useStore((s) => s.setCustomActions)
  const protocol = useStore((s) => s.settings.protocol)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)
  const requestConfirm = useUiStore((s) => s.requestConfirm)

  const [editing, setEditing] = useState<CustomAction | null>(null)
  const [form, setForm] = useState<CustomActionInput | null>(null)

  const filtered = actions.filter((a) => a.protocol === protocol)

  const reload = async (): Promise<void> => {
    setCustomActions(await window.irms.actions.list())
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
    // 儲存前一律鉗制:動作會被反覆載入使用,一個不合法的參數存進去會永久影響
    // 每一場用到它的 Session(負容錯 → rep 靜默永不前進)
    const safe = clampTriggerParams(form)
    try {
      if (editing) await window.irms.actions.update(editing.id, safe)
      else await window.irms.actions.create(safe)
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
    await window.irms.actions.delete(a.id)
    showToast('動作已刪除', 'success')
    await reload()
  }

  const restoreDefaults = async (): Promise<void> => {
    const ok = await requestConfirm('還原預設', '這將清除所有自訂動作並重建預設範本,確定嗎?')
    if (!ok) return
    setCustomActions(await window.irms.actions.restoreDefaults())
    showToast('已還原預設動作範本', 'success')
  }

  return (
    <>
      <header className="page-header">
        <h2>Custom Actions</h2>
        <p>管理各關節協定的復健動作範本</p>
      </header>

      <div className="row" style={{ marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={{ width: 220 }}>
          <GlassDropdown
            value={protocol}
            onChange={(v) => setSettings({ protocol: v as CustomAction['protocol'] })}
            options={JOINT_PROTOCOLS.map((p) => ({ value: p.value, label: p.label }))}
          />
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
            還原預設
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + 新增動作
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty glass panel">
          <p>此協定尚無動作範本</p>
          <button className="btn btn-secondary" onClick={() => void restoreDefaults()}>
            載入預設範本
          </button>
        </div>
      ) : (
        <div className="grid cards">
          {filtered.map((a) => (
            <div key={a.id} className="action-card glass">
              <h4>{a.name}</h4>
              <span className="badge">{a.triggerType}</span>
              <div className="meta">
                Target {a.targetAngle}° · Tol ±{a.tolerance}° · Hold {a.holdTimeMs}ms
              </div>
              {a.description && <div className="meta">{a.description}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(a)}>
                  Edit
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => void remove(a)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="overlay" onClick={() => setForm(null)}>
          <div className="modal glass" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Action' : 'Create Action'}</h3>
              <button className="close-x" onClick={() => setForm(null)}>
                ×
              </button>
            </div>
            <div className="field">
              <label>Name 動作名稱</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Description 說明</label>
              <input
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Trigger Type 判定規則</label>
              <GlassDropdown
                value={form.triggerType}
                onChange={(v) => setForm({ ...form, triggerType: v as CustomActionInput['triggerType'] })}
                options={TRIGGER_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>Target (°)</label>
                <input
                  type="number"
                  min={TARGET_ANGLE_BOUND.min}
                  max={TARGET_ANGLE_BOUND.max}
                  value={form.targetAngle}
                  onChange={(e) => setForm({ ...form, targetAngle: parseFloat(e.target.value) })}
                  onBlur={(e) =>
                    setForm({ ...form, targetAngle: clampTargetAngle(parseFloat(e.target.value)) })
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Tolerance (±°)</label>
                <input
                  type="number"
                  min={TOLERANCE_BOUND.min}
                  max={TOLERANCE_BOUND.max}
                  value={form.tolerance}
                  onChange={(e) => setForm({ ...form, tolerance: parseFloat(e.target.value) })}
                  onBlur={(e) =>
                    setForm({ ...form, tolerance: clampTolerance(parseFloat(e.target.value)) })
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Hold (ms)</label>
                <input
                  type="number"
                  min={HOLD_TIME_BOUND.min}
                  max={HOLD_TIME_BOUND.max}
                  step={100}
                  value={form.holdTimeMs}
                  onChange={(e) => setForm({ ...form, holdTimeMs: parseInt(e.target.value, 10) })}
                  onBlur={(e) =>
                    setForm({ ...form, holdTimeMs: clampHoldTimeMs(parseInt(e.target.value, 10)) })
                  }
                />
              </div>
            </div>
            <div className="actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setForm(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => void save()}>
                儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
