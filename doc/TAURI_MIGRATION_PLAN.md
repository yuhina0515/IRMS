# IRMS Tauri v2 Migration — Complete Transition Plan

> Living document — update it as decisions change, don't append a history here (that's what
> `doc/coding log/` is for). See [[HOME]] for the latest status line and [[ROADMAP]] for how this
> relates to the desktop app's other architecture decisions (D1–D5).

## Status at a glance

**Decided (2026-09-07): proceed with Tauri v2 as the primary direction for IRMS_App.** This
followed a three-participant meeting ([[log_20260907_meeting_tauri_v2_evaluation|minutes]]) whose
verdict was "spike first, don't commit yet" — the user's actual instruction after seeing that
verdict was to start the migration now. That's a decision inside the user's own authority (risk
tolerance is theirs to set); this plan proceeds on that basis and does not re-litigate it. What
carries forward from the meeting is not the "wait" conclusion but the **specific risks it
surfaced** — this plan is built around retiring those risks in order, not around ignoring them.

**Kickoff work already done** (2026-09-07, [[log_20260907_tauri_migration_kickoff|log]]):
`IRMS_App_Tauri` scaffolded and verified building/launching on this machine; `protocol.ts`'s
`parseAnglePacket` fully ported to Rust with all 18 test cases passing; the complete BLE transport
layer (`ble.rs`, via `btleplug`) written and compiling clean. **Not yet done or validated: any of
it against real hardware, the DB layer, the frontend, window chrome, or the updater.**

## Correction to the meeting record — the mobile argument was weaker than presented

The migration advocate's strongest surviving argument in the meeting was that a comment in
`main/index.ts` about a planned Android/iOS/iPadOS/watchOS companion app meant Electron
structurally forecloses a future Tauri already supports. **This needs a correction**: `[[ROADMAP]]`
already contains **Decision D5** (2026-09-01, predates the Tauri meeting), which settled how
mobile will actually be built — **React Native + `react-native-ble-plx`, as an independent
codebase from the desktop UI**, specifically because iOS Safari/WebKit has zero Web Bluetooth
support under any wrapper (confirmed against caniuse.com and the WebBluetoothCG's own
implementation-status tracker), so BLE has to be rewritten natively on mobile regardless of what
desktop framework is chosen. Only the pure-function business logic (`services/` — trigger engine,
calibration math, protocol parsing) was ever meant to be shared; UI and BLE transport were always
going to be separate per-platform code.

**Practical effect**: desktop moving to Tauri does not unlock or simplify the mobile port that D5
already scoped — mobile was always a from-scratch React Native BLE integration either way. The
migration's justification rests on the meeting's other arguments (architecture cleanliness,
security-by-default capability model, footprint/cold-boot), not on mobile. Recorded here so a
future reader doesn't cite the mobile angle as settled support for this decision — it isn't.

## Scope and non-goals

**In scope**: full replacement of `IRMS_App` (Electron) with `IRMS_App_Tauri` (Tauri v2) as the
shipped desktop app, covering BLE/OTA transport, data persistence, window chrome, auto-update, and
the full React frontend.

**Explicitly out of scope for this plan**: the mobile companion app (owned by ROADMAP D5,
independent effort, gated on desktop UI Phase 4 being done — it already is); any change to
`IRMS_Sensor` firmware (the wire protocol is the contract both apps must honor unchanged); i18n,
multi-relation-joint generalization, or any other item already deferred in `[[ROADMAP]]`/
`[[OPTIMIZATION]]` — this plan doesn't reopen those.

**`IRMS_App` (Electron) stays the shipped, production app until the cutover criteria below are
met.** It is not frozen — bug fixes and small features may still land there — but no further
large Electron-side investment (new architecture, big UI work) should start once this plan is
underway, to avoid growing the eventual "what still needs porting" surface for no reason.

## Phases

Each phase lists its entry gate (what must be true to start) and exit gate (what must be true to
call it done). 🖥 = no hardware needed · 📡 = needs the real ESP32 sensor.

### Phase 0 — Environment + highest-risk spike — ✅ substantially done, 📡 gate open

