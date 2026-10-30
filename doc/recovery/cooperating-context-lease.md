# Cooperating browser-context lease prototype

[78-case evidence](context-lease-probe-20261030.json) adds9 lease cases to the historical69.
Separately48 focused unit/CLI cases passed:11lease,15startup,19owner and3CLI. Production acquisition,
Tauri IPC, other profiles and native global ownership remain unconnected/unverified.

The [W3C Web Locks editor draft](https://w3c.github.io/web-locks/) (24Sep2025, read30Oct2026) defines
cooperative coordination within a storage bucket, an ifAvailable null result for contention, and
callback-promise lifetime/termination behavior. It is a work in progress, not conformance proof.
This prototype uses one fixed name `irms-recovery-prototype-history-owner-v1`, exclusive mode and
ifAvailable, never queueing or stealing. The actual probe uses two owned Chrome targets sharing one
temporary profile/origin; it does not test every browser, worker or native process.

`openCooperatingHistoryOwner` obtains the lease before running the trusted startup audit. It publishes
a ready result separately from the callback's still-pending lifetime promise, keeping the lease
through the returned owner's lifetime. Busy/unsupported/request failure returns fixed held reasons
without auditing. Grant timeout ignores late callbacks; audit timeout returns held and exits the
callback. Request termination during audit is rechecked after await, before allocating a lifetime.

Only a proxy is returned. Append/change check liveness both at method entry and actual callback
dispatch, including each fence/mutation stage. Lost lease therefore prevents new stages after a
pending await; it cannot cancel an operation already dispatched. Request failure revokes the proxy.
Normal release synchronously verifies no pending append and either open state or historyComplete,
revokes even destructured old methods, then ends the lifetime promise. Pending/uncertain stages
cannot normally release; no unlock/reset/steal API is provided.

Actual browser cases verify lock held before audit completion, peer busy without reading storage,
lifetime after readiness, refused release while append pending, old-method rejection, handoff only
after release, refused uncertain release with peer blocked, context death releasing the lock while
durable pending journal blocks the successor, and historyComplete release retaining a real fence.
Lease-specific append/failure callbacks are controlled promises; earlier actual SQLite cases remain
part of the same probe. Context termination is not proof that native work stopped.

Three regression scenarios were reproduced before fixes: request failure during audit left an
orphan lifetime after late success; lease loss before an accepted append microtask still dispatched;
lease loss while fence awaited still invoked mutation. Post-await termination and callback liveness
checks now cover them. Public errors/results contain no original callback path/payload/cause.

This coordination depends on every relevant caller using the same wrapper/name/bucket. Raw factories,
direct IPC, other profiles, external restore and noncooperating code remain bypasses. Browser lease
release on context death is safe only as one prerequisite; persisted journal/fence must be reaudited
and native target/history preconditions still checked. Empty local readiness does not detect eviction
or rollback. Native deletion in the test oracle currently targets numeric IDs in synthetic fixed DBs;
it is not a production bound-delete/restore authorization contract.

Reproduce using [native oracle](native-journal-oracle.md) with output
`../doc/recovery/context-lease-probe-20261030.json`. Preserve earlier reports. Raw/served module/
runtime/native executable hashes identify tested bytes, not attestation; fresh build procedure
provides source-to-binary association. No power-loss/WebView/actualIPC/globalDB-lock claim is made.
Next bounded gate: native bound-history mutation preconditions before any journal resolution or
production hookup. Retention/deletion/unlock UX and restore generation remain unfinished.
