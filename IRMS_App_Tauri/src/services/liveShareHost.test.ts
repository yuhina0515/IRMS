import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store/useStore'
import { applyRemoteParams, buildSnapshot } from './liveShareHost'

beforeEach(() => {
  useStore.getState().resetSession()
  useStore.getState().setParams({ targetAngle: 90, tolerance: 10, holdTimeMs: 2000 })
})

describe('remote parameter changes', () => {
  it('applies and clamps parameters when no session is running', () => {
    const r = applyRemoteParams({ targetAngle: 60, holdTimeMs: -5 })
    expect(r.ok).toBe(true)
    expect(useStore.getState().params.targetAngle).toBe(60)
    expect(useStore.getState().params.holdTimeMs).toBeGreaterThan(0)
  })

  it('refuses while a session is running', () => {
    useStore.getState().patchSession({ running: true })
    const r = applyRemoteParams({ targetAngle: 60 })
    expect(r.ok).toBe(false)
    expect(useStore.getState().params.targetAngle).toBe(90)
  })

  it('rejects non-numeric values', () => {
    expect(applyRemoteParams({ tolerance: Number.NaN }).ok).toBe(false)
  })
})

describe('snapshot', () => {
  it('carries params and zone but no action name', () => {
    const s = buildSnapshot()
    expect(s.params).toEqual({ targetAngle: 90, tolerance: 10, holdTimeMs: 2000 })
    expect(s.zone.min).toBe(80)
    expect(JSON.stringify(s)).not.toMatch(/"name"/)
  })
})
