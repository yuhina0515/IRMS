---
tags: [irms, native, hardware, telemetry, acceptance]
summary: First real-device run of the native beta.7 read from the telemetry collector: connection and live angles work, one 7 s ERR:1 (I2C) burst.
date: 2026-11-17
---

# Native beta.7: first real-device run (from telemetry, run d27aa7b0)

Owner tested at school on 2026-11-17 around 13:36 to 13:39 (Taipei) and had telemetry on; the run was read from the collector (`/irms-api/v1/runs`), nothing was pasted by hand.

- Run start (05:36:01Z): about 690 packets, a 109 s session with 4 reps and no connection event, packets 60 ms after launch. Very likely the simulator (opened via a demo entry or an older shortcut); not real measurement. Owner's operation order not confirmed.
- Real connection (05:36:38Z): `connection connected=true deviceName=IRMS_Device`. Packets `T:/S:/K:/TR:/SR:/KR:/V:` stream normally (about 20 to 25 Hz), `CMD:LED_*` and `CMD:ALARM_OFF` sent. Over the next minutes the knee angle K moved between 0 and 109.5 deg with the owner's leg movement (checked in 10 s samples).
- Fault: three `ERR:1` bursts, in one 05:37:39.28Z to 05:37:46.30Z (171 packets, about 7 s), then K was valid again. `ERR:1` is the I2C disconnect code in the firmware protocol; it points at a wire or IMU contact glitch, not at the native app. Relevant to the mounting and strain-relief work (see the December plan). What the native app showed during the burst was not observed (the freeze and overlay behaviour from the AI coding rules are still unconfirmed on the native UI).
- Not seen in telemetry: calibration wizard outcome, session on the real device, CSV export (native does not emit `session_start`; `session_end` was seen only for the simulator part). Renderer and IME unknown.
- Conclusion: the beta.7 fix works; real BLE connection and live data are now confirmed on hardware for the first time in the native line.
