// store 純函式單元測試:applyCalibration 校準轉換、reconcileSelection 選取校正
import { describe, expect, it } from 'vitest'
import type { CustomAction } from '@shared/types'
import type { LiveAngles } from '@shared/protocol'
import { effectiveRaw } from '../services/calibration'
import { deriveHingeAxis } from '../services/angleMath'
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
}

describe('migrateSettings', () => {
  it('v0 舊 settings 補齊新欄位,保留使用者既有校準值', () => {
    // v0 是最早的持久化形狀,理當用當年的 thigh/shin 命名(v11 才改名 proximal/distal),
    // 藉此順便證明 migrateSettings 能一路從最舊格式升級到現在
    const old = { settings: { thighInvert: true, thighZeroRaw: -12.5, protocol: 'elbow' } }
    const { settings } = migrateSettings(old)
    expect(settings.proximalInvert).toBe(true)
    expect(settings.proximalZeroRaw).toBe(-12.5)
    expect(settings.protocol).toBe('elbow')
    expect(settings.lastCalibratedAt).toBeNull() // 新欄位補預設
    expect(settings.flushIntervalSec).toBe(2)
    expect(settings.proximalRollVerified).toBe(false) // v3 新欄位補預設(未驗證)
    expect(settings.distalRollVerified).toBe(false)
  })

  it('空/毀損的 persist 資料回退為完整預設值', () => {
    expect(migrateSettings(undefined).settings.protocol).toBe('knee')
    expect(migrateSettings({}).settings.maxChartPoints).toBe(50)
  })

  // v4→v5 的迴歸鎖。這個測試真正在保護的不是 migrateSettings(它是
  // {...DEFAULT_SETTINGS, ...rest},本來就補得了),而是**「新增欄位必須 bump
  // persist version」這條規則**:migrate 只在 persisted version < current 時才會被
  // 呼叫,版本不動就不會跑,zustand 預設的淺層 merge 會拿舊的 settings 物件整個
  // 蓋掉初始值,新欄位變成 undefined,而 UI 上的表現是開關永遠打不開又沒有錯誤。
  it('v4 的 persist 資料補上 v5 新欄位 showKneeRoll,且不動使用者既有值', () => {
    // v4 已經是 zeroRaw 格式(不是符號摺疊 offset),但仍是 thigh/shin 命名(v11 才改名)
    const v4 = {
      settings: {
        protocol: 'knee',
        maxChartPoints: 120,
        thighZeroRaw: -8.25,
        thighInvert: true
      }
    }
    const { settings } = migrateSettings(v4)
    expect(settings.showKneeRoll).toBe(false) // 新欄位補預設
    expect(settings.maxChartPoints).toBe(120) // 使用者既有值不被覆蓋
    expect(settings.proximalZeroRaw).toBe(-8.25)
    expect(settings.proximalInvert).toBe(true)
  })

  it('v8 的 persist 資料補上 v9 新欄位 showTrendChart/show3D2DPose,且不動使用者既有值', () => {
    const v8 = {
      settings: {
        protocol: 'knee',
        maxChartPoints: 80,
        showKneeRoll: true
      }
    }
    const { settings } = migrateSettings(v8)
    expect(settings.showTrendChart).toBe(false) // 新欄位補預設(收起)
    expect(settings.show3D2DPose).toBe(false)
    expect(settings.maxChartPoints).toBe(80) // 使用者既有值不被覆蓋
    expect(settings.showKneeRoll).toBe(true)
  })

  it('v9 的 persist 資料補上 v10 新欄位 allowBetaUpdates,且不動使用者既有值', () => {
    const v9 = {
      settings: {
        protocol: 'knee',
        maxChartPoints: 80,
        showTrendChart: true
      }
    }
    const { settings } = migrateSettings(v9)
    expect(settings.allowBetaUpdates).toBe(true) // 新欄位補預設(維持既有的一律 beta 行為)
    expect(settings.maxChartPoints).toBe(80) // 使用者既有值不被覆蓋
    expect(settings.showTrendChart).toBe(true)
  })

  it('v12 的 persist 資料補上 v13 新欄位 sidebarCollapsed,且不動使用者既有值', () => {
    const v12 = {
      settings: {
        protocol: 'knee',
        maxChartPoints: 80,
        allowBetaUpdates: false
      }
    }
    const { settings } = migrateSettings(v12)
    expect(settings.sidebarCollapsed).toBe(false) // 新欄位補預設(展開)
    expect(settings.maxChartPoints).toBe(80) // 使用者既有值不被覆蓋
    expect(settings.allowBetaUpdates).toBe(false)
  })

  it('v13 的 persist 資料補上 v14 遙測欄位(預設關閉),且不動使用者既有值', () => {
    const v13 = { settings: { protocol: 'knee', sidebarCollapsed: true } }
    const { settings } = migrateSettings(v13)
    expect(settings.telemetryEnabled).toBe(false)
    expect(settings.telemetryEndpoint).toBe('https://hina-tw.ddns.net/irms-api')
    expect(settings.sidebarCollapsed).toBe(true)
  })

  it('v3 以前的符號摺疊 offset 換算成 zeroRaw(2026-08-12 會議:修掉 invert 事後翻轉的雙倍偏差缺陷)', () => {
    // 這組測試刻意模擬 v3 以前的舊 persisted JSON 形狀——thigh/shin 命名(v11 才改名
    // proximal/distal,見 ROADMAP D3)+ 符號摺疊 offset(v4 才改 zeroRaw)兩層舊格式疊在一起,
    // 輸入物件的 key 必須原封不動保留舊名稱,migrateSettings 才吃得到這條舊换算路徑。

    // invert=false:zeroRaw = -offset × 1
    const notInverted = migrateSettings({ settings: { thighInvert: false, thighOffset: 20 } })
    expect(notInverted.settings.proximalZeroRaw).toBe(-20)

    // invert=true:zeroRaw = -offset × -1 = offset
    const inverted = migrateSettings({ settings: { thighInvert: true, thighOffset: -12.5 } })
    expect(inverted.settings.proximalZeroRaw).toBe(-12.5)

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
    const { settings } = migrateSettings({ settings: { proximalZeroRaw: 42 } })
    expect(settings.proximalZeroRaw).toBe(42)
  })
})

