// Spoken session cues via the WebView's built-in speech synthesis (no dependency, works offline).
// Cues are short and time-critical, so the newest cue replaces whatever is still being spoken
// instead of queueing stale ones. A safety cue (over-limit) is never cut off by a routine cue
// that fires right after it.
import { getLocale } from '../i18n'
import { useStore } from '../store/useStore'

export type VoicePriority = 'normal' | 'safety'

/** Routine cues are dropped for this long after a safety cue so the warning is heard in full. */
export const SAFETY_HOLD_MS = 3000

let lastSafetyAt = 0

function synth(): SpeechSynthesis | null {
  const s = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
  return s ?? null
}

export function isVoiceSupported(): boolean {
  return synth() != null && typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === 'function'
}

/** Speak `text` if voice prompts are enabled and supported. Never throws. */
export function speak(text: string, priority: VoicePriority = 'normal'): void {
  if (!useStore.getState().settings.voiceEnabled) return
  const s = synth()
  if (!s || !isVoiceSupported()) return
  const now = Date.now()
  if (priority === 'safety') lastSafetyAt = now
  else if (now - lastSafetyAt < SAFETY_HOLD_MS) return
  try {
    s.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = getLocale() === 'en' ? 'en-US' : 'zh-TW'
    s.speak(utterance)
  } catch {
    /* A speech failure must never affect the session. */
  }
}

/** Stop anything being spoken (used when voice is switched off mid-speech). */
export function stopSpeaking(): void {
  try {
    synth()?.cancel()
  } catch {
    /* ignore */
  }
}

/** Test hook: forget the safety window. */
export function resetVoiceStateForTests(): void {
  lastSafetyAt = 0
}
