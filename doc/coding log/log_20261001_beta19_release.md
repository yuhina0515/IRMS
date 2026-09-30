---
tags: [irms, release]
date: 2026-10-01
summary: "v1.2.0-beta.19 released: bundles PR #11 window clamp, #20 adaptive workbench, #21 i18n foundation, #22 mobile prep, #23 module page lifecycle. Manual signed pipeline unchanged."
---

# beta.19 release

## Contents (since `v1.2.0-beta.18`)
- #11 main window clamped to the monitor work area.
- #20 adaptive workbench layout + UI audit.
- #21 i18n foundation (typed dictionary, language setting).
- #22 mobile prep (desktop-only plugins gated, Android project; desktop build unaffected).
- #23 module pages hosted on the Tools tab with immediate lifecycle reactivation.
- No migration changes since beta.18.

## Procedure (unchanged from beta.18)
- Branch `release/1.2.0-beta.19`; version bumped in the same 5 files as the beta.18 bump commit
  (`package.json`, `package-lock.json`, `src-tauri/{tauri.conf.json,Cargo.toml,Cargo.lock}`).
- `npm run ci` green: vitest 48 files / 443 tests, cargo 84 passed (3 ignored), clippy clean.
- Signed `npm run tauri build` with the updater key from `IRMS_secrets` via
  `TAURI_SIGNING_PRIVATE_KEY*` env vars. Hand-built `latest.json` (signature read from the `.sig`
  file, not retyped); installer + `.sig` renamed to the dotted `IRMS.Dashboard_…` name before upload.
- `tauri build` again flipped `Cargo.toml` to CRLF. Gotcha: `git checkout --` on it also discards
  an uncommitted version bump, so commit the bump first (or re-apply it, as done here).

## Verification (pre-publish)
- Installer signature checked against `plugins.updater.pubkey` in `tauri.conf.json` with a small
  Node minisign verifier (Ed25519 over BLAKE2b-512 prehash, plus trusted-comment global sig): valid.
  Negative check: a one-byte-appended copy fails.
- App not manually run on device; the user verifies.

## Published
- PR #24 squash-merged (`5e8f2ac`, tree identical to the built commit); pre-release
  `v1.2.0-beta.19` targets it with the dotted installer, `.sig` and `latest.json`;
  `beta-latest/latest.json` clobbered.
- Post-publish: downloaded `beta-latest/latest.json` reports `1.2.0-beta.19`, installer URL HEAD 200,
  downloaded installer is byte-identical to the build and its manifest signature verifies against
  the pubkey; the released `.sig` asset equals the manifest signature.
- Squash merges are authored by the GitHub noreply address (same as #20-#23).