describe('applyCalibration', () => {
  it('新韌體有加速度向量時優先使用向量，不受奇異區舊 Euler 欄位污染', () => {
    const raw = {
      thigh: 75,
      shin: 88,
      thighRoll: -25,
      shinRoll: -78,
      thighAccel: { x: 0, y: 1, z: 0 },
      shinAccel: { x: 0, y: 1, z: 0 }
    }
    const s = { ...BASE_SETTINGS, proximalZeroRaw: 90, distalZeroRaw: 90 }
    const out = applyCalibration(raw, s)
    expect(out.thigh).toBeCloseTo(0)
    expect(out.shin).toBeCloseTo(0)
    expect(out.knee).toBeCloseTo(0)
  })

  it('右腳實測回歸：z≈0 時屈膝資訊落在 x/y 平面，仍以 3D 向量算出關節角', () => {
    const stand = {
      thigh: 84,
      shin: 92,
      thighRoll: -30,
      shinRoll: 80,
      thighAccel: { x: -0.06, y: 0.993, z: 0.1 },
      shinAccel: { x: 0, y: 1, z: -0.023 }
    }
    const flex = {
      thigh: 88,
      shin: 88,
      thighRoll: -87,
      shinRoll: 83,
      thighAccel: { x: -0.636, y: 0.771, z: 0.031 },
      shinAccel: { x: 0.347, y: 0.937, z: 0.036 }
    }
    const standingRawAngle = applyCalibration(stand, BASE_SETTINGS).knee
    const s = { ...BASE_SETTINGS, kneeZeroRaw: standingRawAngle }

    expect(applyCalibration(stand, s).knee).toBeCloseTo(0, 5)
    expect(applyCalibration(flex, s).knee).toBeGreaterThan(45)
    expect(applyCalibration(flex, s).knee).toBeLessThan(65)
  })

  it('向量站姿基準 + 屈曲軸讓 THIGH/SHIN/roll 在 Euler 奇異區仍可真正歸零(2026-09-15 3D 貼裝改版)', () => {
    const thighZero = { x: -0.06, y: 0.993, z: 0.1 }
    const shinZero = { x: 0, y: 1, z: -0.023 }
    const raw = {
      thigh: 84,
      shin: 92,
      thighRoll: -30,
      shinRoll: 80,
      thighAccel: thighZero,
      shinAccel: shinZero
    }
    // 任意「移動終點」皆可推出一個與基準垂直的屈曲軸——這個測試只驗證站姿本身
    // 歸零,不依賴屈曲軸的實際物理方向。
    const proximalHingeAxis = deriveHingeAxis(thighZero, { x: thighZero.x + 0.2, y: thighZero.y, z: thighZero.z })
    const distalHingeAxis = deriveHingeAxis(shinZero, { x: shinZero.x, y: shinZero.y, z: shinZero.z + 0.2 })
    const s = {
      ...BASE_SETTINGS,
      proximalZeroAccel: thighZero,
      distalZeroAccel: shinZero,
      proximalHingeAxis,
      distalHingeAxis
    }
    const out = applyCalibration(raw, s)

    expect(out.thigh).toBeCloseTo(0)
    expect(out.shin).toBeCloseTo(0)
    expect(out.thighRoll).toBeCloseTo(0)
    expect(out.shinRoll).toBeCloseTo(0)
  })

  it('僅有站姿基準、無屈曲軸(舊資料未重跑精靈)→ 退回 Euler 路徑,不假裝已知貼裝方向', () => {
    const thighZero = { x: -0.06, y: 0.993, z: 0.1 }
    const raw = { thigh: 84, shin: 0, thighRoll: -30, shinRoll: 0, thighAccel: thighZero }
    const s = { ...BASE_SETTINGS, proximalZeroAccel: thighZero }
    const out = applyCalibration(raw, s)
    // Euler 路徑用 raw.thighAccel 算出的 pitch 減 proximalZeroRaw(預設 0),不等於 0——
    // 這正是提示使用者需要重跑精靈以取得 proximalHingeAxis 的訊號,而不是靜默算錯。
    expect(out.thigh).not.toBeCloseTo(0)
  })

  it('無校準時原樣輸出;knee 為絕對值,kneeRoll 帶符號(shinRoll−thighRoll,正=外翻)', () => {
    const out = applyCalibration({ thigh: 30, shin: -60, thighRoll: 5, shinRoll: 2 }, BASE_SETTINGS)
    expect(out.thigh).toBe(30)
    expect(out.shin).toBe(-60)
    expect(out.knee).toBe(90)
    expect(out.kneeRoll).toBe(-3) // 2 - 5:小腿較大腿偏內 → 內翻(負)
  })

  it('axisRotationDeg=90(貼歪 90°):pitch 端與舊版 axisSwap 慣例一致,roll 端多一次變號', () => {
    // 見 angleMath.ts rotateRawAxes 開頭推導:90° 邊界是真旋轉,不是舊版布林 swap 的
    // 純交換(反射)——兩者在拓樸上不可能重合,必然有一軸多一次變號,由獨立的
    // roll invert 吸收(這正是遷移後舊資料被標記 legacy/unverified 的原因)。
    const s = { ...BASE_SETTINGS, proximalAxisRotationDeg: 90, proximalZeroRaw: 10 }
    const out = applyCalibration({ thigh: 3, shin: 0, thighRoll: 50, shinRoll: 0 }, s)
    expect(out.thigh).toBeCloseTo(40) // 取 thighRoll 50 → (50 - 10) * 1,與舊版一致
    expect(out.thighRoll).toBeCloseTo(-3) // 取 thigh 3,但變號(舊版 axisSwap 是 +3)
  })

  it('先減零位、再反相(順序不可顛倒)', () => {
    const s = { ...BASE_SETTINGS, proximalInvert: true, proximalZeroRaw: 10 }
    const out = applyCalibration({ thigh: 30, shin: 0, thighRoll: 0, shinRoll: 0 }, s)
    expect(out.thigh).toBe(-20) // (30 - 10) * -1
  })

  it('raw* 欄位保留未校準原始值(供校準 UI 顯示)', () => {
    const s = { ...BASE_SETTINGS, proximalInvert: true, proximalZeroRaw: 99 }
    const out = applyCalibration({ thigh: 30, shin: 1, thighRoll: 2, shinRoll: 3 }, s)
    expect(out.rawThigh).toBe(30)
    expect(out.rawShin).toBe(1)
  })
})

