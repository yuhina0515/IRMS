# Persistent local startup-readiness prototype

The [69-case browser/native report](startup-readiness-probe-20261030.json) adds8 startup cases to
the historical61. Separately,37 focused unit/CLI cases passed:19owner,15startup and3CLI cases.
These are not a fresh full-suite total or Tauri IPC, cancellation or production recovery acceptance.

`openHistoryTransitionGate(readStats, timeoutMs=5000)` exposes no owner until the supplied trusted
audited journal reader resolves. Deadline must be a safe integer1..60000ms. The factory validates
own snapshot fields, nonnegative safe counters, consistent all-zero/all-positive totals and
batches<=rows. Only `key:'totals'`, explicit rows/batches/bytes0 and `historyFence:null` return
`{status:'ready', owner}`. It is intentionally a local snapshot precondition, not history authority.

| Condition | Result | Owner exposed |
| --- | --- | --- |
| Unresolved history fence, even without queued rows | held/historyUnresolved | No |
| Valid nonempty totals without fence | held/pendingJournal | No |
| Missing/legacy/inherited/invalid fields or failed/unavailable read | held/storageUnavailable | No |
| Read deadline or private throw/reject/getter error | held/storageUnavailable | No |
| Explicit audited empty totals, no fence | ready | Local owner only |

Full stored-record/fence validation and capacity auditing remain the journal reader's responsibility;
the factory does not authenticate a callback that fabricates zeros. Fence objects conservatively
block regardless of contents. No repair, native creation, replay, queue erase or fence clear occurs.
All held outcomes contain only fixed reason strings, not storage errors, payloads or paths.

The read callback runs through a promise chain after the timer is arranged. First settlement wins,
timers clear on every result and late rejection is consumed. A late empty read never upgrades an
already returned held outcome. This deadline cannot interrupt a synchronously blocked event loop.
An empty readonly audit may have observedDurability:null; readiness is not proof of strict writes.

Actual Chrome cases cover pending journal, pending after owned-browser kill/reopen, persisted fence
on empty queue, fence over pending data, explicit empty audit, withheld audit with no published
owner, released audit readiness, and closed-store failure retaining data. Existing native data
remains present during local empty-fixture cases: local readiness does not mean the native database
is empty or every interrupted history is reconciled. Synthetic resets are test fixtures, not unlock.

The raw owner factory remains an unconnected testing primitive. Production would need the audited
entry point and one exclusive owner across all relevant cooperating paths; stats->owner is not an
atomic cross-window lease. A different writer/window may change state after inspection. Deleted or
evicted journal data and rollback of both stores may also appear empty. External restore/native
history, retained-data deletion/unlock, WebView persistence and real IPC remain unresolved.

Reproduce with the fresh-build/manual probe procedure in [native oracle](native-journal-oracle.md),
selecting `--output ../doc/recovery/startup-readiness-probe-20261030.json`. Source/served-module/
runtime/native executable hashes identify tested bytes; preserve earlier19/29/39/53/61 reports.
Focused unit reproduction: run `historyTransitionPrototype.test.ts`, `historyStartupPrototype.test.ts`
and `scripts/probe-recovery-journal.test.mjs` with one Vitest worker/no-file-parallelism.

Later [cooperating-context lease](cooperating-context-lease.md) holds ownership across audit/lifetime
and blocks a competing context. It remains a browser-only prerequisite. No automatic resume, rebind/recreate, timestamp
repair, complete-tail, clinical or universal institutional/country/population claim is made.
