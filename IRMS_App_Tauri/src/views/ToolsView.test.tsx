import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolsView } from './ToolsView'
import { useModulesStore } from '../services/modules'
import { commitFeatures, removeFeatures } from '../services/moduleFeatures'
import { useUiStore } from '../store/useUiStore'

const mod = (id: string, status: 'active' | 'disabled' = 'active') => ({
  id, name: `M-${id}`, version: '1.0.0', description: '', enabled: status === 'active', status, tips: []
})

beforeEach(() => {
  for (const id of ['a', 'b', 'c']) removeFeatures(id)
  useUiStore.setState({ toolModuleId: null, view: 'tools' })
})

describe('ToolsView', () => {
  it('shows an empty state when no module offers a panel', () => {
    useModulesStore.setState({ modules: [mod('a')] })
    render(<ToolsView />)
    expect(screen.getByText('目前沒有提供操作頁面的模組')).toBeInTheDocument()
  })

  it('lists only active modules with a panel and mounts the selected one', async () => {
    commitFeatures('a', { page: { title: 'M-a', mount: (el) => void (el.textContent = 'panel-a') } })
    commitFeatures('b', { page: { title: 'M-b', mount: (el) => void (el.textContent = 'panel-b') } })
    commitFeatures('c', { page: { title: 'M-c', mount: () => {} } })
    useModulesStore.setState({ modules: [mod('a'), mod('b'), mod('c', 'disabled')] })
    render(<ToolsView />)
    expect(screen.getByText('panel-a')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'M-c' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'M-b' }))
    expect(screen.getByText('panel-b')).toBeInTheDocument()
  })
})
