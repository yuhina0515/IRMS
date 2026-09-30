// SettingsView 的韌體 OTA 面板旅程測試:連線態閘門 → 選檔 → 進度旅程 → 失敗旅程 → 中止。
//
// 為什麼這個檔案存在:OPTIMIZATION.md §三點名"App/Dashboard/Settings 的...及 OTA 進度/
// 失敗旅程"目前沒有元件層測試。firmware.rs(Rust 邊界)與 bluetoothService.performOtaUpdate
// 的協定細節已有各自的測試,但「畫面是否正確反映每個 OtaProgress phase」這一層——進度條
// 百分比、starting/transferring/finalizing/done/error 五種文字、中止按鈕只在 inFlight 時
// 出現——從未被驗證過。只測 FirmwareOtaPanel(透過渲染整個 SettingsView,因為它是私有元件
// 沒有另外 export),不涉及本檔其他面板(校準/一般設定/軟體更新/示範模式),避免測試範圍
// 擴大到與本次目的無關的區塊。
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FirmwareBinary } from '@shared/types'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService, type OtaProgress } from '../services/bluetooth'
import { irms } from '../platform/irmsApi'
import { SettingsView } from './SettingsView'

const FIRMWARE: FirmwareBinary = {
  path: 'C:\\fw\\IRMS_Sensor.ino.bin',
  size: 1_122_799,
  md5: 'abcdef0123456789abcdef0123456789',
  data: new Uint8Array([1, 2, 3])
}

function resetStores(): void {
  useStore.setState({ isConnected: false, session: { ...useStore.getState().session, running: false } })
  // 繞過真實 ConfirmDialog(本檔未渲染):預設自動核可,個別測試可覆寫回傳 false。
  useUiStore.setState({ requestConfirm: async () => true, confirm: null })
}

