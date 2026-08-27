// --- 硬體回饋鏈的指令稽核測試(T1–T6)---
//
// 為什麼這個檔案存在:`CMD:LED_ON` / `CMD:GOAL` / `CMD:ALARM_ON` 是整個系統裡
// **唯一會主動對患者發出指令**的東西——蜂鳴器綁在患者腿上。而在此之前,
// 這條鏈從未被任何形式驗證過:173 個測試全在純函式層,sessionController
// 這 368 行沒有一行被測到,實機驗證也只做到「連得上、校準跑得完」為止。
//
// 手法:bluetoothService.send 是所有指令的唯一出口,對它 spy 就得到一份**有序的
// 指令稽核**。順序本身就是斷言的一部分——「有沒有送」與「什麼時候送」是兩個
// 不同的問題,而後者才是 LED 卡住、警報不重新武裝這類缺陷的所在。
//
// 封包一律經 encodeAnglePacket → bluetoothService.ingest 進入,走與真實封包
// 完全同一條路(parseAnglePacket → applyCalibration → 平滑 → 引擎),
// 這是 2026-08-03 會議否決 onAnglesReceived 接縫時的硬性要求。

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { CustomAction } from '@shared/types'
import { installIrmsStub, type IrmsStub } from '../test/irmsStub'
import { useStore, type Settings } from '../store/useStore'
import { bluetoothService } from './bluetooth'
import { ALARM_SILENCE_MS, sessionController } from './sessionController'
import { ERR_PACKET, encodeAnglePacket, truncateTo } from './simulation/encode'
import { poseForKnee } from './simulation/kinematics'
import { REFERENCE_ACTION } from './simulation/scenarios'

const COMM_PERIOD_MS = 40

// node 環境沒有 localStorage,而 useStore 掛了 zustand persist。少了它,每一次
// set() 都會往 stderr 吐一行「storage is currently unavailable」——狀態本身仍
// 正確更新,所以只是雜訊,但一個測試吐三十行會讓真正的失敗訊息完全埋掉。
// 補一個記憶體版:persist 得到它預期的介面,測試輸出保持可讀。
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size
      }
    },
    configurable: true
  })
}

/** 參考動作:zone = { min: 80, max: 100, overLimit: 120, rest: 30 } */
const ACTION: CustomAction = {
  id: 1,
  name: '測試動作',
  description: null,
  protocol: 'knee',
  ...REFERENCE_ACTION
}

const IN_ZONE = 90
const REST = 10
const OVER_LIMIT = 130

/** 恆等校準:讓 poseForKnee(K) 直接等於判定看到的 K */
const IDENTITY_CALIBRATION: Partial<Settings> = {
  thighAxisSwap: false,
  shinAxisSwap: false,
  thighInvert: false,
  thighZeroRaw: 0,
  shinInvert: false,
  shinZeroRaw: 0,
  thighRollInvert: false,
  thighRollZeroRaw: 0,
  shinRollInvert: false,
  shinRollZeroRaw: 0
}

// 明確標註型別而非 ReturnType<typeof vi.spyOn>:後者沒有帶泛型參數,
// mock.calls 會退化成 any[],於是「稽核裡到底是不是字串」這件事失去型別保護
let sendSpy: MockInstance<(command: string) => Promise<void>>
let stub: IrmsStub

/**
 * EMA 平滑層(α=0.3)收斂到目標值所需的封包數。
 *
 * 這不是隨手挑的:平滑器在鏈路重設後由第一筆播種,之後每筆只走 30% 的差距,
 * 所以「把角度換成 90」與「判定看到 90」之間隔著好幾拍(1−0.7ⁿ:5 筆才 83%,
 * 從 10° 出發只到 76.6°,還沒進到 80° 的區間下限)。第一版測試就是踩在這裡,
 * 誤以為抓到缺陷。給足收斂時間,測試斷言的才是判定邏輯,不是平滑器的斜率。
 */
const EMA_SETTLE_PACKETS = 15

/** 送出 n 個「膝夾角 = knee」的封包,每個之間推進一個 BLE 推播週期 */
function feed(knee: number, packets: number): void {
  for (let i = 0; i < packets; i++) {
    bluetoothService.ingest(encodeAnglePacket(poseForKnee(knee)))
    vi.advanceTimersByTime(COMM_PERIOD_MS)
  }
}

