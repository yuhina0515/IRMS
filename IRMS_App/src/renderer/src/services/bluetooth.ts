// renderer/services/bluetooth.ts
// --- Web Bluetooth 服務 ---
// 負責:連線/重連、訂閱角度通知、解析封包、套用校準、處理硬體錯誤、下發指令。
// 解析與校準邏輯抽到 shared/protocol + store.applyCalibration,本檔僅處理傳輸。

import {
  CHAR_ANGLE_TX,
  CHAR_PROFILE_RX,
  SERVICE_UUID,
  parseAnglePacket,
  type LiveAngles
} from '@shared/protocol'
import { applyCalibration, useStore } from '../store/useStore'
import { AngleSmoother } from './smoothing'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 3000

export class BluetoothService {
  private device: BluetoothDevice | null = null
  private angleChar: BluetoothRemoteGATTCharacteristic | null = null
  private profileChar: BluetoothRemoteGATTCharacteristic | null = null
  private manualDisconnect = false
  private packetCount = 0
  private malformedCount = 0
  /** 已就本次連線回報過截斷,避免 25Hz 的資料流把同一件事洗滿日誌 */
  private truncationReported = false
  private smoother = new AngleSmoother()
  /** 模擬鏈路(Demo 模式)進行中——沒有真實 GATT,封包由 simulator 餵進 ingest() */
  private simulated = false

  /**
   * 模擬模式下已下發的指令稽核。
   * 真實模式沒有這個陣列:那時指令真的寫進了 GATT 特徵值,硬體自己會亮/會響。
   * 模擬模式沒有硬體,Demo 面板據此把 LED 與蜂鳴器畫出來——否則使用者看不出
   * 「引擎確實下了指令」與「引擎什麼都沒做」的差別。
   */
  readonly cmdTranscript: string[] = []

  /** 每筆有效角度更新後呼叫(由 sessionController 設定),供達標判定與資料緩衝 */
  onAnglesReceived: ((angles: LiveAngles) => void) | null = null

  /** 連線確定失守(手動斷線或自動重連耗盡)時呼叫,供 sessionController 安全收尾 Session */
  onConnectionLost: (() => void) | null = null

  private get store() {
    return useStore.getState()
  }

  /**
   * 重設「這一條鏈路」的串流狀態。
   *
   * 這些欄位全都是 per-link 而非 per-service 的:截斷與否取決於這次協商到的 MTU,
   * 濾波器的收斂狀態取決於這條連線的角度歷史,日誌節流計數只在本次連線內有意義。
   *
   * 必須掛在 connectGATT 而不是 connect:自動重連走的是 attemptReconnect →
   * connectGATT,完全繞過 connect()。原本重設寫在 connect() 裡,於是
   * 「重連可能協商到不同的 MTU,舊旗標不得沿用」這句註解自述的情境,
   * 正好是唯一失效的那個——重連到較大的 MTU 之後 linkTruncated 永遠卡在 true,
   * 截斷橫幅不會消失,校準精靈也會持續拒絕外展步驟。
   */
  private resetStreamState(): void {
    this.packetCount = 0
    this.malformedCount = 0
    this.truncationReported = false
    this.smoother.reset()
    useStore.getState().setLinkTruncated(false)
  }

  /** 目前是否走在模擬鏈路上(UI 據此停用真實連線入口並顯示原因) */
  get isSimulated(): boolean {
    return this.simulated
  }

  /**
   * 模擬鏈路上線。刻意重用 connectGATT 成功時**完全相同的 store 副作用**,
   * 而不是另外做一套:任何依賴 isConnected / hardwareError 的 UI(尤其是
   * 校準精靈的 isConnected 閘門)才會與真實連線時表現一致。
   */
  beginSimulated(name = 'IRMS Demo Device'): void {
    this.manualDisconnect = false
    this.simulated = true
    this.cmdTranscript.length = 0
    this.resetStreamState()
    useStore.getState().setConnection(true, name)
    useStore.getState().setHardwareError(null)
    this.store.log(`Simulated link up: ${name}`)
  }

