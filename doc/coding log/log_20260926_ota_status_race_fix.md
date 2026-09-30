---
tags: [irms, ota, ble, regression]
date: 2026-09-26
summary: "Fix OTA replies lost before BLE write completion and clean up failed transfers."
---

# OTA status race repair

## Request and evidence

The user stopped telemetry monitoring and requested an OTA fix. Automation `irms` is paused.
On beta.14, run `863ac18d-961a-4881-b7f4-bb8013a52bb5` logged READY at
01:26:09.238Z but timed out at 01:26:19.259Z. A retry received ALREADY_RUNNING at
01:32:59.220Z and again timed out. Evidence is recorded on issue #3.

## Changes and decisions

- Subscribe to the broadcast status channel before polling START/END writes, retaining
  notifications delivered before the BLE write acknowledgement.
- Propagate device errors, aborts and channel failures as errors, never empty-string success.
- Route transfer failures through best-effort OTA:ABORT cleanup bounded to three seconds,
  preserving the original error and emitting error progress with the transferred byte count.
- Serialize OTA updates with a nonblocking backend lock, including cleanup, so competing
  manual/automatic requests cannot overlap or abort one another through failure cleanup.
- Keep this change on a branch based on claude/irms-ui-v3; no device commands were run by
  the agent, no release was published, and monitoring was not resumed.

## Verification and self-review

- Five regression tests cover replies before write ACK (READY and DONE), immediate device
  errors, stale replies/timeouts, write failure, and aborted/lagged channels.
- cargo test: 73 passed, 3 existing live integration tests ignored, zero failures.
- cargo clippy --all-targets --all-features -- -D warnings: passed.
- cargo fmt and git diff --check: passed.
- Reviewed START/END subscription ordering and confirmed all errors after START flow through
  bounded cleanup before releasing the update lock. Cleanup is best-effort, not an assertion
  that a disconnected/unresponsive device acknowledged ABORT.

## Remaining acceptance

Install/run the fixed build and repeat OTA with hardware: READY, transfer, DONE, reboot,
reconnect, then read firmware 1.0.1-beta.1. Also verify timeout/abort followed by a retry.
The device may still hold the previous beta.14 OTA session; use the app's abort control or
restart the device before retesting. Physical acceptance remains pending.
