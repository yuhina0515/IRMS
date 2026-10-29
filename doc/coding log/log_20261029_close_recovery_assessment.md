# R05 normal-close recovery assessment

Previous task is progress:4556b18 delivered complete failed-suffix retention and shared transaction
budgets. This bounded round assessed one next lifecycle gap while its CI40873513567 remained live;
no runtime code, schema, native window, service or device was changed. Quota30%/61% at assessment.
Plan plans/2026-10-29-close-recovery-plan.md; source snapshot %TEMP%/irms-close-recovery-snapshot.

Lead and independent read-only engineering reviewer verified normal close is unguarded: platform
windowControls.close delegates directly; bootstrap/App/native lib register no close coordinator.
The only native window-event listener found is DPI ScaleFactorChanged. Existing save retry retains
data only in the running process. Thus cooperative titlebar/AltF4 close is a concrete unprotected
path, distinct from forced kill/crash. No physical close was tested; source evidence only.

Meeting: accept missing guard finding. Minimum next task is application-lifetime native close
coordination, preserving retry UI and refusing destruction until session/pending operations are safe.
Install before allowing session start; include private starting/ending state rather than id alone.
Repeated requests must serialize, and false endSession return cannot by itself authorize close.
Updater already guards running/retained-id; preserve it. Installed Tauri window.js awaits its close
handler before destroy unless prevented; implementation and precise ACL must be covered next batch.
Block-and-save versus explicit end-and-close remains a scoped implementation decision, not an
implemented behavior. No durable queue/idempotency migration proposed in this task.

Reviewer inherited model/backend unknown; no edits/tests/network/other-chat messages. Lead inspected
exact sources/installed API, created7-file snapshot, plan and this log. Initial guessed updater.ts/
AppErrorBoundary.tsx filenames were absent; corrected using platform/irmsApi.ts and ErrorBoundary.tsx,
without treating the failed reads as product defects. No broad tests rerun for documentation only.
Next implementation requires meaningful normal-close/start/save/race/lifetime regressions, frontend
checks and independent final review. Native titlebar/AltF4, forced process termination, crash durability
and OS shutdown remain unverified. Broad research/international readiness remains incomplete.

Delivery gate: CI40873513567 for4556b18 completed SUCCESS. Documentation-only assessment delivery
quota26%/60%; git diff whitespace check passed. Runtime implementation remains next bounded task.
