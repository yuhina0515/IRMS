---
tags: [irms, voice, safety, test]
date: 2026-11-11
summary: "Voice cues checked on the real Windows zh-TW engine; the over-limit warning (3.7 s) outlasted the fixed 3 s safety hold, so routine cues could cut it off. Hold now lasts until the safety cue ends (capped at 10 s). Settings shows a notice when the WebView has no speech synthesis. 711 tests pass."
---

# Voice cues: safety hold follows the real utterance length

## Real-engine check (2026-11-11, before the device returned)

Installed Google Chrome on the owner's desktop (driven by playwright-core), `lang = 'zh-TW'`, default voice for the language. Local voices
found: Microsoft Hanhan, Yating, Zhiwei (Chinese, Traditional, Taiwan). Every cue in
`i18n/zh-Hant.ts` `voice.*` started and ended without error:

| Cue | Spoken time |
|---|---|
| 療程開始 | 1.9 s |
| 第 3 下完成 | 2.1 s |
| 保持 | 1.4 s |
| 超過極限角度,請慢慢放鬆 (safety) | 3.7 s |
| 膝蓋稍微彎一點 (safety) | 2.4 s |
| 療程結束,共完成 10 下 | 3.3 s |
| 連線中斷,療程已結束 | 3.2 s |
| 感測器可能移位了 | 2.7 s |

`cancel()` followed by `speak()` (what `voice.ts` does) works: the cut cue ends with
`interrupted`, the new one plays to the end.

The real Tauri WebView2 was not launched (no isolated data dir); WebView2 uses the same OneCore
voices, so the timings should be close but are not proven there.

## Bug

`SAFETY_HOLD_MS = 3000` was a fixed window. The over-limit cue takes about 3.7 s, so a rep or hold
cue arriving 3.0 to 3.7 s after it cancelled the warning mid-sentence. Since 2026-09-27 the device
has no buzzer or LED, so voice and screen are the only warning channels.

## Fix

- `voice.ts`: routine cues are dropped while a safety cue is still speaking (cleared by its
  `onend`/`onerror`), with `SAFETY_HOLD_MS` as the minimum and `SAFETY_MAX_HOLD_MS = 10000` as the
  cap for engines that never fire the end event. A token makes sure an older, interrupted safety
  cue cannot release the hold of a newer one.
- `SettingsView` display pane: when `isVoiceSupported()` is false the toggle is disabled and the
  hint says voice is not available on this device (warnings still show on screen).
- Tests: 3 new cases in `voice.test.ts` (long safety cue, missing end event, interrupted older
  safety cue). Full suite 71 files / 711 tests, `tsc --noEmit` clean.

## Open

- Android: Android System WebView is expected to have no `speechSynthesis`; not verified on a phone
  (no phone on adb). If confirmed, voice on Android needs a native TTS bridge, otherwise it stays
  screen-only with the new notice.
- Rep cue takes about 2.1 s; reps faster than that cut the previous count. Acceptable for slow
  rehab reps; revisit only if a session shows it.
