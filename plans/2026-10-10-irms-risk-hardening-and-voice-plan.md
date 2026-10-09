# IRMS risk hardening + voice cues (2026-10-10)

Follow-up to `2026-10-09-irms-proactive-audit-plan.md`.

## Request
1. Fix / optimize the previously unfixed known issues, and annotate each (in code where it changes, in the log for the rest).
2. Skip real-device testing (verification is automated only; BLE/OTA behavior stays "unverified on hardware").
3. Add voice prompts.

## Assumptions
- "Voice prompts" = spoken cues during a session via the WebView `speechSynthesis` API (no new dependency, works offline on Windows/WebView2). zh-Hant and en follow the app language. Setting `voiceEnabled`, default on, toggle in Settings -> Display.
- Design-level security items (index version/expiry, TOCTOU, IPC gating, endpoint pinning) change the signing/update contract and need the owner's decision; they are annotated and deferred, not changed.
- No fan-out audit this round: the findings already exist and were verified last round; workers are read-only so they would add no fixes. Work is done by the lead in batches.

## Work items
| ID | item | area | plan |
|----|------|------|------|
| V1 | voice service + cues (start, rep n, hold, over-limit repeat, end, connection lost) | services/voice.ts, sessionController, i18n, settings | new |
| R1 | persisted settings sanitize (NaN flushIntervalSec / maxChartPoints) | store/useStore.ts | merge hook + sanitize |
| R2 | NaN from `parseFloat('')` in ActionsView / SessionDock | views, components | guard |
| R3 | `ble.rs` leaks: duplicate connect listener, failed connect not disconnected, stale peripheral | src-tauri/src/ble.rs | read, fix cheap ones |
| R4 | `export_write_text` path scope | src-tauri commands | read, constrain |
| R5 | `telemetry_log` size cap | src-tauri telemetry | cap |
| R6 | `splash.ts` listener ordering, `modules.ts` activate timeout | src | read, fix cheap ones |
| D1 | firmware version trailing NUL; OTA START 10 s timeout | ble.rs / protocol | check code only |
| S1 | index version/expiry, TOCTOU, IPC gating, endpoint pinning | updater / modules | annotate, defer |

## Done criteria
- `npm run ci` green; new tests for V1 and each fix; one deliberate source break per new test file shows a failure, then restored.
- Each remaining item marked FIXED / DEFERRED / NOT-A-BUG with reason in the work log (`doc/coding log/`).
- Hardware behavior explicitly listed as unverified.
