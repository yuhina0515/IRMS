// 校準純數學測試(v2:方向校正)。核心是 round-trip:精靈產出的 patch 餵回
// applyCalibration,斷言統一慣例成立——站直≈0、前抬為正、後勾為負、外展 roll 為正。
import { describe, expect, it } from 'vitest'
import type { RawAngles } from '@shared/protocol'
import {
  applyCalibration,
  CALIBRATION_KEYS,
  CALIBRATION_TRANSFORM_KEYS,
  type Settings
} from '../store/useStore'
import {
  buildCalibrationPatch,
  buildQuickZeroPatch,
  computeCaptureStats,
  recalibrateAxis,
  effectiveRaw,
  CAPTURE_STD_LIMIT_ABDUCTION,
  buildCalibrationSnapshot,
  calibrationDrift,
  baselineIsObservable,
  parseCalibrationSnapshot,
  type CaptureStats
} from './calibration'

const raw = (thigh: number, shin: number, thighRoll = 0, shinRoll = 0): RawAngles => ({
  thigh,
  shin,
  thighRoll,
  shinRoll
})

const stable = (mean: RawAngles): CaptureStats => ({ mean, maxStdDev: 0.5 })

const SETTINGS: Settings = {
  proximalAxisRotationDeg: 0,
  distalAxisRotationDeg: 0,
  proximalAxisRotationVerified: false,
  distalAxisRotationVerified: false,
  proximalInvert: false,
  proximalZeroRaw: 0,
  distalInvert: false,
  distalZeroRaw: 0,
  proximalRollInvert: false,
  proximalRollZeroRaw: 0,
  distalRollInvert: false,
  distalRollZeroRaw: 0,
  proximalRollVerified: false,
  distalRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  showKneeRoll: false,
  showTrendChart: false,
  show3D2DPose: false,
  lastCalibratedAt: null,
  wearSide: null,
  themeMode: 'dark',
  allowBetaUpdates: true,
  sidebarCollapsed: false,
  telemetryEnabled: false,
  telemetryEndpoint: 'https://hina-tw.ddns.net/irms-api',
  telemetryToken: ''
}

describe('computeCaptureStats', () => {
  it('平均與最大標準差(取四軸最大)', () => {
    const stats = computeCaptureStats([raw(10, 0), raw(14, 0), raw(12, 0)])
    expect(stats.mean.thigh).toBeCloseTo(12)
    expect(stats.maxStdDev).toBeCloseTo(Math.sqrt(8 / 3))
  })

  it('新韌體以三維向量判定穩定，不受相容 Euler 欄位在 90° 跳分支影響', () => {
    const samples = [raw(89, 88, -80, -70), raw(90, 89, 20, 75)].map((sample) => ({
      ...sample,
      thighAccel: { x: 0, y: 1, z: 0 },
      shinAccel: { x: 0, y: 1, z: 0 }
    }))
    expect(computeCaptureStats(samples).maxStdDev).toBeCloseTo(0)
  })
})

describe('recalibrateAxis / effectiveRaw(2026-09-08 會議:原始向量旋轉法)', () => {
  it('彎曲動作完全出現在 pitch 軸、roll 完全不動 → rotationDeg ≈ 0', () => {
    const r = recalibrateAxis(raw(0, 0), raw(40, 0, 0, 0), 'thigh')
    expect(r.rotationDeg).toBeCloseTo(0)
    expect(r.delta).toBeCloseTo(40)
  })

  it('彎曲動作完全出現在 roll 軸(感測器貼歪 90°)→ rotationDeg ≈ 90', () => {
    const r = recalibrateAxis(raw(0, 0), raw(0, 0, 40, 0), 'thigh')
    expect(r.rotationDeg).toBeCloseTo(90)
    expect(r.delta).toBeCloseTo(40)
  })

  it('部分耦合(貼裝介於正貼與貼歪 90° 之間)→ 連續解出中間值,舊版二元判定抓不到這種情況', () => {
    // 09-08 會議的起因正是這種情況:真實動作是純 pitch,但貼裝旋轉 φ=30° 讓它同時
    // 投影到兩個讀值分量——依 rotateRawAxes 的物理模型反推感測器實際會讀到的角度
    const phi = 30
    const rad = (phi * Math.PI) / 180
    const truePitchTan = Math.tan((40 * Math.PI) / 180)
    const sensorPitchDeg = (Math.atan(truePitchTan * Math.cos(rad)) * 180) / Math.PI
    const sensorRollDeg = (Math.atan(truePitchTan * Math.sin(rad)) * 180) / Math.PI
    const r = recalibrateAxis(raw(0, 0), raw(sensorPitchDeg, 0, sensorRollDeg, 0), 'thigh')
    expect(r.rotationDeg).toBeCloseTo(phi, 3)
  })

  it('effectiveRaw 依 rotationDeg 修正 pitch/roll(90° 邊界:pitch 端與舊版一致,roll 端變號)', () => {
    const eff = effectiveRaw(raw(1, 2, 3, 4), { proximalAxisRotationDeg: 90, distalAxisRotationDeg: 0 })
    expect(eff.thigh).toBeCloseTo(3)
    expect(eff.thighRoll).toBeCloseTo(-1)
    expect(eff.shin).toBeCloseTo(2)
    expect(eff.shinRoll).toBeCloseTo(4)
  })
})

