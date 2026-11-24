# Isolated history transition owner — 2026-10-30

Plan:plans/2026-10-30-history-transition-plan.md. Baseline f2ad909 clean, CI41050986613 SUCCESS.
Quota initial76%/31%, latest70%/30% remaining. One bounded software task; no production acquisition,
IPC/UI/schema/deployment, app/participant data, physical devices or people messaging.

Lead added unconnected historyTransitionPrototype.ts and19controlled-promise/fake-timer cases.
One outstanding append registered synchronously before callback, full shared-budget count only.
History owner reserves before await, then drains accepted append, awaits durable fence, requests
mutation. Each stage has a positive safe1..60000ms deadline (default5000 per stage, not overall).
Throw/reject/short/timeout enters first-reason sticky hold; late success/failure never reopens or
advances beyond failed stage. Even successful change remains held; no cancellation/reset/unlock API.
Fixed public error/no callback cause, timer cleanup, bounded one-work tracking and snapshot only.

Meeting: engineering/security independent read-only design then final static review; inherited model,
backendID unverifiable. Accepted registration-before-callback/reentrant owner reservation, exactcount,
deadline as uncertainty not cancellation, late rejection consumption and first hold reason retention.
Both final reviews found no blocker. No inclusion review needed for no-UI/no-locale prototype.
No demographic thresholds or universal population/institutional claim.

Verification: initial14focused cases passed; added same-tick deadline/ack bothorders, synchronous
change reentry and late fence/mutation rejection to address reviewers' design priorities. Final19
passed; TypeScript noEmit and Vite build passed. Existing ToolsView/chunk warnings remain. Source
search confirms no production imports (rg no matches, expected status1). No full frontend rerun:
prior736historical suite excludes these19, do not add into a claimed fresh full total. Actual53case
Chrome/native artifact and Rust sources unchanged; baseline full168Rust/7ignored/fmt/Clippy not
rerun. No test/setup failure, no source change after final validation.

Limit: tests simulate asynchronous operation outcomes, not actual native IPC, cancellation or
cross-window/process quiescence. All future relevant native work must route through one owner;
ungated paths bypass this guarantee. Already-submitted mutation may still finish after timeout.
Retention/unlock/data-erasure and external/both-store restore remain separate unresolved gates.

Docs/spec/cheatsheet/optimization/HOME/checkpoint updated. Next bounded task: integrate this isolated
owner into actual browser/native probe with controlled delayed acknowledgement; prove ordered append
settlement -> fence complete -> native mutation. No production hookup until broader gates pass.
Scoped commit/push/update draftPR5, no merge. Inspect new head CI before next push. Broad goal open;
follow live quota guard, no purchases/reset/auth substitution.
