---
tags: [irms, native, modules, security]
date: 2026-11-22
summary: Phase 1 slice 1 of independently updatable native modules - signed content packs in the IRMS-Modules index (native array), staged install with active/previous pointer, re-verification from the stored signed index on every load, downgrade/replay guards, Settings → 模組 management page, session-tips as the first pack. Built by eng-developer, reviewed by eng-qa, 10 findings fixed. Nothing published.
---

# Native module packages, phase 1 slice 1

Decision: [[log_20261122_meeting_updatable_modules]] (owner reversed D2). Implemented by an
eng-developer worker (sonnet) in worktree `IRMS-wt\module-packages`, branch
`feat/native-module-packages`; reviewed by eng-qa (sonnet); lead verified tests, key and layout.

## Design

- `IRMS_Core/src/modules.rs`: the IRMS-Modules signed `index.json` (Ed25519, same compiled-in key
  `MODULES_PUBKEY_B64`) gains a top-level `native` array; the Tauri parser ignores it (no
  `deny_unknown_fields`). Entries: `kind` (only `content` today; others skipped), `schemaVersion`,
  `minApp`, `sha256`, official release-folder `url`, `files[{name, path, size, sha256}]`.
- Signature checked over the exact bytes before parsing; URL allowlist like `app_update.rs`; file names
  reject traversal, `:`, trailing dots/spaces, Windows reserved names and clashes with the bookkeeping
  files; size caps; one invalid entry is skipped (listed), a bad signature rejects the file.
- Install: stage, rename to `modules/<id>/<version>/`, then move `active.json`; previous version kept;
  the signed index and signature are stored with each version and re-verified (signature, entry,
  hashes) on every load. Tampering falls back to the previous version, then to built-in content.
  A pack that needs a newer build is left untouched by an older build (display falls back only).
- Downgrade/replay: `install` refuses a lower version than the active one (rollback is separate);
  an older signed index cannot replace the cached one (per-entry versions, as in Tauri).
- Data dir: `<db dir>/modules/` for the default `irms.sqlite`, `<stem>.modules/` for any other `--db`.
- Apply timing: content packs apply immediately after install.
- UI (`IRMS_App_Native/src/module_ui.rs`, Settings → 模組): row for 使用提示 (installed/available
  version, status chip, 更新, 停用/啟用, 退回上一版), built-in modules as compact rows, 檢查更新,
  全部還原為內建, first 2 tips plus 「…共 N 則」. Buttons and handlers refuse while busy. Network
  work on tokio, off the UI thread.

## Review (eng-qa) and fixes

Verified findings fixed with regression tests: a hostile `active.json` version could delete folders
outside the pack (`a_hostile_active_json_never_deletes_or_reads_outside_the_pack_folder`); an older
build deleted a newer pack; on-load verification trusted an unsigned `meta.json` (now the stored
signed index); no downgrade/replay guard; tips overflowed the no-scroll page; reserved/case-clashing
file names; toggles racing an install; one bad entry rejecting the whole index; uppercase hashes; two
`--db` files sharing one modules folder.

## Verification

- IRMS_Core 225 passed / 6 ignored (25 module tests), IRMS_App_Native 58 / 1, IRMS_App_Tauri 43 / 3;
  clippy `-D warnings` clean in all three.
- Snapshots with a test-signed 20-tip pack (temporary test-key patch, reverted; the compiled-in key is
  the IRMS-Modules key): 有更新 at 1280x800 and 1024x680 (the window minimum), 已停用 at 1024x680, all fit.
- Not done: nothing published (proposal in `doc/plans/2026-11-22-module-packages-publishing.md`), real
  network path untested, no automatic check at launch, no memory of a rolled-back version. Phase 2
  (wasmi logic modules) not started.
