// i18n DOM 端:<html lang> 跟隨語系設定;TopNav 以 connectionStatus 列舉判斷未連線,
// 不再比對可能被翻譯的 statusText 字串。
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useStore } from '../store/useStore'
import { TopNav } from '../components/TopNav'
import { installDocumentLang } from '.'

afterEach(() => {
  useStore.getState().setLanguage('system')
  useStore.setState({ connectionStatus: 'disconnected', statusText: 'Disconnected', isConnected: false })
})

describe('installDocumentLang', () => {
  it('sets <html lang> now and on every language change', () => {
    document.documentElement.lang = 'en'
    const stop = installDocumentLang()
    try {
      expect(document.documentElement.lang).toBe('zh-Hant')
      useStore.getState().setLanguage('en')
      expect(document.documentElement.lang).toBe('en')
      useStore.getState().setLanguage('zh-Hant')
      expect(document.documentElement.lang).toBe('zh-Hant')
    } finally {
      stop()
    }
    useStore.getState().setLanguage('en')
    expect(document.documentElement.lang).toBe('zh-Hant') // 取消訂閱後不再變動
  })
})

describe('TopNav connection status', () => {
  it('uses the status enum, not the status text, to detect "disconnected"', () => {
    useStore.getState().setStatus('disconnected', 'anything')
    render(<TopNav />)
    expect(screen.getByRole('status')).toHaveTextContent('未連線')
  })

  it('translates other non-connected states from the enum, ignoring the raw status text', () => {
    useStore.getState().setStatus('connectionFailed', 'raw log text')
    render(<TopNav />)
    expect(screen.getByRole('status')).toHaveTextContent('連線失敗')
    expect(screen.getByRole('status')).not.toHaveTextContent('raw log text')
  })
})
