// TriggerEngine 狀態機單元測試
// v3.1 穩定化:離區判定加入遲滯(HYSTERESIS_DEG)與寬限(EXIT_GRACE_MS)——
// 「單筆出區即清進度」為刻意移除的舊行為,本檔測試即新行為的規格。
import { describe, expect, it } from 'vitest'
import type { LiveAngles } from '@shared/protocol'
import {
  EXIT_GRACE_MS,
  HYSTERESIS_DEG,
  computeMetricSample,
  computeMetricZone,
  type TriggerConfig
} from './movementMetric'
import { TriggerEngine, type EngineInput, type TriggerEvents } from './triggerEngine'

/** 快速組出 LiveAngles(只關心 knee/thigh,其餘填 0) */
function angles(knee: number, thigh = 0): LiveAngles {
  return {
    knee,
    thigh,
    shin: 0,
    kneeRoll: 0,
    thighRoll: 0,
    shinRoll: 0,
    rawThigh: thigh,
    rawShin: 0,
    rawThighRoll: 0,
    rawShinRoll: 0
  }
}

/** v2 的 engine.handle(angles, config) 等價輸入 */
function input(knee: number, thigh: number, cfg: TriggerConfig): EngineInput {
  return {
    sample: computeMetricSample(angles(knee, thigh), cfg.triggerType, cfg.tolerance),
    zone: computeMetricZone(cfg),
    holdTimeMs: cfg.holdTimeMs
  }
}

interface Recorded {
  events: string[]
  progress: number[]
  alarms: boolean[]
}

function makeEngine(): { engine: TriggerEngine; rec: Recorded; tick: (ms: number) => void } {
  let now = 0
  const rec: Recorded = { events: [], progress: [], alarms: [] }
  const events: TriggerEvents = {
    onZoneEnter: () => rec.events.push('enter'),
    onZoneExit: () => rec.events.push('exit'),
    onHoldProgress: (p) => rec.progress.push(p),
    onRepCompleted: () => rec.events.push('rep'),
    onRestCompleted: () => rec.events.push('rest'),
    onOverExtension: (a) => rec.alarms.push(a)
  }
  const engine = new TriggerEngine(events, () => now)
  return { engine, rec, tick: (ms) => (now += ms) }
}

const JOINT: TriggerConfig = { targetAngle: 90, tolerance: 10, holdTimeMs: 1000, triggerType: 'joint_angle' }

describe('TriggerEngine — joint_angle 完整達標循環', () => {
  it('進區 → 維持滿 → 計一下 → 需回休息位才能再計(phase 全程對應)', () => {
    const { engine, rec, tick } = makeEngine()
    expect(engine.phase).toBe('idle')

    engine.handle(input(50, 0, JOINT)) // 未達標
    expect(rec.events).toEqual([])
    expect(engine.phase).toBe('idle')

    engine.handle(input(90, 0, JOINT)) // 進區
    expect(rec.events).toEqual(['enter'])
    expect(engine.phase).toBe('holding')

    tick(500)
    engine.handle(input(85, 0, JOINT)) // 區間內(90±10),維持 50%
    expect(rec.progress.at(-1)).toBe(50)

    tick(500)
    engine.handle(input(90, 0, JOINT)) // 滿 1000ms → rep
    expect(rec.events).toEqual(['enter', 'rep'])
    expect(engine.phase).toBe('restPending')

    engine.handle(input(90, 0, JOINT)) // restPending:仍在高角度,不得重複計數
    expect(rec.events).toEqual(['enter', 'rep'])

    engine.handle(input(20, 0, JOINT)) // 回休息位(knee <= 30)
    expect(rec.events).toEqual(['enter', 'rep', 'rest'])
    expect(engine.phase).toBe('idle')

    engine.handle(input(95, 0, JOINT)) // 可開始下一循環
    expect(rec.events).toEqual(['enter', 'rep', 'rest', 'enter'])
  })

  it('提早離區且寬限逾時 → 進度歸零並發 exit,不計數', () => {
    const { engine, rec, tick } = makeEngine()
    engine.handle(input(90, 0, JOINT))
    tick(700)
    engine.handle(input(50, 0, JOINT)) // 離區:啟動寬限,尚未 exit
    expect(rec.events).toEqual(['enter'])
    expect(engine.phase).toBe('holding')
    tick(EXIT_GRACE_MS + 1)
    engine.handle(input(50, 0, JOINT)) // 寬限逾時 → 確定離區
    expect(rec.events).toEqual(['enter', 'exit'])
    expect(rec.progress.at(-1)).toBe(0)
    expect(engine.phase).toBe('idle')
  })
})

