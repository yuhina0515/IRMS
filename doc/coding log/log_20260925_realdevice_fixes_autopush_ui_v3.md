---
tags: [irms, hardware, calibration, firmware, ota, modules, ui, telemetry]
date: 2026-09-25
summary: "Telemetry-driven real-device session: fixed manual-disconnect auto-reconnect and the knee formula (CAL-03 A/B), shipped beta.12/13, split firmware into IRMS-Firmware with signed idle-time auto OTA, added signed IRMS-Modules, and implemented the approved GPT v3 'Rehabilitation Workbook' UI on claude/irms-ui-v3."
---

# Real-device fixes, automatic delivery, UI v3

## Evidence source

The user ran the device with beta.11/12 and live telemetry on; every finding below comes from
the collector (`/irms-api/v1/runs/<id>/events`), not from reading code. Runs: `51e7fcbe`
(beta.11), `b99ffcae` (beta.12).

## Fixes (released in beta.12)

- **Manual disconnect auto-reconnected** (`4bb5141`). At 06:20:47 a packet arrived between
  `disconnect()` and Rust's disconnected event; the HMR-resync path treated it as a live link,
  cleared `manualDisconnect`, and the disconnected event was handled as link-lost. Packets are
  now ignored while a manual disconnect is pending. Confirmed on hardware with beta.12 (06:38:43,
  07:21:13: no reconnect).
- **Knee angle ~30° at a real ~90°** — CAL-03 A/B on run `51e7fcbe` (`f506fc1`). With clothing
  lifting the IMUs, the standing inter-sensor angle was 35.4°; "vector angle − scalar zero"
  cannot compensate a non-parallel mount. Hinge-frame projection difference read 82–85°, same
  source as Leg3D (which the user confirmed matched reality). When both limbs are
  hinge-calibrated, knee = |thigh − shin| in the hinge frame. First real rep counted 06:57:14.
- Residual ~10° under-read traced to the shin hinge axis: 15–20° of shin motion landed in roll,
  pitch ≈ 0 → the shin-hook capture was off. Recalibration then failed once by design (thigh
  raise 18.5° < 20° minimum → wizard returns to that step).

## beta.13 (`v1.2.0-beta.13`)

Trigger-type dropdown opened behind the modal (z 200 vs overlay 1100) and was translucent;
History chart empty because Chart.js registration only happened inside lazy LiveChart (+ no
viewport height + a stale-async canvas reuse); action rows had 6 children in a 5-track grid;
analysis modal gained a full-resolution summary (`sessionAnalysis.ts`).

## Automatic delivery (user decisions: idle-only auto OTA; two public repos)

- `yuhina0515/IRMS-Firmware`: firmware source moved there with history (`git subtree split`);
  `IRMS_Sensor/` here is a pointer. Tag `vX.Y.Z` → CI compiles (`esp32:esp32@3.0.7`), refuses
  a tag ≠ `IRMS_FW_VERSION`, signs `manifest.json` with Ed25519. v1.0.0 published by CI.
- App `firmware_update.rs`: verifies manifest signature (compiled-in key), size/SHA-256/MD5,
  derives the download URL itself. `firmwareAutoUpdate.ts`: runs after connect and after each
  session; never during a session, hardware error or demo; one auto attempt per version per
  run; Start is blocked while it runs. Live-verified against the real release
  (`cargo test live_release -- --ignored`).
- `yuhina0515/IRMS-Modules`: signed `index.json` + per-module files; first module
  `session-tips`. App `modules.rs` verifies and stores under `<app data>/modules` (the only
  asset-protocol scope); CSP `script-src` gains `asset:` only. Live sync verified
  (`cargo test live_modules -- --ignored`). **Not yet seen loading inside a real Tauri build** —
  confirm via telemetry `app_log "[module:session-tips] ..."` once beta.13 is installed.
- Keys: `IRMS_secrets/irms_firmware_ed25519.pem`, `irms_modules_ed25519.pem` (+ Actions secrets).

## UI v3 (branch `claude/irms-ui-v3`, not released)

GPT (Codex CLI) produced `doc/ui-v3-gpt/` from Claude's brief; user approved: adopt v3, 2D pose
default with 3D toggle, block session start until calibrated. Implemented per
`doc/UI_V3_IMPLEMENTATION_PLAN.md`: day/night tokens (system-following), top navigation, fixed
page frame; Dashboard (coach band state contract, judged metric + ruler, 2D/3D/diagnostics
stage, dock); Settings category index; Actions paged list + inspector; History paged list +
full-page review. Six-card strip and Roll overlays removed from clinical views.

Verification: CI green (362 tests); Playwright against Vite with mocked IPC — every view and
all 7 settings categories, plus Dashboard ready/holding/over-limit/ERR states, at 1024×600,
1280×720, 1920×1080 in both themes: page scroll 0, no unbounded scroller. Not yet run in the
native Tauri window or at real Windows scaling.

## Still open

- Hardware checklist (issue #3): over-limit + mute + 30 s re-arm, ESP32 power-cut auto-reconnect
  mid-session, force-kill → `abandoned`; first real auto OTA (needs a firmware version bump);
  module load in a real build.
- v3: native-window DPI matrix, 2 m legibility, patient-focus mode, persisted attempt events
  (per-rep review), bundled Chinese serif (PROPOSAL §9) — deliberately not started.
- PR #10 (v2) superseded by v3; PR for v3 opened as draft.
