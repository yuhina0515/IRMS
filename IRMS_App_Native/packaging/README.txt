IRMS v1.3.0-beta.6 - Windows x64 native test release

This is the first installer for the Rust/Slint native application.
It is an early test release; feature parity and real-device acceptance are incomplete.

The shortcuts start the real device (Bluetooth) mode. Simulated readings are not real measurements.
The Start menu also includes "IRMS Simulator Demo" (--simulate).
BLE, calibration, GPIO feedback and OTA have not passed real-device acceptance.
The native application does not yet replace the shipping Tauri application.

Install: current user only, no administrator rights required.
Default location: %LOCALAPPDATA%\Programs\IRMS Native Beta
Data: %LOCALAPPDATA%\irms-native-prototype\irms.sqlite
The native beta uses an isolated database and does not migrate Tauri records.
Uninstall retains native data. Close the application before installing or uninstalling.
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

No automatic Tauri-to-native update is provided by this release.
