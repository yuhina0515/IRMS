---
tags: [irms, native, release, installer, modules]
date: 2026-11-26
summary: "Native v1.3.0-beta.14 published (first with independently updatable module packs); beta-latest points to it. test-installer.ps1 caught an intermittent locked-exe failure in silent self-update; the installer now waits for the file to unlock and its error boxes answer themselves when silent."
---

# Native v1.3.0-beta.14 release (2026-11-26)

Owner: "發佈 beta 14". Release: https://github.com/yuhina0515/IRMS/releases/tag/v1.3.0-beta.14 (pre-release, unsigned code, tag target `63cbcb1` on `release/native-v1.3.0-beta.14`).

## Contents since beta.13
- Signed content module packs (Settings → 模組): install, update, roll back, reset to built-in; re-verified on every load; downgrade/replay refused; automatic check after launch and every 6 h, installs when idle, can be turned off; rolled-back versions are held ([[log_20261122_native_module_packages_phase1]]). IRMS-Modules `v2026.11.22` session-tips 1.0.0 (minApp beta.14) now applies.
- Installer fix below.

## Installer finding
First `test-installer.ps1 -Old beta.13 -New beta.14` run: 3 FAIL. The old app was closed, but the copy of the new exe failed and the silent `/SELFUPDATE` installer showed a modal "Close IRMS Native Beta before installing." (captured from the installer window only). The process was gone, so the file was still locked for a moment (likely antivirus or handle teardown). An automatic update on the owner's laptop would have stopped on that box. A rerun passed 13/13, so it is intermittent; the script had not changed since beta.13.

Fix in `installer.nsi`: `CloseRunningApp` now waits up to 15 s for `irms_app_native.exe` to open for writing; the two install error boxes have `/SD IDOK` so a silent install cannot hang. After the fix, two runs passed 13/13. Two passes do not prove the intermittent case is gone; the change only removes the hang and gives the lock time to clear. The uninstaller's close function was not changed (uninstall passed every run).

## Steps and checks
1. Version bump: Cargo.toml/lock, build-installer.ps1 check, installer.nsi `VIProductVersion 1.3.0.14`, native README, packaging README.txt, release-notes, root README.
2. Native fmt clean, 67 tests, clippy -D warnings clean; IRMS_Core 232 tests.
3. `packaging\build-installer.ps1` (then `-SkipBuild` after the NSIS fix). Installer SHA-256 `8f010a86306439270e1eb4caed3f38a3edacad42aa2b80605915220f65464d36`.
4. Signed with the updater key (password from IRMS_secrets via env var, not printed); hand-built `latest.json`.
5. `gh release create --prerelease` with exe, `.sha256`, `latest.json` (note: `--target` needs the full SHA, a short one gives HTTP 422). Downloaded assets match the local build and the `.sha256`.
6. `beta-latest/latest.json` replaced; it reports 1.3.0-beta.14.
7. `IRMS_Core` live test `live_the_published_installer_verifies` (ignored by default): offered 1.3.0-beta.14, downloaded and verified with the built-in key.

## Not verified
- The owner's laptop auto-update from beta.13 to beta.14 (look for a beta.14 `app_start` in telemetry).
- Module pack download and install inside the released app on a real machine.
- Everything device-bound (#19 to #23).
