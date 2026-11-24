import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session, SessionPage } from '@shared/types'
import { HistoryView } from './HistoryView'
import { installIrmsStub } from '../test/irmsApiStub'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'

const measured = vi.hoisted(() => ({ size: 6 }))
vi.mock('../hooks/usePageSize', () => ({ usePageSize: () => measured.size }))
vi.mock('../services/chartSetup', () => ({ Chart: class { destroy(): void {} } }))
const originalConfirm = useUiStore.getState().requestConfirm
const row = (id: number): Session => ({ id, startTime: '2026-10-29T00:00:00Z', endTime: '2026-10-29T00:01:00Z', actionName: `Page row ${id}`, source: 'device', abandoned: 0, repsCompleted: 0, calibration: null } as Session)
const pageOf = (rows: Session[], requested: number, pageSize: number): SessionPage => {
  const page = Math.min(requested, Math.max(0, Math.ceil(rows.length / pageSize) - 1))
  return { sessions: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length, page, pageSize }
}
beforeEach(() => {
  measured.size = 6
  useStore.getState().resetSession()
  useStore.setState((s) => ({ settings: { ...s.settings, language: 'zh-Hant' } }))
  useUiStore.setState({ toasts: [], requestConfirm: vi.fn(async () => true) })
})
afterEach(() => { cleanup(); useUiStore.setState({ requestConfirm: originalConfirm }); vi.restoreAllMocks() })

it.each(['resolve', 'reject'] as const)('ignores a stale %s after page size changes', async (outcome) => {
  let resolve!: (value: SessionPage) => void
  let reject!: (reason: Error) => void
  const pending = new Promise<SessionPage>((ok, fail) => { resolve = ok; reject = fail })
  const stub = installIrmsStub({ sessions: { listPage: async (page, size) => size === 6 ? pending : pageOf([row(1), row(2), row(3)], page, size) } })
  const view = render(<HistoryView />)
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
  measured.size = 3
  view.rerender(<HistoryView />)
  expect(await screen.findByText('Page row 1')).toBeInTheDocument()
  await act(async () => { if (outcome === 'resolve') resolve(pageOf([row(999)], 0, 6)); else reject(new Error('stale')) })
  expect(screen.queryByText('Page row 999')).not.toBeInTheDocument()
  expect(useUiStore.getState().toasts).toHaveLength(0)
  expect(stub.sessions.listPage).toHaveBeenCalledWith(0, 3)
})

it('uses native clamping after deleting the only last-page row without a redundant request', async () => {
  const rows = Array.from({ length: 7 }, (_, index) => row(index + 1))
  const stub = installIrmsStub({ sessions: {
    listPage: async (page, size) => pageOf(rows, page, size),
    delete: async (id) => { rows.splice(rows.findIndex((value) => value.id === id), 1); return { success: true } }
  } })
  render(<HistoryView />)
  await screen.findByText('Page row 1')
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
  await screen.findByText('Page row 7')
  fireEvent.click(screen.getByRole('button', { name: /刪除.*7/ }))
  await screen.findByText('Page row 1')
  expect(screen.queryByText('Page row 7')).not.toBeInTheDocument()
  expect(stub.sessions.listPage).toHaveBeenCalledTimes(3)
  expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
})

it('keeps the row and clears pending deletion when delete fails', async () => {
  const stub = installIrmsStub({ sessions: { listPage: async () => pageOf([row(7)], 0, 6), delete: async () => { throw new Error('locked') } } })
  render(<HistoryView />)
  await screen.findByText('Page row 7')
  const remove = screen.getByRole('button', { name: /刪除.*7/ })
  fireEvent.click(remove)
  await waitFor(() => expect(useUiStore.getState().toasts.some((toast) => toast.type === 'error')).toBe(true))
  expect(remove).toBeEnabled()
  expect(screen.getByText('Page row 7')).toBeInTheDocument()
  expect(stub.sessions.listPage).toHaveBeenCalledTimes(1)
})

it('reports the current page failure and stops showing loading', async () => {
  installIrmsStub({ sessions: { listPage: async () => { throw new Error('locked') } } })
  render(<HistoryView />)
  expect(await screen.findByText('載入歷史失敗')).toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一頁' })).toBeDisabled()
})
