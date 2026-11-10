// Spoken session cues via the WebView's built-in speech synthesis (no dependency, works offline).
// Cues are short and time-critical, so the newest cue replaces whatever is still being spoken
// instead of queueing stale ones. A safety cue (over-limit) is never cut off by a routine cue
// that fires right after it: routine cues are dropped until the safety cue has finished speaking.
import { getLocale } from '../i18n'
import { useStore } from '../store/useStore'

export type VoicePriority = 'normal' | 'safety'

/** Routine cues are dropped for at least this long after a safety cue, even if the engine reports an early end. */
export const SAFETY_HOLD_MS = 3000

/**
 * Upper bound on the wait for a safety cue's end event. Measured 2026-11-11 with the Windows zh-TW
 * voices: the longest safety cue ("超過極限角度,請慢慢放鬆") takes about 3.7 s, longer than
 * SAFETY_HOLD_MS, so a fixed window alone let a rep cue cut it off. The cap protects against
 * engines that never fire onend/onerror.
 */
export const SAFETY_MAX_HOLD_MS = 10000

let lastSafetyAt = 0
let safetySpeaking = false
let safetyToken = 0

function synth(): SpeechSynthesis | null {
  const s = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis
  return s ?? null
}

export function isVoiceSupported(): boolean {
  return synth() != null && typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === 'function'
}

function safetyHoldActive(now: number): boolean {
  const elapsed = now - lastSafetyAt
  if (elapsed < SAFETY_HOLD_MS) return true
  return safetySpeaking && elapsed < SAFETY_MAX_HOLD_MS
}

/** Speak `text` if voice prompts are enabled and supported. Never throws. */
export function speak(text: string, priority: VoicePriority = 'normal'): void {
  if (!useStore.getState().settings.voiceEnabled) return
  const s = synth()
  if (!s || !isVoiceSupported()) return
  const now = Date.now()
  if (priority !== 'safety' && safetyHoldActive(now)) return
  try {
    s.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = getLocale() === 'en' ? 'en-US' : 'zh-TW'
    if (priority === 'safety') {
      lastSafetyAt = now
      safetySpeaking = true
      const token = ++safetyToken
      const done = (): void => {
        // Only the newest safety cue may clear the flag; an older one ends with "interrupted".
        if (token === safetyToken) safetySpeaking = false
      }
      utterance.onend = done
      utterance.onerror = done
    } else {
      safetySpeaking = false
    }
    s.speak(utterance)
  } catch {
    /* A speech failure must never affect the session. */
  }
}

/** Stop anything being spoken (used when voice is switched off mid-speech). */
export function stopSpeaking(): void {
  // 停止語音亦代表結束上一段警示的抑制期，避免吞掉新療程提示。
  lastSafetyAt = 0
  safetySpeaking = false
  try {
    synth()?.cancel()
  } catch {
    /* ignore */
  }
}

/** Test hook: forget the safety window. */
export function resetVoiceStateForTests(): void {
  lastSafetyAt = 0
  safetySpeaking = false
}
