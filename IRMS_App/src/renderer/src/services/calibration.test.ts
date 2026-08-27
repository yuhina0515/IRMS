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
  detectAxisSwap,
  effectiveRaw,
  CAPTURE_STD_LIMIT_ABDUCTION,
  buildCalibrationSnapshot,
  calibrationDrift,
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
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighZeroRaw: 0,
  shinInvert: false,
  shinZeroRaw: 0,
  thighRollInvert: false,
  thighRollZeroRaw: 0,
  shinRollInvert: false,
  shinRollZeroRaw: 0,
  thighRollVerified: false,
  shinRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  showKneeRoll: false,
  lastCalibratedAt: null
}

describe('computeCaptureStats', () => {
  it('平均與最大標準差(取四軸最大)', () => {
    const stats = computeCaptureStats([raw(10, 0), raw(14, 0), raw(12, 0)])
    expect(stats.mean.thigh).toBeCloseTo(12)
    expect(stats.maxStdDev).toBeCloseTo(Math.sqrt(8 / 3))
  })
})

describe('detectAxisSwap / effectiveRaw', () => {
  it('彎曲動作出現在 pitch 軸 → 不對調', () => {
    const r = detectAxisSwap(raw(0, 0), raw(40, 0, 3, 0), 'thigh')
    expect(r).toEqual({ swap: false, delta: 40 })
  })
  it('彎曲動作出現在 roll 軸(感測器貼歪 90°)→ 對調', () => {
    const r = detectAxisSwap(raw(0, 0), raw(3, 0, 40, 0), 'thigh')
    expect(r.swap).toBe(true)
    expect(r.delta).toBe(40)
  })
  it('effectiveRaw 對調指定肢段的 pitch/roll', () => {
    const eff = effectiveRaw(raw(1, 2, 3, 4), { thighAxisSwap: true, shinAxisSwap: false })
    expect(eff).toEqual({ thigh: 3, thighRoll: 1, shin: 2, shinRoll: 4 })
  })
})

describe('buildCalibrationPatch — 驗證', () => {
  const okRaise = stable(raw(40, 0))
  const okFlex = stable(raw(0, -35))

  it('晃動過大 → unstable', () => {
    const r = buildCalibrationPatch({ mean: raw(0, 0), maxStdDev: 5 }, okRaise, okFlex, null, SETTINGS)
    expect(r).toEqual({ ok: false, error: 'unstable' })
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
    expect(r.patch.thighRollInvert).toBe(SETTINGS.thighRollInvert) // 沿用原設定
    expect(r.patch.thighRollVerified).toBe(false) // 未驗證
    expect(r.patch.shinRollInvert).toBe(false) // 20 ≥ 0 → 不反相
    expect(r.patch.shinRollVerified).toBe(true)
  })

  it('外展兩軸皆幅度不足 → 兩軸都沿用原設定,整步仍成功(等同跳過)', () => {
    const cur = { ...SETTINGS, thighRollInvert: true, thighRollVerified: true }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, stable(raw(0, 0, 5, -3)), cur)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighRollInvert).toBe(true)
    expect(r.patch.thighRollVerified).toBe(true) // 保留原本已驗證狀態,不因這次不足而清掉
    expect(r.patch.shinRollInvert).toBe(false)
    expect(r.patch.shinRollVerified).toBe(false)
  })

  it('跳過外展 → 沿用現有 roll invert 設定,verified 狀態不變', () => {
    const cur = { ...SETTINGS, thighRollInvert: true, thighRollVerified: true }
    const r = buildCalibrationPatch(stable(raw(0, 0)), okRaise, okFlex, null, cur)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighRollInvert).toBe(true)
    expect(r.patch.thighRollVerified).toBe(true)
    expect(r.patch.shinRollVerified).toBe(false)
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

describe('buildCalibrationPatch — round-trip(慣例最終保證)', () => {
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

  it('感測器貼歪 90°(彎曲出現在 roll 軸)→ axisSwap 修正後慣例仍成立', () => {
    // 大腿感測器轉了 90°:前抬時 thighRoll raw 大幅變化、thigh raw 幾乎不動
    const baseline = stable(raw(2, 1, 88, 3))
    const thighRaise = stable(raw(3, 1, 130, 3)) // 動作出現在 thighRoll 軸(+42)
    const kneeFlex = stable(raw(2, -34, 88, 3))
    const r = buildCalibrationPatch(baseline, thighRaise, kneeFlex, null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighAxisSwap).toBe(true)
    expect(r.patch.shinAxisSwap).toBe(false)

    const cal = { ...SETTINGS, ...r.patch }
    const stand = applyCalibration(baseline.mean, cal)
    expect(stand.thigh).toBeCloseTo(0)
    expect(stand.thighRoll).toBeCloseTo(0)
    expect(applyCalibration(thighRaise.mean, cal).thigh).toBeCloseTo(42) // 前抬為正
  })

  it('正向佩戴:不反相、不對調,僅歸零', () => {
    const baseline = stable(raw(-3, 2))
    const r = buildCalibrationPatch(baseline, stable(raw(42, 2)), stable(raw(-3, -33)), null, SETTINGS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.patch.thighAxisSwap).toBe(false)
    expect(r.patch.thighInvert).toBe(false)
    expect(r.patch.shinInvert).toBe(false)
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

  it('大腿貼歪 90°(thighAxisSwap)時仍能正確歸零 —— 修復前會歸到錯的物理軸', () => {
    const swapped = { ...SETTINGS, thighAxisSwap: true }
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
    const inverted = { ...SETTINGS, thighInvert: true, shinRollInvert: true }
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
    const settings: Settings = { ...SETTINGS, thighZeroRaw: 12.5, shinInvert: true }
    const snapshot = buildCalibrationSnapshot(settings)
    settings.thighZeroRaw = 99
    expect(snapshot.thighZeroRaw).toBe(12.5)
    expect(snapshot.shinInvert).toBe(true)
  })

  it('序列化後可原樣還原(這是它進 DB 的形式)', () => {
    const snapshot = buildCalibrationSnapshot({ ...SETTINGS, thighRollZeroRaw: -7.25 })
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
    const now: Settings = { ...SETTINGS, shinInvert: true, thighZeroRaw: 4 }
    expect(calibrationDrift(snapshot, now).sort()).toEqual(['shinInvert', 'thighZeroRaw'])
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
      thighRollVerified: true,
      shinRollVerified: true
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
