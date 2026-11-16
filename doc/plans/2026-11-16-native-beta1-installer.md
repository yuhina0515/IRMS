---
tags: [irms, plan, rust, release, installer]
date: 2026-11-16
summary: "Package the Rust-native Windows application as v1.3.0-beta.1 without changing Windows trust policy or the Tauri updater channel."
---

# Native beta 1 installer

The owner requested an installer after Windows Smart App Control blocked the
unsigned portable executable from commit `7bfce2c`, and selected `v1.3.0-beta.1`.
The owner confirmed there is no public code-signing certificate or signing account
and asked to complete the test installer first.

1. Set the native crate and Windows executable metadata to `1.3.0-beta.1`.
2. Default to the software renderer already used for Windows verification. Preserve
   explicit `SLINT_BACKEND` overrides. Include the Slint attribution widget.
3. Create a reproducible NSIS x64 installer for the current user, with isolated
   install and data paths, simulator and experimental device shortcuts, notices,
   and an uninstaller that retains session data.
4. Run native regression tests, build the release, and verify silent installation,
   installed executable launch and snapshot, upgrade, and uninstall/data retention.
5. Commit and push the release work; publish a separate GitHub prerelease and
   download hash. Leave the Tauri updater manifests and `beta-latest` tag unchanged.

This is an early native test release, not feature parity or hardware acceptance.
The application and installer remain unsigned. Neither a wrapper nor a self-signed
certificate resolves public Smart App Control trust. Public signing is a separate
follow-up requiring an eligible trusted service or CA-issued certificate. The
installer must not change Windows security settings or install trust roots.
