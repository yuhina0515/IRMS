IRMS v1.3.0-beta.2 is the second Windows x64 installer for the Rust/Slint native application.

Download `IRMS_1.3.0-beta.2_x64-setup.exe`. This current-user installer adds desktop and Start menu shortcuts and an uninstaller. It runs alongside the Tauri application with a separate database. No WebView2 installation is required.

The main shortcut starts simulated data. An **IRMS Device (Experimental)** Start menu entry enables the real BLE code path. Physical BLE, calibration, feedback and OTA acceptance remain incomplete; this release does not yet have feature parity with Tauri. Simulated readings are not real measurements.

**New since beta.1:** ordered BLE session feedback, alarm mute and Windows speech; editable prescriptions with persistent preferences; a calibration wizard with leg choice, calibrate / mobility / quick re-zero presets, whose calibration is restored at startup; range-of-motion records with a comparable trend; and a wearing check before a session on a real device (an offset small enough to be the strap can be re-zeroed on the spot).

Session storage includes interrupted-session recovery and retry of failed final writes. A force kill or power loss can still lose readings retained only in memory. Uninstall preserves native records in `%LOCALAPPDATA%\irms-native-prototype\irms.sqlite`.

**Windows security:** the installer and application are unsigned. Smart App Control may still block this release. An installer or a self-signed certificate does not resolve public trust. Public signing is pending a trusted signing service or CA-issued certificate. This release does not modify Windows security settings. [Microsoft signing guidance](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).

This is a separate native prerelease. Existing Tauri installations are not automatically updated to it; the Tauri updater channel is unchanged.

Slint attribution is available through the application's About button. IRMS and third-party license notices are included in the installation folder.

Validation on the build machine: native and core regression tests, Clippy with warnings denied, and an installed-release smoke test were run. The wizard, mobility and wearing logic were exercised on a simulated two-sensor rig only; none of it has been accepted on a physical device. These checks do not establish Smart App Control compatibility.