describe('TriggerEngine — 遲滯與出區寬限(v3.1 穩定化)', () => {
  it('雜訊尖峰在寬限內回區 → 進度不清零,續算至 rep', () => {
    const { engine, rec, tick } = makeEngine()
    engine.handle(input(90, 0, JOINT)) // enter,t=0
    tick(400)
    engine.handle(input(60, 0, JOINT)) // 尖峰跳出(60 < 80−4),進度凍結
    expect(rec.events).toEqual(['enter'])
    tick(100) // 寬限內(100ms < 250ms)
    engine.handle(input(90, 0, JOINT)) // 回區:以原起點續算 → 500/1000 = 50%
    expect(rec.progress.at(-1)).toBe(50)
    tick(500)
    engine.handle(input(90, 0, JOINT)) // 滿 1000ms → rep,進度未曾歸零
    expect(rec.events).toEqual(['enter', 'rep'])
    // 首筆為進區當下的 0%,其後進度只增不歸零
    expect(rec.progress.slice(1)).not.toContain(0)
  })

  it('寬限期間進度凍結:不發 onHoldProgress,也不會在區外完成 rep', () => {
    const { engine, rec, tick } = makeEngine()
    engine.handle(input(90, 0, JOINT))
    tick(1200) // 已超過 holdTimeMs,但此刻樣本在區外
    engine.handle(input(60, 0, JOINT)) // 寬限開始:凍結,不得在區外發 rep
    expect(rec.events).toEqual(['enter'])
    expect(rec.progress).toEqual([0]) // 僅進區當下的 0%,寬限期間無新事件
    tick(100)
    engine.handle(input(90, 0, JOINT)) // 回區的樣本上才完成 rep
    expect(rec.events).toEqual(['enter', 'rep'])
  })

  it('遲滯:保持中漂到嚴格區間外、放寬區間內(min−4)→ 不離區照常計時', () => {
    const { engine, rec, tick } = makeEngine()
    engine.handle(input(90, 0, JOINT))
    tick(500)
    engine.handle(input(80 - HYSTERESIS_DEG, 0, JOINT)) // 76:嚴格區外、放寬區內
    expect(rec.events).toEqual(['enter'])
    expect(rec.progress.at(-1)).toBe(50)
    expect(engine.phase).toBe('holding')
  })

  it('遲滯不放寬進區:idle 時值在放寬區間內、嚴格區間外 → 不 enter', () => {
    const { engine, rec } = makeEngine()
    engine.handle(input(80 - HYSTERESIS_DEG, 0, JOINT)) // 76 < min 80
    expect(rec.events).toEqual([])
    expect(engine.phase).toBe('idle')
  })

  it('segment 類:保持中膝直前置同樣放寬遲滯,超出放寬值才走寬限離區', () => {
    const ELEV: TriggerConfig = { targetAngle: 45, tolerance: 10, holdTimeMs: 1000, triggerType: 'segment_elevation' }
    const { engine, rec, tick } = makeEngine()
    engine.handle(input(10, 50, ELEV)) // 膝直 + 達標 → enter
    tick(500)
    engine.handle(input(15 + HYSTERESIS_DEG, 50, ELEV)) // 膝 19:嚴格門檻外、放寬內 → 續算
    expect(rec.progress.at(-1)).toBe(50)
    engine.handle(input(30, 50, ELEV)) // 膝 30 超出放寬 → 寬限開始
    tick(EXIT_GRACE_MS + 1)
    engine.handle(input(30, 50, ELEV)) // 逾時 → exit
    expect(rec.events).toEqual(['enter', 'exit'])
  })
})

describe('TriggerEngine — 超限安全警報', () => {
  it('超過 target+tol+10 觸發,回落即解除;獨立於達標狀態機', () => {
    const { engine, rec } = makeEngine()
    engine.handle(input(110, 0, JOINT)) // 恰在界線(90+10+10),不觸發
    expect(rec.alarms).toEqual([])
    engine.handle(input(111, 0, JOINT))
    expect(rec.alarms).toEqual([true])
    engine.handle(input(80, 0, JOINT))
    expect(rec.alarms).toEqual([true, false])
  })

  it('reset 時若警報作動中,必須發出解除事件,且 phase 回 idle', () => {
    const { engine, rec } = makeEngine()
    engine.handle(input(150, 0, JOINT))
    expect(rec.alarms).toEqual([true])
    engine.reset()
    expect(rec.alarms).toEqual([true, false])
    expect(engine.phase).toBe('idle')
  })
})

