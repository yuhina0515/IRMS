// 2026-09-27 回報:示範模式選了別的情境,切到其他頁面再回來,選單總是顯示
// 「正常療程 — 連續三下達標」。選取狀態原本是面板的 useState,面板卸載後就遺失;
// 現在放在 useUiStore。這裡以真的卸載/重新掛載 SettingsView 重現那個操作。
// 同一次回報也要求移除上方導覽列的主題切換鈕,一併在此確認。
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => undefined)
}))

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsView } from './SettingsView'
import { TopNav } from '../components/TopNav'

async function openDemo(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: /示範模式/ }))
}

describe('示範模式情境選單', () => {
  it('切換頁面後回來仍顯示先前選的情境', async () => {
    const first = render(<SettingsView />)
    await openDemo()
    await userEvent.click(screen.getByRole('button', { name: /正常療程 — 連續三下達標/ }))
    await userEvent.click(screen.getByRole('option', { name: /極限範圍/ }))
    expect(screen.getByRole('button', { name: /極限範圍/ })).toBeInTheDocument()

    first.unmount()
    render(<SettingsView />)
    await openDemo()
    expect(screen.getByRole('button', { name: /極限範圍/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /正常療程 — 連續三下達標/ })).toBeNull()
  })
})

describe('上方導覽列', () => {
  it('沒有主題切換鈕', () => {
    render(<TopNav />)
    for (const label of ['跟隨系統', '日間', '夜間']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull()
    }
  })
})