- [x] 🖥 Scaffold `IRMS_App_Tauri`, verify the whole toolchain builds/bundles/launches on this
      machine (task #50, done 2026-09-07).
- [x] 🖥 Port `parseAnglePacket` to Rust with full test parity (task #52's protocol half, done).
- [x] 🖥 Write the complete BLE transport layer against `btleplug` (task #52, done — compiles,
      zero warnings, not hardware-tested).
- [ ] 📡 **Validate against real hardware** (task #55, blocked on physical access to the sensor —
      same situation as the existing firmware OTA tasks B3/B4/D1/D2). Two specific tests, both
      required before Phase 2+ proceeds in earnest:
      1. Sustained 25Hz angle-notification reliability over a realistic session length
         (20–45 min), including with the eventual Tauri-side UI under load (once Phase 3 exists
         enough to test this combination — a bare Rust harness only proves the transport, not the
         full pipeline).
      2. GATT characteristic re-discovery after an OTA-triggered firmware version bump — pair,
         run one real OTA update, and confirm reconnect sees the post-update characteristic table
         without a manual unpair (WinRT-backend GATT caching is a documented cross-platform BLE
         issue class, not hypothetical).

**Exit gate for treating the migration as "probably viable"**: both Phase 0 hardware tests pass.
If either fails, stop and reassess — don't sink further effort into Phases 1–4 on a transport that
doesn't hold up. (This isn't a hard blocker on *starting* Phases 1–3's hardware-independent work
below in parallel — DB and frontend porting don't depend on BLE working — but it is a hard
blocker on calling the migration done or retiring Electron.)

### Phase 1 — Data layer: `better-sqlite3` → `rusqlite` — ✅ done (2026-09-07)

- [x] Ported `main/db.ts`'s three repos (`actionsRepo`, `sessionsRepo`, `dataRepo`) and
      `main/migrations.ts`'s versioned migration runner to Rust + `rusqlite`
      (`db.rs`/`migrations.rs`/`types.rs`/`defaults.rs`).
- [x] Ported `main/migrations.test.ts`'s upgrade-path tests 1:1 — 15 tests, all passing.
- [x] LTTB downsampling (`downsample.rs`) — 8 tests ported from `downsample.test.ts`, all passing.
- [x] Repo-level tests (CRUD roundtrips, cascade delete, purge-demo, downsample-on-read) — 9 more
      tests, all passing. **51/51 total across protocol+migrations+downsample+db.**

**Exit gate met**: full Rust unit-test suite green, zero dependency on a running Tauri app.
**Deliberately not done yet**: no `#[tauri::command]` wiring — this phase is pure data-layer
correctness; IPC surface is Phase 2b's job once the platform-adapter shape is decided (see below),
so nothing here gets wired to the frontend twice.

### Phase 2 — Frontend port — 🖥 no hardware needed

**Decided (2026-09-07): refactor `IRMS_App` first, then move it.** Not a near-verbatim copy — the
hardware-integration critique's finding that the adapter boundary is less clean than "thin client"
implied (auto-pairing contract, not just data shapes) is the deciding factor: do that cleanup once,
in the still-working Electron app where it's cheap to verify against the existing 286-test suite,
rather than twice (once messily during the port, once properly afterward).

**Phase 2a — Refactor `IRMS_App` (still Electron, no Tauri involved yet). ✅ Done (2026-09-07):**

Note going in: the codebase already has a clean `IrmsApi` interface (`shared/types.ts`) that
`preload/index.ts` implements and every call site consumes uniformly as the `window.irms` global
— there's no scattered direct Electron API usage to hunt down. The gap isn't "no interface," it's
that `window.irms` is an implicit global rather than an imported module, so nothing marks it as
the seam that changes per-platform, and it isn't mockable/injectable for tests today.

1. [x] **Audit**: `grep -rn "window.irms" IRMS_App/src/renderer/src` — 8 files with real call
       sites (26 total): `main.tsx`, `App.tsx`, `components/TopHeader.tsx`,
       `components/UpdateBanner.tsx`, `views/{Settings,History,Actions}View.tsx`,
       `services/sessionController.ts`. (`test/irmsStub.ts`/`test/setup.ts` also matched but are
       the test infrastructure that *writes* `window.irms`, not call sites to migrate.)
2. [x] **Introduced `src/renderer/src/platform/irmsApi.ts`** — **not** a plain
       `export const irms = window.irms`. Found during the audit: `test/irmsStub.ts`'s
       `installIrmsStub(overrides)` reassigns `window.irms` to a *brand-new* stub object
       mid-test (several Settings/History tests call it a second time to override one method's
       return value for that test). A snapshot-at-import-time re-export would capture the first
       stub and silently ignore every later override, breaking test isolation invisibly. Used
       getters instead (`get sessions() { return window.irms.sessions }`, one per `IrmsApi`
       namespace) so every property access re-reads the current global.
3. [x] **Migrated all 26 call sites** across the 8 files to `import { irms } from
       '<relative>/platform/irmsApi'`.
4. [x] **Verified zero behavior change**: `npm run typecheck` clean, full test suite **286/286
       still passing** (including the mid-test override cases that would have caught the stale-
       reference bug if the naive approach had been used), `npm run build` clean, bundle chunk
       sizes unchanged (pure refactor, no logic touched).

**Note for Phase 2b, not Phase 2a**: some `IrmsApi` members aren't 1:1 portable behind a
same-shaped adapter — `windowControls` and `updates` in particular wrap Electron/contextBridge
concepts (window chrome, `electron-updater`) that Tauri's equivalents (`@tauri-apps/api/window`,
`tauri-plugin-updater`) don't mirror exactly. Phase 2a didn't need to solve this — it only needed
the seam to exist — but Phase 2b's adapter implementation for those two members will need real
adaptation logic, not a mechanical `invoke` swap like `sessions`/`actions`/`data` get.

