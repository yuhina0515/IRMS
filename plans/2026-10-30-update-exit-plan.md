# R05 updater/session-start exit interlock

Baseline275336c clean; previous CI40883973181 SUCCESS. Quota100%/59% after natural reset,
releasing earlier hold; no credits/reset/auth changes. Snapshot %TEMP%/irms-update-exit-snapshot,
5 exact source/test files. One bounded task; no deployment/native installer execution.

Verified source: restartNow checks store session.running/id before install await; starting is private
controller state until native sessions_start resolves. Installer-await also leaves a window for a
new start. Normal-close guard separately reserves closingWindow but updater does not consult it.
Reproduce through actual platform adapter and controller with deferred native start/install mocks.

Design candidate: tiny import-independent single-owner application-transition lease shared by
controller start, idle normal-close reservation and updater installation, avoiding platform/controller
import cycle. Keep existing active/retained-session checks. Start releases its lease in finally;
failed native destroy releases close lease; failed install releases for retry. Successful install
keeps lease/installer state until process exit, because launching installer must not admit new data
while termination is pending. Do not treat resolved install promise as proof process has exited.
No SQLite schema/durable queue or public IPC change. Final choice depends on review/regressions.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | updater/controller transition design and final diff | pending-start, close/update ordering, failed/successful install ownership |
| Lead | current | reproduce/implement/tests/docs/Git | real adapter-controller cross-boundary tests and scoped delivery |

Worker read-only/no edits/deploy/commit/heavytests/network/other chats, <=220word verified scenario
report with snapshot file/line and uncertainty. Meaningful regressions: pending native start blocks
install despite null id; install blocks new start and normal close; failure releases/retries; success
continues blocking new data until process exit. Typecheck/full frontend/build; native sources unchanged
so native tests not repeated without evidence. Document log/index/spec/cheat sheet/checkpoint, scoped
commit/push/draft PR after previous CI success. No actual installer/BLE/production/participant activity.
Native OS installer/termination timing, forced exits/crashes and durability remain acceptance gates.