describe('buildCalibrationPatch — 驗證', () => {
  const okRaise = stable(raw(40, 0))
  const okFlex = stable(raw(0, -35))

  it('晃動過大 → unstable', () => {
    const r = buildCalibrationPatch({ mean: raw(0, 0), maxStdDev: 5 }, okRaise, okFlex, null, SETTINGS)
    expect(r).toEqual({ ok: false, error: 'unstable' })
  })

  it('真機站姿落在 atan2 共用分母奇異區 → 拒絕產生錯誤校正', () => {
    // 2026-09-15 右腿實測的穩定站姿代表值；小腿 az 幾乎為 0，SR 在相同站姿
    // 仍可跨越數十度。這不是 offset 或 axis rotation 能恢復的資訊。
    const measuredStand = raw(75.3, 88.4, -26.3, -77.6)
    expect(baselineIsObservable(measuredStand)).toBe(false)

    const r = buildCalibrationPatch(
      stable(measuredStand),
      stable(raw(68, 86, 66, 86)),
      stable(raw(63, 83, -65, -44)),
      null,
      SETTINGS
    )
    expect(r).toEqual({ ok: false, error: 'singularBaseline' })
  })

  it('大腿/小腿幅度不足 → 對應錯誤碼', () => {
    expect(buildCalibrationPatch(stable(raw(0, 0)), stable(raw(12, 0)), okFlex, null, SETTINGS)).toEqual({
      ok: false,
      error: 'thighDeltaTooSmall'
    })
    expect(buildCalibrationPatch(stable(raw(0, 0)), okRaise, stable(raw(0, -10)), null, SETTINGS)).toEqual({
      ok: false,
      error: 'shinDeltaTooSmall'
    })
  })

  it('外展單軸幅度不足 → 該軸沿用原設定且未驗證,另一軸正常判定,整步不失敗', () => {
    // thighRoll delta = 8(< 15,不足)、shinRoll delta = 20(≥ 15,足夠)
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, stable(raw(0, 0, 8, 20)), SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.proximalRollInvert).toBe(SETTINGS.proximalRollInvert) // 沿用原設定
    expect(r.patch.proximalRollVerified).toBe(false) // 未驗證
    expect(r.patch.distalRollInvert).toBe(false) // 20 ≥ 0 → 不反相
    expect(r.patch.distalRollVerified).toBe(true)
  })

  it('外展兩軸皆幅度不足 → 兩軸都沿用原設定,整步仍成功(等同跳過)', () => {
    const cur = { ...SETTINGS, proximalRollInvert: true, proximalRollVerified: true }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, stable(raw(0, 0, 5, -3)), cur)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.proximalRollInvert).toBe(true)
    expect(r.patch.proximalRollVerified).toBe(true) // 保留原本已驗證狀態,不因這次不足而清掉
    expect(r.patch.distalRollInvert).toBe(false)
    expect(r.patch.distalRollVerified).toBe(false)
  })

  it('跳過外展 → 沿用現有 roll invert 設定,verified 狀態不變', () => {
    const cur = { ...SETTINGS, proximalRollInvert: true, proximalRollVerified: true }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, null, cur)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.proximalRollInvert).toBe(true)
    expect(r.patch.proximalRollVerified).toBe(true)
    expect(r.patch.distalRollVerified).toBe(false)
  })

  it('外展捕捉晃動介於一般門檻(3°)與外展專用門檻(4°)之間 → 仍視為穩定', () => {
    const shakyAbduction: CaptureStats = { mean: raw(0, 0, 20, 20), maxStdDev: CAPTURE_STD_LIMIT_ABDUCTION - 0.1 }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, shakyAbduction, SETTINGS)
    expect(r.ok).toBe(true)
  })

  it('外展捕捉晃動超過外展專用門檻 → unstable', () => {
    const tooShakyAbduction: CaptureStats = { mean: raw(0, 0, 20, 20), maxStdDev: CAPTURE_STD_LIMIT_ABDUCTION + 0.1 }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, tooShakyAbduction, SETTINGS)
    expect(r).toEqual({ ok: false, error: 'unstable' })
  })
})

