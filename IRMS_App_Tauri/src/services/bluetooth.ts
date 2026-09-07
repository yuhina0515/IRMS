// renderer/services/bluetooth.ts (Tauri port)
// --- BLE 傳輸層,Tauri 版 ---
// Web Bluetooth 在 WebView2/Tauri 下不存在,真正的 GATT 連線/掃描/訂閱/OTA 全部搬到
// src-tauri/src/ble.rs(btleplug),此檔改為那一層的 IPC 客戶端:呼叫 invoke() 送指令、
// listen() 收 ble.rs 發出的 'ble:connection' / 'ble:packet' / 'ble:ota-progress' 事件。
// 對外的 class 介面(connect/disconnect/send/beginSimulated/…)刻意維持與 Electron 版
// 完全相同,store/useStore.ts 與 services/sessionController.ts 才不必跟著改。
//
// 尚未在真實 ESP32 上驗證(見 ble.rs 檔頭註解與 doc/TAURI_MIGRATION_PLAN.md task #55):
// 25Hz 長時間串流穩定性、OTA 版本跳動後的 GATT 重新探索、以及這裡新寫的重連迴圈
// (見 attemptReconnect)在真正的斷線情境下是否如預期運作。

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { parseAnglePacket, type LiveAngles, type ParsedPacket } from '@shared/protocol'
import { applyCalibration, useStore } from '../store/useStore'
import { AngleSmoother } from './smoothing'

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_MS = 3000

export interface OtaProgress {
  phase: 'starting' | 'transferring' | 'finalizing' | 'done' | 'error' | 'aborted'
  bytesSent: number
  totalBytes: number
  message?: string
}

interface ConnectionEventPayload {
  connected: boolean
  deviceName: string | null
}

/** ble.rs 的 OtaProgress enum,#[serde(tag = "phase", rename_all = "camelCase")] 序列化後的形狀 */
interface RustOtaProgressPayload {
  phase: OtaProgress['phase']
  bytesSent: number
  totalBytes: number
  message?: string
}

export class BluetoothService {
  private manualDisconnect = false
  private connected = false
  private packetCount = 0
  private malformedCount = 0
  /** 已就本次連線回報過截斷,避免 25Hz 的資料流把同一件事洗滿日誌 */
  private truncationReported = false
  private smoother = new AngleSmoother()
  /** 模擬鏈路(Demo 模式)進行中——沒有真實 GATT,封包由 simulator 餵進 ingest() */
  private simulated = false
  private listenersReady: Promise<void>

  /**
   * 模擬模式下已下發的指令稽核。
   * 真實模式沒有這個陣列:那時指令真的透過 invoke 寫進了 GATT 特徵值,硬體自己會亮/會響。
   */
  readonly cmdTranscript: string[] = []

  /** 每筆有效角度更新後呼叫(由 sessionController 設定),供達標判定與資料緩衝 */
  onAnglesReceived: ((angles: LiveAngles) => void) | null = null

  /** 連線確定失守(手動斷線或自動重連耗盡)時呼叫,供 sessionController 安全收尾 Session */
  onConnectionLost: (() => void) | null = null

  constructor() {
    this.listenersReady = this.registerEventListeners()
  }

  private get store() {
    return useStore.getState()
  }

  /**
   * 訂閱 ble.rs 發出的事件,整個 App 生命週期只訂一次(不像 Web Bluetooth 版那樣
   * 每次連線才掛 characteristicvaluechanged)——Rust 端的連線狀態本來就是全域單例
   * (BleState),事件也是全域廣播,這裡對稱地用一組長駐監聽器接收。
   */
  private async registerEventListeners(): Promise<void> {
    await listen<ConnectionEventPayload>('ble:connection', (event) => {
      const { connected, deviceName } = event.payload
      this.connected = connected
      if (connected) {
        useStore.getState().setConnection(true, deviceName ?? 'IRMS Device')
        useStore.getState().setHardwareError(null)
        this.resetStreamState()
        this.store.log('Connected and subscribed to notifications.')
      } else {
        useStore.getState().setConnection(false, null)
        this.resetStreamState()
        if (this.manualDisconnect) {
          this.onConnectionLost?.()
        } else {
          this.store.log('Device disconnected (link lost).')
          void this.attemptReconnect()
        }
      }
    })

    await listen<ParsedPacket>('ble:packet', (event) => {
      this.dispatchParsed(event.payload)
    })
  }

