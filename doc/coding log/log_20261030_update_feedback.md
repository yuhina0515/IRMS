# R05/R06 update handoff feedback and handled rejection

Baseline432d5fa clean, prior CI40924530764 SUCCESS; initial quota93%/58%. Plan
plans/2026-10-30-update-feedback-plan.md; snapshot %TEMP%/irms-update-feedback-snapshot,6 original
files plus SettingsView source/test reconstructed from HEAD after exhaustive-consumer migration.
Lead edits/tests/Git; engineering and inclusion independent read-only reviews, inherited model,
backend IDs unknown. No native installer/device/service/participant operations.

Verified downloaded-only banner stayed ready during installation; void restartNow had no rejection
handler. Corrected new test fixture's nonexistent patchSettings to real setLanguage, reran baseline:
5 failures/3 passes across new cases plus original updater checks. Fixture typo is not a product bug.
New installing/install-error(version) states preserve original rejection and retained downloaded
artifact. Acquire lease/set installing first, capture update/version, then publish. Resolved install
keeps installing for remount replay and blocks restart until process exit. Explicit rejection first
releases, then publishes generic install-error and rethrows original object; no native details in
status/user text. Existing current-session/retained-save checks and silent download paths retained.

Banner catches rejection, never auto-retries, retains separate persistent polite status/alert nodes,
keeps progress visible across pending/successful handoff/remount and disables repeated activation.
Both locales tested for progress and error/retry. Static Settings copies include both new states;
downloaded artifact still owns its disabled check button. Typecheck found exhaustive consumer before
migration; fixed rather than weakening union/return type. Ordinary updateBanner strings only.

Meeting: accepted engineering subscriber exception/reentrancy risk. Each listener and immediate
replay isolated; snapshot iteration plus lastStatus identity suppress old error after nested retry.
Regression checks throwing replay/notify doesn't mask original rejection or block observers/install,
sync restart doesn't duplicate install, and nested error retry can't overwrite newer installing.
Accepted inclusion duplicate installing announcement finding: Settings copy now static for installing
and install-error; combined Settings/banner DOM test verifies two visible copies but only one live
owner for each transition. Inclusion re-reviewed correction; both final reviews no blocker.
Reviewers did not run tests. Native actual speech order/initial region/remount delivery remains open.

Focused33 tests and typecheck passed before final retained-session and announcement fixes. Initial
full641/67/typecheck/build passed, then reviewer fix justified final rerun recorded below. No Rust/
collector source change, previous native/collector results not rerun or relabelled current. Generic
error wording deliberately does not assert an external installer never launched. Promise success
still does not prove native exit; failure may be ambiguous. No conformance/clinical/population or
institution acceptance claim. Broader readiness remains partial.

Final641/641 frontend tests67 files, TypeScript and Vite build passed after inclusion correction and
combined Settings/banner announcement test. Existing Vite large-chunk/ToolsView warnings unchanged.
Latest observed remaining quota80%/56%; prior head432d5fa CI40924530764 confirmed SUCCESS before
delivery. Next bounded R07 artifact/provenance inventory per checkpoint; no broad repeated audit.
