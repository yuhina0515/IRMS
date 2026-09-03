// renderer/views/DashboardView.tsx
// 引導式 Dashboard:畫面圍繞「選定動作的主指標」——量表 + 教練提示 + 進度;下方是
// Gemini round-2 規格的「Cockpit」即時資料區(2026-09-02,取代原本 4 選 1 的單一 tab
// 卡片):左欄(圖表/詳細數值互切)+ 右欄(3D/2D 姿態互切)常駐並排,不再是四選一。
import { useRef, useState } from 'react'
import { isProtocolSupported } from '@shared/types'
import { useStore } from '../store/useStore'
import { computeMetricSample, computeMetricZone, metricInfo } from '../services/movementMetric'
import { computeGuidance, guidanceText } from '../services/guidance'
import { LiveChart } from '../components/LiveChart'
import { AngleVisualizer } from '../components/AngleVisualizer'
import { Leg3D } from '../components/Leg3D'
import { MetricGauge } from '../components/MetricGauge'
import { CoachHint } from '../components/CoachHint'
import { ProgressRing } from '../components/ProgressRing'
import { SessionControlPanel } from '../components/SessionControlPanel'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { useLiquidKnob } from '../components/LiquidKnob'
import { sessionController } from '../services/sessionController'

type LeftTab = 'chart' | 'detail'
type RightTab = '3d' | '2d'

const LEFT_TABS: { id: LeftTab; label: string }[] = [
  { id: 'chart', label: '趨勢圖' },
  { id: 'detail', label: '詳細數值' }
]
const RIGHT_TABS: { id: RightTab; label: string }[] = [
  { id: '3d', label: '3D 姿態' },
  { id: '2d', label: '2D 姿態' }
]

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }): JSX.Element {
  return (
    <div className="panel glass stat">
      <div className="label">{label}</div>
      <div className={`value ${cls ?? ''}`}>{value}</div>
    </div>
  )
}

