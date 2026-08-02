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
  private smoother = new AngleSmoother()

  /** 每筆有效角度更新後呼叫(由 sessionController 設定),供達標判定與資料緩衝 */
  onAnglesReceived: ((angles: LiveAngles) => void) | null = null

  /** 連線確定失守(手動斷線或自動重連耗盡)時呼叫,供 sessionController 安全收尾 Session */
  onConnectionLost: (() => void) | null = null

  private get store() {
    return useStore.getState()
  }

  async connect(): Promise<void> {
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
    this.smoother.reset()
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

    const value = new TextDecoder().decode(target.value)
    const parsed = parseAnglePacket(value)

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
    if (this.packetCount % 30 === 1) this.store.log(`Packet #${this.packetCount}: "${value}"`)

    // rawAngles 全速進 store(校準精靈逐筆取樣);顯示用 angles 由
    // sessionController 統一節流同步,這裡只交給判定管線
    useStore.getState().setRawAngles(parsed.raw)
    const angles = this.smoother.next(applyCalibration(parsed.raw, this.store.settings))
    this.onAnglesReceived?.(angles)
  }

  /** 下發指令字串(CMD:... 或設定檔)。未連線或無 Profile 特徵值則靜默忽略 */
  async send(command: string): Promise<void> {
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
