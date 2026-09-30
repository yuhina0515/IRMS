// TelemetryPanel 旅程測試:開啟前必須經過含「動作名稱」提醒的確認;取消不得開啟、
// 不得呼叫 Rust;Rust 驗證失敗不得存成開啟;關閉直接生效。
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn()
}))

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { invoke } from '@tauri-apps/api/core'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { TelemetryPanel } from './TelemetryPanel'

const invokeMock = vi.mocked(invoke)
const DEFAULT_ENDPOINT = 'https://hina-tw.ddns.net/irms-api'

function statusResponse(enabled: boolean): Record<string, unknown> {
  return { enabled, runId: 'run-123', pending: 0, sent: 0, dropped: 0, lastError: null }
}

let confirmMessages: string[] = []

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === 'telemetry_status') return statusResponse(false)
    if (cmd === 'telemetry_configure') return statusResponse(true)
    return undefined
  })
  confirmMessages = []
  useStore.getState().setSettings({ telemetryEnabled: false, telemetryEndpoint: DEFAULT_ENDPOINT })
  useUiStore.setState({
    requestConfirm: async (_title: string, message: string) => {
      confirmMessages.push(message)
      return true
    },
    confirm: null
  })
})

const toggle = (): HTMLElement => screen.getByRole('checkbox', { name: '上傳即時遙測資料' })
const configureCalls = (): unknown[][] =>
  invokeMock.mock.calls.filter(([cmd]) => cmd === 'telemetry_configure')

describe('TelemetryPanel', () => {
  it('開啟前先確認,並提醒動作名稱不要用姓名', async () => {
    render(<TelemetryPanel />)
    await userEvent.click(toggle())
    await waitFor(() => expect(useStore.getState().settings.telemetryEnabled).toBe(true))
    expect(confirmMessages).toHaveLength(1)
    expect(confirmMessages[0]).toMatch(/動作名稱/)
    expect(confirmMessages[0]).toMatch(/姓名/)
    expect(configureCalls()[0][1]).toEqual({ enabled: true, endpoint: DEFAULT_ENDPOINT })
  })

  it('確認時取消:不開啟、不呼叫 Rust', async () => {
    useUiStore.setState({ requestConfirm: async () => false })
    render(<TelemetryPanel />)
    await userEvent.click(toggle())
    expect(useStore.getState().settings.telemetryEnabled).toBe(false)
    expect(configureCalls()).toHaveLength(0)
  })

  it('Rust 拒絕網址時不存成開啟', async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'telemetry_status') return statusResponse(false)
      if (cmd === 'telemetry_configure') throw '伺服器網址必須使用 https'
      return undefined
    })
    render(<TelemetryPanel />)
    await userEvent.click(toggle())
    await waitFor(() => expect(configureCalls()).toHaveLength(1))
    expect(useStore.getState().settings.telemetryEnabled).toBe(false)
  })

  it('關閉不需確認,立即生效', async () => {
    useStore.getState().setSettings({ telemetryEnabled: true })
    render(<TelemetryPanel />)
    await userEvent.click(toggle())
    expect(useStore.getState().settings.telemetryEnabled).toBe(false)
    expect(confirmMessages).toHaveLength(0)
  })
})