describe('applyCalibration — zeroRaw 不變式(2026-08-12 會議:由建構保證)', () => {
  // rotateRawAxes 的 az 正負號是由「當下這一筆 pitch 讀值」的 cos 正負號現場推導
  // (見 angleMath.ts reconstructTiltVector),不是跨呼叫追蹤的狀態——這對單次呼叫
  // (真實 App 唯一的用法:effectiveRaw 只會餵真正的 raw 讀值,不會餵別次呼叫的輸出)
  // 是正確且足夠的,但代表「先以 -θ 反旋轉出 raw、再以 +θ 正向驗證」這種疊兩次呼叫
  // 的技巧不通用(反旋轉可能把 pitch 推過 cos=0 的邊界,兩次呼叫各自推導出不同的 az
  // 正負號,疊起來就不是恆等變換)。以下測試改為直接指定 raw 姿勢、算出對應的
  // zeroRaw(與 buildQuickZeroPatch 的真實用法同構,只呼叫 effectiveRaw 一次),
  // 而不是反推 raw 姿勢。
  it('∀ axisRotationDeg{0,90}/invert 組合(2⁶=64 種):zeroRaw 對應的原始姿勢一律讀 0,即使 invert 事後翻轉', () => {
    // 173/-168 刻意跨 ±180 分支切點,連帶驗證 wraparound 不會破壞不變式
    const rawPose = { thigh: 11, shin: -47, thighRoll: 173, shinRoll: -168 }
    const bools = [false, true]
    const rotations = [0, 90]
    let cases = 0
    for (const proximalAxisRotationDeg of rotations) {
      for (const distalAxisRotationDeg of rotations) {
        for (const proximalInvert of bools) {
          for (const distalInvert of bools) {
            for (const proximalRollInvert of bools) {
              for (const distalRollInvert of bools) {
                cases++
                const mapping = { proximalAxisRotationDeg, distalAxisRotationDeg }
                const zeroEff = effectiveRaw(rawPose, mapping)
                const s: Settings = {
                  ...BASE_SETTINGS,
                  ...mapping,
                  proximalInvert,
                  distalInvert,
                  proximalRollInvert,
                  distalRollInvert,
                  proximalZeroRaw: zeroEff.thigh,
                  distalZeroRaw: zeroEff.shin,
                  proximalRollZeroRaw: zeroEff.thighRoll,
                  distalRollZeroRaw: zeroEff.shinRoll
                }
                const out = applyCalibration(rawPose, s)
                expect(out.thigh).toBeCloseTo(0, 6)
                expect(out.shin).toBeCloseTo(0, 6)
                expect(out.thighRoll).toBeCloseTo(0, 6)
                expect(out.shinRoll).toBeCloseTo(0, 6)
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(64)
  })

  it('非邊界的連續旋轉角(37°)同樣成立——不是只有 0°/90° 兩個特例湊巧對', () => {
    const rawPose = { thigh: 11, shin: -47, thighRoll: 173, shinRoll: -168 }
    const mapping = { proximalAxisRotationDeg: 37, distalAxisRotationDeg: -22 }
    const zeroEff = effectiveRaw(rawPose, mapping)
    const s: Settings = {
      ...BASE_SETTINGS,
      ...mapping,
      proximalZeroRaw: zeroEff.thigh,
      distalZeroRaw: zeroEff.shin,
      proximalRollZeroRaw: zeroEff.thighRoll,
      distalRollZeroRaw: zeroEff.shinRoll
    }
    const out = applyCalibration(rawPose, s)
    expect(out.thigh).toBeCloseTo(0, 6)
    expect(out.shin).toBeCloseTo(0, 6)
    expect(out.thighRoll).toBeCloseTo(0, 6)
    expect(out.shinRoll).toBeCloseTo(0, 6)
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
      proximalZeroRaw: 12,
      proximalInvert: true,
      maxChartPoints: 200
    })
    expect(frozen.sort()).toEqual(['proximalInvert', 'proximalZeroRaw'])
    expect(allowed).toEqual({ maxChartPoints: 200 })
  })

  it('進行中:校準欄位被忽略,原值保持不動', () => {
    startClean(true)
    useStore.getState().setSettings({ proximalZeroRaw: 33, distalInvert: true })
    expect(useStore.getState().settings.proximalZeroRaw).toBe(BASE_SETTINGS.proximalZeroRaw)
    expect(useStore.getState().settings.distalInvert).toBe(BASE_SETTINGS.distalInvert)
  })

  it('進行中被忽略時會留下日誌,而不是靜默失敗', () => {
    startClean(true)
    useStore.getState().setSettings({ proximalZeroRaw: 33 })
    const logged = useStore.getState().logs.some((l) => l.includes('Calibration frozen'))
    expect(logged).toBe(true)
    expect(useStore.getState().logs.some((l) => l.includes('proximalZeroRaw'))).toBe(true)
  })

  it('進行中:同一筆 patch 內的非校準欄位仍然套用(不是整筆丟掉)', () => {
    startClean(true)
    useStore.getState().setSettings({ proximalZeroRaw: 33, maxChartPoints: 123 })
    expect(useStore.getState().settings.proximalZeroRaw).toBe(BASE_SETTINGS.proximalZeroRaw)
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
