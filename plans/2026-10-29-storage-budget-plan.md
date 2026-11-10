# R05 bounded storage writes without silent retention truncation

Baseline157a4f7 clean worktree; quota45%/63%. CI40872203346 in progress, push gated on success.
Snapshot %TEMP%/irms-storage-budget-snapshot (4 source/tests, no private/generated data).
Verified flush sends entire buffer; native command has no work cap; failure truncates restored prefix
at2000. One bounded change: contract fixture batch1000/pending2000/timestamp128UTF8bytes. Native
command validates count/string bytes/finite angles before DB lock (after Tauri deserialization).
Repo append transaction remains unchanged, including bulk synthetic fixtures/legacy atomicity.

Controller serializes <=1000-row chunks, retires only positively acknowledged chunks, restores failed
suffix before new readings without slicing. Track unacknowledged in-flight rows. Auto-flush at1000
when idle, regardless long configured timer; if pending buffer+inflight reaches2000 before another
sample, stop that session through existing end/save/retry flow BEFORE engine/count/buffer acceptance.
No continuous collection with silent historical truncation. Preserve session-owner and end serialization.
Pressure UI message explains storage stop; no treatment/demographic threshold. Ordinary UI translations.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | Inherited; backend ID unknown | Controller snapshot/final diff | chunk acknowledgements, partial failure/suffix ordering, pressure/end/retry ownership |
| Security | Inherited; backend ID unknown | Native command/budget fixture/final diff | validation-before-lock, UTF8/finite/count boundaries, honest resource scope |
| Lead | Current | Reproduce, implement, verify and scoped delivery | no silent data truncation, complete retained samples and native transaction contract |

Workers read-only no edits/deploy/commit/heavytests/otherchats; <=220words BUG/RISK scenario/fix/
uncertainty. Lead meaningful regressions: >1000/backlog pressure, suffix-only retry, samples arriving
during write, owner switch, acknowledged-count mismatch; native exact/over/UTF8/finite/empty budget.
Shared JSON pins numeric budgets across Rust/TS. No idempotency/durable-queue claim: commit-with-lost
reply ambiguity/process crash recovery remain open. In-flight RPC cannot be cancelled; pressure stops
acquisition but cannot guarantee completion if disk hangs. Full frontend/build/typecheck/native fmt/
test/Clippy; new log/index/spec/cheat-sheet/threat/checkpoint, scoped commit/push/draft PR after CI gate.
