# R05 healthy-renderer normal-close guard

Baselinee1ad348 clean, snapshot %TEMP%/irms-close-recovery-snapshot (runtime unchanged since4556b18).
Plan plans/2026-10-29-close-guard-implementation-plan.md builds on independent assessment plan.
Quota25%/60% initially,22%/60% during validation; no credits/reset/credential changes.
Lead implements/tests/Git; independent read-only engineering reviewer inherited model/backend unknown.

Decision: block-and-save. Active/starting/ending/retained-session close requests are prevented and
localized ordinary toast directs existing end/save/retry. No silent discard/auto-end/extra confirm.
Application-lifetime singleton outside React pages/error boundaries is installed in main before
render; starts synchronously blocked until registration succeeds. Registration failure keeps starts
blocked, logs and shows restart hint. Controller includes private starting/ending plus running/id,
buffer and flushing, so an awaiting native start cannot slip through an id-only check.

Idle-close reservation synchronously blocks new start until explicit native destroy; failure releases
reservation and reports error. Handler always prevents default before checking and awaiting. Installed
Tauri window.js would otherwise auto-destroy after callback, hiding native destruction rejection from
the controller. Installed generated schema shows core:window:default lacks destroy, so add only
core:window:allow-destroy under existing main-window capability. No Rust code/schema/DB change.
Listener deliberately lasts for whole app; no React unmount/cleanup/late-unmount path exists.

Meeting: engineering final review accepts registration/start/retained-data/race behavior and narrow
ACL, no blocker. Suggested explicit reserveWindowClose assertion in deferred saving test is deferred;
source guard includes ending/flushing and controller tests cover pending-start and retained failure.
Reviewer did not run tests. Tests separate actual production-handler bridge with native/controller
mocks from real controller lifecycle tests; no physical native event evidence claimed.

Focused initial45 tests passed/typecheck passed; removed three identical mock-labeled variants
because they did not independently exercise lifecycle states. Final full-suite result recorded below.
Existing Vite large-chunk/ToolsView warnings expected; native/collector code suites not rerun because
runtime Rust/collector sources unchanged. Capability/native titlebar/AltF4 acceptance remains open.
Forced exit, renderer hang/crash, OS shutdown, durable queue and lost-reply idempotency remain open.
No hardware/service/production/participant operations. Broader readiness remains partial.

Final verification:623/623 frontend tests across64 files, TypeScript and Vite build passed.
Existing build warnings unchanged. Previous docs-head CI40874246554 still live at verification;
pending delivery must wait for its terminal success. No native suite result newly claimed.

QUOTA HOLD at20% five-hour /59% weekly after successful local verification. Saved local commit and
checkpoint; no further expensive work until all known windows>=30%. Pending CI40874246554 gates push.

Delivery gate update2026-10-29T13:38Z: CI40874246554 for previous doc head completed SUCCESS.
Quota18%/59%; only scoped Git/draft PR delivery and checkpoint update permitted this round.
No implementation/tests rerun, no native acceptance claim; QUOTA HOLD remains until all>=30%.
