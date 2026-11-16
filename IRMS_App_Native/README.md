# IRMS Native Beta

Windows x64 Rust/Slint application, version `1.3.0-beta.3`. Early test release:
feature parity and physical device acceptance are incomplete. The existing Tauri
release remains the shipping application.

The default shortcut uses simulated sensor data. The experimental device shortcut
passes `--real-ble`. Session data stays in
`%LOCALAPPDATA%\irms-native-prototype\irms.sqlite`; Tauri data is not migrated.
Software rendering is the default; developers can override `SLINT_BACKEND`.

Beta.3 adds session CSV export (system save dialog) and single-instance launch on top of beta.2. Beta.2 added, on top of beta.1: ordered BLE session feedback with alarm mute and Windows
system speech (toggle in Settings / Display, or launch with `--no-voice`), editable
prescriptions and persistent preferences, a calibration wizard with leg choice, calibrate /
mobility / quick re-zero presets and a calibration that survives restarts, range-of-motion
records with a comparable trend (Settings / Calibration), and a pre-session wearing check
on real devices. Physical device output, speech and wearing-check acceptance remain pending.

## Build and package

Prerequisites: Rust MSVC toolchain, Visual Studio C++ build tools, Windows SDK,
and NSIS 3 with its standard includes/plugins. Run from PowerShell:

```powershell
./packaging/build-installer.ps1 -MakeNsis 'C:\path\to\NSIS\Bin\makensis.exe'
```

The script uses the locked release build, embeds Windows version/icon resources,
collects dependency license notices, creates the installer under
`target/installer`, and writes its SHA-256 file. `-SkipBuild` packages an existing
release binary only after verifying its embedded version.

The current-user installer creates Start menu and desktop shortcuts and registers
an uninstaller, and bundles the required signed Microsoft Visual C++ runtime DLL
from the installed Visual Studio redistributable directory (`-VcRuntime` can
specify its path). Close the native beta before installation or uninstallation.
Uninstall retains session data. It does not install WebView2, replace the Tauri
application, or change its automatic update channel.

## Windows signing

This release is unsigned. Windows Smart App Control may block both the installer
and installed executable. Packaging and self-signing do not establish public trust.
Use a trusted code-signing service or CA-issued certificate for public signed
distribution. The installer does not change Windows security policy.

See [Microsoft's signing guidance](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).
Slint uses its royalty-free desktop license; its official attribution widget is
available from the application's About button. Dependency license notices and the
IRMS license are included in the installation directory.