**Phase 2b — Port to Tauri (in `IRMS_App_Tauri`):**
- [x] **DB layer wired to real Tauri IPC** (2026-09-07, `commands.rs`): all 13 `db.rs` repo
      functions exposed as `#[tauri::command]`s (`actions_*`, `sessions_*`, `data_append_batch`),
      state-managed via `DbState(Mutex<Connection>)`, DB opened for real at app startup in
      `.setup()` against the actual Tauri `app_data_dir()`. Verified at runtime, not just by
      `cargo check`: built and launched the packaged exe, confirmed the real SQLite file gets
      created with the full migration chain applied and the process stays alive.
- [x] **React components, Zustand store, and pure-logic services ported** (2026-09-07): all of
      `components/`, `hooks/`, `views/`, `store/`, `services/` (except `bluetooth.ts`), `shared/`,
      `App.tsx`, `main.tsx`, and static assets copied verbatim into `IRMS_App_Tauri/src` — confirmed
      via grep that none of this layer touches Electron APIs directly, so zero logic changes were
      needed. Test files (`*.test.ts(x)`) were deliberately **not** copied yet — they depend on
      `test/setup.ts`/`test/irmsStub.ts` infra that doesn't exist on this side; porting the suite
      stays a separate follow-up, not silently skipped.
