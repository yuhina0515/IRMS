---
tags: [irms, native, updater, installer, release]
summary: Native auto-update (signed installer from the beta channel), installer self-update mode, wearing-check and minimize fixes; beta.9.
date: 2026-11-17
---

# Native auto-update and beta.9

Owner (2026-11-17): wizard posture fix confirmed, real-device calibration OK, beta.9 go, "enable automatic update check and install".

- **Updater** (`IRMS_Core/src/app_update.rs`, `IRMS_App_Native/src/update_ui.rs`): reads the `beta-latest` `latest.json`; the installer URL must equal `releases/download/v<ver>/IRMS_<ver>_x64-setup.exe` on yuhina0515/IRMS; the download is size-capped and its minisign signature (Tauri updater format) is verified against the compiled-in key before anything is written; versions compared with semver. Check 30 s after launch and every 6 h; install only when no session, wizard, wearing check, editor or dialog is open and the device is not connecting; setting "自動更新" (default on, remembered in preferences), manual "檢查更新" / "立即安裝". Developer runs (custom `--db`, simulator, snapshot, `--no-update`, env `IRMS_NO_AUTOUPDATE`) never update.
- **Installer** (`installer.nsi`): `/SELFUPDATE` = silent, restart afterwards, does NOT remove a Tauri install (`/UPDATE` still replaces Tauri for the Tauri updater path); closes a running IRMS first (normal close request, up to ~10 s, then forced); old/new Start menu shortcuts handled (the uninstaller left "IRMS Simulator Demo.lnk" before).
- **Fixes the owner reported:** wearing check re-zero verdict gets a "不歸零直接開始" button and a failed re-zero keeps the dialog with the reason; window restored from minimized repainted partly black (software renderer) -> `repaint-nudge` forces a full repaint.
- **Verification:** core 186 tests (6 ignored live), native 42, Clippy and fmt clean. Live test: the published beta.8 installer downloaded and verified against the compiled-in key. Installer end to end on this desktop (temp install dir): beta.7 running -> `/SELFUPDATE` with the beta.9 installer closed it, installed 1.3.0-beta.9, relaunched in 2.5 s, Tauri app untouched, uninstall left no registry keys, shortcuts or data. In-app path: a build labelled 1.3.0-beta.1 checked, downloaded, verified and launched the installer on its own (it used the published beta.8 installer, which predates `/SELFUPDATE`, so the wizard appeared; that is why the end-to-end was repeated against beta.9 after publishing, see below). A download folder per attempt now avoids a file lock when an earlier installer still runs.
- **Limits:** beta.8 and older have no updater, so beta.9 must be installed by hand once; every later release can update itself. Not verified on the owner's laptop.
