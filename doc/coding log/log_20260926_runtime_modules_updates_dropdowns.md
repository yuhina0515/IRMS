---
tags: [irms, modules, ota, updater, dropdown]
date: 2026-09-26
summary: "Add runtime OTA and history-analysis providers, deduplicate app update downloads, and keep dropdowns within the viewport."
---

# Runtime features and update/menu fixes

## Request

Convert multiple features to independently delivered modules; prevent repeated Check Now
clicks from downloading multiple installers; keep expanded menus visible and selectable.

## Changes

- ModuleContext API v2 supports first-party firmware-updater and session-analysis providers.
  Registrations are staged until activation succeeds and restricted to their respective IDs.
  Disable removes the provider for subsequent operations; bundled implementations remain
  available offline/on failure. Existing OTA operations retain their current provider.
- Auto OTA resolves its provider at an idle trigger; the host checks current connection,
  simulation/session/error state before invoking it and again at flash. BLE transport,
  signature checks and update exclusion stay in the host; modules do not receive raw IPC.
- History uses the analysis provider, validates its numeric result, and falls back on failure.
- IRMS-Modules has independent firmware-updater and session-analysis v1.0.0 sources,
  metadata requiring beta.15, tests and CI checks. No release tag was pushed.
- Prepare host beta.15 version metadata for the new API. This is not an installed/released build.
- Check Now and the automatic check share a promise through download completion. The ready
  installer is retained instead of downloaded again, failed resources close before retry,
  subscribers receive the latest status, and install calls cannot overlap.
- GlassDropdown uses available viewport space, flips upward, clamps horizontal position,
  limits height with scrolling, and updates on viewport resize/scroll.

## Verification

- Frontend typecheck/build and all 371 tests (39 files) passed, including updater/menu/provider tests.
- Standalone module tests verify analysis statistics and OTA defer/failure/once-per-run flow.
- Host integration tests prove module invocation and session-state rejection before flash.
- Rust suite: 73 passed, 3 existing live tests ignored; Clippy/rustfmt checked.
- Browser interaction at 1024x600: settings menu bounds x220.8..580.8, y424.5..556.3;
  selecting the last option changed the trigger label. At 1024x450 the same menu flipped up
  to y124.8..256.6 and selection worked. Viewport override reset after testing.
- Browser uses a local preview, not native Windows/DPI/hardware acceptance. No device tests,
  production installer downloads, module signing or release publishing were performed.

## Decisions and remaining release work

The user supersedes the earlier blanket rule against OTA modules: orchestration is now
replaceable; native primitives and verification stay compiled. Signed first-party code is
trusted code in the WebView, not a sandbox. Re-enable/new module versions load on app restart.
Changes are stacked on the OTA repair branch so its early-status fix is included by ancestry.
Merge/release is not authorized by the standing commit/push/PR workflow. Publish host beta.15
and signed module assets through their existing release pipelines after review; hardware OTA
and native DPI acceptance remain separate. Telemetry automation stays paused.
