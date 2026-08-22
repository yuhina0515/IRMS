// store 純函式單元測試:applyCalibration 校準轉換、reconcileSelection 選取校正
import { describe, expect, it } from 'vitest'
import type { CustomAction } from '@shared/types'
import type { LiveAngles } from '@shared/protocol'
import { effectiveRaw } from '../services/calibration'
import {
  applyCalibration,
  CALIBRATION_KEYS,
  migrateSettings,
  reconcileSelection,
  splitCalibrationPatch,
  useStore,
  type Settings
} from './useStore'

const BASE_SETTINGS: Settings = {
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
  lastCalibratedAt: null
}

describe('migrateSettings', () => {
  it('v0 舊 settings 補齊新欄位,保留使用者既有校準值', () => {
    const old = { settings: { thighInvert: true, thighZeroRaw: -12.5, protocol: 'elbow' } }
    const { settings } = migrateSettings(old)
    expect(settings.thighInvert).toBe(true)
    expect(settings.thighZeroRaw).toBe(-12.5)
    expect(settings.protocol).toBe('elbow')
    expect(settings.lastCalibratedAt).toBeNull() // 新欄位補預設
    expect(settings.flushIntervalSec).toBe(2)
    expect(settings.thighRollVerified).toBe(false) // v3 新欄位補預設(未驗證)
    expect(settings.shinRollVerified).toBe(false)
  })

  it('空/毀損的 persist 資料回退為完整預設值', () => {
    expect(migrateSettings(undefined).settings.protocol).toBe('knee')
    expect(migrateSettings({}).settings.maxChartPoints).toBe(50)
  })

  it('v3 以前的符號摺疊 offset 換算成 zeroRaw(2026-08-12 會議:修掉 invert 事後翻轉的雙倍偏差缺陷)', () => {
    // invert=false:zeroRaw = -offset × 1
    const notInverted = migrateSettings({ settings: { thighInvert: false, thighOffset: 20 } })
    expect(notInverted.settings.thighZeroRaw).toBe(-20)

    // invert=true:zeroRaw = -offset × -1 = offset
    const inverted = migrateSettings({ settings: { thighInvert: true, thighOffset: -12.5 } })
    expect(inverted.settings.thighZeroRaw).toBe(-12.5)

    // 四軸都換算,且換算後 applyCalibration 在原校準姿勢下仍讀 0(可逆性的直接證明)
    const legacy = migrateSettings({
      settings: {
        thighInvert: true,
        thighOffset: -12.5,
        shinInvert: false,
        shinOffset: 20,
        thighRollInvert: true,
        thighRollOffset: 8,
        shinRollInvert: false,
        shinRollOffset: -6
      }
    }).settings
    // 每軸的 raw 就是其換算後的 zeroRaw(thigh -12.5、shin -20、thighRoll 8、shinRoll 6)
    const out = applyCalibration({ thigh: -12.5, shin: -20, thighRoll: 8, shinRoll: 6 }, legacy)
    expect(out.thigh).toBeCloseTo(0)
    expect(out.shin).toBeCloseTo(0)
    expect(out.thighRoll).toBeCloseTo(0)
    expect(out.shinRoll).toBeCloseTo(0)
  })

  it('已是新格式(有 zeroRaw)時不套用舊換算,原樣保留', () => {
    const { settings } = migrateSettings({ settings: { thighZeroRaw: 42 } })
    expect(settings.thighZeroRaw).toBe(42)
  })
})