/** 目前為止的指令稽核(有序) */
function transcript(): string[] {
  return sendSpy.mock.calls.map(([command]) => command)
}

function countOf(cmd: string): number {
  return transcript().filter((c) => c === cmd).length
}

beforeEach(() => {
  vi.useFakeTimers()
  stub = installIrmsStub()

  useStore.setState({
    customActions: [ACTION],
    selectedActionId: ACTION.id,
    settings: { ...useStore.getState().settings, ...IDENTITY_CALIBRATION, protocol: 'knee' }
  })
  useStore.getState().setParams({
    targetAngle: ACTION.targetAngle,
    tolerance: ACTION.tolerance,
    holdTimeMs: ACTION.holdTimeMs
  })
  useStore.getState().resetSession()

  // 乾淨的鏈路:beginSimulated 會重設串流狀態,而 setConnection 的
  // false→true 轉換會讓 sessionController 重設引擎與指令去重快取。
  bluetoothService.endSimulated()
  useStore.getState().setConnection(false, null)
  bluetoothService.beginSimulated('test-link')

  // spy 裝在整備之後,稽核裡才不會混入整備動作產生的指令
  sendSpy = vi.spyOn(bluetoothService, 'send')
})

afterEach(async () => {
  // 有進行中的 Session 就收掉,避免計時器與緩衝跨測試殘留
  if (useStore.getState().session.id != null) await sessionController.endSession()
  bluetoothService.endSimulated()
  sendSpy.mockRestore()
  stub.uninstall()
  vi.useRealTimers()
})

// ─────────────────────────────────────────────────────────────
// T1 — 警報鏈:超限 → 靜音 → 自動重新武裝
// 本專案安全意義最高、且此前完全未測的一段。
// ─────────────────────────────────────────────────────────────
describe('T1 超限警報:鳴響、靜音、自動重新武裝', () => {
  it('走完整條鏈,且每個轉換只下發一次指令', async () => {
    await sessionController.startSession()

    // 休息位不該有任何警報
    feed(REST, 25)
    expect(countOf('CMD:ALARM_ON')).toBe(0)

    // 超過 overLimit(120):警報鳴響,且 25Hz 的資料流下只送一次
    // ——這證明去重撐得住整條資料流,而不是只在狀態轉換那一拍正確
    feed(OVER_LIMIT, 25)
    expect(countOf('CMD:ALARM_ON')).toBe(1)
    expect(useStore.getState().session.alarmActive).toBe(true)

    // 手動靜音:蜂鳴器綁在患者腿上,必須有軟體開關
    sessionController.silenceAlarm()
    expect(countOf('CMD:ALARM_OFF')).toBeGreaterThanOrEqual(1)
    expect(useStore.getState().session.alarmActive).toBe(false)

    // 靜音期間持續超限也不得重新鳴響
    vi.advanceTimersByTime(ALARM_SILENCE_MS - 2000)
    feed(OVER_LIMIT, 5)
    expect(countOf('CMD:ALARM_ON')).toBe(1)

    // 靜音到期、仍然超限 → 必須自動重新鳴響。
    // 靜音是暫時的,不是一鍵永久關掉一個安全訊號。
    vi.advanceTimersByTime(3000)
    feed(OVER_LIMIT, 5)
    expect(countOf('CMD:ALARM_ON')).toBe(2)
    expect(useStore.getState().session.alarmActive).toBe(true)
  })

  it('回到安全範圍即解除警報', async () => {
    await sessionController.startSession()
    feed(OVER_LIMIT, 10)
    expect(countOf('CMD:ALARM_ON')).toBe(1)

    feed(REST, 25)
    expect(useStore.getState().session.alarmActive).toBe(false)
    expect(countOf('CMD:ALARM_OFF')).toBeGreaterThanOrEqual(1)
    // 刻意不斷言「ALARM_OFF 是稽核的最後一筆」:由 130° 放回 10° 的過程中,
    // 腿會**經過**目標區間(80–100),於是後面還會有一組 LED_ON/LED_OFF。
    // 那是正確行為——真人放腿本來就會經過目標角度——第一版測試在這裡寫錯了。
    expect(countOf('CMD:ALARM_ON')).toBe(1)
  })

  it('結束 Session 時強制關閉兩個輸出', async () => {
    await sessionController.startSession()
    feed(OVER_LIMIT, 10)
    await sessionController.endSession()

    expect(transcript().slice(-2)).toEqual(['CMD:LED_OFF', 'CMD:ALARM_OFF'])
  })
})

