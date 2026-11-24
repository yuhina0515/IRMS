# S03 native/collector ownership-v1

Baseline f039457, clean readiness worktree. Prior-head CI 40831234393 confirmed SUCCESS.
Plan `plans/2026-10-29-share-ownership-plan.md`; source-only snapshot
`%TEMP%/irms-share-ownership-snapshot`. Quota at start 95%/82%, after final checks 79%/80%
remaining (shared account windows, not exact task tokens). Lead alone edited/tested/delivered.

## Decision meeting and implementation

Independent read-only `/root/security` and `/root/engineering`, inherited models, exact backend
IDs unavailable. Before implementation, security required first-ingest atomic binding, proof checks
before replacement, reader isolation and atomic retention. Engineering required per-collector HMAC,
one canonical URL identity, no redirects, sensitive headers, generation checks around awaited
creation and fail-closed version negotiation. Lead accepted and implemented these decisions.
Baseline regression: runId-only creation returned 200 instead of expected 403.

Native per-launch master derives collector-scoped HMAC proof. It is absent from renderer/status/
events/JSON; only a sensitive HTTP header carries it on ingest/create. Native normalizes endpoint
for both identity and transport, rejects userinfo/query/fragment, disables redirects and checks
enabled/current run/collector. Existing runtime-module request shape remains unchanged: native
preflights ownershipVersion=1 and requires success confirmation, with configuration-generation
checks before POST and before publishing code/token. One overall timeout covers preflight+create.

Collector keeps SHA-256 digest in separate run_owners table, bound only during a brand-new run's
successful ingest transaction. Wrong/missing proof cannot update owned events/liveness/metadata;
existing legacy run cannot be claimed later. Ownership authorization precedes share replacement.
Reader uses explicit run fields; expiry deletes events/ownership/run in one transaction. Docker
COPY includes the new helper; CI now runs collector tests using its existing Node 24 setup.

Compatibility: legacy telemetry continues, but legacy runs cannot share. Updated native refuses
legacy collectors; no insecure fallback. Updated app restart yields new run/master. Returning to
an equivalent backend via a different canonical URL alias may need restart. Already-issued creates
may leave an unpublished TTL share after cancellation/config change; no remote recall guarantee.
First-writer preclaim can deny service; this proves run possession, not sensor/device attestation.

## Review, verification and limits

Final independent source reviews found no blocking bypass/regression. Security's suggested real
write-failure rollback test was added with a SQLite trigger after owner/events insert; real HTTP
ingest returns 500 and all three tables remain unchanged, then retry succeeds. Engineering's
suggested total-timeout test was added with two 500ms stages and one 750ms budget; no late code.
No rejected findings. Neither reviewer independently reran tests or inspected deployed state.

Validation: 138 Rust passed / 5 ignored (3 live + 2 manual benchmarks), main/doc targets passed;
fmt and Clippy all-targets/all-features -D warnings passed. Thirteen Node tests passed, including
real collector subprocess/HTTP/SQLite, known-runId+reader attacks, legitimate retry/dedup/recreate,
legacy refusal, restart persistence, injected write rollback and retention cleanup; syntax checks
passed. Four existing frontend liveShareHost tests passed; no frontend code/interface change.
Last full frontend verification remains 553 tests/57 files/typecheck/build from the earlier batch.
Native tests cover actual command-shared orchestration, proof header/privacy, URL identity, version
mismatch, generation races, total timeout and ingest/create redirect refusal. No claim of a single
cross-language native-app-to-deployed-module E2E test.

Fixture corrections: Windows accepted sockets inherited nonblocking behavior, causing premature
POST reads; explicitly restore blocking streams. Short localhost timeout fixture failed before
its intended second stage; use explicit IPv4 and controlled stage delays, then focused/full tests
passed. These setup failures are not claimed product defects. Existing S01 limits also bound
capability replies. R05 benchmark remains its historical source baseline; no unrelated rerun.

No production calls, deployment/restart, firmware/module publishing, private telemetry, secrets or
participant data. README/spec/cheat-sheet/threat/readiness/HOME/checkpoint updated. Coordinated
native+collector rollout/backup and real runtime-module/client acceptance remain open, alongside
native performance, locale/accessibility and institutional/measurement/population evidence gates.
Docker build/deployment was not run; COPY coverage was source-reviewed and collector subprocess
tests exercised the same source set locally. New remote CI outcome must be checked independently.
