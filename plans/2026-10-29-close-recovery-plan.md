# R05 healthy-renderer close protection: evidence and implementation plan

Baseline4556b18f5c18a785492fe677618fc6e5bd8e1e1c, clean before this assessment.
Snapshot %TEMP%/irms-close-recovery-snapshot (7 relevant source files, no private/generated data).
Quota30%/61%; CI40873513567 confirmed in progress. Do not supersede its push before terminal result.
This round is one bounded recovery-gap assessment; implementation is the next bounded task.

## Verified evidence

main.tsx/App.tsx do not install close-request protection. irmsApi.windowControls.close calls native
window.close directly. lib.rs registers no CloseRequested/ExitRequested guard; the separate dpi_guard
window listener handles ScaleFactorChanged only. Native decorations are enabled, so titlebar close
and AltF4 must be covered by native close events, not just a custom close button.
SessionSaveControl/endSession correctly retain failed writes in process; ordinary window destruction
can discard that retained memory and leave an unfinished session. This is source evidence, not a
physical native close reproduction. Updater restartNow already refuses running/id-retained sessions;
do not replace this existing protection. startSession holds a private starting flag before awaiting
native start, while session.id is still null: checking only store.id/running misses this boundary.

Installed @tauri-apps/api/window.js onCloseRequested awaits the handler then destroys the window
unless prevented. This local installed implementation, not a remembered API assumption, informs design.

## Team and decision

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited, backend unknown | close/bootstrap/controller source | native close routes, pending-start/save races |
| Lead | current | evidence, plan and eventual implementation | scoped lifecycle protection and meaningful regression |

Worker read-only; no edits/deploy/commit/heavy tests/network/other-chat messages. Report<=180words,
verified file/line risks plus explicit uncertainty. Final decision recorded in new coding log.

## Next implementation boundaries

1. Install one application-lifetime close handler outside view/error-boundary lifetimes, handling
   registration/cleanup failure explicitly. Add narrow platform abstraction and mocks as needed.
2. Expose a controller-owned close-readiness decision including pending start, active session, ending
   and retained failed-save state; avoid guessing from id alone. Gate state changes during close.
3. For a healthy renderer close while data is retained: prevent native destruction immediately and
   route to existing end/save/retry UI with localized explanation. Do not silently discard, force exit,
   auto-close after a failed save or repeatedly open conflicting confirmation dialogs. Idle close
   should preserve normal behavior. Decide explicit end-and-close versus block-and-save from source
   and independent review before writing code; no mandatory extra confirmation if blocking suffices.
4. Regressions through actual production handler: idle, running, saving, failed retry, pending-start,
   repeated close, listener cleanup/late registration and view error lifetime. Verify native IPC ACL
   from installed Tauri permissions; no speculative blanket grant. Native titlebar/AltF4 acceptance
   remains separate from mocks. Typecheck/full frontend/build; Rust checks only if Rust changes.
5. Update log/index/spec/cheat sheet/checkpoint; scoped commit/push/draft PR after previous CI success.

This protects cooperative normal closes only. Renderer termination/hang, process crash, forced kill,
OS shutdown and durable recovery remain open. It is not a durable queue or exactly-once delivery.
Do not add SQLite schema/idempotency design to this bounded close task. No native/device/production
operations or participant trials are authorized by this plan.
