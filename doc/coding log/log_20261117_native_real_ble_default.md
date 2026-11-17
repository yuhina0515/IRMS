---
tags: [irms, native, ble, bugfix, hardware]
summary: Owner's first device test hit demo mode because real BLE needed --real-ble; real device is now the default, --simulate starts the simulator.
date: 2026-11-17
---

# Native app: real BLE is the default

- **Report (owner, 2026-11-17 noon):** pressing connect entered a demo mode instead of connecting to the device.
- **Cause:** in v1.3.0-beta.1 to beta.6 the real BLE path was enabled only by `--real-ble`; every normal shortcut started the simulator (a prototype-era default that survived into the installer). The Start menu entry "IRMS Device (Experimental)" was the only way to a real connection.
- **Fix:** real device mode is the default. The simulator starts only with `--simulate` or a simulator startup option (`--connected`, `--calibrated`, `--run`, `--inject-fault`, `--inject-slip`, `--mobility-demo`). `--real-ble` remains as an alias and is rejected together with a simulator option. Installer: the Start menu entry is now "IRMS Simulator Demo" (`--simulate`); README, packaging README and release notes updated.
- **Verification:** native 39 tests, Clippy and fmt clean, release build; snapshots of the release exe: no flag shows the status "裝置資料", `--simulate` shows "模擬資料 · 不是真實量測". Not verified: a real connect (no device at the desktop).
- **Release:** not published. The fix needs a new beta (version bump, installer, GitHub release), which waits for the owner's go-ahead. Workaround for beta.6 testing: start `irms_app_native.exe --real-ble`, or the Start menu entry "IRMS Device (Experimental)".
- **Lesson:** the beta.1-6 acceptance claims ("native app ready") were all simulator runs; the checklist step 2 would have caught this on day one. Keep real-device mode as the default and keep the footer label ("裝置資料" vs "模擬資料") visible.

## beta.7 release (owner: "go to beta 7", 2026-11-17)

- Version bump (Cargo.toml/lock, build-installer.ps1 check, installer.nsi VIProductVersion 1.3.0.7, READMEs, release notes); installer built with `packaging\build-installer.ps1` and signed with the Tauri updater key (`tauri signer sign`, password via env var only); `latest.json` in the beta.6 format; `gh release create --prerelease` with exe, `.sha256`, `latest.json`; `beta-latest` latest.json replaced, as for beta.6.
- Not verified: a real device connection; the Tauri updater path end to end.
