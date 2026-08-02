// store 純函式單元測試:applyCalibration 校準轉換、reconcileSelection 選取校正
import { describe, expect, it } from 'vitest'
import type { CustomAction } from '@shared/types'
import type { LiveAngles } from '@shared/protocol'
import { applyCalibration, migrateSettings, reconcileSelection, useStore, type Settings } from './useStore'

const BASE_SETTINGS: Settings = {
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighOffset: 0,
  shinInvert: false,
  shinOffset: 0,
  thighRollInvert: false,
  thighRollOffset: 0,
  shinRollInvert: false,
  shinRollOffset: 0,
  thighRollVerified: false,
  shinRollVerified: false,
  protocol: 'knee',
  maxChartPoints: 50,
  flushIntervalSec: 2,
  lastCalibratedAt: null
}

describe('migrateSettings', () => {
  it('v0 舊 settings 補齊新欄位,保留使用者既有校準值', () => {
    const old = { settings: { thighInvert: true, thighOffset: -12.5, protocol: 'elbow' } }
    const { settings } = migrateSettings(old)
    expect(settings.thighInvert).toBe(true)
    expect(settings.thighOffset).toBe(-12.5)
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
})

describe('applyCalibration', () => {
  it('無校準時原樣輸出;knee 為絕對值,kneeRoll 帶符號(shinRoll−thighRoll,正=外翻)', () => {
    const out = applyCalibration({ thigh: 30, shin: -60, thighRoll: 5, shinRoll: 2 }, BASE_SETTINGS)
    expect(out.thigh).toBe(30)
    expect(out.shin).toBe(-60)
    expect(out.knee).toBe(90)
    expect(out.kneeRoll).toBe(-3) // 2 - 5:小腿較大腿偏內 → 內翻(負)
  })

  it('axisSwap:貼歪 90° 的肢段 pitch/roll 對調後再套 invert/offset', () => {
    const s = { ...BASE_SETTINGS, thighAxisSwap: true, thighOffset: -10 }
    const out = applyCalibration({ thigh: 3, shin: 0, thighRoll: 50, shinRoll: 0 }, s)
    expect(out.thigh).toBe(40) // 取 thighRoll 50 → offset -10
    expect(out.thighRoll).toBe(3)
  })

  it('反相先乘、偏移後加(順序不可顛倒)', () => {
    const s = { ...BASE_SETTINGS, thighInvert: true, thighOffset: 10 }
    const out = applyCalibration({ thigh: 30, shin: 0, thighRoll: 0, shinRoll: 0 }, s)
    expect(out.thigh).toBe(-20) // 30 * -1 + 10
  })

  it('raw* 欄位保留未校準原始值(供校準 UI 顯示)', () => {
    const s = { ...BASE_SETTINGS, thighInvert: true, thighOffset: 99 }
    const out = applyCalibration({ thigh: 30, shin: 1, thighRoll: 2, shinRoll: 3 }, s)
    expect(out.rawThigh).toBe(30)
    expect(out.rawShin).toBe(1)
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
