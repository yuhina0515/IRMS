# S02 pending live-share poll revocation

Baseline: 562089c, clean readiness worktree. Scope: `IRMS_Telemetry/share.mjs` and its local unit tests.
Goal: removed, departed or expired viewers must not receive newer state through a pending poll;
revocation should promptly settle their poll without disclosing state. No production calls/deployment.

Snapshot: `%TEMP%/irms-share-revocation-snapshot`. Lead edits/tests/delivery only. Independent
security reviewer (inherited model, backend ID unavailable) is read-only and reviews the frozen diff
after implementation; report <=200 words with source location, concrete scenario, risk and remedy.

Reproduce host removal while poll waits, then cover voluntary leave and idle sweep plus continued
authorized polling. Revalidate Map membership at completion, wake revoked polls, preserve closed-share
semantics and ensure cleanup. Run local Node tests; update threat/readiness/checkpoint and a new coding
log. S01 response bounds and S03 independent run ownership remain separate. Quota <=20% stops new
expensive work; retain continuation instead of starting another broad batch.
