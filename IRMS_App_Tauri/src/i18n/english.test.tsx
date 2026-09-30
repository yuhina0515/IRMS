// i18n P1 guard: (1) the zh-Hant master and the English dictionary have identical key sets and
// every English message is free of CJK text, and (2) with language = en, the main views render
// no CJK characters. (2) is what catches a string that was never moved into the dictionary.
//
// Intentional CJK exceptions (and why) are listed in ALLOWED_CJK below. User data (exercise
// names, module names) is not UI text, so fixtures here use English names.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
vi.mock('chart.js', () => ({
  Chart: class {
    static register = (): void => {}
    destroy = (): void => {}
  },
  CategoryScale: {},
  Filler: {},
  Legend: {},
  LineController: {},
  LineElement: {},
  LinearScale: {},
  PointElement: {},
  Tooltip: {}
}))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CustomAction, Session } from '@shared/types'
import type { LiveAngles } from '@shared/protocol'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { installIrmsStub } from '../test/irmsApiStub'
import App from '../App'
import { CalibrationWizard } from '../components/CalibrationWizard'
import { en } from './en'
import { zhHant } from './zh-Hant'

const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/

/**
 * CJK text that is allowed on screen in English:
 * - '繁體中文': the language selector lists each language by its own name (endonym) so a user
 *   who cannot read the current UI language can still find theirs. Only visible while the
 *   language dropdown is open, so none of the renders below should need it.
 */
const ALLOWED_CJK = ['繁體中文']

/** Every leaf of a dictionary as "path → kind"; function messages are called with dummy params. */
function leaves(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(path, v)
    else if (typeof v === 'function') {
      const params = new Proxy({}, { get: () => '1' })
      out.set(`${path}()`, String((v as (p: unknown) => unknown)(params)))
    } else if (v && typeof v === 'object') {
      for (const [p, s] of leaves(v as Record<string, unknown>, path)) out.set(p, s)
    }
  }
  return out
}

function cjkIn(text: string): string[] {
  let rest = text
  for (const ok of ALLOWED_CJK) rest = rest.split(ok).join('')
  return rest.split(/\s+/).filter((w) => CJK.test(w))
}

/** Visible text plus the attributes screen readers and tooltips expose. */
function screenText(): string {
  const attrs = Array.from(document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]')).flatMap((el) =>
    ['aria-label', 'title', 'placeholder', 'alt'].map((a) => el.getAttribute(a) ?? '')
  )
  return [document.body.textContent ?? '', ...attrs].join(' ')
}

function expectNoCjk(where: string): void {
  expect(cjkIn(screenText()), where).toEqual([])
}

describe('dictionaries', () => {
  it('zh-Hant and en have identical key sets', () => {
    expect([...leaves(en).keys()].sort()).toEqual([...leaves(zhHant).keys()].sort())
  })

  it('stylesheets generate no CJK text via `content:` (jsdom cannot see pseudo-element text)', async () => {
    // Read from disk: vitest replaces CSS modules (even ?raw) with empty strings. The app has no
    // @types/node, so the node:fs surface used here is typed inline.
    const fsModule = 'node:fs'
    const fs = (await import(/* @vite-ignore */ fsModule)) as {
      readdirSync(path: string): string[]
      readFileSync(path: string, encoding: 'utf8'): string
    }
    // vitest runs with the app directory (IRMS_App_Tauri) as cwd
    const cwd = (globalThis as unknown as { process: { cwd(): string } }).process.cwd()
    const dir = `${cwd}/src/styles/`
    const sheets = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => [file, fs.readFileSync(dir + file, 'utf8')] as const)
    expect(sheets.length).toBeGreaterThan(0)
    expect(sheets.every(([, css]) => css.length > 0)).toBe(true)
    const bad = sheets.flatMap(([file, css]) =>
      css
        .split('\n')
        .filter((line) => /content\s*:/.test(line) && CJK.test(line))
        .map((line) => `${file}: ${line.trim()}`)
    )
    expect(bad).toEqual([])
  })

  it('no English message contains CJK characters', () => {
    const bad = [...leaves(en)].filter(([, s]) => cjkIn(s).length > 0)
    expect(bad).toEqual([])
  })
})

const ACTION: CustomAction = {
  id: 1,
  name: 'Knee bend',
  description: 'Bend the knee to the target and hold',
  protocol: 'knee',
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 3000,
  triggerType: 'joint_angle',
  safetyLimit: null
}

const SEGMENT: CustomAction = { ...ACTION, id: 2, name: 'Leg raise', triggerType: 'segment_elevation', targetAngle: 40 }

