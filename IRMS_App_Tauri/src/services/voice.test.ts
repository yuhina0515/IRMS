import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size
      }
    },
    configurable: true
  })
}

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

import { useStore } from '../store/useStore'
import { SAFETY_HOLD_MS, SAFETY_MAX_HOLD_MS, isVoiceSupported, resetVoiceStateForTests, speak, stopSpeaking } from './voice'

class FakeUtterance {
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public text: string) {}
}

let spoken: FakeUtterance[]
let cancel: ReturnType<typeof vi.fn>

function installSynth(): void {
  spoken = []
  cancel = vi.fn()
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', { speak: (u: FakeUtterance) => spoken.push(u), cancel })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-10T00:00:00Z'))
  resetVoiceStateForTests()
  useStore.setState({ settings: { ...useStore.getState().settings, voiceEnabled: true, language: 'zh-Hant' } })
  installSynth()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('speak', () => {
  it('clears the safety suppression window when stopping at a session boundary', () => {
    speak('warning', 'safety')
    stopSpeaking()
    speak('ended')
    expect(spoken.map((u) => u.text)).toEqual(['warning', 'ended'])
  })
  it('speaks with the language matching the app locale', () => {
    speak('hello')
    expect(spoken.map((u) => [u.text, u.lang])).toEqual([['hello', 'zh-TW']])

    useStore.setState({ settings: { ...useStore.getState().settings, language: 'en' } })
    speak('again')
    expect(spoken[1].lang).toBe('en-US')
  })

  it('does nothing when voice prompts are switched off', () => {
    useStore.setState({ settings: { ...useStore.getState().settings, voiceEnabled: false } })
    speak('hello')
    expect(spoken).toHaveLength(0)
  })

  it('is a silent no-op when the platform has no speech synthesis', () => {
    vi.unstubAllGlobals()
    expect(isVoiceSupported()).toBe(false)
    expect(() => speak('hello')).not.toThrow()
  })

  it('swallows speech engine errors', () => {
    vi.stubGlobal('speechSynthesis', {
      speak: () => {
        throw new Error('engine down')
      },
      cancel
    })
    expect(() => speak('hello')).not.toThrow()
  })

  it('replaces a stale cue instead of queueing behind it', () => {
    speak('one')
    speak('two')
    expect(cancel).toHaveBeenCalledTimes(2)
    expect(spoken.map((u) => u.text)).toEqual(['one', 'two'])
  })

  it('drops routine cues right after a safety cue, then resumes', () => {
    speak('warning', 'safety')
    vi.advanceTimersByTime(SAFETY_HOLD_MS - 1)
    speak('routine')
    expect(spoken.map((u) => u.text)).toEqual(['warning'])

    vi.advanceTimersByTime(2)
    spoken[0].onend?.()
    speak('routine')
    expect(spoken.map((u) => u.text)).toEqual(['warning', 'routine'])
  })

  it('keeps dropping routine cues while a long safety cue is still being spoken', () => {
    // zh-TW "超過極限角度,請慢慢放鬆" measured at ~3.7 s, longer than SAFETY_HOLD_MS
    speak('warning', 'safety')
    vi.advanceTimersByTime(3500)
    speak('rep')
    expect(spoken.map((u) => u.text)).toEqual(['warning'])

    spoken[0].onend?.()
    speak('rep')
    expect(spoken.map((u) => u.text)).toEqual(['warning', 'rep'])
  })

  it('stops waiting for a missing end event after SAFETY_MAX_HOLD_MS', () => {
    speak('warning', 'safety')
    vi.advanceTimersByTime(SAFETY_MAX_HOLD_MS - 1)
    speak('rep')
    expect(spoken).toHaveLength(1)
    vi.advanceTimersByTime(1)
    speak('rep')
    expect(spoken.map((u) => u.text)).toEqual(['warning', 'rep'])
  })

  it('does not let an interrupted older safety cue release the newer one', () => {
    speak('first', 'safety')
    vi.advanceTimersByTime(1000)
    speak('second', 'safety')
    spoken[0].onerror?.() // engine reports "interrupted" for the cancelled first cue
    vi.advanceTimersByTime(SAFETY_HOLD_MS + 500)
    speak('rep')
    expect(spoken.map((u) => u.text)).toEqual(['first', 'second'])
    spoken[1].onend?.()
    speak('rep')
    expect(spoken.map((u) => u.text)).toEqual(['first', 'second', 'rep'])
  })

  it('lets a safety cue through even inside the safety window', () => {
    speak('first', 'safety')
    speak('second', 'safety')
    expect(spoken.map((u) => u.text)).toEqual(['first', 'second'])
  })
})
