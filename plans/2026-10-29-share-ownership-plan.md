# S03 per-run share ownership proof

Baseline f039457, clean worktree; prior-head CI 40831234393 confirmed SUCCESS. Quota 95% / 82%.
Source snapshot `%TEMP%/irms-share-ownership-snapshot`, source only (no deployment data/secrets).
One bounded task: establish collector/native ownership contract and implement compatible fail-closed
share creation; no production deployment, module publishing or participant operations.

Proposed contract for independent decision review: random native-only per-launch master; derive
per-collector HMAC proof, send only in sensitive HTTP header on ingest and native-intercepted share
creation. Persist proof digest in separate ownership table when a run is FIRST ingested. Owned run
subsequent ingest must match; never upgrade an existing legacy/unowned run via a later claim. Public
legacy ingest may continue without share ownership; updated collector refuses its share creation.
Existing runtime module keeps its request shape; native injects proof after matching enabled collector
and current runId. Ownership-v1 capability check before create and response marker fail closed on old
collector. No secret in status/events/JSON/reader endpoints. Update native+collector together;
old client/new collector must fail sharing clearly, new client/old collector must not publish a code.

Decision outcome: both independent reviewers accepted with requirements for canonical URL identity,
redirect refusal, generation fencing, atomic bind/prune and explicit reader projection. Implemented;
source final reviews found no blocker. Added their suggested real ingest rollback and whole-call
timeout tests. Final validation: 138 Rust / 13 collector / 4 focused frontend tests pass; fmt/Clippy
pass. Coordinated deployment and actual native/runtime-module acceptance remain open, not inferred
from local protocol tests. Full handoff in `doc/coding log/log_20261029_share_ownership.md`.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Security | Inherited, backend ID unavailable | Snapshot collector ingest/share/storage | Threat completeness, first-claim hijack, persistence, secret exposure |
| Engineering | Inherited, backend ID unavailable | Native telemetry/bridge + liveShareHost contract | Module/collector mismatch, endpoint generation, retries/restart and testability |
| Lead | Current | Verify decisions, implementation and tests | Source-grounded tradeoffs, failing-before attack reproduction, end-to-end local evidence |

Workers read-only: no edits/tests heavy/deploy/commit/messages to chats. <=250 words, source:line
BUG/RISK scenario/proposed fix and uncertainty; decision review precedes lead implementation.
Done: collector service + real subprocess/SQLite/HTTP tests, native proof/bridge tests, Rust/fmt/Clippy,
focused frontend API checks if changed, independent final review, docs/log/HOME/checkpoint, scoped
commit/push/draft PR. Do not mark S03 fixed if merely replacing a share needs a host token while first
creation remains hijackable. Native/client/production/institution/population gates remain explicit.
