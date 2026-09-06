// renderer/views/DashboardView.tsx
// 引導式 Dashboard:畫面圍繞「選定動作的主指標」——量表 + 教練提示 + 進度;下方是
// 「Cockpit」即時資料區:左欄(圖表/詳細數值互切)+ 右欄(3D/2D 姿態互切)常駐並排。
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

interface DetailStatsGridProps {
  angles: ReturnType<typeof useStore.getState>['angles']
  hardwareError: string | null
}

// 抽成獨立元件:同一組數值卡片有兩個各自獨立的出現位置——一般尺寸下作為左欄
// 「詳細數值」分頁的內容,container 極窄時作為強制數字回退(numeric fallback)——
// 抽出來避免兩處各寫一份一樣的 6 張 Stat 卡片,以後改欄位只需要改一個地方。
function DetailStatsGrid({ angles, hardwareError }: DetailStatsGridProps): JSX.Element {
  const fmt = (n: number | undefined): string =>
    hardwareError ? 'ERR' : n === undefined ? '--' : `${n.toFixed(1)}°`
  return (
    <div className="grid cards w-full">
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
  // 兩者預設收起(見 useStore.ts 的欄位註解),Settings 可個別開啟
  const showTrendChart = useStore((s) => s.settings.showTrendChart)
  const show3D2DPose = useStore((s) => s.settings.show3D2DPose)

  const [leftTab, setLeftTab] = useState<LeftTab>('chart')
  const [rightTab, setRightTab] = useState<RightTab>('3d')
  // 趨勢圖被關掉時,「chart」根本不在可見分頁清單裡——不額外用 useEffect 同步
  // leftTab state,單純渲染時算出「實際要顯示哪一個」,設定切回開啟時自然復原。
  const visibleLeftTabs = showTrendChart ? LEFT_TABS : LEFT_TABS.filter((t) => t.id !== 'chart')
  const effectiveLeftTab: LeftTab = !showTrendChart && leftTab === 'chart' ? 'detail' : leftTab
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

  return (
    <div className="dash-shell">
      <header className="page-header">
        <h2>Guided Monitoring</h2>
        <p>圍繞當前動作的主指標即時引導復健</p>
      </header>

      {lastCalibratedAt == null && (
        <div className="calib-chip" onClick={() => setWizardOpen(true)}>
          ⚠ 感測器尚未校準——偵測與顯示方向可能不正確,點此啟動校準精靈
        </div>
      )}
      {/* 內外翻方向未驗證的警示不放在這裡:roll 完全不進入任何判定路徑——
          computeMetricSample 只讀 thigh/knee,三種 triggerType 全是 pitch 導向。
          在判定不讀方向的畫面上宣稱「方向未驗證」是一個假的負面訊號。roll 影響的
          僅有 3D 模型、詳細數值、History 疊圖與 CSV,相關提示已移至 Settings 的
          3D 顯示區塊。 */}

      {/* 由上而下的絕對空間分配:.dashboard-workspace 是唯一吃「剩餘空間」
          (flex-1 min-h-0)的節點,底下用 container query 依「這個容器實際還剩多少
          高度」切三種 layout preset,而不是猜視窗總尺寸——calib-chip 這類條件渲染的
          橫幅多佔的高度,會自動從這個容器的剩餘空間扣掉,不需要另外為它調整任何常數。
          單一 .dashboard-grid 用 grid-template-areas 佈五個語意格(gauge/ring/
          chart/pose/numeric)——preset B(窄筆電高度)需要把量表、控制環、cockpit
          排成同一橫排,分開的 grid 做不到這件事。 */}
      <div className="dashboard-workspace">
        <div
          className={`dashboard-grid${show3D2DPose ? '' : ' no-pose'}`}
        >
          <div
            className={`dash-cell-gauge panel glass glass-elevated${isConnected ? '' : ' panel-stale'}`}
          >
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

          <div className="dash-cell-ring panel glass">
            {session.alarmActive && (
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <p className="text-danger" style={{ fontWeight: 600, margin: 0 }}>
                  ⚠ 超限警報
                </p>
                {/* 蜂鳴器綁在患者腿上,必須有軟體開關;靜音是暫時的,仍超限時會自動重新鳴響 */}
                <button className="btn btn-danger" onClick={() => sessionController.silenceAlarm()}>
                  🔕 靜音 30 秒
                </button>
              </div>
            )}
            <SessionControlPanel ring={<ProgressRing percent={session.holdProgress} reps={session.reps} />} />
          </div>

          <div className="dash-cell-chart cockpit-panel panel glass">
            {visibleLeftTabs.length > 1 && (
              <div className="tabs" ref={leftTabsRef}>
                {left.knobElement}
                {visibleLeftTabs.map((t) => (
                  <button
                    key={t.id}
                    data-knob-key={t.id}
                    className={`tab-btn${effectiveLeftTab === t.id ? ' active' : ''}`}
                    onClick={() => setLeftTab(t.id)}
                    {...left.getItemProps(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <div className="cockpit-content">
              {effectiveLeftTab === 'chart' && <LiveChart />}
              {effectiveLeftTab === 'detail' && <DetailStatsGrid angles={angles} hardwareError={hardwareError} />}
            </div>
          </div>

          {show3D2DPose && (
            <div className="dash-cell-pose cockpit-panel panel glass">
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
              <div className="cockpit-content">
                {rightTab === '3d' && <Leg3D />}
                {rightTab === '2d' && <AngleVisualizer />}
              </div>
            </div>
          )}

          {/* 只在最窄的 preset(container 高度 ≤620px)顯示,由 CSS 強制切換,跟使用者
              在 Settings 選了什麼無關——這個高度下已經沒有空間畫 3D 模型或折線圖,
              治療師需要的是明確角度數字,不是被壓在 150px 高的方塊裡的骨架動畫。 */}
          <div className="dash-cell-numeric panel glass">
            <DetailStatsGrid angles={angles} hardwareError={hardwareError} />
          </div>
        </div>
      </div>

      {wizardOpen && <CalibrationWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
