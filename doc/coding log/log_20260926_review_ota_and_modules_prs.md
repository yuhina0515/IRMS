---
tags: [irms, review, ota, modules]
date: 2026-09-26
summary: "Review PR #13 and #14 before beta.15; fix OTA error progress reset and over-eager module removal."
---

# Review of PR #13 (OTA race) and PR #14 (runtime modules)

## Findings and fixes

- **PR #13, `bluetooth.ts`**: the Rust command now returns `Err` for every OTA failure
  after emitting an `error` progress event with the real byte count. The frontend
  `catch` re-emitted `error` with `bytesSent: 0`, so the progress bar jumped back to 0.
  It now emits a fallback error only if Rust did not send one, keeping the last known
  byte count. The stale doc comment (protocol failures via `Ok`) was rewritten.
  New `bluetooth.test.ts` fails on the old code, passes on the fix (`cd24442`).
- **PR #14, `firmwareAutoUpdateInstall.ts`**: any auto-OTA error removed the
  `firmware-updater` provider, even when the built-in updater was running. Now it is
  removed only when this run used the module (`next !== createFirmwareAutoUpdater`).
  A first attempt keyed on `factory` would have kept a module whose factory returned an
  invalid result; the new tests cover both invalid-factory and failing-`run()` (`ae96ebe`).
- #13 merged into #14 (`07afedd`) so the stack stays consistent; no force-push.

Reviewed without change: BLE subscribe-before-write ordering, bounded ABORT cleanup,
`try_lock` serialization, updater dedupe/`readyToInstall`, provider registration window,
analysis-result validation, dropdown viewport clamping.

## Verification

typecheck clean; vitest 40 files / 375 tests passed; cargo test 73 passed, 3 live ignored.

## Remaining (needs the user)

- Merge #12 → #13 → #14 and publish beta.15 + signed IRMS-Modules releases.
- Hardware acceptance on issue #3 with the fixed build (OTA READY→DONE→reboot→
  `1.0.1-beta.1`, alarm mute/re-arm, power-cut reconnect, force-kill → `abandoned`).
  Latest telemetry run `863ac18d` ended 2026-09-26T02:11Z; the device may still hold
  the stale beta.14 OTA session — power-cycle it before retesting.