const SESSION: Session = {
  id: 7,
  startTime: '2026-08-27T10:00:00.000Z',
  endTime: '2026-08-27T10:10:00.000Z',
  targetAngle: 90,
  tolerance: 10,
  holdTimeMs: 2000,
  actionId: 1,
  actionName: 'Knee bend',
  protocol: 'knee',
  repsCompleted: 12,
  safetyLimit: 120,
  comfortAngle: 100,
  limitAngle: 118,
  triggerType: 'joint_angle',
  calibration: '{"proximalZeroRaw":1}',
  abandoned: 1,
  source: 'demo'
}

const ANGLES: LiveAngles = {
  thigh: 10,
  shin: -95,
  knee: 105,
  thighRoll: 1,
  shinRoll: 2,
  kneeRoll: 1,
  rawThigh: 10,
  rawShin: -95,
  rawThighRoll: 1,
  rawShinRoll: 2
}

describe('views render no CJK with language = en', () => {
  beforeEach(() => {
    useStore.getState().setLanguage('en')
    useUiStore.setState({ view: 'dashboard', demoMode: false, confirm: null })
    useStore.setState((s) => ({
      isConnected: false,
      hardwareError: null,
      angles: null,
      customActions: [ACTION, SEGMENT],
      selectedActionId: null,
      angleRange: null,
      session: { ...s.session, running: false, alarmActive: false, overComfort: false, phase: 'idle' },
      settings: { ...s.settings, protocol: 'knee', lastCalibratedAt: null }
    }))
    installIrmsStub({ sessions: { list: async () => [SESSION, { ...SESSION, id: 8, source: 'device', abandoned: 0 }] } })
  })

  afterEach(() => {
    useStore.getState().setLanguage('system')
  })

  it('dashboard across coaching states', async () => {
    const { rerender } = render(<App />)
    expectNoCjk('dashboard, disconnected')

    useStore.setState({ isConnected: true })
    rerender(<App />)
    expectNoCjk('dashboard, not calibrated')

    useStore.setState((s) => ({
      selectedActionId: ACTION.id,
      angles: ANGLES,
      angleRange: { id: 1, comfortAngle: 100, limitAngle: 118, measuredAt: '2026-09-01T00:00:00.000Z' } as never,
      settings: { ...s.settings, lastCalibratedAt: '2026-09-25T06:00:00.000Z' }
    }))
    rerender(<App />)
    expectNoCjk('dashboard, ready')

    useStore.setState((s) => ({ session: { ...s.session, running: true, phase: 'holding', holdProgress: 40, overComfort: true } }))
    rerender(<App />)
    expectNoCjk('dashboard, holding + over comfort')

    useStore.setState((s) => ({ session: { ...s.session, alarmActive: true } }))
    rerender(<App />)
    expectNoCjk('dashboard, over limit')

    useStore.setState((s) => ({ selectedActionId: SEGMENT.id, session: { ...s.session, alarmActive: false, phase: 'idle' } }))
    rerender(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Values' }))
    expectNoCjk('dashboard, segment action + diagnostics')

    useStore.setState({ hardwareError: 'ERR:1' })
    rerender(<App />)
    expectNoCjk('dashboard, hardware fault overlay')
  })

  it('exercises list, inspector and editor', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Exercises' }))
    await screen.findByRole('heading', { level: 1, name: 'Exercises' })
    expectNoCjk('exercises list')
    await userEvent.click(screen.getByRole('button', { name: /Leg raise/ }))
    expectNoCjk('exercise inspector')
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expectNoCjk('exercise editor')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /Knee bend/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alertdialog')
    expectNoCjk('delete confirmation dialog')
  })

  it('session history list and review', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'History' }))
    await screen.findAllByText('Knee bend')
    expectNoCjk('history list')
    await userEvent.click(screen.getAllByRole('button', { name: 'Review' })[0])
    await screen.findByRole('heading', { level: 1, name: 'Session review' })
    expectNoCjk('session review')
  })

  it('every settings category', async () => {
    useStore.setState({ isConnected: true })
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    for (const label of Object.values(en.settings.categories).map((c) => c.label)) {
      await userEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
      expectNoCjk(`settings: ${label}`)
    }
  })

  it('tools empty state', async () => {
    useUiStore.setState({ view: 'tools' })
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Tools' })
    expectNoCjk('tools')
  })

  it('calibration wizard first step, including the leg-switch path', () => {
    useStore.setState((s) => ({ isConnected: true, settings: { ...s.settings, wearSide: 'left' } }))
    render(<CalibrationWizard onClose={() => {}} />)
    expectNoCjk('calibration wizard step 1')
  })

  it('switching the language back re-renders in zh-Hant (the selector is live, not a restart)', async () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    useStore.getState().setLanguage('zh-Hant')
    expect(await screen.findByRole('button', { name: '設定' })).toBeInTheDocument()
  })
})