describe('couplingWarning(2026-09-15 會議:正面貼裝根因,φ 單自由度的殘留耦合提示)', () => {
  const baseline = stable(raw(0, 0))
  const thighRaise = stable(raw(40, 0))
  const kneeFlex = stable(raw(0, -35))

  it('跳過外展 → 兩側皆為 null(不知道,不是沒問題)', () => {
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.couplingWarning).toEqual({ proximal: null, distal: null })
  })

  it('外展乾淨(有效 pitch 幾乎不變)→ 該側 false,幅度不足的另一側仍是 null', () => {
    // thighRoll delta = 20(足夠),thigh pitch 殘留 = 0
    const abduction = stable(raw(0, 0, 20, 0))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.couplingWarning.proximal).toBe(false)
    expect(r.couplingWarning.distal).toBeNull() // shinRoll delta = 0,未達門檻,未評估
  })

  it('外展時有效 pitch 殘留比例過高 → 該側 true(提示可能換了貼裝面,非擋關)', () => {
    // thighRoll delta = 20(足夠),thigh pitch 殘留 = 9 → 比例 0.45 > 0.4 門檻
    const abduction = stable(raw(9, 0, 20, 0))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.couplingWarning.proximal).toBe(true)
  })

  it('兩側都做且都乾淨 → 兩側皆 false', () => {
    const abduction = stable(raw(0, 0, 20, -18))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.couplingWarning).toEqual({ proximal: false, distal: false })
  })
})

