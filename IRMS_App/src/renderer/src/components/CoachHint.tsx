// 教練提示列:phase 徽章(準備/保持/回位)+ 引導文字大字。
import type { EnginePhase } from '../services/triggerEngine'

const PHASE_LABEL: Record<EnginePhase, string> = {
  idle: '準備',
  holding: '保持',
  restPending: '回位'
}

interface Props {
  phase: EnginePhase
  text: string
  tone: 'normal' | 'success' | 'danger'
}

export function CoachHint({ phase, text, tone }: Props): JSX.Element {
  return (
    <div className={`coach-hint ${tone}`}>
      <span className={`phase-badge ${phase}`}>{PHASE_LABEL[phase]}</span>
      <span className="coach-text">{text}</span>
    </div>
  )
}