- [x] **New `platform/irmsApi.ts` implementation, backed by `@tauri-apps/api`** (2026-09-07):
      `sessions`/`data`/`actions` are mechanical `invoke()` wrappers over the Phase 1 DB commands.
      `windowControls` got a real implementation via `@tauri-apps/api/window`'s `getCurrentWindow()`
      (`minimize`/`toggleMaximize`/`close`/`isMaximized`/`onResized`-based maximize-change polling);
      `hasCustomTitlebar()` returns `false` until Phase 3 lands the frameless window. `updates` only
      implements `getCurrentVersion()` for real (`@tauri-apps/api/app`'s `getVersion()`); the rest
      are honest no-ops pending task #54 (Phase 4). `firmware.pickBinary()` returns `null` with a
      console warning — deferred to a new dedicated task (dialog-picker + MD5), independent of the
      hardware-gated task #55.
- [x] **New `services/bluetooth.ts` implementation, backed by `ble.rs`'s IPC surface**
      (2026-09-07): same public `BluetoothService` class shape as the Electron version (so
      `store/useStore.ts` and `services/sessionController.ts` needed zero changes), internals swapped
      from Web Bluetooth GATT calls to `invoke()`/`listen()` against `ble_connect`/`ble_disconnect`/
      `ble_send_command`/`ble_get_firmware_version`/`ble_perform_ota_update`/`ble_abort_ota` and the
      `ble:connection`/`ble:packet`/`ble:ota-progress` events. The demo-mode `ingest(text)` entry
      point is preserved unchanged for the simulator; real packets now arrive pre-parsed from Rust
      (`ble:packet` payload matches `ParsedPacket`'s shape exactly, confirmed via `protocol.rs`'s
      `#[serde(tag = "kind", rename_all = "camelCase")]`) instead of being re-parsed in JS. The
      auto-reconnect loop was ported as a call-`ble_connect`-again retry loop (the closest analog to
      Web Bluetooth's `device.gatt.connect()` retry, since `ble_connect` already encapsulates
      scan+connect+subscribe) — like the rest of `ble.rs`, this is unvalidated against real hardware
      disconnect scenarios (task #55).
- [x] **Verified at runtime, not just by compilation** (2026-09-07): `tsc --noEmit` clean, `vite
      build` clean, full `tauri build --debug` succeeded (MSI+NSIS). Launched the packaged exe,
      confirmed the window renders the real ported UI (sidebar nav, IRMS branding, live metric gauge)
      with **dynamic data from a real DB round-trip** — the gauge's target/tolerance/safety-limit
      values only appear if `main.tsx`'s `bootstrap()` → `irms.actions.list()` → `actions_list`
      Rust command → SQLite → back through Zustand → React actually worked end-to-end. Confirmed
      `irms.sqlite` was created fresh in the smoke-test's AppData dir, then cleaned it up.
      Screenshots: `doc/coding log/assets/tauri-smoke-dashboard.png`. Not yet done: clicking through
      Actions/History/Settings (attempted via raw Win32 mouse-event injection, unreliable in this
      environment — worth a proper Playwright-over-CDP driver later) and a console-error check.
- [x] **Port the full existing test suite** (2026-09-08, [[log_20260908_tauri_test_suite_port|log]]):
      268/268 passing across 25 files (down from 286/26 — `main/migrations.test.ts` doesn't port,
      it tests the Electron `better-sqlite3` main-process layer already replaced by Phase 1's own
      `cargo test` suite; `reconnect.test.ts` loses exactly one test, an Electron-specific
      regression lock for a `statusText` overwrite bug that doesn't exist in the Tauri
      `attemptReconnect` implementation, since it calls `invoke('ble_connect')` directly instead of
      routing through a shared `connect()`/`connectGATT()` that resets status text). Added
      vitest/jsdom/testing-library devDeps and the `node`/`dom` two-project vitest.config.ts split
      (ported verbatim from the Electron side, same glob-silently-skips-`.tsx` rationale). New
      `test/irmsApiStub.ts` replaces `window.irms` monkeypatching with
      `vi.mock('@renderer/platform/irmsApi', ...)` plus in-place reassignment of the mocked
      module's `sessions`/`data`/`actions` methods — confirmed this still supports mid-test
      re-override (the exact stale-reference class Phase 2a's log flagged) via a throwaway
      self-check test, then via the ported `ActionsView.test.tsx`/`HistoryView.test.tsx` (setup.ts's
      default install + each test's own override, both passing for real content, not just
      not-crashing). `reconnect.test.ts` was rewritten to drive `attemptReconnect` through mocked
      `@tauri-apps/api/core` `invoke`/`@tauri-apps/api/event` `listen` instead of a fake
      `BluetoothDevice.gatt.connect()` — the Electron test's actual external dependency doesn't
      exist in the Tauri implementation. Bumped `tsconfig.json`'s `target`/`lib` from ES2020 to
      ES2022 (matching Electron's `tsconfig.web.json`) — ported tests using `Array.prototype.at()`
      exposed a pre-existing scaffold-default gap, not a test issue. `tsc --noEmit` and
      `npm run build` both clean.

**Exit gate**: `npm run ci`-equivalent green on the Tauri side with the full ported suite, and a
manual smoke pass through every view (Dashboard/Actions/History/Settings) in demo mode (no
hardware needed for this pass — demo mode already exists precisely to exercise the full pipeline
without a device).

### Phase 3 — Window chrome, boot splash, single-instance — 🖥 no hardware needed — ✅ done (2026-09-10)

- [x] Frameless titlebar + custom minimize/maximize/close (`decorations:false` in
      `tauri.conf.json`; `platform/irmsApi.ts`'s `windowControls` was already a real
      `@tauri-apps/api/window` implementation from Phase 2 — only `hasCustomTitlebar()` needed to
      flip from its placeholder `false` to `true`). `TopHeader.tsx`/`WindowControls` ported
      byte-identical from `IRMS_App`, no changes needed.
- [x] Single-instance lock (`tauri-plugin-single-instance`, registered first in the builder chain
      per Tauri's own requirement; focuses the "main"-labeled window on second launch).
- [x] Two-stage boot splash — `src-tauri/src/splash.rs` (new module) orchestrates a dynamically
      created "splash" `WebviewWindow` sized to the primary monitor's work area, steps its bounds
      via `set_position`/`set_size` on a 16ms timer (`animate_bounds`, direct port of
      `animateBounds()`'s ease-out-cubic math), and hands off to the main window exactly like
      `main/splash.ts`. `splash.html`/`src/splash.css`/`src/splash.ts` ported near-verbatim from
      `IRMS_App` — the edge-travel geometry math (`setupFullScreenAssembly`) turned out to have
      zero Electron-specific dependencies (pure DOM/SVG math off the window's own viewport), so
      the "needs to be redesigned" flag from [[log_20260908_boot_splash_edge_travel]] didn't
      apply — only the bridge at the bottom of splash.ts (Tauri `invoke`/`listen` replacing
      Electron's contextBridge) is platform-specific. One deliberate simplification: reduced-motion
      + ready now travel up in a single `invoke('splash_ready', {reducedMotion})` call instead of
      the Electron version's two-step did-finish-load + executeJavaScript(matchMedia) query, since
      Tauri's invoke can carry a payload on the very first call. Full details:
      [[log_20260910_tauri_phase3_phase4]].

**Exit gate**: ✅ met, with a caveat — verified live (`npm run tauri dev` + screenshots), confirmed
no native title bar (frameless working), custom header/controls render, no Rust panics or webview
console errors, and the app reaches a fully rendered Dashboard state (splash sequence completes
without hanging). Could **not** get a clean side-by-side pixel/timing comparison against the
Electron version's Playwright harness — the test machine's virtual display (819×614) is smaller
than the app's own `minWidth:1024`, which clipped the window's right edge in screenshots
regardless of platform. This is a pre-existing app-level minimum-size assumption (see
`main/index.ts`'s own "13" 1366×768 at 125% scaling ≈ 1093×614 DIP" comment), not something Phase
3 introduced — the Electron app would clip identically on this same screen. Real Playwright
screenshot-diffing against Electron is still open, blocked on a normal-sized display.

### Phase 4 — Auto-update — 🖥 no hardware needed, but real cost (flagged by all three meeting
participants, not disputed by any critique) — ✅ App-side integration done (2026-09-10), ✅ release
pipeline established manually (2026-09-11, see below) — ⚠ not yet proven end-to-end with a real client

- [x] Replace `electron-updater`/GitHub-Releases-direct with Tauri's updater plugin
      (`tauri-plugin-updater`). One custom Rust command was needed (`src-tauri/src/update.rs`'s
      `update_check`) — the JS `check()`'s `CheckOptions` has no per-call endpoint override, only
      the Rust `UpdaterBuilder::endpoints()` does, and that's required for the channel toggle
      below. The command returns the same `{rid, currentVersion, version, date, body, rawJson}`
      shape the plugin's own `check` command does, so `platform/irmsApi.ts` hands it straight to
      `new Update(metadata)` (exported by `@tauri-apps/plugin-updater`) and rides the plugin's own
      `download`/`install` machinery unmodified from there — minimal custom surface.
      **`tauri-action`/CI manifest generation is NOT set up** — this repo has no `.github/workflows`
      at all (Electron's releases are also fully manual, `electron-builder --publish` run by hand;
      no precedent to follow here). `latest.json` generation for a real release still needs
      `tauri build` run with `TAURI_SIGNING_PRIVATE_KEY` set, same manual-release pattern as today.
- [x] Port the beta/stable channel toggle (`allowBetaUpdates`) — the frontend UI
      (`SettingsView`'s toggle, `App.tsx`'s `setAllowPrerelease` call, `UpdateBanner`) was already
      fully wired from Phase 2's platform-adapter work; only `irmsApi.ts`'s `updates` stub needed a
      real implementation. Tauri has no built-in prerelease-channel concept like
      `electron-updater`'s `allowPrerelease` — implemented as two distinct endpoint URLs
      (`update.rs`'s `STABLE_ENDPOINT`/`BETA_ENDPOINT`), selected server-side per check.
      **Beta endpoint is now live (2026-09-11)**: `.../releases/download/beta-latest/latest.json`
      resolves — a `beta-latest` release now exists holding a hand-assembled `latest.json` for
      `v1.2.0-beta.2`. GitHub's own `/releases/latest/download/` alias (used for the stable
      endpoint) still resolves to nothing yet, since every release so far is a prerelease — that
      will start working automatically the moment a real non-prerelease release ships, no further
      setup needed for that path.
- [x] Updater signing keypair generated (`tauri signer generate`) — private key + its password live
      at `E:\Monitoring-and-IoT\IRMS_secrets\` (sibling to the repo, never inside it, so it can't be
      accidentally committed); public key is in `tauri.conf.json`'s `plugins.updater.pubkey`.
      **The private key and password are NOT backed up anywhere else** — if this machine is lost,
      no future Tauri build can produce updates existing installs will accept, and every user would
      need a manual reinstall. Back the key + password up to a password manager before relying on
      this in a real release.
- [ ] **Document the cutover discontinuity explicitly in the release notes when this ships**: per
      the hardware-integration critique, existing Electron installs (including whatever build is
      used for real-hardware testing) cannot auto-update into the first Tauri release — that's a
      manual reinstall, with no auto-update rollback path if the first Tauri build regresses.
      Plan the first Tauri release's rollout with that in mind (e.g., keep the last Electron
      installer easily reachable for manual rollback). Not yet done because there's no Tauri
      release to write notes for yet — this is a release-time task, not an App-side coding task.
- [x] **Release pipeline — manual procedure established (2026-09-11)**: `tauri build` with
      `createUpdaterArtifacts: true` (already set in `tauri.conf.json`) produces the signed
      installer + `.sig`, but does **not** itself emit a `latest.json` — that turned out to be
      false comfort in the config's name; Tauri only auto-assembles that manifest inside
      `tauri-action` (the GitHub Action this repo doesn't use), so it has to be hand-built per
      release: `{version, notes, pub_date, platforms: {"windows-x86_64": {signature, url}}}` where
      `signature` is the raw contents of the generated `.sig` file and `url` is the versioned
      release's installer asset URL (mind the GitHub space→dot filename mangling noted in
      [[irms-project-conventions]]). Upload that `latest.json` to **two** places every beta
      release: the versioned release itself (so `gh release view` shows a complete asset set) and
      as a replacement asset on the fixed `beta-latest` tag (`gh release upload beta-latest
      latest.json --clobber`, or delete+recreate the release, since `gh release upload` won't
      overwrite silently — see [[log_20260911_tauri_updater_pipeline]]). No CI automation yet;
      still a manual step, same as every other release action in this repo.
      **Not yet exercised end-to-end**: no real client has actually received and applied an update
      through this pipeline — that needs a second, higher-version beta release to prove the first
      one's client picks it up, which naturally happens on the next real beta.

### Phase 5 — Cutover

- [ ] All of Phases 0–4 exit gates met, **including the Phase 0 hardware validation** (this is the
      one gate that cannot be waived by "it compiled" — see Phase 0).
- [ ] Run the existing manual hardware validation script (the ~30-minute E2E pass already used for
      the Electron app, see [[ROADMAP]] Phase 0/issue #3) against the Tauri build, not just the
      Electron one.
- [ ] `IRMS_App` (Electron) **codebase** archived, not deleted — same treatment `ROADMAP.md`
      already gives retired approaches (e.g. `IRMS_Sensor_Full.bak`) — kept as a reference/rollback
      point, not actively developed further after cutover. **This is about the source code, not
      the Electron installation's userData folder** — see the next bullet, which is a deliberate
      exception to "don't delete" scoped narrowly to that one folder.
- [x] **Electron → Tauri data migration, done (2026-09-10)**: `src-tauri/src/migrate_electron.rs`
      runs once on a fresh Tauri install — if Tauri's own DB doesn't exist yet and
      `%APPDATA%\irms-app\irms.sqlite` (the Electron app's real userData folder; note this is
      keyed off `package.json`'s `"name"` field, not the `productName` "IRMS Dashboard") does, it
      copies the SQLite file over, lets the normal migration runner bring it up to Tauri's current
      schema, verifies the copy is a real readable database, and only then deletes the source
      Electron userData folder — **this is a user-directed exception to "archive, don't delete"**,
      scoped specifically to this one data folder (not the Electron app itself, which stays
      installed and archived per the bullet above). If the copy or verification fails at any
      point, the Electron folder is left untouched and the error is logged, non-fatally — the app
      still starts with an empty DB rather than blocking launch. **Known, accepted gap**: Settings
      (theme/calibration/beta-update toggle) live in Electron's Local Storage (Chromium leveldb),
      which WebView2 cannot read — only `irms.sqlite`'s contents transfer, Settings reset to
      Tauri's defaults. 3 unit tests cover the success path, the no-source no-op, and the safety
      property that a corrupt copy does NOT get the source deleted.

## Risk register

Carried forward from the meeting and its cross-examination, kept here so they don't have to be
re-derived from the minutes every time this plan is revisited:

| Risk | Source | Status |
|---|---|---|
| No first-party Web Bluetooth in WebView2/Tauri — entire BLE stack is a rewrite | All 3 participants, confirmed independently | Accepted, being executed (Phase 0) |
| `OTA_CHUNK_DELAY_MS` throttle may not hold through btleplug's WinRT backend | Migration advocate's self-flagged weak point | Open — Phase 0 hardware test #1 |
| GATT cache doesn't invalidate after firmware version bump on WinRT | Hardware-integration critique | Open — Phase 0 hardware test #2 |
| Sustained 25Hz + UI load through the new Rust→IPC→React hop, never tested by a short spike | Hardware-integration critique | Open — Phase 0 hardware test #1 (session-length, not connectivity-only) |
| Auto-pairing timeout/permission contract has no `btleplug` equivalent, larger rewrite than "thin client" implied | Hardware-integration critique | Addressed in `ble.rs`'s `scan_for_device` (polling-based 15s scan, no Chromium-style select-device callback needed) — worth a second look once Phase 0 hardware testing exercises it for real |
| Updater cutover forces manual reinstall, no auto-update rollback for the first Tauri release | Hardware-integration critique | Planned for in Phase 4 |
| "~85% reusable" / "2-3 months" estimates are both unsourced/generic, not derived for IRMS | Both sides' cross-examination | Treat neither number as a real budget — track actual phase-by-phase progress instead |
| `tauri-plugin-blec`/`btleplug` are young, single/small-maintainer, "Tauri issues aren't ours to help with" | Migration advocate's self-flagged weak point | Accepted risk — mitigation is `ble.rs` talking to `btleplug` directly rather than through the thinner `tauri-plugin-blec` wrapper, keeping one fewer dependency in the chain the student can't patch |

## Open questions requiring a decision before the phase that needs them

1. **Phase 2's frontend-port approach** (verbatim copy vs. platform-adapter refactor-first) — see
   Phase 2 above. Decide before starting Phase 2.
2. Nothing else is currently blocking on a user decision — Phases 0/1/3/4 have clear technical
   paths and don't need a judgment call to proceed.

## Future consideration (not yet scoped, gated on Phase 4)

**2026-09-09/10**: user confirmed direction for a runtime-pluggable module system on the App
side — feature modules updatable without a full app version bump, users choosing which
non-core modules to enable/disable. Full framing lives in `[[OPTIMIZATION]]`'s P4 backlog (not
architectural enough yet for a ROADMAP decision entry). Noted here because it has a real
dependency on this plan: module delivery/versioning would ride on whatever Phase 4 picks for
the Tauri updater plugin's manifest mechanism, so this can't be scoped in earnest until Phase 4
is decided. Also constrained by `#[tauri::command]` being compile-time-registered — only
modules that stay in pure frontend logic (no native/BLE/DB) can realistically be swapped
without a full rebuild.

**2026-09-10 decided**: a three-way decision meeting (same format as the 2026-09-07 Tauri
migration precedent) must happen once Phase 4 lands and this is actually ready to be designed —
not a straight fall-through into implementation. First-party-only module source is the working
assumption for now, not yet finalized; that gets re-confirmed at the decision meeting.
Bundle integrity verification is locked in as SHA-256 checksum + signature (against a
release-embedded public key); key management and failure-mode details are deferred to that same
design pass. **The calibration logic rewrite (see `[[OPTIMIZATION]]`'s P4 entry) is now the
first module planned for this system** — the user confirmed the existing paired-sensor,
single-linear-wizard calibration architecture can't isolate which sensor/step is actually wrong,
and chose to hold that fix until this module system is ready rather than patch it standalone now.
The already-decided design from `[[log_20260908_meeting_single_imu_axis_orientation]]` (raw
vector rotation + `atan2`, independent per-limb `recalibrateAxis`) remains the reference
starting point for that rewrite, not discarded — just not implemented ahead of the module system.