// ─────────────────────────────────────────────────────────────
// T2 — 未開始 Session 不得鳴響(已修臨床缺陷的迴歸鎖)
// 連線後只是坐上椅子(膝約 90–120°)就會超過預設動作的 overLimit,
// 患者腿上會憑空長鳴,而且沒有 Session 可以結束。
// ─────────────────────────────────────────────────────────────
describe('T2 未開始 Session 時的超限', () => {
  it('不鳴響;開始 Session 之後同樣的姿勢才鳴響', async () => {
    feed(OVER_LIMIT, 25)
    expect(countOf('CMD:ALARM_ON')).toBe(0)
    expect(useStore.getState().session.alarmActive).toBe(false)

    await sessionController.startSession()
    feed(OVER_LIMIT, 5)
    expect(countOf('CMD:ALARM_ON')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────
// T3 — ERR: 強制關閉回饋,並在復原後繞過去重重新武裝
// ─────────────────────────────────────────────────────────────
describe('T3 硬體錯誤', () => {
  it('ERR 當下強制關閉兩個輸出並清空判定狀態', async () => {
    await sessionController.startSession()
    feed(IN_ZONE, 5)
    expect(countOf('CMD:LED_ON')).toBe(1)

    bluetoothService.ingest(ERR_PACKET)

    expect(useStore.getState().hardwareError).toBe(ERR_PACKET)
    expect(transcript().slice(-2)).toEqual(['CMD:LED_OFF', 'CMD:ALARM_OFF'])
    const { session } = useStore.getState()
    expect(session.holdProgress).toBe(0)
    expect(session.inZone).toBe(false)
    expect(session.alarmActive).toBe(false)
  })

  it('復原後再次進區必須重新送出 LED_ON(去重快取須被繞過)', async () => {
    await sessionController.startSession()
    feed(IN_ZONE, 5)
    bluetoothService.ingest(ERR_PACKET)

    // 任何合法封包都代表硬體復原
    feed(REST, 3)
    expect(useStore.getState().hardwareError).toBeNull()

    // 若 handleHardwareError 沒有把去重快取壓成 'off',這裡的 LED_ON 會被吃掉,
    // 患者接下來整場都不會再看到達標燈,而且不會有任何錯誤訊息
    feed(IN_ZONE, EMA_SETTLE_PACKETS)
    expect(countOf('CMD:LED_ON')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────
// T4 — 一下完整療程的指令稽核
// ─────────────────────────────────────────────────────────────
describe('T4 達標計數', () => {
  it('進區 → 保持過門檻 → 達標,指令順序為 LED_ON 然後 GOAL', async () => {
    await sessionController.startSession()

    // holdTimeMs = 2000ms,以 40ms 一拍計需要 50 拍以上
    feed(IN_ZONE, 60)

    // 達標的完整序列:進區亮燈 → 達標即離區熄燈 → 達標音。
    // LED_OFF 排在 GOAL 之前是刻意的:熄燈屬於「離開區間」這個狀態變化,
    // 與計數/達標音是兩件事,而且未開始 Session 時只會發生前者。
    expect(transcript().filter((c) => c !== 'CMD:ALARM_OFF')).toEqual([
      'CMD:LED_ON',
      'CMD:LED_OFF',
      'CMD:GOAL'
    ])
    expect(useStore.getState().session.reps).toBe(1)
    expect(stub.sessions.progress).toHaveBeenCalledWith(1, 1)
  })

  it('回位後再次進區,必須再次送出 LED_ON', async () => {
    await sessionController.startSession()
    feed(IN_ZONE, 60) // 第一下達標
    expect(countOf('CMD:GOAL')).toBe(1)

    // 回到休息位(< rest 30),引擎由 restPending 回到 idle
    feed(REST, 25)

    // 第二次進區:患者應該再次看到達標區間的 LED 回饋
    feed(IN_ZONE, 60)
    expect(countOf('CMD:GOAL')).toBe(2)
    expect(useStore.getState().session.reps).toBe(2)
    expect(countOf('CMD:LED_ON')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────
// T5 — 斷線重連
//
// ⚠ 這裡的兩個測試各自鎖住**不同**的一段程式,不要合併:
//   第一個鎖「斷線時清空指令去重快取」(訂閱器的 prev.isConnected && !state.isConnected)
//   第二個鎖「重連時重設引擎狀態」(訂閱器的 !prev.isConnected && state.isConnected)
//
// 這件事是實測出來的,不是推導:原本只寫了第一個測試,並以為它同時涵蓋兩者。
// 把重連重設那三行拿掉之後測試照樣全綠——因為 ALARM_ON 能重送靠的是去重快取被清空,
// 與引擎有沒有重設無關。重連重設真正保護的是下面第二個測試的情境。
// ─────────────────────────────────────────────────────────────
describe('T5 斷線重連', () => {
  it('斷線清空去重快取,重連後仍超限時警報得以重新鳴響', async () => {
    await sessionController.startSession()
    feed(OVER_LIMIT, 10)
    expect(countOf('CMD:ALARM_ON')).toBe(1)

    // ESP32 斷線後 GPIO 狀態未知(可能重開機);若不清快取,
    // 重連後的第一次 ALARM_ON 會被去重吃掉而永不下發
    useStore.getState().setConnection(false, null)
    useStore.getState().setConnection(true, 'test-link')

    feed(OVER_LIMIT, 5)
    expect(countOf('CMD:ALARM_ON')).toBe(2)
  })

  it('重連不得憑斷線前的保持計時憑空計出一下', async () => {
    await sessionController.startSession()

    // 進區並開始保持,但還沒到 holdTimeMs
    feed(IN_ZONE, 10)
    expect(useStore.getState().session.reps).toBe(0)

    // 斷線,患者離開很久(這段期間沒有任何封包,引擎完全不知道發生了什麼)
    useStore.getState().setConnection(false, null)
    vi.advanceTimersByTime(60_000)
    useStore.getState().setConnection(true, 'test-link')

    // 重連後的第一筆封包:若引擎沒被重設,state 仍是 'holding' 而
    // inZoneStartTime 停在一分鐘前,elapsed 遠超過 holdTimeMs,
    // 於是第一拍就計出一下——一次患者根本沒有做的療程,直接寫進 DB。
    feed(IN_ZONE, 1)
    expect(useStore.getState().session.reps).toBe(0)
    expect(countOf('CMD:GOAL')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────
// T6 — MTU 截斷:只回報一次,判定照常,且新鏈路會還原旗標
// ─────────────────────────────────────────────────────────────
describe('T6 MTU 截斷', () => {
  it('只回報一次截斷,且療程仍靠存活的 Pitch 完成', async () => {
    await sessionController.startSession()

    for (let i = 0; i < 60; i++) {
      bluetoothService.ingest(truncateTo(encodeAnglePacket(poseForKnee(IN_ZONE))))
      vi.advanceTimersByTime(COMM_PERIOD_MS)
    }

    expect(useStore.getState().linkTruncated).toBe(true)
    const truncationLogs = useStore
      .getState()
      .logs.filter((l) => l.includes('MTU too small'))
    expect(truncationLogs).toHaveLength(1)

    // 判定只讀 Pitch,而 T:/S: 在 20 bytes 切點下必定存活
    expect(useStore.getState().session.reps).toBe(1)
  })

  it('建立新鏈路後截斷旗標必須還原', () => {
    bluetoothService.ingest(truncateTo(encodeAnglePacket(poseForKnee(IN_ZONE))))
    expect(useStore.getState().linkTruncated).toBe(true)

    // 截斷是「這條鏈路這一次」的性質:新鏈路可能協商到不同的 MTU,舊旗標不得沿用
    bluetoothService.endSimulated()
    bluetoothService.beginSimulated('test-link')

    expect(useStore.getState().linkTruncated).toBe(false)
  })
})
