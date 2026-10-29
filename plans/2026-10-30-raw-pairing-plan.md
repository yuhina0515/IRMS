# R07 Calibration B raw-notification reuse guard

Baseline71f4902 clean, CI40943840118 SUCCESS; initial quota60%/53%. Snapshot
%TEMP%/irms-raw-pairing-snapshot,5 source/tests, no raw private/device data. One bounded task.

Inventory: client G: parser accepts12 finite gyro deg/s/accel g values, RawMotion has no timestamp/
sequence. Bluetooth publishes parsed values only. Wizard B records on fresh store rawAngles but
pairs every frame with latestMotion.current indefinitely; one old G can fill a floor capture or
gyro list while V: packets continue. History CSV contains calibrated angles/renderer ISO timestamps
and session calibration metadata, not a timestamped/synchronized raw-motion reference capture.
Firmware implementation is not tracked here (IRMS_Sensor has README only); no firmware claim.

Design: local monotonically increasing raw-notification receipt counter (not a device sequence),
increment on each raw callback even when same object/value repeats. Each record starts AFTER its
countdown and snapshots current counter, excluding pre-window raw. Each accepted fresh vector frame
may consume a newer raw receipt at most once. Floor capture and any capture using floor correction
require a new raw receipt; otherwise existing V-only/gyro-optional path remains available, including
explicit floor skip. Preserve10-frame minimum, durations/countdown, solve math and Apply-only setting
write. No numeric age/physiological threshold invented. Source timestamps/queue delay/synchronization
are still unknown; receiver event pairing is not simultaneous-sensor or independent-source proof.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | wizard record and current raw client boundary | duplicate reuse, capture-window isolation, corrected/V-only consistency |
| Lead | current | reproduction/implementation/verification/docs/Git | production component tests, no hardware/source timing claims |

Read-only reviewer no edits/deploy/commit/heavytests/network/other chats, <=200word verified scenario
report/uncertainty. Regressions through actual component/store callbacks: pre-window raw+fresh vectors
cannot advance floor; one new raw cannot count10;10 new raw receipts paired with vectors can advance,
even identical objects; retry starts new window. Existing V-only/skipped-floor/access/announcement
journeys preserved. Full frontend/typecheck/build after runtime component change; no Rust/firmware/
collector changes or live device capture. Document inventory/contract/log/HOME/checkpoint, scoped
commit/push/draft PR after prior CI success. No demographic/clinical/research acceptance claim.
