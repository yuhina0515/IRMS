# S02 pending live-share poll revocation

Baseline 562089c, clean readiness worktree. Plan `plans/2026-10-29-share-revocation-plan.md`;
snapshot `%TEMP%/irms-share-revocation-snapshot`. Lead alone edited and tested. No production calls,
credentials, deployment or private telemetry used.

Reproduced: viewer starts a state poll, host removes it, host pushes new private state. Original
service returned 200 with new state instead of expected 401. Added shared removal helper for host
deletion, leave and expiry, per-viewer waiter sets, completion-time membership identity check and
timer/set/close-listener cleanup. Revocation settles only that viewer's polls promptly. Closed share
still returns 410. Response already sent before revocation cannot be recalled.

Independent read-only `/root/security`, inherited model (backend ID unavailable), reviewed frozen
diff and found no blocking bypass/regression. Confirmed synchronous delete/wake ordering, Set
iteration safety, other-viewer isolation and cleanup; reviewer did not rerun tests. No rejected
findings; S01 incoming response bounds and S03 ownership proof intentionally remain separate.

Validation: `node --test IRMS_Telemetry/share.test.mjs`: original regression failed 200 !=401;
after fix 10/10 passed. Covers multiple pending polls, removal/leave/expiry, unchanged authorized
viewer, subsequent token refusal and share-close cleanup. Expiry test injects clock/host freshness
to isolate its sweep branch; not a deployed HTTP timing test. `node --check` and Git whitespace
checks run before delivery. Native/frontend product code unchanged; do not infer a new native or
frontend full-suite run from these collector-only tests.

Source docs/threat model/checkpoint updated. An initial multi-file documentation patch failed on an
incorrect README anchor and made no changes; reread actual heading and applied corrected patch.
Remaining deployment/native/research/inclusion gates unchanged. Quota near 20%: finish delivery,
then do not start another expensive batch until the configured resume threshold is met.