describe('applyCalibration', () => {
  it('無校準時原樣輸出;knee 為絕對值,kneeRoll 帶符號(shinRoll−thighRoll,正=外翻)', () => {
    const out = applyCalibration({ thigh: 30, shin: -60, thighRoll: 5, shinRoll: 2 }, BASE_SETTINGS)
    expect(out.thigh).toBe(30)
    expect(out.shin).toBe(-60)
    expect(out.knee).toBe(90)
    expect(out.kneeRoll).toBe(-3) // 2 - 5:小腿較大腿偏內 → 內翻(負)
  })

  it('axisSwap:貼歪 90° 的肢段 pitch/roll 對調後再套 invert/zeroRaw', () => {
    const s = { ...BASE_SETTINGS, thighAxisSwap: true, thighZeroRaw: 10 }
    const out = applyCalibration({ thigh: 3, shin: 0, thighRoll: 50, shinRoll: 0 }, s)
    expect(out.thigh).toBe(40) // 取 thighRoll 50 → (50 - 10) * 1
    expect(out.thighRoll).toBe(3)
  })

  it('先減零位、再反相(順序不可顛倒)', () => {
    const s = { ...BASE_SETTINGS, thighInvert: true, thighZeroRaw: 10 }
    const out = applyCalibration({ thigh: 30, shin: 0, thighRoll: 0, shinRoll: 0 }, s)
    expect(out.thigh).toBe(-20) // (30 - 10) * -1
  })

  it('raw* 欄位保留未校準原始值(供校準 UI 顯示)', () => {
    const s = { ...BASE_SETTINGS, thighInvert: true, thighZeroRaw: 99 }
    const out = applyCalibration({ thigh: 30, shin: 1, thighRoll: 2, shinRoll: 3 }, s)
    expect(out.rawThigh).toBe(30)
    expect(out.rawShin).toBe(1)
  })
})

