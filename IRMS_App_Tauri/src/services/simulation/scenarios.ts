// renderer/services/simulation/scenarios.ts
// --- 具名模擬情境 ---
//
// ⚠⚠ 使用範圍的硬性限制 ⚠⚠
// 模擬器驗證的是「**程式對輸入的反應**」,永遠不是「**輸入像不像一條真的腿**」。
// 因此任何測試都**不得**拿模擬器去論證下列常數的取值是否恰當:
//   FILTER_ALPHA(韌體互補濾波)、EMA_ALPHA(smoothing)、HYSTERESIS_DEG、
//   EXIT_GRACE_MS、CAPTURE_STD_LIMIT / CAPTURE_STD_LIMIT_ABDUCTION(校準擷取門檻)。
// 那些數字要由真人腿上的實測資料決定(issue #2)。用模擬資料去「驗證」它們,
// 得到的只是「模擬器與常數互相同意」,那是循環論證,而且會產生虛假的信心。
//
// 情境是**純函式且以 t 參數化**——這正是 vitest 不需要啟動 pump(setInterval)
// 就能消費它們的原因,也是兩個消費端(demo pump / 測試)共用同一份定義的方式。

import type { RawAngles } from '@shared/protocol'
import type { TriggerType } from '@shared/types'
import { computeMetricZone, type AngleLimits, type TriggerConfig } from '../movementMetric'
import { ERR_PACKET, encodeAnglePacket, truncateTo } from './encode'
import { REST_POSE, poseForKnee, poseForThigh } from './kinematics'
import { getT, type Messages } from '../../i18n'

export type ScenarioId = keyof Messages['scenarios']

/** 情境顯示名稱依介面語系(每次讀取時才查字典,語系切換即生效;id 不翻譯) */
function scenarioLabel(id: ScenarioId): string {
  return getT().scenarios[id]
}

/** 一拍的產出:封包字串,或 null = 這一拍鏈路上沒有東西送達 */
export type ScenarioFrame = string | null

export interface Scenario {
  id: string
  label: string
  /** 情境全長;pump 播完後從頭循環,測試則自行控制 t */
  durationMs: number
  /** 這個情境結束時是否應視為鏈路中斷(pump 據此呼叫 endSimulated) */
  endsDisconnected?: boolean
  frameAt(tMs: number): ScenarioFrame
}

interface Segment {
  durMs: number
  frame: (tInSeg: number, absT: number) => ScenarioFrame
}

/** 把分段串成一個 frameAt;超過總長則循環(demo 用) */
function fromSegments(segments: Segment[]): { durationMs: number; frameAt(t: number): ScenarioFrame } {
  const durationMs = segments.reduce((sum, s) => sum + s.durMs, 0)
  return {
    durationMs,
    frameAt(tMs: number): ScenarioFrame {
      let t = ((tMs % durationMs) + durationMs) % durationMs
      for (const seg of segments) {
        if (t < seg.durMs) return seg.frame(t, tMs)
        t -= seg.durMs
      }
      return segments[segments.length - 1].frame(segments[segments.length - 1].durMs, tMs)
    }
  }
}

/** 情境依據的判定參數;與 sessionController 餵給引擎的 TriggerConfig 同形 */
export type ScenarioConfig = TriggerConfig

/**
 * 預設參考動作:joint_angle / 目標 90° / 容錯 10° / 保持 2000ms,
 * 個人舒適角度 105°、極限範圍 120°(僅測試用;真實使用者沒有預設值)。
 * 由此導出 zone = { min: 80, max: 100, rest: 30 }。
 *
 * 示範模式實際播放時用的是**當下選取動作**的參數(simulator 取
 * currentTriggerConfig()),情境角度與保持時間都由該參數導出,
 * 所以任何動作(含 segment 類、保持時間比 2 秒長的動作)都能達標。
 * 這個常數只是沒有指定參數時(測試、SCENARIOS 選項清單)的預設值。
 */
export const REFERENCE_ACTION = {
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 2000,
  triggerType: 'joint_angle' as TriggerType,
  limits: { comfort: 105, limit: 120 } as AngleLimits
} satisfies ScenarioConfig

/** 讓判定主指標 = value 的原始姿勢(以預設校準而言) */
function poseForMetric(triggerType: TriggerType, value: number): RawAngles {
  switch (triggerType) {
    case 'segment_elevation':
      return poseForThigh(value)
    case 'segment_extension':
      return poseForThigh(-value)
    case 'joint_angle':
    default:
      return poseForKnee(value)
  }
}

/** 由判定參數導出情境要用到的主指標值與保持時間 */
function metricLevels(cfg: ScenarioConfig): { rest: number; hold: number; over: number; holdMs: number } {
  const zone = computeMetricZone(cfg)
  // joint_angle 的膝夾角恆 ≥ 0;segment 類的主指標可以是負值(大腿往反方向)
  const floor = cfg.triggerType === 'joint_angle' ? 0 : -Infinity
  const rest = Math.max(floor, zone.rest - 10)
  // joint_angle 停在區間正中央;segment 類上限是 Infinity,停在下限之上 5°
  const hold = Number.isFinite(zone.max) ? (zone.min + zone.max) / 2 : zone.min + 5
  // 極限範圍情境彎膝超過個人極限(與判定一致,一律比膝角);未量測時退到舒適角度之上,
  // 兩者都沒有就彎到目標上方——此時不會有任何警示,情境標籤會註明需先量測
  const limits = cfg.limits
  const kneeTop = Number.isFinite(zone.max) ? zone.max : cfg.targetAngle
  const over = Math.min(175, (limits?.limit ?? limits?.comfort ?? kneeTop + 10) + 10)
  return { rest, hold, over, holdMs: cfg.holdTimeMs + 1500 }
}