describe('TriggerEngine — segment 類判定', () => {
  const ELEV: TriggerConfig = { targetAngle: 45, tolerance: 10, holdTimeMs: 1000, triggerType: 'segment_elevation' }
  const EXT: TriggerConfig = { targetAngle: 20, tolerance: 8, holdTimeMs: 1000, triggerType: 'segment_extension' }

  it('elevation:需膝近直(<=15°)且大腿 >= target', () => {
    const { engine, rec } = makeEngine()
    engine.handle(input(30, 50, ELEV)) // 膝彎 30 > 15,不算
    expect(rec.events).toEqual([])
    engine.handle(input(10, 50, ELEV)) // 膝直 + 大腿 50 >= 45
    expect(rec.events).toEqual(['enter'])
  })

  it('elevation:容錯較大時膝直門檻取 max(15, tol)', () => {
    const { engine, rec } = makeEngine()
    const loose = { ...ELEV, tolerance: 20 }
    engine.handle(input(18, 50, loose)) // 18 <= max(15,20)
    expect(rec.events).toEqual(['enter'])
  })

  it('extension:大腿需低於 -target(正規化後 value = -thigh)', () => {
    const { engine, rec } = makeEngine()
    engine.handle(input(5, -10, EXT)) // -10 > -20,未達
    expect(rec.events).toEqual([])
    engine.handle(input(5, -25, EXT))
    expect(rec.events).toEqual(['enter'])
  })
})

// --- 2026-08-01 會議 F2 迴歸:rest 不變式 ---
// 修復前:rest 是寫死的 30,而出貨預設 Backward Extension 的 min 是 20,
// 目標區整個落在休息區內,狀態機在原地閉合成迴圈,一條靜止不動的腿
// 每 holdTimeMs 被計一次 rep 並發一次達標音,寫進 sessions.repsCompleted。
describe('TriggerEngine — 靜止的腿不得產生幻影 reps', () => {
  const BACKWARD_EXTENSION: TriggerConfig = {
    targetAngle: 20,
    tolerance: 8,
    holdTimeMs: 2000,
    triggerType: 'segment_extension'
  }

  it('出貨預設 Backward Extension:腿停在區間內不動,只算一下', () => {
    const { engine, rec, tick } = makeEngine()

    // 大腿後伸 25°(value = 25 >= min 20),然後完全靜止不動
    for (let i = 0; i < 200; i++) {
      engine.handle(input(0, -25, BACKWARD_EXTENSION))
      tick(40) // 25Hz 封包流,總共模擬 8 秒 = 4 個 holdTime 週期
    }

    expect(rec.events.filter((e) => e === 'rep')).toHaveLength(1)
    expect(engine.phase).toBe('restPending') // 卡在等回位,而非回到 idle 重新計數
  })

  it('必須真的回到休息位才能計下一下', () => {
    const { engine, rec, tick } = makeEngine()

    engine.handle(input(0, -25, BACKWARD_EXTENSION))
    tick(2000)
    engine.handle(input(0, -25, BACKWARD_EXTENSION))
    expect(rec.events).toEqual(['enter', 'rep'])

    // 回到 -16(value 16):高於新的 rest 門檻 15,還不算回位
    engine.handle(input(0, -16, BACKWARD_EXTENSION))
    expect(rec.events).toEqual(['enter', 'rep'])

    // 回到 -10(value 10 <= 15):確實回位
    engine.handle(input(0, -10, BACKWARD_EXTENSION))
    expect(rec.events).toEqual(['enter', 'rep', 'rest'])

    // 再做一次才是第二下
    engine.handle(input(0, -25, BACKWARD_EXTENSION))
    tick(2000)
    engine.handle(input(0, -25, BACKWARD_EXTENSION))
    expect(rec.events.filter((e) => e === 'rep')).toHaveLength(2)
  })

  it('低目標的 joint_angle 動作同樣不會迴圈(使用者自建溫和動作)', () => {
    // target 35 / tol 10 → min 25;舊的固定 rest=30 會讓 min < rest 而迴圈
    const gentle: TriggerConfig = {
      targetAngle: 35,
      tolerance: 10,
      holdTimeMs: 1000,
      triggerType: 'joint_angle'
    }
    const { engine, rec, tick } = makeEngine()

    for (let i = 0; i < 150; i++) {
      engine.handle(input(30, 0, gentle)) // 膝停在 30°,落在 25–45 區間內
      tick(40)
    }
    expect(rec.events.filter((e) => e === 'rep')).toHaveLength(1)
  })

  it('holdTimeMs 為 0 時進度不得為 NaN', () => {
    const { engine, rec } = makeEngine()
    const zeroHold: TriggerConfig = { ...JOINT, holdTimeMs: 0 }
    engine.handle(input(90, 0, zeroHold))
    expect(rec.progress.every((p) => Number.isFinite(p))).toBe(true)
  })
})