  /**
   * 重設「這一條鏈路」的串流狀態,理由與時機同 Electron 版(見該檔案原始註解):
   * per-link 而非 per-service,必須掛在每次連線成功/失敗之後,不能只在 connect() 呼叫時做一次。
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
   * 模擬鏈路上線。刻意重用「真實連線成功時完全相同的 store 副作用」,
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
    // Demo 模式下擋掉真實連線,理由同 Electron 版:兩條鏈路同時活著會讓 store 的
    // 連線狀態與實際資料來源說法不一致。
    if (this.simulated) {
      this.store.log('Cannot connect to a real device while demo mode is active.')
      return
    }
    await this.listenersReady
    this.manualDisconnect = false
    if (this.connected) {
      this.disconnect()
      return
    }

    try {
      this.store.log('Requesting Bluetooth device...')
      useStore.getState().setStatus('Connecting...')
      // ble_connect 一次做完 scan → connect → discover_services → subscribe,
      // 成功/失敗都由 Rust 端的 'ble:connection' 事件回報,這裡只送出請求。
      await invoke<string>('ble_connect')
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      if (message.includes('not found')) {
        this.store.log('Device not found within scan window.')
        useStore.getState().setStatus('Device not found')
      } else {
        this.store.log(`Connection error: ${message}`)
        useStore.getState().setStatus('Connection failed')
      }
    }
  }

  disconnect(): void {
    this.manualDisconnect = true
    void invoke('ble_disconnect').catch((err) => {
      this.store.log(`Disconnect error: ${(err as Error).message ?? err}`)
    })
  }

  /**
   * 未預期斷線後的自動重連。Web Bluetooth 版重用同一個 BluetoothDevice 物件重跑
   * device.gatt.connect();ble_connect 本身就包含完整的 scan+connect+subscribe,
   * 所以這裡的「重連」就是重新呼叫同一個 command——語意對等,只是原語不同。
   */
  private async attemptReconnect(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      if (this.connected || this.manualDisconnect) {
        useStore.getState().setReconnect(null)
        return
      }
      useStore.getState().setReconnect({ attempt, max: MAX_RECONNECT_ATTEMPTS })
      useStore.getState().setStatus(`Reconnecting (${attempt}/${MAX_RECONNECT_ATTEMPTS})...`)
      try {
        await invoke<string>('ble_connect')
        // 成功時 'ble:connection' 事件會把 reconnect 清掉、connected 設為 true
        return
      } catch (err) {
        this.store.log(`Reconnect attempt ${attempt} failed: ${(err as Error).message ?? err}`)
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS))
        }
      }
    }
    useStore.getState().setReconnect(null)
    if (!this.connected) {
      useStore.getState().setStatus('Disconnected')
      this.store.log('Auto-reconnect exhausted all attempts.')
      this.onConnectionLost?.()
    }
  }

  /**
   * 純文字封包注入口——模擬鏈路專用(simulator.ts 直接餵字串,和真實韌體發送的
   * 格式完全一樣)。真實鏈路的封包已經在 Rust 端解析過,經 'ble:packet' 事件送來
   * 現成的 ParsedPacket,不會再呼叫這個函式;這裡呼叫 shared parseAnglePacket 只是
   * 為了讓模擬鏈路和真實鏈路殊途同歸,共用下面同一條 dispatchParsed 管線。
   */
  ingest(text: string): void {
    this.dispatchParsed(parseAnglePacket(text))
  }

  /**
   * 協定管線的唯一注入口(見 ingest 的註解):錯誤/壞封包分流 → 套用校準 → 平滑 → 交給判定。
   */
  private dispatchParsed(parsed: ParsedPacket): void {
    if (parsed.kind === 'error') {
      if (this.store.hardwareError !== parsed.code) {
        this.store.log(`Hardware error: ${parsed.code}`)
        useStore.getState().setHardwareError(parsed.code)
        this.smoother.reset()
      }
      return
    }

    if (parsed.kind === 'malformed') {
      this.malformedCount++
      if (this.malformedCount % 50 === 1) this.store.log(`Malformed packet discarded: "${parsed.value}"`)
      return
    }

    if (this.store.hardwareError) {
      useStore.getState().setHardwareError(null)
      this.store.log('Hardware recovered, resuming.')
    }

    this.packetCount++
    if (this.packetCount % 30 === 1) this.store.log(`Packet #${this.packetCount}`)

    if (parsed.truncated && !this.truncationReported) {
      this.truncationReported = true
      useStore.getState().setLinkTruncated(true)
      this.store.log('BLE MTU too small — packet truncated, roll axes unavailable.')
    }

    useStore.getState().setRawAngles(parsed.raw)
    const angles = this.smoother.next(applyCalibration(parsed.raw, this.store.settings))
    this.onAnglesReceived?.(angles)
  }

  /** 下發指令字串(CMD:...)。未連線則靜默忽略,由 ble_send_command 本身處理 */
  async send(command: string): Promise<void> {
    if (this.simulated) {
      this.cmdTranscript.push(command)
      this.store.log(`→ ${command} (simulated)`)
      return
    }
    try {
      await invoke('ble_send_command', { command })
    } catch (err) {
      this.store.log(`Failed to send "${command}": ${(err as Error).message ?? err}`)
    }
  }

  /** 讀取裝置目前已燒錄的韌體版本字串;未連線/模擬模式/舊韌體(無 OTA service)回傳 null */
  async getDeviceFirmwareVersion(): Promise<string | null> {
    if (this.simulated || !this.connected) return null
    try {
      return await invoke<string | null>('ble_get_firmware_version')
    } catch (err) {
      this.store.log(`Firmware version read failed (device may predate OTA support): ${(err as Error).message ?? err}`)
      return null
    }
  }

  /**
   * 把一份韌體 .bin 透過 BLE OTA 推送到裝置。ble_perform_ota_update 一個 command
   * 內部做完 START → 分塊傳輸 → END 整條流程,期間持續發出 'ble:ota-progress' 事件;
   * 這裡邊聽事件邊轉發給呼叫端的 onProgress,並用「最後一次事件的 phase」判定
   * 最終是否成功——command 本身的回傳值(Result<String,String>)只在 Rust 層級的
   * 例外(如寫入失敗的底層錯誤)才會走 Err 分支,協定層級的失敗(NO_SPACE 等)
   * 一律經由 phase:'error' 事件 + Ok(message) 回傳,不能只看 invoke 有沒有丟例外。
   */
  async performOtaUpdate(
    firmware: { data: Uint8Array; md5: string },
    onProgress: (p: OtaProgress) => void
  ): Promise<{ ok: boolean; message: string }> {
    if (this.simulated) return { ok: false, message: 'Demo 模式沒有真實裝置,無法更新韌體' }
    if (!this.connected) return { ok: false, message: '裝置未連線' }

    // 用可變物件而非單純 let 變數存放最後一個 phase:TS 的控制流分析看不到
    // listen() 回呼(非同步、之後才觸發)裡的賦值,若用 let 會把型別窄化死在
    // 初始值 'starting' 上,導致下面的比較被判定為恆假。
    const last: { phase: OtaProgress['phase'] } = { phase: 'starting' }
    let unlisten: UnlistenFn | null = null
    try {
      unlisten = await listen<RustOtaProgressPayload>('ble:ota-progress', (event) => {
        const p = event.payload
        last.phase = p.phase
        onProgress({ phase: p.phase, bytesSent: p.bytesSent, totalBytes: p.totalBytes, message: p.message })
      })

      const message = await invoke<string>('ble_perform_ota_update', {
        data: Array.from(firmware.data),
        md5: firmware.md5
      })
      return { ok: last.phase === 'done', message }
    } catch (err) {
      const message = (err as Error).message ?? String(err)
      this.store.log(`OTA update failed: ${message}`)
      onProgress({ phase: 'error', bytesSent: 0, totalBytes: firmware.data.length, message })
      return { ok: false, message }
    } finally {
      unlisten?.()
    }
  }

  /** 中止進行中的 OTA。裝置斷線本身就等同中止,這裡只是讓韌體立刻釋放 Update 物件 */
  async abortOtaUpdate(): Promise<void> {
    try {
      await invoke('ble_abort_ota')
    } catch {
      // 送不到就算了——最壞情況是裝置已經斷線,而斷線本身就已經達成中止的效果
    }
  }
}

export const bluetoothService = new BluetoothService()
