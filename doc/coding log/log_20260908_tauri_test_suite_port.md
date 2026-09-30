---
tags: [coding-log, tauri, migration, testing]
summary: Ported the Electron test suite (286 tests) to IRMS_App_Tauri — 268/268 passing, module-mock replaces window.irms, reconnect.test.ts rewritten against invoke/listen
date: 2026-09-08
---

# 2026-09-08 Change Log — Tauri Migration Phase 2b (Test Suite Port)

> **Related docs**: [[HOME|Home]] · [[TAURI_MIGRATION_PLAN|Migration Plan]] ·
> [[log_20260907_tauri_phase2b_frontend_port|Phase 2b frontend port]]

## Goal

Phase 2b's frontend port (previous log) deliberately left the test suite for later — it depends on
`test/setup.ts`/`test/irmsStub.ts` infra that didn't exist on the Tauri side yet, and porting it
needed a real answer for one architectural gap: Electron's tests mock a global (`window.irms`,
installed via `contextBridge`); Tauri's `platform/irmsApi.ts` has no global, only a module export.
This log covers building that test infra from scratch and porting all 26 Electron test files.

## Actions

- **devDeps + scripts**: added `vitest`, `jsdom`, `@testing-library/{react,dom,jest-dom,user-event}`
  to `package.json`, matching the exact versions used on the Electron side. Added `test`,
  `test:watch`, `ci` scripts mirroring Electron's names.
- **`vitest.config.ts`**: ported the Electron config's `node`/`dom` two-project split verbatim,
  including its rationale comment (a single `include: ['src/**/*.test.ts']` glob silently skips
  `.tsx` files — tests get written, never run, and the suite stays green regardless). Aliases
  adjusted to Tauri's actual layout: `@renderer` → `./src` (not `./src/renderer/src`), `@shared` →
  `./src/shared`.
- **`src/test/irmsApiStub.ts`** — the module-mock replacement for Electron's `test/irmsStub.ts`.
  Since call sites do `import { irms } from '.../platform/irmsApi'` instead of reading a global,
  the seam moves from "monkeypatch `window.irms`" to `vi.mock('@renderer/platform/irmsApi', () =>
  mockIrmsApiModule)`. `mockIrmsApiModule` is a single object created once per test file (the
  `vi.mock` factory only runs on first import); `installIrmsStub(overrides)` does NOT replace it or
  its `sessions`/`data`/`actions` sub-objects — it does `Object.assign` onto the existing
  sub-objects, reassigning only the leaf methods. This matters for the exact reason Phase 2a's log
  flagged for the Electron side: if `installIrmsStub` returned a brand-new object each call and
  callers had already captured a reference to the old one, a mid-test second call would be silently
  invisible. Since `irms.sessions.start` is a normal property read at call time (not snapshotted),
  and the `sessions` object identity never changes, callers always see the latest reassignment.
- **`src/test/setup.ts`** — dom-project `setupFiles` entry, ported from Electron's version:
  registers the `platform/irmsApi` mock, calls `installIrmsStub()` once as the default, and polyfills
  `window.matchMedia` (jsdom doesn't have it, and `theme.ts` calls it unconditionally at import
  time). Byte-for-byte same rationale as the Electron original.
- **17 zero-change ports** (only import paths differ due to directory layout, no assertion changes):
  `shared/{downsample,protocol,validation}.test.ts`, `services/{actionQuery,angleMath,
  calibration.axisDelta,calibration,escapeStack,guidance,movementMetric,smoothing,triggerEngine,
  uiThrottle}.test.ts`, `services/simulation/{encode,scenarios}.test.ts`,
  `hooks/useGlobalShortcut.test.tsx`, `components/{MetricGauge,CalibrationWizard}.test.tsx`,
  `store/useStore.test.ts`. These only use `@shared/*` alias imports and relative imports that
  resolve identically under the Tauri layout — copied verbatim, ran green immediately.
- **`store/demoMode.test.ts`, `services/simulation/simulator.test.ts`,
  `services/sessionController.test.ts`**: import path for the stub changed
  (`test/irmsStub` → `test/irmsApiStub`), plus each file adds its own
  `vi.mock('@renderer/platform/irmsApi', () => mockIrmsApiModule)` and
  `vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))`. The second
  mock is necessary because `bluetoothService` (imported by all three, directly or via
  `sessionController`) is a module-level singleton whose constructor calls
  `registerEventListeners()`, which calls the real `listen()` from `@tauri-apps/api/event` —
  outside an actual Tauri webview, `window.__TAURI_INTERNALS__` doesn't exist, and the real
  `listen()`/`invoke()` throw. Without this mock, merely importing `bluetoothService` in a test file
  crashes (as an unhandled rejection inside the async constructor path, not a clean synchronous
  throw). node-project files don't get this mock for free from a setupFile (deliberately, per the
  existing philosophy documented in the original `irmsStub.ts`: explicit installation, no
  environment magic that could silently swallow assertions) — each file installs it itself, exactly
  like it already installs `installIrmsStub()` itself.
