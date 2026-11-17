IRMS v1.3.0-beta.7 is the seventh Windows x64 installer for the Rust/Slint native application.

Download `IRMS_1.3.0-beta.7_x64-setup.exe`. This current-user installer adds desktop and Start menu shortcuts and an uninstaller. Installed by hand it runs alongside the Tauri application; installed by the updater it replaces it. No WebView2 installation is required.

The app starts in real device (Bluetooth) mode; an **IRMS Simulator Demo** Start menu entry (`--simulate`) starts the simulator. Physical BLE, calibration, feedback and OTA acceptance remain incomplete; this release does not yet have feature parity with Tauri. Simulated readings are not real measurements.

**New since beta.6:** the app now starts in real device (Bluetooth) mode. In beta.1 to beta.6 the normal shortcuts ran the simulator and the connect button only started demo data; the real device path needed `--real-ble`. The simulator is now `--simulate` (Start menu: IRMS Simulator Demo); the window footer shows "裝置資料" or "模擬資料 · 不是真實量測". The opt-in telemetry choice is now remembered between launches (still off by default), and two calibrations created in the same millisecond no longer share an id. Real device connection has not yet been confirmed on hardware.

**New in beta.6 (since beta.5):** the Tauri beta updater now offers this build. Updating removes the Tauri app (its data folder is left alone) and installs this one, which opens itself afterwards. On the first launch it copies the Tauri records (sessions, readings, prescriptions, personal ranges, mobility records, calibrations) into its own database; the Tauri database is read through a copy and never modified. Import runs once, only into an empty native database. Not carried over: settings the Tauri app kept in its WebView (alarm limits, display choices); re-enter them. This is a beta channel build; physical-device acceptance is still pending.

**New in beta.5 (since beta.4):** firmware check in Settings (fetches the channel manifest, verifies its Ed25519 signature with the built-in key and compares it with the connected device). There is no install button: OTA through the Windows BLE backend is not validated on a physical device, use the Tauri app to update firmware.

**New in beta.4 (since beta.3):** opt-in telemetry upload (Settings / Data and privacy; off at every launch, nothing leaves the computer until it is turned on, no name or computer name is sent) and live share (Tools): share this device's live numbers with a code, or watch another device. Remote setting changes from a viewer are refused.

**New in beta.3 (since beta.2):** session CSV export from History (system save dialog, same metadata header and full readings as the Tauri export) and single-instance launch (a second start shows the running window). Modules are built into the program (design decision D2).

**New in beta.2 (since beta.1):** ordered BLE session feedback, alarm mute and Windows speech; editable prescriptions with persistent preferences; a calibration wizard with leg choice, calibrate / mobility / quick re-zero presets, whose calibration is restored at startup; range-of-motion records with a comparable trend; and a wearing check before a session on a real device (an offset small enough to be the strap can be re-zeroed on the spot).

Session storage includes interrupted-session recovery and retry of failed final writes. A force kill or power loss can still lose readings retained only in memory. Uninstall preserves native records in `%LOCALAPPDATA%\irms-native-prototype\irms.sqlite`.

**Windows security:** the installer and application are unsigned. Smart App Control may still block this release. An installer or a self-signed certificate does not resolve public trust. Public signing is pending a trusted signing service or CA-issued certificate. This release does not modify Windows security settings. [Microsoft signing guidance](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control).

This is a beta-channel build: Tauri beta installations are offered it as an update.

Slint attribution is available through the application's About button. IRMS and third-party license notices are included in the installation folder.

Validation on the build machine: native and core regression tests, Clippy with warnings denied, and an installed-release smoke test were run. The wizard, mobility and wearing logic were exercised on a simulated two-sensor rig only; none of it has been accepted on a physical device. These checks do not establish Smart App Control compatibility.