import { describe, expect, it } from 'vitest'
import { BLOCKING_MODES, deriveDashboardMode, valueTone, type DashboardInputs } from './dashboardState'
import type { MetricZone } from './movementMetric'

const zone: MetricZone = { min: 80, max: 100, overLimit: 120, rest: 20 }

const base: DashboardInputs = {
  hardwareError: false,
  protocolSupported: true,
  isConnected: true,
  reconnecting: false,
  hasAction: true,
  sessionRunning: true,
  alarmActive: false,
  alarmSilencedUntil: 0,
  now: 1_000,
  phase: 'idle',
  sample: { value: 50, kneeStraightOk: true, knee: 50, kneeMax: null },
  zone
}

const at = (value: number): DashboardInputs['sample'] => ({ value, kneeStraightOk: true, knee: value, kneeMax: null })

describe('deriveDashboardMode 優先序', () => {
  it('硬體錯誤優先於一切(含未支援協定與未連線)', () => {
    expect(deriveDashboardMode({ ...base, hardwareError: true, protocolSupported: false, isConnected: false })).toBe(
      'hardwareError'
    )
  })

  it('未支援協定排在連線之前:接上裝置也不會讓它變成可用的量測', () => {
    expect(deriveDashboardMode({ ...base, protocolSupported: false, isConnected: false })).toBe('unsupported')
  })

  it('斷線:自動重連中為 stale,否則 disconnected', () => {
    expect(deriveDashboardMode({ ...base, isConnected: false, reconnecting: true })).toBe('stale')
    expect(deriveDashboardMode({ ...base, isConnected: false })).toBe('disconnected')
  })

  it('已連線但未選動作為 noAction,即使主指標超限也不警報', () => {
    expect(deriveDashboardMode({ ...base, hasAction: false, sample: at(150) })).toBe('noAction')
  })

  it('警報鳴響中優先於保持', () => {
    expect(deriveDashboardMode({ ...base, alarmActive: true, phase: 'holding' })).toBe('alarm')
  })

  it('仍超限且在靜音期間為 silenced;靜音到期或未在療程中則不是', () => {
    const over = { ...base, sample: at(130), alarmSilencedUntil: 5_000 }
    expect(deriveDashboardMode(over)).toBe('silenced')
    expect(deriveDashboardMode({ ...over, now: 6_000 })).not.toBe('silenced')
    expect(deriveDashboardMode({ ...over, sessionRunning: false })).not.toBe('silenced')
  })

  it('保持、回位、目標區、一般量測', () => {
    expect(deriveDashboardMode({ ...base, phase: 'holding', sample: at(90) })).toBe('holding')
    expect(deriveDashboardMode({ ...base, phase: 'restPending', sample: at(90) })).toBe('returning')
    expect(deriveDashboardMode({ ...base, sample: at(90) })).toBe('inZone')
    expect(deriveDashboardMode({ ...base, sample: at(50) })).toBe('active')
    expect(deriveDashboardMode({ ...base, sample: null })).toBe('active')
  })

  it('阻斷狀態集合只含不能量測的四種', () => {
    expect([...BLOCKING_MODES].sort()).toEqual(['disconnected', 'hardwareError', 'noAction', 'unsupported'])
  })
})

describe('valueTone', () => {
  it('目標區外 out、區內 in、超限 over,無資料 out', () => {
    expect(valueTone(at(50), zone)).toBe('out')
    expect(valueTone(at(90), zone)).toBe('in')
    expect(valueTone(at(110), zone)).toBe('out')
    expect(valueTone(at(121), zone)).toBe('over')
    expect(valueTone(null, zone)).toBe('out')
  })

  it('segment 類 zone.max 為 Infinity 時,目標帶上緣以 overLimit 為界', () => {
    const seg: MetricZone = { min: 40, max: Infinity, overLimit: 75, rest: 10 }
    expect(valueTone(at(60), seg)).toBe('in')
    expect(valueTone(at(80), seg)).toBe('over')
  })
})