describe('buildCalibrationPatch — round-trip(慣例最終保證)', () => {
  it('新向量協定可在 z=0 站姿完成校準並避開舊 Euler 奇異值', () => {
    const withAccel = (angles: RawAngles, thigh: [number, number, number], shin: [number, number, number]): RawAngles => ({
      ...angles,
      thighAccel: { x: thigh[0], y: thigh[1], z: thigh[2] },
      shinAccel: { x: shin[0], y: shin[1], z: shin[2] }
    })
    const baseline = stable(withAccel(raw(89, 89, -80, 80), [0, 1, 0], [0, 1, 0]))
    const thighRaise = stable(withAccel(raw(45, 89, 20, -70), [0, Math.SQRT1_2, Math.SQRT1_2], [0, 1, 0]))
    const kneeFlex = stable(withAccel(raw(89, 135, -30, 60), [0, 1, 0], [0, Math.SQRT1_2, -Math.SQRT1_2]))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const cal = { ...SETTINGS, ...r.patch }
    expect(applyCalibration(baseline.mean, cal).knee).toBeCloseTo(0)
    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(45)
    expect(applyCalibration(kneeFlex.mean, cal).shin).toBeCloseTo(-45)
  })

  it('任意 3D 貼裝方向(非單純繞感測器自身法向量的扭轉)仍能正確還原(2026-09-15 屈曲軸外積改版)', () => {
    // 舊版 axisRotationDeg 只解「繞感測器自身法向量」這一個自由度,物理上等於假設
    // 貼裝面已知、只是扭轉了幾度。這裡的貼裝旋轉同時混合 X/Y/Z 三軸,任何單自由度
    // 模型都無法正確還原——這正是 buildCalibrationPatchFromVectors 存在的理由。
    type V3 = { x: number; y: number; z: number }
    const rotateX = (v: V3, deg: number): V3 => {
      const r = (deg * Math.PI) / 180
      return { x: v.x, y: v.y * Math.cos(r) - v.z * Math.sin(r), z: v.y * Math.sin(r) + v.z * Math.cos(r) }
    }
    const rotateY = (v: V3, deg: number): V3 => {
      const r = (deg * Math.PI) / 180
      return { x: v.x * Math.cos(r) + v.z * Math.sin(r), y: v.y, z: -v.x * Math.sin(r) + v.z * Math.cos(r) }
    }
    const rotateZ = (v: V3, deg: number): V3 => {
      const r = (deg * Math.PI) / 180
      return { x: v.x * Math.cos(r) - v.y * Math.sin(r), y: v.x * Math.sin(r) + v.y * Math.cos(r), z: v.z }
    }
    // 任意混合貼裝旋轉(繞 X/Y/Z 皆非 0,且大腿/小腿各自獨立、互不相同)
    const mountThigh = (v: V3): V3 => rotateZ(rotateY(rotateX(v, 37), -52), 81)
    const mountShin = (v: V3): V3 => rotateZ(rotateY(rotateX(v, -64), 18), -29)
    // 解剖真值:站直重力沿 (0,0,1);前抬大腿/後勾小腿是繞解剖 X 軸的單一鉸鏈轉動
    const anatomicalStand: V3 = { x: 0, y: 0, z: 1 }
    const anatomicalRaise = rotateX(anatomicalStand, 40)
    const anatomicalFlex = rotateX(anatomicalStand, -35)

    const withAccel = (angles: RawAngles, thigh: V3, shin: V3): RawAngles => ({
      ...angles,
      thighAccel: mountThigh(thigh),
      shinAccel: mountShin(shin)
    })
    const baseline = stable(withAccel(raw(0, 0), anatomicalStand, anatomicalStand))
    const thighRaise = stable(withAccel(raw(0, 0), anatomicalRaise, anatomicalStand))
    const kneeFlex = stable(withAccel(raw(0, 0), anatomicalStand, anatomicalFlex))

    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.knee).toBeCloseTo(0)
    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(40)
    expect(applyCalibration(kneeFlex.mean, cal).shin).toBeCloseTo(-35)
  })

  it('反向佩戴:站直≈0、前抬為正、後勾為負、外展 roll 為正、kneeRoll≈0', () => {
    // 上下顛倒佩戴:前抬使 thigh raw 變小、後勾使 shin raw 變大、外展使 roll raw 變小
    const baseline = stable(raw(175, -178, 6, -4))
    const thighRaise = stable(raw(135, -178, 6, -4))
    const kneeFlex = stable(raw(175, -140, 6, -4))
    const abduction = stable(raw(175, -178, 6 - 25, -4 - 22)) // roll raw 變小 → 需反相
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(stand.shinRoll).toBeCloseTo(0)
    expect(stand.kneeRoll).toBeCloseTo(0)

    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(40)
    expect(applyCalibration(kneeFlex.mean, cal).shin).toBeCloseTo(-38)
    const abd = applyCalibration(abduction.mean, cal)
    expect(abd.thighRoll).toBeCloseTo(25) // 外展 = 向外 = 正
    expect(abd.shinRoll).toBeCloseTo(22)
  })

  it('感測器貼歪 90°(彎曲出現在 roll 軸)→ axisRotationDeg 修正後慣例仍成立', () => {
    // 大腿感測器轉了 90°:前抬時 thighRoll raw 大幅變化、thigh raw 完全不動
    const baseline = stable(raw(0, 1, 0, 3))
    const thighRaise = stable(raw(0, 1, 42, 3)) // 動作完全出現在 thighRoll 軸(+42)
    const kneeFlex = stable(raw(0, -34, 0, 3))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.proximalAxisRotationDeg).toBeCloseTo(90)
    expect(r.patch.distalAxisRotationDeg).toBeCloseTo(0)
    expect(r.patch.proximalAxisRotationVerified).toBe(true)
    expect(r.patch.distalAxisRotationVerified).toBe(true)

    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(42) // 前抬為正
  })

  it('正向佩戴:不反相、旋轉角為 0,僅歸零', () => {
    const baseline = stable(raw(-3, 2))
    const r = buildCalibrationPatch(baseline, stable(raw(42, 2)), stable(raw(-3, -33)), null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.proximalAxisRotationDeg).toBeCloseTo(0)
    expect(r.patch.proximalInvert).toBe(false)
    expect(r.patch.distalInvert).toBe(false)
    const stand = applyCalibration(baseline.mean, { ...SETTINGS, ...r.patch })
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
  })
})