/** 在 durMs 內由 from 線性移動到 to */
const ramp = (t: number, durMs: number, from: number, to: number): number =>
  from + (to - from) * Math.min(1, Math.max(0, t / durMs))

function buildScenarioList(cfg: ScenarioConfig): Scenario[] {
  const lv = metricLevels(cfg)
  const packet = (value: number): string => encodeAnglePacket(poseForMetric(cfg.triggerType, value))
  const restFrame = (): string => encodeAnglePacket(REST_POSE)
  const kneePacket = (knee: number): string => encodeAnglePacket(poseForKnee(knee))

  /** 一下完整的療程:休息 → 進區 → 保持過門檻 → 達標 → 回位 */
  const oneRep: Segment[] = [
    { durMs: 1000, frame: () => restFrame() },
    { durMs: 800, frame: (t) => packet(ramp(t, 800, 0, lv.hold)) },
    // 保持 = 動作的 holdTimeMs + 1.5 秒餘裕
    { durMs: lv.holdMs, frame: () => packet(lv.hold) },
    { durMs: 800, frame: (t) => packet(ramp(t, 800, lv.hold, lv.rest)) },
    { durMs: 900, frame: () => packet(lv.rest) }
  ]
  const repCycleSegments = (reps: number): Segment[] => Array.from({ length: reps }, () => oneRep).flat()

  return [
    {
      id: 'rep-cycle',
      get label() {
        return scenarioLabel('rep-cycle')
      },
      ...fromSegments(repCycleSegments(3))
    },
    {
      id: 'over-limit',
      get label() {
        return scenarioLabel('over-limit')
      },
      // 停留必須夠久:ALARM_SILENCE_MS 是 30 秒,靜音到期後能否自動恢復警示
      // 是這條鏈最具安全意義的行為,情境太短就演練不到。
      // 個人範圍一律比膝角,所以這裡不論動作類型都用膝屈曲姿勢
      ...fromSegments([
        { durMs: 2000, frame: () => restFrame() },
        { durMs: 1500, frame: (t) => kneePacket(ramp(t, 1500, 0, lv.over)) },
        { durMs: 45_000, frame: () => kneePacket(lv.over) },
        { durMs: 1500, frame: () => restFrame() }
      ])
    },
    {
      id: 'hardware-error',
      get label() {
        return scenarioLabel('hardware-error')
      },
      ...fromSegments([
        { durMs: 2000, frame: () => packet(lv.hold) },
        { durMs: 1000, frame: () => ERR_PACKET },
        { durMs: 3000, frame: () => packet(lv.hold) }
      ])
    },
    {
      id: 'truncated-link',
      get label() {
        return scenarioLabel('truncated-link')
      },
      // 判定只讀 Pitch,而 T:/S: 在 20 bytes 切點下必定存活,
      // 所以療程照常進行、reps 照常累計——Roll 卻一路是 0。
      // 這個情境存在的意義就是證明「照常進行」與「靜默錯誤」可以同時為真。
      ...(() => {
        const base = fromSegments(repCycleSegments(2))
        return {
          durationMs: base.durationMs,
          frameAt: (t: number): ScenarioFrame => {
            const frame = base.frameAt(t)
            return frame == null ? null : truncateTo(frame)
          }
        }
      })()
    },
    {
      id: 'garbage',
      get label() {
        return scenarioLabel('garbage')
      },
      ...(() => {
        const base = fromSegments(repCycleSegments(2))
        return {
          durationMs: base.durationMs,
          frameAt: (t: number): ScenarioFrame => {
            // 中段欄位壞掉(非尾端)→ 解析器判 malformed 而非 truncated
            if (Math.floor(t / 40) % 10 === 3) return 'T:1.0,S:@@@,K:2.0,TR:0.0,SR:0.0,KR:0.0'
            return base.frameAt(t)
          }
        }
      })()
    },
    {
      id: 'dropout',
      get label() {
        return scenarioLabel('dropout')
      },
      endsDisconnected: true,
      ...fromSegments([
        { durMs: 3000, frame: () => packet(lv.hold) },
        // null = 沒有封包送達。App 端不會知道差別,直到 GATT 事件或重連耗盡
        { durMs: 2000, frame: () => null }
      ])
    }
  ]
}

/** 以預設參考動作建立的情境清單(id/label 與參數無關,供 UI 列選項) */
export const SCENARIOS: Scenario[] = buildScenarioList(REFERENCE_ACTION)

export function scenarioById(id: string, cfg: ScenarioConfig = REFERENCE_ACTION): Scenario | undefined {
  return buildScenarioList(cfg).find((s) => s.id === id)
}
