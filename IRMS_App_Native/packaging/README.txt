IRMS v1.3.0-beta.13 - Windows x64 native test release

This is the installer for the Rust/Slint native application.
It is an early test release; feature parity and real-device acceptance are incomplete.

The shortcuts start the real device (Bluetooth) mode. Simulated readings are not real measurements.
The Start menu also includes "IRMS Simulator Demo" (--simulate).
BLE, calibration, GPIO feedback and OTA have not passed real-device acceptance.
The native application does not yet replace the shipping Tauri application.

Install: current user only, no administrator rights required.
Default location: %LOCALAPPDATA%\Programs\IRMS Native Beta
Data: %LOCALAPPDATA%\irms-native-prototype\irms.sqlite
The native beta uses its own database. On the first launch it imports the records of an installed Tauri app once (read from a copy; the Tauri data is never changed).
Uninstall retains native data. The installer and uninstaller close a running IRMS by themselves (a normal close request first).
The required Microsoft Visual C++ runtime DLL is included beside the application.
No WebView2 installation is required. Windows 10/11 x64 is the target; verification
is limited to the build machine. Windows N/KN may require the Media Feature Pack.

SIGNING AND WINDOWS SECURITY
The installer and application are unsigned. Packaging alone does not make an
unknown executable trusted. Windows Smart App Control may still block this release.
A self-signed certificate is not a public code-signing trust solution.
Public signing requires an eligible trusted signing service or CA-issued certificate.
This installer does not disable or modify Windows security settings.
See https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control

A manual install leaves an installed Tauri app alone. The Tauri updater path replaces it; native self-updates never touch it.
Automatic updates: Settings > Software checks the beta channel and installs signed updates when no session is running. It can be turned off there.