  /** 模擬鏈路下線。等同手動斷線:會觸發 onConnectionLost → Session 安全收尾 */
  endSimulated(): void {
    if (!this.simulated) return
    this.simulated = false
    useStore.getState().setConnection(false, null)
    this.resetStreamState()
    this.store.log('Simulated link down.')
    this.onConnectionLost?.()
  }

  async connect(): Promise<void> {
    // Demo 模式下擋掉真實連線。UI 已經把按鈕停用並顯示原因,這裡是最後一道:
    // 兩條鏈路同時活著會讓 store 的連線狀態與實際資料來源說法不一致,
    // 而那正是「示範資料被當成真實量測」最容易發生的縫隙。
    if (this.simulated) {
      this.store.log('Cannot connect to a real device while demo mode is active.')
      return
    }
    this.manualDisconnect = false
    if (this.store.isConnected) {
      this.disconnect()
      return
    }

    try {
      this.store.log('Requesting Bluetooth device...')
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [SERVICE_UUID]
      })
      this.store.log(`Device selected: ${this.device.name ?? '(unknown)'}`)
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected)
      await this.connectGATT()
    } catch (err) {
      const e = err as Error
      if (e.name === 'NotFoundError' || e.message?.includes('cancelled')) {
        this.store.log('Device not found within scan window (or cancelled).')
        useStore.getState().setStatus('Device not found')
        return
      }
      this.store.log(`Connection error: ${e.message ?? e}`)
      useStore.getState().setStatus('Connection failed')
    }
  }

  private async connectGATT(): Promise<void> {
    if (!this.device?.gatt) throw new Error('No GATT server on device')
    this.store.setStatus('Connecting...')
    // 首次連線與自動重連都會經過這裡,是唯一能保證涵蓋兩條路徑的位置
    this.resetStreamState()

    const server = await this.device.gatt.connect()
    const service = await server.getPrimaryService(SERVICE_UUID)

    this.angleChar = await service.getCharacteristic(CHAR_ANGLE_TX)
    await this.angleChar.startNotifications()
    this.angleChar.addEventListener('characteristicvaluechanged', this.handleNotification)

    try {
      this.profileChar = await service.getCharacteristic(CHAR_PROFILE_RX)
    } catch {
      this.store.log('Profile RX characteristic not found (non-critical).')
      this.profileChar = null
    }

    useStore.getState().setConnection(true, this.device.name ?? 'IRMS Device')
    useStore.getState().setHardwareError(null)
    this.store.log('Connected and subscribed to notifications.')
  }

  disconnect(): void {
    this.manualDisconnect = true
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
    }
  }

  private onDisconnected = (): void => {
    this.store.log('Device disconnected (GATT lost).')
    useStore.getState().setConnection(false, null)
    this.resetStreamState()
    if (!this.manualDisconnect) {
      void this.attemptReconnect()
    } else {
      // 手動斷線即為永久斷線,立即收尾
      this.onConnectionLost?.()
    }
  }

  private async attemptReconnect(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (this.store.isConnected || this.manualDisconnect) return
      useStore.getState().setStatus(`Reconnecting (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`)
      try {
        await this.connectGATT()
        return
      } catch (err) {
        this.store.log(`Reconnect attempt ${attempt} failed: ${(err as Error).message}`)
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
        }
      }
    }
    if (!this.store.isConnected) {
      useStore.getState().setStatus('Disconnected')
      this.store.log('Auto-reconnect exhausted all attempts.')
      this.onConnectionLost?.()
    }
  }

  private handleNotification = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic
    if (!target?.value) return
    this.ingest(new TextDecoder().decode(target.value))
  }

  /**
   * 協定管線的唯一注入口:解析 → 錯誤/壞封包分流 → 套用校準 → 平滑 → 交給判定。
   *
   * 從 handleNotification 抽出來的目的是讓「模擬封包」與「真實封包」走**完全同一條路**
   * (2026-08-03 會議裁定)。當時另一個提案是把接縫開在 onAnglesReceived,被否決,
   * 因為那會跳過 parseAnglePacket 與 applyCalibration——而 applyCalibration 正是
   * 校準精靈的輸出真正落地的地方,跳過它等於測不到校準。
   *
   * 傳輸層(BLE 事件、TextDecoder)刻意留在 handleNotification,本方法只吃字串。
   */
  ingest(text: string): void {
    const parsed = parseAnglePacket(text)

    if (parsed.kind === 'error') {
      // 硬體錯誤(I2C 斷線等):凍結角度、觸發紅色遮罩,並停止餵入資料
      if (this.store.hardwareError !== parsed.code) {
        this.store.log(`Hardware error: ${parsed.code}`)
        useStore.getState().setHardwareError(parsed.code)
        // 清除濾波狀態:復原後第一筆重新播種,不從錯誤前的舊角度拖出假值
        this.smoother.reset()
      }
      return
    }

    if (parsed.kind === 'malformed') {
      // 節流:用獨立計數器,即使整條資料流都是壞封包也只每 50 筆記一次
      this.malformedCount++
      if (this.malformedCount % 50 === 1) this.store.log(`Malformed packet discarded: "${parsed.value}"`)
      return
    }

    // 正常封包:清除錯誤狀態
    if (this.store.hardwareError) {
      useStore.getState().setHardwareError(null)
      this.store.log('Hardware recovered, resuming.')
    }

    this.packetCount++
    if (this.packetCount % 30 === 1) this.store.log(`Packet #${this.packetCount}: "${text}"`)

    // 鏈路截斷:MTU 沒協商到 128,notify 承載停在預設的 20 bytes。判定只讀 Pitch 而
    // T:/S: 必定在切點內存活,所以療程照常進行——但 Roll 一路是 0,3D 姿態與校準
    // 精靈的外展步驟會靜靜地用假值算下去。只回報一次,持續狀態交給 store 的旗標。
    if (parsed.truncated && !this.truncationReported) {
      this.truncationReported = true
      useStore.getState().setLinkTruncated(true)
      this.store.log(
        `BLE MTU too small — packet truncated to ${text.length} bytes, roll axes unavailable: "${text}"`
      )
    }

    // rawAngles 全速進 store(校準精靈逐筆取樣);顯示用 angles 由
    // sessionController 統一節流同步,這裡只交給判定管線
    useStore.getState().setRawAngles(parsed.raw)
    const angles = this.smoother.next(applyCalibration(parsed.raw, this.store.settings))
    this.onAnglesReceived?.(angles)
  }

  /** 下發指令字串(CMD:... 或設定檔)。未連線或無 Profile 特徵值則靜默忽略 */
  async send(command: string): Promise<void> {
    // 模擬鏈路沒有 GATT 可寫。指令仍然「發生」,只是落在稽核陣列裡供 Demo 面板呈現。
    if (this.simulated) {
      this.cmdTranscript.push(command)
      this.store.log(`→ ${command} (simulated)`)
      return
    }
    if (!this.profileChar) return
    try {
      // 沿革:v2 韌體的 onWrite 以 == 精確比對,多一個 '\n' 會讓所有 CMD 靜默失效。
      // 韌體 v3 起 onWrite 會先 trim(),此限制已解除——仍不附加換行只是因為沒有必要。
      // (原註解宣稱的限制早已不存在;錯的安全註解比沒有註解更危險,故一併更正。)
      const data = new TextEncoder().encode(command)
      await this.profileChar.writeValue(data)
    } catch (err) {
      this.store.log(`Failed to send "${command}": ${(err as Error).message}`)
    }
  }
}

export const bluetoothService = new BluetoothService()
