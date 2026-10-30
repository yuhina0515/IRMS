# R05/R06 updater handoff feedback and handled rejection

Baseline432d5fa clean worktree, CI40924530764 SUCCESS. Initial quota93%/58% remaining.
Snapshot %TEMP%/irms-update-feedback-snapshot,6 relevant source/tests, no private/generated data.
One bounded task, no actual installer/native process/service/device/participant operation.

Source evidence: UpdateBanner only renders downloaded/APK, void restartNow has no rejection handler.
Platform pins install lease after success but emits no installing/failure status, leaving misleading
ready/restart action visible. Preserve interlock, silent background checks/downloads and manual retry.

Design: additive typed installing/install-error version statuses; publish installing before install
await and retain/replay it after successful handoff (promise success is not process-exit proof).
On explicit install rejection release existing transition for retry, publish localized generic error
state without raw native error details; UI catches rejection, never auto-retries. Installing disables
duplicate action; retained-session guards remain. Persistent distinct polite status and alert regions
avoid announcing raw errors/duplicating failure speech. Download/APK behavior otherwise retained.
No broad UI redesign, new native permissions, schema/IPC changes or clinical/demographic thresholds.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | adapter/shared types/status tests | lease/status ordering, remount replay, rejection and retry |
| Inclusion | inherited/backend unknown | banner/locales/DOM tests | localized state/error, disabled control, live regions and native boundaries |
| Lead | current | reproduce, implement, verify and scoped Git | actual adapter status evidence plus UI rejection capture |

Workers read-only/no edits/deploy/commit/heavytests/network/other chats, <=180words verified scenario
findings/uncertainty. Lead regressions before fix, actual adapter pending/success/remount/failure/retry,
component error/retry/successful pending lock and both locales. Do not use a happy mock to claim native
installer acceptance. Full frontend/typecheck/build; native/collector unchanged, no broad rerun.
Docs/log/HOME/checkpoint/spec/cheat sheet, scoped commit/push/draft PR after previous head CI gate.
Native AT/installer/error meaning/process exit and ambiguous reject remain open evidence gates.

Implementation follow-up: isolate each subscriber and immediate replay, snapshot notification list
and suppress obsolete delivery after synchronous nested status. Notify only after installer lease/
flag established; failure releases before publishing error while rethrowing original rejection.
Typecheck found SettingsView exhaustive status consumer, migrated its text and retained-artifact
button state; error copy is static there so global banner remains the single assertive error owner.
SettingsView source/test baseline added to snapshot from HEAD; no unrelated settings behavior change.
Inclusion final review found installing text also live in Settings; accepted and made BOTH installing
and install-error Settings copies static. Joint Settings/banner test verifies two visible copies but
only one matching live announcement owner. Native speech remains unverified.
