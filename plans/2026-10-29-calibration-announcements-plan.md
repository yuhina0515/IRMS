# R06 Wizard A step/error announcement journey

Baseline 24e1fdd clean worktree. Initial remaining quota31%/72%; stop expensive work <=20%.
CI current 40867351215 pending, previous 40866950201 running; do not restart either.
Snapshot %TEMP%/irms-calibration-announcements-snapshot (Wizard A only).
One bounded task: persistent polite atomic status for step/capturing phase; persistent assertive
error text. Existing localized visible titles/error messages reused; no clinical text/threshold changes.
Exclude countdown values and raw/live-preview values from speech region. Keep visual layout, focus,
capture/timer/math and Apply persistence unchanged. Wizard B speech remains separate scope.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Inclusion | Inherited; backend ID unavailable | Wizard A source and final diff | Stable live-region lifecycle, meaningful phase text, no per-frame/countdown chatter |
| Lead | Current | Regression, bounded implementation/tests/docs/delivery | Repeated identical errors can be re-announced after retry clearing; no sensor-derived speech |

Read-only worker: no edits/deploy/commit/heavy tests/other chats; <=200words BUG/RISK and concrete
scenario/fix/uncertainty. Verify baseline absence; test locale/step transition, capture/countdown/raw
stability, failure/retry region updates. Typecheck/full frontend/build, new log/index/checkpoint,
scoped commit/push/draft PR. Native screen-reader speech/priority/recovery remains unverified.

Outcome: three baseline regressions failed; final 596 frontend tests/61 files, typecheck/build passed.
Independent final review accepted. Next run prioritizes latest-head CI completion before new code.