describe('buildQuickZeroPatch(2026-08-07 會議發現的迴歸)', () => {
  it('未對調時,直接以當下姿勢為零位', () => {
    const patch = buildQuickZeroPatch(raw(12, -8, 3, -1), SETTINGS)
    const cal = { ...SETTINGS, ...patch }
    const stand = applyCalibration(raw(12, -8, 3, -1), cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(stand.shinRoll).toBeCloseTo(0)
  })

  it('大腿貼歪 90°(proximalAxisRotationDeg=90)時仍能正確歸零 —— 修復前會歸到錯的物理軸', () => {
    const swapped = { ...SETTINGS, proximalAxisRotationDeg: 90 }
    // thigh raw 承載的其實是 roll 動作、thighRoll raw 承載的其實是 pitch 動作
    const currentRaw = raw(88, -8, 12, -1)
    const patch = buildQuickZeroPatch(currentRaw, swapped)
    const cal = { ...swapped, ...patch }
    const stand = applyCalibration(currentRaw, cal)
    // 對調後的「有效」pitch/roll 都應歸零,而不是原始軸歸零
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.shinRoll).toBeCloseTo(0)
  })

  it('沿用既有 invert 設定,不重新判定方向', () => {
    const inverted = { ...SETTINGS, proximalInvert: true, distalRollInvert: true }
    const patch = buildQuickZeroPatch(raw(20, 5, 0, -7), inverted)
    const cal = { ...inverted, ...patch }
    const stand = applyCalibration(raw(20, 5, 0, -7), cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.shin).toBeCloseTo(0)
    expect(stand.shinRoll).toBeCloseTo(0)
  })
})

describe('校準快照(migration 6)', () => {
  it('快照涵蓋全部被凍結的欄位,一個都不少', () => {
    // 漏掉任一欄位,那個欄位就是「有在影響角度、卻沒被記錄」——正是這個功能要消滅的狀況
    const snapshot = buildCalibrationSnapshot(SETTINGS)
    expect(Object.keys(snapshot).sort()).toEqual([...CALIBRATION_KEYS].sort())
  })

  it('快照存的是當下的值,不是參照;事後改設定不會回頭改寫已存的快照', () => {
    const settings: Settings = { ...SETTINGS, proximalZeroRaw: 12.5, distalInvert: true }
    const snapshot = buildCalibrationSnapshot(settings)
    settings.proximalZeroRaw = 99
    expect(snapshot.proximalZeroRaw).toBe(12.5)
    expect(snapshot.distalInvert).toBe(true)
  })

  it('序列化後可原樣還原(這是它進 DB 的形式)', () => {
    const snapshot = buildCalibrationSnapshot({ ...SETTINGS, proximalRollZeroRaw: -7.25 })
    expect(parseCalibrationSnapshot(JSON.stringify(snapshot))).toEqual(snapshot)
  })

  it('舊列(null)與壞掉的 JSON 都回傳 null,不丟例外', () => {
    // History 開啟舊 session 時會走到這裡;這裡丟例外等於整個分析視窗白屏
    expect(parseCalibrationSnapshot(null)).toBeNull()
    expect(parseCalibrationSnapshot('{ not json')).toBeNull()
    expect(parseCalibrationSnapshot('42')).toBeNull()
    expect(parseCalibrationSnapshot('null')).toBeNull()
  })
})

describe('calibrationDrift — 這場資料能不能照今天的設定解讀', () => {
  it('與目前設定相同時沒有漂移', () => {
    expect(calibrationDrift(buildCalibrationSnapshot(SETTINGS), SETTINGS)).toEqual([])
  })

  it('列出所有不一致的欄位', () => {
    const snapshot = buildCalibrationSnapshot(SETTINGS)
    const now: Settings = { ...SETTINGS, distalInvert: true, proximalZeroRaw: 4 }
    expect(calibrationDrift(snapshot, now).sort()).toEqual(['distalInvert', 'proximalZeroRaw'])
  })

  it('沒有快照時回傳空陣列——這是「不知道」,呼叫端另行處理,不可當成「一致」', () => {
    expect(calibrationDrift(null, SETTINGS)).toEqual([])
  })

  it('重跑精靈得到相同數值(只有時間戳與 verified 變了)不算漂移', () => {
    // 這是最常見的情況。若這裡報漂移,History 會對每一場都掛上「校準已改變」,
    // 真正的方向錯位就會被當成雜訊略過——警告只有在稀少時才是警告。
    const snapshot = buildCalibrationSnapshot(SETTINGS)
    const recalibrated: Settings = {
      ...SETTINGS,
      lastCalibratedAt: '2026-08-22T10:00:00.000Z',
      proximalRollVerified: true,
      distalRollVerified: true
    }
    expect(calibrationDrift(snapshot, recalibrated)).toEqual([])
  })

  it('每一個會改變算式的欄位單獨改動都偵測得到', () => {
    const snapshot = buildCalibrationSnapshot(SETTINGS)
    for (const key of CALIBRATION_TRANSFORM_KEYS) {
      const current = SETTINGS[key]
      const next =
        typeof current === 'boolean' ? !current : typeof current === 'number' ? current + 3 : 'z'
      const now = { ...SETTINGS, [key]: next } as Settings
      expect(calibrationDrift(snapshot, now)).toEqual([key])
    }
  })
})
