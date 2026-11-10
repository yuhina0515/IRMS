import { act, render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ModulesPanel } from '../components/ModulesPanel'
import { ToolsView } from './ToolsView'
import { loadModules, setModuleEnabled, type ModuleContext } from '../services/modules'
import { useUiStore } from '../store/useUiStore'
import { getT } from '../i18n'

beforeEach(() => {
  localStorage.clear()
  useUiStore.setState({ view: 'settings', toolModuleId: null })
})

it('management only opens the Tools page; navigation cleans the view and re-enable opens a fresh page', async () => {
  const unmount = vi.fn()
  const dispose = vi.fn()
  const mount = vi.fn((el: HTMLElement) => { el.textContent = 'Share operation screen'; return unmount })
  await loadModules({
    appVersion: '1.2.0-beta.18', log: vi.fn(),
    sync: async () => ({ modules: [{ id: 'live-share', name: 'Share', version: '1', description: '', path: 'verified' }], warnings: [], offline: false }),
    importModule: async () => ({ default: { activate(ctx: ModuleContext) {
      ctx.registerPage({ title: 'Share page', mount })
      ctx.onDispose(dispose)
    } } })
  })
  const management = render(<ModulesPanel />)
  expect(mount).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: getT().modules.openModule({ name: 'Share' }) }))
  expect(useUiStore.getState()).toMatchObject({ view: 'tools', toolModuleId: 'live-share' })
  management.unmount()
  const page = render(<ToolsView />)
  expect(screen.getByRole('button', { name: 'Share page' })).toBeInTheDocument()
  expect(screen.getByText('Share operation screen')).toBeInTheDocument()
  page.unmount()
  expect(unmount).toHaveBeenCalledTimes(1)
  expect(dispose).not.toHaveBeenCalled()
  render(<ToolsView />)
  await act(() => setModuleEnabled('live-share', false))
  expect(unmount).toHaveBeenCalledTimes(2)
  expect(dispose).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Share operation screen')).not.toBeInTheDocument()
  expect(screen.getByText(getT().tools.empty)).toBeInTheDocument()
  useUiStore.setState({ view: 'settings', toolModuleId: null })
  render(<ModulesPanel />)
  fireEvent.click(screen.getByRole('checkbox', { name: getT().modules.enableAria({ name: 'Share' }) }))
  const openButton = await screen.findByRole('button', { name: getT().modules.openModule({ name: 'Share' }) })
  expect(useUiStore.getState()).toMatchObject({ view: 'settings', toolModuleId: null })
  fireEvent.click(openButton)
  expect(useUiStore.getState()).toMatchObject({ view: 'tools', toolModuleId: 'live-share' })
  // The still-mounted Tools view picks up the freshly activated instance's page.
  expect(await screen.findByText('Share operation screen')).toBeInTheDocument()
  expect(mount).toHaveBeenCalledTimes(3)
  expect(dispose).toHaveBeenCalledTimes(1)
})

it('adapts legacy panels to Tools pages titled with the module name', async () => {
  const mount = vi.fn((el: HTMLElement) => { el.textContent = 'Legacy operation' })
  await loadModules({
    appVersion: '1.2.0-beta.18', log: vi.fn(),
    sync: async () => ({ modules: [{ id: 'legacy', name: 'Legacy', version: '1', description: '', path: 'verified' }], warnings: [], offline: false }),
    importModule: async () => ({ default: { activate(ctx: ModuleContext) { ctx.registerPanel({ mount }) } } })
  })
  const management = render(<ModulesPanel />)
  expect(mount).not.toHaveBeenCalled()
  management.unmount()
  render(<ToolsView />)
  expect(screen.getByRole('button', { name: 'Legacy' })).toBeInTheDocument()
  expect(screen.getByText('Legacy operation')).toBeInTheDocument()
})
