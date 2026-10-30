# Isolated history transition owner

`src/services/historyTransitionPrototype.ts` is an unconnected single-owner ordering prototype.
Its19 controlled-promise tests are separate from the historical53 actual browser/native cases.
No production acquisition, IPC, startup UI, native schema or process cancellation is implemented.

`append(expectedCount, operation)` reserves the one outstanding work slot synchronously before
invoking the callback. Count must be a safe integer1..1000, using the shared storage budget. A second
append rejects without invoking its callback. Only exactly the full count succeeds; throw, rejection
or a partial/invalid count enters a permanent appendUncertain hold with a fixed public error.

`change(persistFence, mutate, timeoutMs=5000)` synchronously changes open to draining, blocking new
appends and history transitions before its first await. It waits the registered append's complete
acknowledgement, then awaits durable fence completion, then invokes the history mutation callback.
Each stage has its own deadline, restricted to safe integers1..60000ms. This is not one total elapsed
deadline. Timeout stops waiting, enters a sticky hold and never permits the next stage. It does not
cancel the already-dispatched native operation. Ambiguous native mutation stays blocked even if a
late response succeeds. Success also ends in historyComplete hold; there is no reset/unlock API.

Snapshot contains only phase, first hold reason and whether an append is still pending. A late append
can clear its pending indicator but cannot reopen phase or overwrite an earlier deadline reason.
Timers are cleared on settlement. Late promise rejection is consumed internally; callback errors
are replaced by a fixed error without original payload/path/cause. Callers still handle the public
returned promises normally. Elapsed deadlines do not establish hardware completion or cancellation.

Tests cover drain -> fence -> mutation order; blocked concurrent work; full/short/count bounds;
sync throw/private rejection; synchronous append/change callback reentry; hung append/fence/mutation
with late resolve/reject; same-deadline ack-first versus deadline-first; stage errors; timer cleanup.
The mutually exclusive owner constrains only work routed through this instance. All relevant native
append/start/history paths must eventually use one owner; other windows, processes or bypass IPC are
not coordinated. Actual history mutation must also preserve original binding/receipt checks.

Reproduce from `IRMS_App_Tauri`:

```powershell
node node_modules/vitest/vitest.mjs run src/services/historyTransitionPrototype.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Next evidence gate: connect this isolated owner to the existing actual Chrome/SQLite probe with
controlled transport delay before considering production hookup. It must demonstrate submitted
append settlement before durable [history fence](history-change-fence.md) and native mutation.
Restore detection, retained sensitive-data deletion/unlock UX, cross-process ownership, WebView
persistence and crash/power-loss behavior remain unfinished; do not claim complete recovery or erase.