beforeEach(() => {
  resetStores()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function pickFirmware(): Promise<void> {
  vi.spyOn(irms.firmware, 'pickBinary').mockResolvedValue(FIRMWARE)
  await userEvent.click(screen.getByRole('button', { name: '選擇韌體檔案 (.bin)' }))
  await screen.findByText(/IRMS_Sensor\.ino\.bin/)
}


/** v3 Settings shows one category at a time; the OTA panel lives under 軟體與韌體. */
async function openFirmware(): Promise<void> {
  render(<SettingsView />)
  await userEvent.click(screen.getByRole('button', { name: /軟體與韌體/ }))
}

describe('SettingsView 韌體 OTA 面板:連線態閘門', () => {
  it('未連線時操作按鈕停用並顯示原因', async () => {
    await openFirmware()
    expect(screen.getByText('需要先於頂部連線真實裝置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '選擇韌體檔案 (.bin)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '查詢裝置目前版本' })).toBeDisabled()
  })

  it('Session 進行中時顯示鎖定原因', async () => {
    useStore.setState({ isConnected: true, session: { ...useStore.getState().session, running: true } })
    await openFirmware()
    expect(screen.getByText(/Session 進行中無法更新韌體/)).toBeInTheDocument()
  })

  it('已連線且無 Session 時按鈕可用', async () => {
    useStore.setState({ isConnected: true })
    await openFirmware()
    expect(screen.getByRole('button', { name: '選擇韌體檔案 (.bin)' })).not.toBeDisabled()
  })
})

describe('SettingsView 韌體 OTA 面板:選檔與開始更新', () => {
  beforeEach(() => {
    useStore.setState({ isConnected: true })
  })

  it('選檔後顯示檔名/大小/MD5,未選檔前「開始更新」停用', async () => {
    await openFirmware()
    expect(screen.getByRole('button', { name: '開始更新' })).toBeDisabled()

    await pickFirmware()
    expect(screen.getByText(/1096 KB/)).toBeInTheDocument()
    expect(screen.getByText(/abcdef01/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開始更新' })).not.toBeDisabled()
  })

  it('開始更新前會先跳確認;使用者取消則不呼叫 performOtaUpdate', async () => {
    useUiStore.setState({ requestConfirm: async () => false })
    const spy = vi.spyOn(bluetoothService, 'performOtaUpdate')

    await openFirmware()
    await pickFirmware()
    await userEvent.click(screen.getByRole('button', { name: '開始更新' }))

    expect(spy).not.toHaveBeenCalled()
  })
})

describe('SettingsView 韌體 OTA 面板:進度旅程', () => {
  beforeEach(() => {
    useStore.setState({ isConnected: true })
  })

  it('starting → transferring → finalizing → done,進度條與百分比隨 phase 更新', async () => {
    // 可變物件而非單純 let:同一個理由見 bluetooth.ts performOtaUpdate 的 `last` 變數
    // 註解——TS 的控制流分析看不到非同步回呼裡的賦值,用 let 會把型別窄化死在初始值上。
    const holder: { emit: ((p: OtaProgress) => void) | null } = { emit: null }
    vi.spyOn(bluetoothService, 'performOtaUpdate').mockImplementation(async (_fw, onProgress) => {
      holder.emit = onProgress
      onProgress({ phase: 'starting', bytesSent: 0, totalBytes: FIRMWARE.size })
      return { ok: true, message: '更新成功' }
    })

    await openFirmware()
    await pickFirmware()
    await userEvent.click(screen.getByRole('button', { name: '開始更新' }))

    expect(screen.getByText('啟動更新…')).toBeInTheDocument()
    // 中止鈕只在 inFlight(starting/transferring/finalizing)時出現
    expect(screen.getByRole('button', { name: '中止' })).toBeInTheDocument()

    holder.emit?.({ phase: 'transferring', bytesSent: FIRMWARE.size / 2, totalBytes: FIRMWARE.size })
    await screen.findByText('傳輸中… 50%')

    holder.emit?.({ phase: 'finalizing', bytesSent: FIRMWARE.size, totalBytes: FIRMWARE.size })
    await screen.findByText('寫入完成,裝置驗證中…')

    holder.emit?.({ phase: 'done', bytesSent: FIRMWARE.size, totalBytes: FIRMWARE.size })
    await screen.findByText('✅ 完成,裝置重新開機中')
    // done 不在 inFlight 清單裡,中止鈕應隨之消失
    await waitFor(() => expect(screen.queryByRole('button', { name: '中止' })).not.toBeInTheDocument())
  })

  it('失敗時顯示錯誤文字,不冒充成功', async () => {
    vi.spyOn(bluetoothService, 'performOtaUpdate').mockImplementation(async (_fw, onProgress) => {
      onProgress({ phase: 'starting', bytesSent: 0, totalBytes: FIRMWARE.size })
      onProgress({ phase: 'error', bytesSent: 1024, totalBytes: FIRMWARE.size, message: 'NO_SPACE' })
      return { ok: false, message: 'NO_SPACE' }
    })

    await openFirmware()
    await pickFirmware()
    await userEvent.click(screen.getByRole('button', { name: '開始更新' }))

    await screen.findByText('❌ NO_SPACE')
    expect(screen.queryByText('✅ 完成,裝置重新開機中')).not.toBeInTheDocument()
  })

  it('中止時呼叫 bluetoothService.abortOtaUpdate 並清空進度', async () => {
    const holder: { emit: ((p: OtaProgress) => void) | null } = { emit: null }
    vi.spyOn(bluetoothService, 'performOtaUpdate').mockImplementation(async (_fw, onProgress) => {
      holder.emit = onProgress
      onProgress({ phase: 'starting', bytesSent: 0, totalBytes: FIRMWARE.size })
      return new Promise(() => {}) // 傳輸中被中止前不會 resolve
    })
    const abortSpy = vi.spyOn(bluetoothService, 'abortOtaUpdate').mockResolvedValue(undefined)

    await openFirmware()
    await pickFirmware()
    await userEvent.click(screen.getByRole('button', { name: '開始更新' }))
    await screen.findByRole('button', { name: '中止' })

    holder.emit?.({ phase: 'transferring', bytesSent: 10, totalBytes: FIRMWARE.size })
    await userEvent.click(screen.getByRole('button', { name: '中止' }))

    expect(abortSpy).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('button', { name: '中止' })).not.toBeInTheDocument())
  })
})

describe('SettingsView 分類索引(v3)', () => {
  it('一次只顯示一個分類,切換分類會替換右側內容而不是往下長', async () => {
    render(<SettingsView />)
    expect(screen.getByRole('heading', { level: 2, name: '裝置與連線' })).toBeInTheDocument()
    expect(screen.queryByText(/Firmware Update/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /軟體與韌體/ }))
    expect(screen.getByRole('heading', { level: 2, name: '軟體與韌體更新' })).toBeInTheDocument()
    expect(screen.getByText(/Firmware Update/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: '裝置與連線' })).not.toBeInTheDocument()
  })
})