describe('applyCalibration — zeroRaw 不變式(2026-08-12 會議:由建構保證)', () => {
  it('∀ axisSwap/invert 組合(2⁶=64 種):zeroRaw 對應的原始姿勢一律讀 0,即使 invert 事後翻轉', () => {
    // 173/-168 刻意跨 ±180 分支切點,連帶驗證 wraparound 不會破壞不變式
    const zeroEff = { thigh: 11, shin: -47, thighRoll: 173, shinRoll: -168 }
    const bools = [false, true]
    let cases = 0
    for (const thighAxisSwap of bools) {
      for (const shinAxisSwap of bools) {
        for (const thighInvert of bools) {
          for (const shinInvert of bools) {
            for (const thighRollInvert of bools) {
              for (const shinRollInvert of bools) {
                cases++
                const mapping = { thighAxisSwap, shinAxisSwap }
                const s: Settings = {
                  ...BASE_SETTINGS,
                  ...mapping,
                  thighInvert,
                  shinInvert,
                  thighRollInvert,
                  shinRollInvert,
                  thighZeroRaw: zeroEff.thigh,
                  shinZeroRaw: zeroEff.shin,
                  thighRollZeroRaw: zeroEff.thighRoll,
                  shinRollZeroRaw: zeroEff.shinRoll
                }
                // effectiveRaw 是自身的反函式(swap 是對合),故用它把「有效值」還原成 raw
                const rawPose = effectiveRaw(zeroEff, mapping)
                const out = applyCalibration(rawPose, s)
                expect(out.thigh).toBeCloseTo(0, 9)
                expect(out.shin).toBeCloseTo(0, 9)
                expect(out.thighRoll).toBeCloseTo(0, 9)
                expect(out.shinRoll).toBeCloseTo(0, 9)
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(64)
  })
})

const action = (id: number, protocol: CustomAction['protocol'], targetAngle = 90): CustomAction => ({
  id,
  name: `A${id}`,
  description: null,
  protocol,
  targetAngle,
  tolerance: 10,
  holdTimeMs: 3000,
  triggerType: 'joint_angle',
  safetyLimit: null
})

describe('reconcileSelection', () => {
  const actions = [action(1, 'knee', 90), action(2, 'knee', 45), action(3, 'elbow', 100)]

  it('現選動作屬於當前協定 → 保留', () => {
    expect(reconcileSelection(actions, 'knee', 2)).toEqual({ selectedActionId: 2 })
  })

  it('現選動作屬於他協定 → 改選新協定第一個動作並帶入其參數', () => {
    const r = reconcileSelection(actions, 'elbow', 1)
    expect(r.selectedActionId).toBe(3)
    expect(r.params?.targetAngle).toBe(100)
  })

  it('現選動作已被刪除 → 改選同協定第一個', () => {
    const r = reconcileSelection(actions, 'knee', 99)
    expect(r.selectedActionId).toBe(1)
    expect(r.params?.targetAngle).toBe(90)
  })

  it('該協定無任何動作 → 清空選取', () => {
    expect(reconcileSelection(actions, 'shoulder', 1)).toEqual({ selectedActionId: null })
  })
})

describe('syncLiveFrame', () => {
  const angles: LiveAngles = {
    thigh: 10, shin: 0, knee: 10, thighRoll: 0, shinRoll: 0, kneeRoll: 0,
    rawThigh: 10, rawShin: 0, rawThighRoll: 0, rawShinRoll: 0
  }

  it('更新 angles;holdProgress 有變才換新 session 物件', () => {
    useStore.getState().patchSession({ holdProgress: 0 })
    useStore.getState().syncLiveFrame(angles, 42)
    expect(useStore.getState().angles).toBe(angles)
    expect(useStore.getState().session.holdProgress).toBe(42)
  })

  it('hold=null 或值未變 → session 物件參照不變(不觸發相關重繪)', () => {
    useStore.getState().patchSession({ holdProgress: 42 })
    const before = useStore.getState().session
    useStore.getState().syncLiveFrame(angles, null)
    expect(useStore.getState().session).toBe(before)
    useStore.getState().syncLiveFrame(angles, 42) // 同值
    expect(useStore.getState().session).toBe(before)
  })
})

describe('setSettings — Session 進行中凍結校準(migration 6 快照成立的前提)', () => {
  const startClean = (running: boolean): void => {
    useStore.setState({ settings: { ...BASE_SETTINGS }, logs: [] })
    useStore.getState().patchSession({ running })
  }

  it('splitCalibrationPatch 只攔校準欄位,顯示類設定照過', () => {
    const { allowed, frozen } = splitCalibrationPatch({
      thighZeroRaw: 12,
      thighInvert: true,
      maxChartPoints: 200
    })
    expect(frozen.sort()).toEqual(['thighInvert', 'thighZeroRaw'])
    expect(allowed).toEqual({ maxChartPoints: 200 })
  })

  it('進行中:校準欄位被忽略,原值保持不動', () => {
    startClean(true)
    useStore.getState().setSettings({ thighZeroRaw: 33, shinInvert: true })
    expect(useStore.getState().settings.thighZeroRaw).toBe(BASE_SETTINGS.thighZeroRaw)
    expect(useStore.getState().settings.shinInvert).toBe(BASE_SETTINGS.shinInvert)
  })

  it('進行中被忽略時會留下日誌,而不是靜默失敗', () => {
    startClean(true)
    useStore.getState().setSettings({ thighZeroRaw: 33 })
    const logged = useStore.getState().logs.some((l) => l.includes('Calibration frozen'))
    expect(logged).toBe(true)
    expect(useStore.getState().logs.some((l) => l.includes('thighZeroRaw'))).toBe(true)
  })

  it('進行中:同一筆 patch 內的非校準欄位仍然套用(不是整筆丟掉)', () => {
    startClean(true)
    useStore.getState().setSettings({ thighZeroRaw: 33, maxChartPoints: 123 })
    expect(useStore.getState().settings.thighZeroRaw).toBe(BASE_SETTINGS.thighZeroRaw)
    expect(useStore.getState().settings.maxChartPoints).toBe(123)
  })

  it('未進行:每一個校準欄位都照常寫得進去(凍結只在 Session 中生效)', () => {
    startClean(false)
    // 逐欄位掃過,避免日後新增欄位時只有被抽樣到的那幾個受測
    for (const key of CALIBRATION_KEYS) {
      const current = BASE_SETTINGS[key]
      const next =
        typeof current === 'boolean' ? !current : typeof current === 'number' ? current + 7 : 'x'
      useStore.getState().setSettings({ [key]: next } as Partial<Settings>)
      expect(useStore.getState().settings[key]).toEqual(next)
    }
  })
})
