# IRMS Native Beta

Windows x64 Rust/Slint application, version `1.3.0-beta.13`. Early test release:
feature parity and physical device acceptance are incomplete. The existing Tauri
release remains the shipping application.

- Real device (Bluetooth) mode is the default; `--simulate` starts the simulator (the "IRMS Simulator Demo" shortcut). `--real-ble` is kept as an alias.
- Live monitoring with ordered feedback (alarm mute, Windows speech), prescriptions and persistent preferences, a calibration wizard (leg choice; calibrate / mobility / quick re-zero), a pre-session wearing check, range-of-motion records with a trend, session history and CSV export.
- Settings: firmware check and firmware update over BLE (OTA, not yet validated on a physical device), automatic program updates from the beta channel (the installer signature is verified), opt-in telemetry and live share.
- Session data stays in `%LOCALAPPDATA%\irms-native-prototype\irms.sqlite`. On the first launch the Tauri database is read through a copy and its records are imported once; the Tauri file is never changed.
- Software rendering is the default; developers can override `SLINT_BACKEND`.
- Developer runs (custom `--db`, the simulator, `--snapshot`, `--no-update`, or the environment variable `IRMS_NO_AUTOUPDATE`) never update themselves.

Physical-device acceptance is partial: connection, calibration and a session have been seen on a real device; OTA, CSV export, the renderer choice and IME are unconfirmed.

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
specify its path). The installer and uninstaller close a running IRMS by themselves.
Uninstall retains session data. It does not install WebView2. A manual install leaves an installed Tauri app alone; the Tauri updater path (`/UPDATE`) replaces it, and native self-updates (`/SELFUPDATE`) never touch it.

## Windows signing

This release is unsigned. Windows Smart App Control may block both the installer
and installed executable. Packaging and self-signing do not establish public trust.
Use a trusted code-signing service or CA-issued certificate for public signed
distribution. The installer does not change Windows security policy.

See [Microsoft's signing guidance](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).
Slint uses its royalty-free desktop license; its official attribution widget is
available from the application's About button. Dependency license notices and the
IRMS license are included in the installation directory.