export function DashboardView(): JSX.Element {
  const angles = useStore((s) => s.angles)
  const hardwareError = useStore((s) => s.hardwareError)
  const session = useStore((s) => s.session)
  const params = useStore((s) => s.params)
  const isConnected = useStore((s) => s.isConnected)
  const lastCalibratedAt = useStore((s) => s.settings.lastCalibratedAt)
  const protocol = useStore((s) => s.settings.protocol)
  const action = useStore((s) => s.customActions.find((a) => a.id === s.selectedActionId))

  const [leftTab, setLeftTab] = useState<LeftTab>('chart')
  const [rightTab, setRightTab] = useState<RightTab>('3d')
  const [wizardOpen, setWizardOpen] = useState(false)
  const leftTabsRef = useRef<HTMLDivElement>(null)
  const rightTabsRef = useRef<HTMLDivElement>(null)
  const left = useLiquidKnob({
    containerRef: leftTabsRef,
    activeKey: leftTab,
    orientation: 'horizontal',
    onSelect: (key) => setLeftTab(key as LeftTab)
  })
  const right = useLiquidKnob({
    containerRef: rightTabsRef,
    activeKey: rightTab,
    orientation: 'horizontal',
    onSelect: (key) => setRightTab(key as RightTab)
  })

  const triggerType = action?.triggerType ?? 'joint_angle'
  const info = metricInfo(triggerType)
  // 必須帶上動作的 safetyLimit,否則量表畫的超限刻線會與引擎實際判定的門檻不一致
  const zone = computeMetricZone({ ...params, triggerType, safetyLimit: action?.safetyLimit ?? null })
  const sample = angles && !hardwareError ? computeMetricSample(angles, triggerType, params.tolerance) : null

  const protocolOk = isProtocolSupported(protocol)

  const guidance = computeGuidance(sample, zone, session.phase, session.holdProgress, params.holdTimeMs)
  // 未支援的協定排在連線之前:接上裝置也不會讓它變成可用的量測,先叫使用者
  // 去連線等於把人推向一條走不通的路。
  const hintText = hardwareError
    ? '硬體異常,等待感測器復原…'
    : !protocolOk
      ? '此協定尚未支援,請於設定切換回膝關節'
      : !isConnected
        ? '請先於頂部連線裝置'
        : !action
          ? '請先選擇復健動作'
          : guidanceText(guidance, info)
  const tone: 'normal' | 'success' | 'danger' =
    hardwareError || session.alarmActive ? 'danger' : session.phase === 'holding' ? 'success' : 'normal'

  const fmt = (n: number | undefined): string =>
    hardwareError ? 'ERR' : n === undefined ? '--' : `${n.toFixed(1)}°`

  return (
    <>
      <header className="page-header">
        <h2>Guided Monitoring</h2>
        <p>圍繞當前動作的主指標即時引導復健</p>
      </header>

      {lastCalibratedAt == null && (
        <div className="calib-chip" onClick={() => setWizardOpen(true)}>
          ⚠ 感測器尚未校準——偵測與顯示方向可能不正確,點此啟動校準精靈
        </div>
      )}
      {/* 2026-08-01 會議連帶決議:移除「內外翻方向未驗證」警示。
          roll 完全不進入任何判定路徑——computeMetricSample 只讀 thigh/knee,
          三種 triggerType 全是 pitch 導向,連 overLimit 都是從 sample.value 算的。
          在判定不讀方向的畫面上宣稱「方向未驗證」是一個假的負面訊號,只會訓練
          使用者忽略警告。roll 影響的僅有 3D 模型、詳細數值、History 疊圖與 CSV,
          該提示已移至 Settings 的 3D 顯示區塊,語意改為「僅影響顯示」。 */}

      <div className="grid dashboard-grid">
        <div className="panel glass glass-elevated">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div className="metric-action">{action?.name ?? '未選擇動作'}</div>
              <div className="metric-sub">主指標:{info.label}</div>
            </div>
          </div>
          <MetricGauge
            sample={sample}
            zone={zone}
            info={info}
            phase={session.phase}
            alarm={session.alarmActive}
            error={hardwareError != null}
            stale={!isConnected}
            unsupported={!protocolOk}
          />
          <CoachHint phase={session.phase} text={hintText} tone={tone} />
        </div>

        <div className="grid" style={{ gap: 24 }}>
          <div className="panel glass" style={{ textAlign: 'center' }}>
            <ProgressRing percent={session.holdProgress} reps={session.reps} />
            {session.alarmActive && (
              <div style={{ marginTop: 10 }}>
                <p className="text-danger" style={{ fontWeight: 600, marginBottom: 8 }}>
                  ⚠ 超限警報
                </p>
                {/* 蜂鳴器綁在患者腿上,必須有軟體開關;靜音是暫時的,仍超限時會自動重新鳴響 */}
                <button className="btn btn-danger" onClick={() => sessionController.silenceAlarm()}>
                  🔕 靜音 30 秒
                </button>
              </div>
            )}
          </div>
          <SessionControlPanel />
        </div>
      </div>

      {/* Cockpit:常駐並排,不再是四選一的單一卡片(Gemini round-2 規格)。外層容器
          刻意不掛卡片背景,直接坐在畫面底色上,靠上方 border-t 跟上面的摘要卡片分隔;
          左右兩欄各自才是真正的卡片容器。 */}
      <div className="cockpit">
        <div className="cockpit-panel panel glass">
          <div className="tabs" ref={leftTabsRef}>
            {left.knobElement}
            {LEFT_TABS.map((t) => (
              <button
                key={t.id}
                data-knob-key={t.id}
                className={`tab-btn${leftTab === t.id ? ' active' : ''}`}
                onClick={() => setLeftTab(t.id)}
                {...left.getItemProps(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {leftTab === 'chart' && <LiveChart />}
          {leftTab === 'detail' && (
            <div className="grid cards">
              <Stat label="Thigh 大腿" value={fmt(angles?.thigh)} cls="color-thigh" />
              <Stat label="Shin 小腿" value={fmt(angles?.shin)} cls="color-shin" />
              <Stat label="Knee 夾角" value={fmt(angles?.knee)} cls="color-accent" />
              <Stat label="Thigh Roll" value={fmt(angles?.thighRoll)} />
              <Stat label="Shin Roll" value={fmt(angles?.shinRoll)} />
              <Stat
                label="Varus/Valgus 內外翻"
                value={
                  hardwareError
                    ? 'ERR'
                    : angles == null
                      ? '--'
                      : `${Math.abs(angles.kneeRoll).toFixed(1)}° ${angles.kneeRoll >= 0 ? '外翻' : '內翻'}`
                }
              />
            </div>
          )}
        </div>

        <div className="cockpit-panel cockpit-panel-3d panel glass">
          <div className="tabs" ref={rightTabsRef}>
            {right.knobElement}
            {RIGHT_TABS.map((t) => (
              <button
                key={t.id}
                data-knob-key={t.id}
                className={`tab-btn${rightTab === t.id ? ' active' : ''}`}
                onClick={() => setRightTab(t.id)}
                {...right.getItemProps(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {rightTab === '3d' && <Leg3D />}
          {rightTab === '2d' && <AngleVisualizer />}
        </div>
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </>
  )
}
