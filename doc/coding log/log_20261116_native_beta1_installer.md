---
tags: [irms, rust, slint, windows, installer, release]
date: 2026-11-16
summary: "Prepared v1.3.0-beta.1 as a separate native Windows test installer, with explicit unsigned-distribution limits and current-user install/uninstall verification."
---

# Native beta 1 installer

The owner requested an installer after Smart App Control blocked the portable
`7bfce2c` executable, selected `v1.3.0-beta.1`, and confirmed that the unsigned test
installer should proceed without a public code-signing certificate or account.
Plan: [[2026-11-16-native-beta1-installer]].

## Changes

- Native crate, executable resources, title, footer and settings identify
  `1.3.0-beta.1`. The settings page now describes persistent SQLite records,
  replacing the obsolete memory-only prototype description.
- Software rendering is the default on normal launch. An explicit
  `SLINT_BACKEND` remains available for developers. The existing core, BLE wire
  protocol, database isolation and session-save behavior are unchanged.
- The NSIS installer targets the current user, supplies simulator and experimental
  BLE Start menu shortcuts, a desktop shortcut, and an uninstaller. Default path:
  `%LOCALAPPDATA%\Programs\IRMS Native Beta`. Native records retain the existing
  `%LOCALAPPDATA%\irms-native-prototype\irms.sqlite` path; uninstall keeps data.
- `packaging/build-installer.ps1` builds against the lockfile, checks the embedded
  executable version, collects third-party notices, and writes the installer plus
  its SHA-256 file under `IRMS_App_Native/target/installer`.
- The imported `vcruntime140.dll` is deployed beside the application from Visual
  Studio's x64 redistributable directory, with its Microsoft signature validated
  before packaging. Other imported DLLs are Windows components. No WebView2
  installation or machine-wide runtime installation is required.
- Slint's royalty-free desktop license was read locally. The application exposes
  the official `AboutSlint` widget through its About button, and includes dependency
  licenses and the IRMS license in the installation directory.

## Verification

- Locked release build succeeded; the native executable has the expected version
  resources and icon. Four existing native regression tests passed; Clippy passed
  with warnings denied. Tests and Clippy were repeated after correcting settings.
- Silent current-user install and reinstall returned exit code 0. Installed EXE
  hash matched the release build. Uninstall registration identified
  `1.3.0-beta.1`; shortcut targets and experimental `--real-ble` arguments matched.
- Installed release ran without a renderer environment override, rendered a
  Traditional Chinese snapshot and closed normally. The first smoke session
  finalized one `demo` session and 150 sensor readings in an isolated database.
- Reinstall and uninstall preserved the isolated database hash. Application files,
  uninstall registration, Start menu entries and desktop shortcut were removed.
- The initial NSIS build rejected UTF-8 comments under its default ACP input.
  The build script now passes `/INPUTCHARSET UTF8`; packaging then succeeded.
- Adding Windows resource support refreshed the native Cargo lockfile using the
  locally cached dependency graph. Runtime and native regression checks passed.
- Final rebuilt installer: 5,661,967 bytes, SHA-256
  `d69baa229bb309493088ab9bf9a6cc6f285129c09e1f7415a6e2b3d329ef3fa9`.
  Install/reinstall/uninstall and data retention passed again. The final installed
  window and settings both showed `1.3.0-beta.1`; the settings snapshot was visually
  inspected. Normal close finalized the final isolated demo with 148 readings.

## Distribution boundary and handoff

Publish this as a separate GitHub prerelease at `v1.3.0-beta.1`. The release asset
is `IRMS_1.3.0-beta.1_x64-setup.exe`, accompanied by its SHA-256 file. Do not modify
the Tauri updater manifests or `beta-latest` tag. This is an early native test
release, not the planned feature-parity cutover or physical hardware acceptance.

Release page: [v1.3.0-beta.1](https://github.com/yuhina0515/IRMS/releases/tag/v1.3.0-beta.1).

Both the application and installer remain unsigned. A self-signed certificate was
found locally but is not used as a public trust workaround. An installer does not
resolve Smart App Control trust; the owner still needs an eligible trusted signing
service or CA-issued certificate for signed distribution. No security policy or
trust store is changed. See [Microsoft's signing guidance](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).

Next: test the release on the owner's laptop, arrange public code signing, then
continue physical BLE and calibration acceptance. The test does not establish
compatibility with an active Smart App Control policy or a clean Windows VM.
