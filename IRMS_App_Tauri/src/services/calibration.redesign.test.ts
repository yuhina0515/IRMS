import { describe, expect, it } from 'vitest'
import { deriveHingeAxis, projectOntoHingeFrame, reconcileToReferenceFrame, vectorAngleDeg } from './angleMath'

type Vec = { x: number; y: number; z: number }

function rotateAroundZ(v: Vec, deg: number): Vec {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: v.z }
}

function rotateAroundX(v: Vec, deg: number): Vec {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: v.x, y: v.y * cos - v.z * sin, z: v.y * sin + v.z * cos }
}

// 合成幾何反例，不冒充真人追蹤或醫療精度驗收。
describe('calibration redesign acceptance counterexamples', () => {
  it('pure hinge flexion beyond 90 degrees must not become 180 degree Roll', () => {
    const radians = 150 * Math.PI / 180
    const result = projectOntoHingeFrame(
      { x: 0, y: -Math.sin(radians), z: Math.cos(radians) },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 }
    )
    expect(result.pitch).toBeCloseTo(150)
    expect(result.roll).toBeCloseTo(0)
  })

  it('independently rotated sensor coordinates cannot be compared as one shared frame', () => {
    // 兩肢段同步轉動，實際相對角為零。遠端感測器多繞 z 軸貼裝 90 度。
    // 站直時兩者都是 (0,0,1)，所以扣除站直夾角也無法補償此誤差。
    const r = Math.PI / 4
    const proximal = { x: 0, y: Math.sin(r), z: Math.cos(r) }
    const distal = { x: Math.sin(r), y: 0, z: Math.cos(r) }
    expect(vectorAngleDeg(proximal, distal)).toBeCloseTo(60)
  })
})

// CAL-03 候選方案的合成驗證——不冒充真機驗收，見 angleMath.ts 的
// `reconcileToReferenceFrame` 文件註解「已知限制」。此函式刻意未接上
// useStore.ts 的即時計算路徑；這裡只證明它在合成場景下數學自洽。
describe('reconcileToReferenceFrame candidate (unwired, CAL-03 evidence only)', () => {
  const worldBaseline: Vec = { x: 0, y: 0, z: 1 }
  // 近端(大腿)感測器貼裝與世界座標系一致；遠端(小腿)感測器多繞自身 z 軸貼歪 90 度
  // ——與上面「假 60 度」反例相同的貼裝差異設定。
  const toProximalFrame = (w: Vec): Vec => w
  const toDistalFrame = (w: Vec): Vec => rotateAroundZ(w, 90)

  // 近端參考動作(前抬大腿)與遠端參考動作(勾小腿)都假設繞同一條矢狀面內外側軸
  // (world X 軸)——與 pitch/roll 分解、kneeRoll 正負號慣例隱含的假設相同。
  const referenceWorld = rotateAroundX(worldBaseline, 30)
  const baseProximal = toProximalFrame(worldBaseline)
  const baseDistal = toDistalFrame(worldBaseline)
  const proximalHingeAxis = deriveHingeAxis(baseProximal, toProximalFrame(referenceWorld))
  const distalHingeAxis = deriveHingeAxis(baseDistal, toDistalFrame(referenceWorld))

  it('resolves the false-60-degree counterexample back to ~0 when both segments co-move', () => {
    const trueMotionWorld = rotateAroundX(worldBaseline, 45)
    const liveProximal = toProximalFrame(trueMotionWorld)
    const liveDistal = toDistalFrame(trueMotionWorld)

    // 未經和解的原始向量比較:重現反例的假 60 度。
    expect(vectorAngleDeg(liveProximal, liveDistal)).toBeCloseTo(60, 5)

    const distalInProximalFrame = reconcileToReferenceFrame(
      liveDistal,
      distalHingeAxis,
      baseDistal,
      proximalHingeAxis,
      baseProximal
    )
    expect(vectorAngleDeg(liveProximal, distalInProximalFrame)).toBeCloseTo(0, 5)
  })

  it('still reads genuine relative flexion, not a degenerate always-zero result', () => {
    const liveProximal = toProximalFrame(worldBaseline) // 大腿不動(無髖動作)
    const liveDistal = toDistalFrame(rotateAroundX(worldBaseline, 60)) // 小腿真實彎 60 度

    const distalInProximalFrame = reconcileToReferenceFrame(
      liveDistal,
      distalHingeAxis,
      baseDistal,
      proximalHingeAxis,
      baseProximal
    )
    expect(vectorAngleDeg(liveProximal, distalInProximalFrame)).toBeCloseTo(60, 5)
  })
})
