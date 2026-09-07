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
- [ ] React components, Zustand store (`useStore`/`useUiStore`),
      `services/` pure logic (trigger engine, calibration, angleMath, smoothing, guidance) port
      with no BLE/DB-shape changes required — none of that layer touches Electron APIs directly.
- [ ] Write a new implementation of the Phase 2a adapter module backed by `@tauri-apps/api`'s
      `invoke`/`listen` instead of `window.irms.*` — this is the one file the refactor was meant
      to make swappable. Wires up the Phase 1 DB commands and Phase 0 BLE commands/events
      (`ble:packet`, `ble:connection`, `ble:ota-progress` already emitted by `ble.rs` — the
      frontend side of that contract doesn't exist yet).
- [ ] Port the full existing test suite (286 tests today) — most are pure-logic and should port
      with zero changes to the assertions; only the tests that mock `window.irms`/DB directly need
      rewriting against the new adapter.

**Exit gate**: `npm run ci`-equivalent green on the Tauri side with the full ported suite, and a
manual smoke pass through every view (Dashboard/Actions/History/Settings) in demo mode (no
hardware needed for this pass — demo mode already exists precisely to exercise the full pipeline
without a device).

### Phase 3 — Window chrome, boot splash, single-instance — 🖥 no hardware needed

- [ ] Frameless titlebar + custom minimize/maximize/close (Tauri: `decorations: false` +
      `@tauri-apps/api/window`, same drag-region CSS approach ports directly).
- [ ] Single-instance lock (`tauri-plugin-single-instance` — likely simpler than the current
      hand-rolled `second-instance` handler, per the meeting's migration advocate).
- [ ] Two-stage boot splash (see [[log_20260907_boot_splash_and_code_splitting]] and
      [[log_20260907_boot_splash_gemini_review]] for what it currently does) — the manual
      60fps `setBounds()` growth loop ports to Tauri's `Window::set_size`/`set_position`; the
      splash renderer (currently a standalone non-React HTML/CSS/SVG bundle) needs its own Tauri
      window + a Rust-side port of `main/splash.ts`'s handoff orchestration.

**Exit gate**: visual/timing parity check against the Electron version's existing Playwright
verification pattern (screenshot each phase, confirm no reflow/timing regressions) — same
standard already applied to the Electron splash work, not a lower bar just because it's a port.

### Phase 4 — Auto-update — 🖥 no hardware needed, but real cost (flagged by all three meeting
participants, not disputed by any critique)

- [ ] Replace `electron-updater`/GitHub-Releases-direct with Tauri's updater plugin
      (`tauri-plugin-updater`), which needs a generated `latest.json` manifest — `tauri-action`
      can automate this in CI, but it's a new moving part in the release pipeline, not a drop-in.
- [ ] Port the beta/stable channel toggle (`allowBetaUpdates`, shipped 2026-09-07 —
      [[log_20260907_beta_update_optin_toggle]]) to whatever channel concept the Tauri updater
      plugin supports.
- [ ] **Document the cutover discontinuity explicitly in the release notes when this ships**: per
      the hardware-integration critique, existing Electron installs (including whatever build is
      used for real-hardware testing) cannot auto-update into the first Tauri release — that's a
      manual reinstall, with no auto-update rollback path if the first Tauri build regresses.
      Plan the first Tauri release's rollout with that in mind (e.g., keep the last Electron
      installer easily reachable for manual rollback).

### Phase 5 — Cutover

- [ ] All of Phases 0–4 exit gates met, **including the Phase 0 hardware validation** (this is the
      one gate that cannot be waived by "it compiled" — see Phase 0).
- [ ] Run the existing manual hardware validation script (the ~30-minute E2E pass already used for
      the Electron app, see [[ROADMAP]] Phase 0/issue #3) against the Tauri build, not just the
      Electron one.
- [ ] `IRMS_App` (Electron) archived, not deleted — same treatment `ROADMAP.md` already gives
      retired approaches (e.g. `IRMS_Sensor_Full.bak`) — kept as a reference/rollback point, not
      actively developed further after cutover.

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
