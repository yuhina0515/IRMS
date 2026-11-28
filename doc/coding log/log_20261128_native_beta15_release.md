---
tags: [irms, native, firmware, release, log]
summary: Release of native v1.3.0-beta.15 and firmware 1.0.1-beta.3 on the owner's "merge, release"
date: 2026-11-28
---

# Native beta.15 and firmware 1.0.1-beta.3

Owner: "merge, release" after [[log_20261128_bench_device_no_wearer]].

- PR #27 merged (1dfdbe2). Release PR #28.
- Installer built and signed; `test-installer.ps1` 13/13 (beta.14 to beta.15).
- PR #28 merged; `v1.3.0-beta.15` published (pre-release, tag target 286c486), `beta-latest` points to it.
  Live updater test passed; the desktop's beta.14 updated itself to beta.15 in about 40 s, data files unchanged.
  The desktop install had been removed for the installer test and was put back this way.
- Firmware built with core 3.0.7 (installed separately; a long path breaks its toolchain on Windows) and run
  on the board before tagging: rollback with no client, kept after confirmation (other slot beta.2),
  `OTA:DONE` received, 60 s idle timeout.
- IRMS-Firmware #2 merged (791e1a2; `main` now also carries the former `feat/raw-stream` commits), tag
  `v1.0.1-beta.3`, CI signed and published it, `beta-latest` points to it. The published image updated the
  board from beta.2 and was confirmed. The board stays on 1.0.1-beta.3.
- Previous channel pointers are saved in `E:\Monitoring-and-IoT\IRMS_firmware_backup\2026-11-28\`.

## To know
- Updating FROM beta.2 (or older) still shows one false failure on app beta.14 and older.
- A unit updated to beta.3 and power-cycled before any client connects returns to its old firmware.
- The Tauri beta app updates firmware by itself when idle, so it will move devices to beta.3.

## Problems during the release
- The first 3.0.7 rollback run was contaminated: Windows reconnected to the rebooted board and confirmed the
  image. Repeated with Bluetooth off at the moment of the restart.
- One OTA to the board lost the link 3 s in (receiving side was the released beta.2); the host stopped cleanly.
