// renderer/services/simulation/scenarios.ts
// --- 具名模擬情境 ---
//
// ⚠⚠ 使用範圍的硬性限制(2026-08-03 會議裁定的延伸)⚠⚠
// 模擬器驗證的是「**程式對輸入的反應**」,永遠不是「**輸入像不像一條真的腿**」。
// 因此任何測試都**不得**拿模擬器去論證下列常數的取值是否恰當:
//   FILTER_ALPHA(韌體互補濾波)、EMA_ALPHA(smoothing)、HYSTERESIS_DEG、
//   EXIT_GRACE_MS、CAPTURE_STD_LIMIT / CAPTURE_STD_LIMIT_ABDUCTION(校準擷取門檻)。
// 那些數字要由真人腿上的實測資料決定(issue #2)。用模擬資料去「驗證」它們,
// 得到的只是「模擬器與常數互相同意」,那是循環論證,而且會產生虛假的信心。
//
// 情境是**純函式且以 t 參數化**——這正是 vitest 不需要啟動 pump(setInterval)
// 就能消費它們的原因,也是兩個消費端(demo pump / 測試)共用同一份定義的方式。

import { ERR_PACKET, encodeAnglePacket, truncateTo } from './encode'
import { REST_POSE, poseForKnee, sweep } from './kinematics'

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

const packet = (kneeDeg: number): string => encodeAnglePacket(poseForKnee(kneeDeg))
const restFrame = (): string => encodeAnglePacket(REST_POSE)

/**
 * 參考動作:joint_angle / 目標 90° / 容錯 10° / 保持 2000ms / 安全上限 120°。
 * 由此導出 zone = { min: 80, max: 100, overLimit: 120, rest: 30 }。
 * 情境的角度都是相對這組參數挑的;換動作參數時情境的語意會跑掉,
 * 所以 demo 面板選情境時一併套用這組參數。
 */
export const REFERENCE_ACTION = {
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 2000,
  safetyLimit: 120,
  triggerType: 'joint_angle' as const
}

/** 一下完整的療程:休息 → 進區 → 保持過門檻 → 達標 → 回位 */
const oneRep: Segment[] = [
  { durMs: 1000, frame: () => restFrame() },
  // 由休息位掃到 90°(區間正中央);用半個 sweep 週期做單向爬升
  { durMs: 800, frame: (t) => packet(sweep(t, { periodMs: 1600, min: 5, max: 90 })) },
  // 停在 90° 保持 2.5 秒(> holdTimeMs 2000)
  { durMs: 2500, frame: () => packet(90) },
  // 回位到 10°(< rest 30)
  { durMs: 800, frame: (t) => packet(sweep(t + 800, { periodMs: 1600, min: 10, max: 90 })) },
  { durMs: 900, frame: () => packet(10) }
]

function repCycleSegments(reps: number): Segment[] {
  return Array.from({ length: reps }, () => oneRep).flat()
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'rep-cycle',
    label: '正常療程 — 連續三下達標',
    ...fromSegments(repCycleSegments(3))
  },
  {
    id: 'over-limit',
    label: '超限警報 — 爬過安全上限並停留 45 秒',
    // 停留必須夠久:ALARM_SILENCE_MS 是 30 秒,靜音到期後能否自動重新鳴響
    // 是這條鏈最具安全意義的行為,情境太短就演練不到
    ...fromSegments([
      { durMs: 2000, frame: () => restFrame() },
      { durMs: 1500, frame: (t) => packet(sweep(t, { periodMs: 3000, min: 5, max: 130 })) },
      { durMs: 45_000, frame: () => packet(130) },
      { durMs: 1500, frame: () => packet(10) }
    ])
  },
  {
    id: 'hardware-error',
    label: '硬體錯誤 — ERR:1 後復原',
    ...fromSegments([
      { durMs: 2000, frame: () => packet(90) },
      { durMs: 1000, frame: () => ERR_PACKET },
      { durMs: 3000, frame: () => packet(90) }
    ])
  },
  {
    id: 'truncated-link',
    label: 'MTU 過小 — 每個封包被切到 20 bytes',
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
    label: '壞封包 — 每 10 筆混入 1 筆亂碼',
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
    label: '連線中斷 — 封包停止後鏈路失守',
    endsDisconnected: true,
    ...fromSegments([
      { durMs: 3000, frame: () => packet(90) },
      // null = 沒有封包送達。App 端不會知道差別,直到 GATT 事件或重連耗盡
      { durMs: 2000, frame: () => null }
    ])
  }
]

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