- **`services/reconnect.test.ts` — full rewrite, not a port.** Electron's version drives
  `attemptReconnect` by injecting a fake `BluetoothDevice` into `bluetoothService`'s private
  `device` field (a fake `gatt.connect()` that fails N times then succeeds) — that field is the Web
  Bluetooth version's only external dependency. The Tauri implementation has no `device` field at
  all: `attemptReconnect` calls `invoke('ble_connect')` directly, and success/failure of the actual
  connection is reported asynchronously via the `'ble:connection'` event, not via the `invoke` call
  itself succeeding. Rewrote the test to mock `@tauri-apps/api/core`'s `invoke` and
  `@tauri-apps/api/event`'s `listen` (via `vi.hoisted()`, since the mock factories close over
  file-local mutable state — `vi.mock` calls are hoisted above regular `const` declarations in the
  same file by Vitest's transform, so referencing a plain `const` from inside a `vi.mock` factory
  hits a TDZ trap unless the state is declared through `vi.hoisted()`). A helper `installFakeConnect
  (failures)` makes `invoke('ble_connect')` reject N times then, on success, synchronously emits a
  fake `'ble:connection'` event (mimicking what `ble.rs` does for real) before resolving — this is
  what actually flips `useStore`'s `isConnected`/`reconnect` state, matching the real code's
  behavior where `setConnection(true, ...)` (called from the event handler, not from
  `attemptReconnect` itself) is what clears `reconnect`.
- **One test dropped from `reconnect.test.ts`, explicitly, not silently**: Electron's suite had a
  regression lock titled "statusText gets overwritten by connectGATT's Connecting... — so progress
  can't rely on it," asserting that `attemptReconnect`'s `'Reconnecting (n/5)...'` status text gets
  clobbered because it routes through a shared `connect()`/`connectGATT()` whose first line resets
  status to `'Connecting...'`. In the Tauri port, `attemptReconnect` calls
  `invoke<string>('ble_connect')` directly — it never goes through any function that overwrites
  `statusText`. This is a genuine architecture-driven behavior difference, not an unported bug: the
  overwrite path this test guarded against doesn't exist in this implementation, so there's nothing
  left to lock. Removed with an inline comment explaining exactly why, rather than adapting the
  assertion to something that no longer tests anything real.
