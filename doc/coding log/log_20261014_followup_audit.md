---
tags: [irms, squad, audit, signing, calibration, docs, port]
date: 2026-10-14
summary: "Ported the five 2026-10-06..10 archive commits onto the new public repo line, ran a 4-worker audit (signing/update S1, narrative docs, config files, calibration A/B/C), added a module-index rollback guard, fixed stale docs. Voice stays on OS speech synthesis. Android debug APK builds. No hardware testing."
---

# Follow-up audit, port and rollback guard (2026-10-14)

Plan: `plans/2026-10-14-irms-followup-audit-plan.md`. Branch: `fix/ota-truncated-link-flow-control` (new public repo clone, based on `feat/calibration-b`).

## Request
Owner answered six open items from the 2026-10-13 status review: explain the deferred signing items, decide self-trained vs off-the-shelf voice, check docs and config files, agree to the Android toolchain, analyse calibration strategies A/B/C, push.

## Port (item 6)
The 10-06..10-10 work (OTA truncated-link flow control, MTU hint, Claude Design sources, proactive-audit fixes, risk hardening + voice) lived only in the `IRMS-archive` working copy (`E:\Monitoring-and-IoT\IRMS`, origin = archive). The live line is the new public repo (`_repo-migration\new-IRMS`, up to v1.2.0-beta.24 with calibration C). The five commits were exported with `format-patch` and applied with `git am --3way` onto `feat/calibration-b`.
- Conflicts resolved: `doc/HOME.md` (kept both status bullets), `db.rs` (kept both tests: mobility roundtrip and downsample), `calibration.ts` (kept the new repo's `sameCalibrationValue`, the same bug was already fixed independently), `ble.rs` (rejected hunk re-applied by hand on top of `error_chain`).
- Verification after port: `tsc` clean, vitest 54 files / 500 tests pass, `cargo test --lib` 96 pass / 3 ignored.
- Old archive clone is no longer the place for new work (see patent/license strategy memory).

## Squad (read-only workers on a scratchpad snapshot)
| Worker | Model | Result |
|---|---|---|
| W1 signing/update S1 | opus | (a) fix module-only rollback now; (b) TOCTOU accept; (c) IPC tiering real but defer, module key power equals firmware key; (d) endpoint pinning do not do |
| W2 narrative docs | sonnet | stale beta.19 / user_version 8 statements, HOME.md missing entries, broken wikilink; verified and fixed below |
| W3 config files | haiku | one claimed RISK (missing icons) was a false positive: my snapshot excluded `*.png`/`*.ico`; icons are tracked in git |
| W4 calibration A/B/C | opus | keep A as the runtime default, hide B behind a legacy switch, keep C as a separate mobility record; 11 issues listed (not fixed, see below) |

## Changes
- `modules.rs`: `find_rollback` + `cached_entries`. A validly signed remote index whose module version is lower than the cached, still-verifying index is rejected and the cached index is used (offline path with a warning). Upgrades, additions and removals pass. Two unit tests. No change to the signature format or CI; installed betas keep updating. Consequence: yanking a bad release by republishing an older version is no longer possible, publish a higher version instead.
- Docs: version beta.19 -> beta.24 and `user_version` 8 -> 9 in PROJECT_STATUS, AI_CODING_RULES (+ README anchor), OPTIMIZATION, ROADMAP; calibration C marked shipped in beta.24; HANDOFF, TAURI_MIGRATION_PLAN and MODULE_CONTRACT version notes marked historical; HOME.md gets entries for 10-04, 10-09, 10-10, 10-14 and a broken wikilink became plain text; UI_REDESIGN contradiction removed.

## Decisions and findings not acted on
- Voice: off-the-shelf OS speech synthesis (`speechSynthesis`), no self-trained model. Risk: some devices have no zh-TW voice; if real-device tests show that, add pre-rendered clips. Unverified on Android/iOS WebViews.
- Android: SDK 36, NDK 27/28, JDK 21, Rust android targets were already installed. `tauri android build --debug --apk --target aarch64` produced `app-universal-debug.apk`. Not installed on a device, so BLE on Android is untested.
- Calibration (W4, unverified claims, no code changed): B's floor bias/scale correction applies only during capture, not at runtime (~2-3 deg estimated); B wizard has no skip for poses; snapshot does not record calibration method; C hold window is 10 samples (~0.4 s at 25 Hz) while the UI says 2 s; C does not check direction; C knee uses the shank only; C trend ignores the starting pose; no back-to-neutral button; C gyro fusion is dead code. Recommended real-device protocol: 2-3 subjects with a goniometer, A vs B at 0/45/90/120 deg, C repeatability over 3 re-dons.
- Not fixed: `AI_CODING_RULES.md` section 4.3 still lacks a `mobility_records` description; HOME.md still has a stray blank line between bullet groups.
- Open: S1 (b), (c), (d) deliberately left; the ESP32 firmware verification could not be checked from this repo.

## Problems hit during the run (including mine)
- First push (item 6) went to `origin` of the archive clone, which is `IRMS-archive`. That was the wrong repo per the license strategy; I created a same-named branch there by mistake. Owner chose to delete it.
- My first status report (beta.19, "calibration C not pushed") was read from the archive clone and was stale; the new repo is at beta.24 with calibration C pushed.
- The numbered answers in the `/squad` args did not match anything I had listed; the owner's screenshot resolved the mapping. I should have asked before pushing.
- Snapshot excluded image files, so worker W3 produced one false positive.
- `ble.rs` contains six literal NUL bytes (from the 10-10 commit; present in the archive source too). It builds and tests pass, but it is a latent hazard for tooling (`file` reports it as data). Not changed.
- Opus workers returned analyses, not edits; W1 and W4 findings other than the rollback guard were not independently re-verified.

## Verification
`tsc`, vitest (500), cargo test --lib (98 after adding two tests), clippy `-D warnings`, rustfmt clean, Android debug APK build. No hardware testing, no device run of the APK.
