# R07 raw-motion input inventory and Wizard B receipt reuse guard

Baseline71f4902 clean readiness worktree, CI40943840118 SUCCESS; initial quota60%/53%, later50%/51%.
Plan plans/2026-10-30-raw-pairing-plan.md; snapshot %TEMP%/irms-raw-pairing-snapshot5 source/tests.
Lead implements/tests/Git; engineering read-only design/final review inherited model/backend unknown.
No device capture, participant/firmware/production/service/network operation or new institution claim.

Inventory verified client G:12 finite values with gyro deg/s/accel g, no source timestamp/sequence.
Bluetooth passes parsed RawMotion only. CSV exports calibrated/smoothed angles, renderer ISO time and
session calibration JSON; it is not raw-motion/reference capture. Firmware source moved to separate
repository per tracked IRMS_Sensor README; implementation/deployed protocol not verified here. Initial
guessed file/glob searches corrected via actual tracked files, not treated as defects.

Concrete bug: record subscribed to new V: values but paired latestMotion forever; one old G could fill
floor/gyro minimum sample counts. New actual component tests reproduced2 failures/1 pass. Accepted
engineering counter/window/correction-consistency design: raw callback increments local receipt even
for identical objects/values, record snapshots after countdown each time, complete fresh V consumes
latest newer receipt once. Face or any floor correction requires raw, preventing uncorrected V mixing;
skip/no-correction path keeps V-only and optional gyro with actual receipt counts. Cancelled capture
callback rejects frames. Existing10-frame minimum,2/6second windows, countdown, solver/Apply unchanged.

Tests cover pre-window and single raw reuse, identical-object distinct callbacks, countdown exclusion,
retry boundary/error clearing, missing V not consuming raw, explicit floor skip, six actual face
captures establishing correction then raw-stall rejection, and optional1/10 raw receipts producing
omitted/exact10 gyro entries in actual solver arguments. Existing announcement happy fixture had
relied on one old raw notification; corrected to emit one per V while preserving its speech assertions.
Focused21 tests/typecheck passed before final optional10 case expansion; full final result below.
Reviewer final accepts, no blocker, did not execute tests or hardware.

Full680/680 Vitest cases across69 files (includes29 offline replay CLI cases), TypeScript and Vite
build passed. Existing chunk/ToolsView warnings unchanged. Rust/firmware/collector sources unchanged,
their suites not rerun. No native timing/measurement result newly claimed. Snapshot/window pairing
is receiver event order only: faster raw coalesces, delayed/duplicated source packets may look new,
minimum count is not temporal coverage. No timestamp/age/sensor-sync or anatomical accuracy inferred.
New capture evidence must label clock domain/calibration/provenance rather than infer missing data.