- **`views/{ActionsView,HistoryView}.test.tsx`**: only the stub import path changed
  (`test/irmsStub` → `test/irmsApiStub`); no `vi.mock` boilerplate needed in these files since
  `test/setup.ts` (dom project) already registers the module mock globally — these tests just call
  `installIrmsStub(overrides)` a second time (after setup.ts's default install) to configure
  specific return values, exactly like the Electron originals.
- **Excluded**: `main/migrations.test.ts` (17 tests) — tests the Electron `better-sqlite3`
  main-process DB/migration layer, which Phase 1 already replaced with `rusqlite` + its own
  `cargo test` suite (15 tests, ported 1:1 per the migration plan). No TS-side equivalent needed;
  confirmed via the plan doc and via `grep`, no Tauri file imports anything this test exercised.
- **`tsconfig.json`**: bumped `target`/`lib` from `ES2020`/`["ES2020", "DOM"]` to
  `ES2022`/`["ES2022", "DOM", "DOM.Iterable"]`, matching Electron's `tsconfig.web.json` exactly. The
  ported tests (`downsample`, `triggerEngine`, `scenarios`, `uiThrottle`) use
  `Array.prototype.at()`, which needs ES2022 lib types — the runtime (Tauri's WebView2/WKWebView,
  both modern browser engines) already supports it, this was purely a stale scaffold default never
  bumped since Tauri's initial `create-tauri-app` scaffold. Fixed the config, not the tests.

## Decisions

- **Module mock over global monkeypatch, but keep the exact same `installIrmsStub(overrides)`
  ergonomics.** Considered mounting a fake `window.__TAURI_INTERNALS__` globally instead (since
  `@tauri-apps/api/core`'s `invoke` is a thin wrapper over it) — that would work for `irmsApi.ts`
  too, since its methods call `invoke()` fresh on every call rather than caching anything. Rejected
  it for the `irms` surface specifically because tests assert on a per-namespace/per-method basis
  (`stub.sessions.progress`, `stub.data.appendBatch`), matching exact call arguments and counts —
  reducing that to raw `invoke(cmd, args)` assertions would have required rewriting essentially
  every assertion in every ported test that touches `irms`, which the task was explicit about not
  doing where avoidable. The module-mock approach keeps zero assertion changes.
- **No shared cross-file Tauri-IPC mock helper module.** Considered building a
  `test/tauriIpcStub.ts` analogous to `irmsApiStub.ts`, exporting shared `invoke`/`listen` mocks for
  every file that needs them. Dropped it: `vi.mock()` calls only hoist within the file they're
  written in — delegating the actual `vi.mock(...)` call to a shared function doesn't work, only
  sharing the *state* referenced by inline `vi.mock` calls would. Given only `reconnect.test.ts`
  needs to actually control/inspect `invoke`/`listen` behavior (the other three call sites just need
  the constructor not to crash), a shared helper would have been one more file to explain for a
  three-line inline mock that's already self-explanatory. `reconnect.test.ts` keeps its bespoke
  `vi.hoisted()` state local to itself.
- **`purgeDemo` intentionally left out of the sessions stub**, matching the Electron original's
  `irmsStub.ts` exactly — its `defaults.sessions` never wrapped `purgeDemo` either (6 of the 7
  `IrmsApi['sessions']` methods are stubbed, not 7). No ported test calls it. Kept the same gap
  rather than "fixing" it as a drive-by, since introducing new stub coverage wasn't in scope and
  risks diverging from Electron's parity baseline for a method nothing exercises.

## Verification

- `npx vitest run`: **25 test files, 268/268 passing.** Ran incrementally after each batch (17
  zero-change files first, then the three BLE-adjacent-but-simulated files, then
  `reconnect.test.ts` alone, then the full suite) rather than porting all 26 blind — every batch
  was green before moving to the next.
- Reconciled the count against the Electron baseline: 286 total − 17 (`migrations.test.ts`,
  confirmed via `npx vitest run src/main/migrations.test.ts` on the Electron side) − 1
  (`reconnect.test.ts`'s dropped Electron-specific test) = 268. Exact match, no unaccounted gap.
- `npx tsc --noEmit`: clean (after the `tsconfig.json` lib bump — first run surfaced 9
  `TS2550: Property 'at' does not exist` errors across 4 files, all from the lib gap described
  above, none from an actual logic problem).
- `npm run build` (`tsc && vite build`): **succeeds**, same chunk-size warning that pre-dates this
  change (`Leg3D` chunk >500kB, unrelated to testing work, not addressed here).
- Confirmed the Electron-side baseline itself (`npx vitest run` in `IRMS_App`) still reports
  286/286 to rule out having misremembered the starting count.

## Self-review

Scenario checked: does the module-mock stub genuinely support a **second** `installIrmsStub(overrides)`
call mid-test overriding the first, the exact pattern Phase 2a's log flagged as the one that would
catch a stale-reference regression? The 26-file suite itself doesn't contain a single test that
calls `installIrmsStub` twice within the same `it(...)` block (checked via `grep` across every
occurrence) — the closest real-world instance of this pattern is `test/setup.ts`'s automatic
`installIrmsStub()` (the "first install," per test file) followed by each `ActionsView.test.tsx`/
`HistoryView.test.tsx` test's own `installIrmsStub(overrides)` call (the "second install," scoped to
that one test) — and those tests assert on real returned content (specific session names, specific
action lists), so if the override were invisible to the render, the assertions would fail, not
silently pass. Both passed for real.

To rule out any remaining doubt about the *specific* "twice within one test" shape, also wrote a
throwaway test (not part of the ported suite, deleted after checking) that called
`installIrmsStub({ actions: { list: async () => [...] } })` twice in a row inside one `it`, asserting
`irms.actions.list()` reflected each install in turn. **Result: PASS** — the second call's override
was visible immediately, with no re-import or extra plumbing needed. This confirms the
`Object.assign`-onto-stable-sub-objects design doesn't reintroduce the stale-reference bug class in
its module-mock form.

## What's left

Test suite porting (the last open item under Phase 2b) is now done. Per `TAURI_MIGRATION_PLAN.md`,
Phase 2b's exit gate still needs a manual smoke pass through every view in demo mode (not attempted
here — out of scope for this task, which was test-suite porting only). Phase 3 (window chrome/boot
splash), Phase 4 (auto-update), and the hardware-gated Phase 0 validation (task #55) remain
untouched, as they were explicitly out of scope going in.
