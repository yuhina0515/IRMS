---
tags: [irms, firmware, ota, modules, plan]
summary: "Plan for automatic firmware and module delivery via two new public repos (IRMS-Firmware, IRMS-Modules): signed release manifests, idle-only automatic OTA, and a verified runtime module loader."
date: 2026-09-25
---

# Automatic firmware / module delivery

> User decisions (2026-09-25): firmware updates **automatically when idle** (connected, no
> session running; a session in progress defers the update until it ends). Two **public**
> repos: `yuhina0515/IRMS-Firmware`, `yuhina0515/IRMS-Modules` — public because the app
> carries no GitHub token (same reason the main repo went public, see AI_CODING_RULES).

## Goal

A tagged release in either repo reaches every connected app without anyone building a
`.bin` or picking a file by hand, and the app refuses anything it cannot verify.

## Constraints

- Nothing the app installs is trusted by transport alone: every artifact is listed in a
  manifest signed with an Ed25519 key whose public half is compiled into the app. Private
  keys live only in `E:\Monitoring-and-IoT\IRMS_secrets\` and as GitHub Actions secrets.
- Existing BLE sensor contract (`IRMS_SERVICE_UUID` characteristics) is untouched.
- Firmware must stay within the default 4 MB partition scheme (ota_0/ota_1 already present).
- Never interrupt a running session; never start OTA while `hardwareError` or a manual
  OTA is in progress.
- Module loader follows the 2026-09-11 ruling: first-party only; native capabilities
  (BLE/DB, signature verification and OTA transport) stays native. As requested on
  2026-09-26, OTA orchestration and history analysis can be signed first-party runtime
  modules through the versioned ModuleContext API; app updates still use the native updater.

## Steps

### Firmware

1. Firmware reports its version: add the standard Device Information Service (0x180A) with
   Firmware Revision String (0x2A26) = `IRMS_FW_VERSION` in `config.h`. Old firmware lacks
   the service → the app treats it as `0.0.0` (always eligible for update).
2. Create `IRMS-Firmware` repo: firmware source (moved from `IRMS_Sensor/`, which becomes a
   pointer README), GitHub Actions that on tag `v*` builds with `arduino-cli`
   (`esp32:esp32:esp32`, core 3.0.x), refuses a tag that differs from `IRMS_FW_VERSION`,
   and publishes `IRMS_Sensor.bin` + `manifest.json` (`version`, `size`, `md5`, `sha256`,
   `minAppVersion`, `notes`) + `manifest.json.sig` (Ed25519 over the manifest bytes).
3. App (Rust): `firmware_check` command — read 0x2A26 on connect, fetch
   `releases/latest/download/manifest.json` + `.sig`, verify signature, compare semver,
   download `.bin`, verify sha256/size, hand bytes to the existing OTA pipeline.
4. App (TS): idle scheduler — on connect and after each session ends, run the check; if an
   update is available and no session is active, start OTA automatically with a visible
   progress banner; Start Session is disabled during OTA; a session in progress defers.
   Settings shows device firmware version, latest version and last check result.

### Modules

5. Create `IRMS-Modules` repo: `modules/<id>/` sources, CI builds each to one ES module
   bundle, publishes `index.json` (id, version, sha256, url, minAppVersion) + signature.
6. App: apply the three CSP/asset-protocol changes from the 2026-09-17 spike; Rust
   `modules_sync` downloads + verifies into app data; TS loader imports verified bundles
   and exposes them through a narrow registry. First module: a small, harmless one (the
   spike's hello module) — calibration stays non-modular per the 09-11 ruling.

## Done criteria

- Unit tests: manifest signature verify (good / tampered / wrong key), semver compare,
  idle scheduler (defers during session, runs after end, never during hardware error).
- Both repos exist, CI green, a real `v*` release produced by CI with verifiable signature.
- End-to-end on hardware: connected device on older firmware updates itself while idle and
  reconnects reporting the new version (needs the device; tracked as a GitHub issue per the
  hardware-work convention if not run in this session).
