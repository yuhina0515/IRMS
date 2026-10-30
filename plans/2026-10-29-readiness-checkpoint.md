# IRMS autonomous continuation checkpoint

## Current checkpoint (2026-10-30 persistent local startup-readiness)

Baseline928814a clean, CI41066460644 SUCCESS. Initialquota56%/28%, latest45%/26%, no quota hold.
20stop/30resume hysteresis still applies; checkpoint/stop expensivework<=20, resumeheldonlyall>=30.
One bounded task: async openHistoryTransitionGate trusts auditedjournal.stats, no owner until read
settles. Explicitownfields/safecounts/consistency, zero totals/fence:null only localready. Pending/
fenced/unknown/legacy/readerror/deadline held without owner. Late read never upgrades, timers clear.
No native calls/replay/repair/clear or production hookup. No devices/participants/appdata/deployment.

37focused passed (19owner+15startup+3CLI), TypeScript/Vite/node syntax passed. New69actual synthetic
browser/native cases (61prior+8startup), doc/recovery/startup-readiness-probe-20261030.json: pending
restart, empty/queued fence, explicitempty, pending/released audit, closedstore retains data. Native
rows stay present during emptyjournal fixtures; localready is not nativehistory/restore/eviction or
strictwrite proof. No cross-window reservation. Raw owner factory still an unconnected testprimitive.
No production imports; native unchanged currentcached no-run build selected. Baseline168Rust/7ignored/
fmt/Clippy and736fullfrontend not rerun; collector unchanged. Older artifacts preserved; finalsource
hashes checked beforedelivery. Engineering/security finalstaticreviews no blocker.

See plans/2026-10-30-startup-readiness-plan.md, doc/recovery/startup-readiness.md and
doc/coding log/log_20261030_startup_readiness.md. Scoped commit/push/update draftPR5; newheadCI before
anotherpush. Next bounded software task: exclusive cooperating-context ownership around startup
audit and owner lifetime, so secondcontext cannot concurrently gain readiness. All productionpaths
must eventually share owner; bypasses/crossprocess/nativehistory/restore/eviction/retention/unlock/
data-erasure/WebView/actualIPC/native interruption remain unfinished. No auto-resume/rebind/recreate/
timestamp repair/complete-tail or universalinstitutional/population/clinical claim.

## Historical checkpoint (2026-10-30 actual owner ordering probe)

Baseline3c54526 clean, CI41058113067 SUCCESS. Initialquota66%/29%, latest60%/28%.
No quota hold active;20stop/30resume hysteresis permits continued bounded work above20, but after
quota hold all known windows must>=30 to resume. Stop/checkpoint if any known remaining<=20.
One bounded actual Chrome/IDB/SQLite integration task complete,61synthetic cases (53prior+8owner).
Gate registers append BEFORE native commit/retry; parent controls delayed/substituted ack throughCDP,
not actualTauriIPC. Drain/nofence/norequest directly observed; fullcount -> actualfencecomplete ->
nativebackupdelete -> held/journal retained. Short/25ms withheld/latefullcount no fence/delete.

Owned-browser kill/reopen retains marker+originalqueue, memory owner disappears; startup recovery
NOT complete. Four fixedloopbackroutes importmap/journal/owner/sharedbudget, no nativeendpoint or
filemapping. Raw/servedmodule/budget/runtime/nativeexe hashes and cleanup in
doc/recovery/owner-ordering-probe-20261030.json. Original19/29/39/53reports preserved.
Current cached native executable selected via freshCargo no-run, Rust unchanged. Node syntax,
3normalCLIredaction and typecheck passed. Prior19ownerunit/build, full168Rust/7ignored/fmt/Clippy
and736fullfrontend not rerun; collector unchanged. Engineering/security finalstatic reviews no blocker.
See plans/2026-10-30-owner-probe-plan.md, doc/recovery/owner-ordering-probe.md and
doc/coding log/log_20261030_owner_probe.md. Scoped commit/push/update draftPR5; inspect new head CI
before anotherpush. No devices/realappDB/profile/participants/productionhook/deployment/messages.

Next bounded software task: persisted startup-readiness gate before owner accepts work; unresolved
fence or pending journal cannot auto-resume/replay/clear. Memory owner factory alone starts open and
cannot authorize recovery. All relevant native paths must eventually share one owner; cross-window/
process/bypasses and cancellation remain unverified. Data-erasure/unlock/retention/external-or-both-
store restore detection, WebView/eviction/actualIPC/native interruption remain unfinished. No rebind/
recreate/timestamp repair/complete-tail or universal institutional/population/clinical claim.

## Historical checkpoint (2026-10-30 isolated history transition owner)

Baseline f2ad909 clean, CI41050986613 SUCCESS. Quota initial76%/31%, latest70%/30% remaining.
One bounded software task complete: unconnected historyTransitionPrototype.ts tracks1append before
callback, exact shared-budget count only; reserves history owner before await, drains accepted work,
awaits durable fence, then invokes mutation. Per-stage deadline1..60000ms/default5000; sticky first
hold reason on uncertainty/timeout, even success remains held. No reset/unlock/native cancellation.

19controlled-promise/faketimer cases passed (initial14then5design-priority additions): ordering,
reentry, short/invalidcounts, privateerrors, same-tick deadlinebothorders, late resolve/reject across
stages and timer cleanup. Typecheck/Vite build passed; ToolsView/chunk warnings remain. No production
imports, no runtimeIPC/UI/schema change. Actual53browser/native artifact unchanged, not rerun;
baseline full168Rust/7ignored/fmt/Clippy and prior736frontend not rerun. Do not combine19targetedcases
with historical full totals into a fresh full-suite claim. Engineering/security final static reviews
no blocker. See plans/2026-10-30-history-transition-plan.md, doc/recovery/history-transition-owner.md,
doc/coding log/log_20261030_history_transition.md. Deliver scoped commit/push/update draftPR5;
inspect new head CI before another push. No devices/app/participant data/production operations.

Next bounded software task: connect isolated owner to existing actual Chrome/SQLite probe with
controlled delayed acknowledgement, verifying accepted append settles BEFORE fence complete/native
history mutation. Current19tests simulate async outcomes, not actualIPC/cross-window/process proof.
All relevant work must eventually route through one owner; bypass operations remain uncoordinated.
Keep acquisition unconnected. Retention/unlock/data-erasure UX, external/both-store restore detection,
WebView/quota/eviction/native process interruption still unfinished. No automatic resume/rebind/
recreate/timestamp repair/complete-tail or universal institutional/population/clinical claim.

## Historical checkpoint (2026-10-30 singleton history-change fence)

Baseline8c7811f clean, CI41043282152 SUCCESS. Initial remaining89%/33%, latest80%/31%.
One bounded isolated task: optional singleton historyFence in existing version1 IDB meta, strict
complete-before-success; known second record only, unknown/corrupt metadata rejected without erase.
Full canonical intent retries idempotently, conflicting intent cannot overwrite. Delete requires
original session/binding, restore requires null binding. Same entries/meta scope blocks enqueue/
fullack after unresolved fence; peek/stats preserve evidence. No clear API or production hookup.

53actual synthetic browser/native cases (39prior+14new), doc/recovery/history-fence-probe-20261030.json:
request-success abort no publication; actual backup DB delete only after fence commit, lost reply/
owned-browser kill/reopen retains queue/intent; matching backup/native rejection never clear; prior
enqueue retained and following concurrent ack rejected; malformed/corrupt/unknown meta failclosed.
Typecheck/Vite build,3normal CLIredaction/node syntax passed. Native unchanged, current cached build
selected; baseline full168Rust/7ignored/fmt/Clippy not rerun. Prior736frontend not rerun, UI unchanged;
collector unchanged. Original19/29/39artifacts preserved; final source hashes checked before delivery.

Independent engineering/security debate + cross-critique select bounded singleton rather than
unbounded tombstones. Both final static reviews no blocker; lead added recommended concurrent ack
case after52-case review, final53actualpass. Minutes/log doc/coding log/log_20261030_history_fence.md,
plan plans/2026-10-30-history-fence-plan.md, contract doc/recovery/history-change-fence.md.
No devices/real app DB/profile/participants/deployment/people messaging. Deliver scoped commit/push/
update draftPR5; inspect new head CI before another push. No merge.

Next bounded software task: exclusive history-transition/quiescence prototype covering already-sent
native append, rejecting ambiguous/hung outcomes before native mutation. Counterexample: append sent,
fence commit, restore backup, old append commits. Current fence does NOT cancel/coordinate this.
Global indefinite hold/no unlock or full deletion UX remain unfinished; native deletion retains
sensitive journal, not privacy-erasure proof. External replacement or both-store rollback not detected.
Keep acquisition unconnected; no auto resume/rebind/recreate, timestamp repair or complete-tail claim.
Later WebView persistence/quota/eviction/native termination evidence still software-only gates.
No broad repeated audit or universal school/country/demographic/clinical acceptance claim.

## Historical checkpoint (2026-10-30 read-only reconciliation inspection)

Baseline f7cd1d4 clean, CI41036086380 SUCCESS. Initial quota100%/34%, latest92%/33% remaining.
One bounded test-only task complete: cfg(test) native read-only association/receipt inspection,
explicit rejected/conflict/needsDecision/receiptMatched plus session abandoned/ended state. Uses
shared bounded validation and original payload hash/count in one SELECT/read transaction. No
production startup/UI/schema/IPC/acquisition hook. No devices, participant data or deployments.

Reviewers caught init_database migration/finalization side effects; reconcile now dispatches BEFORE
init, existing SQLITE_OPEN_READ_ONLY connection plus query_only and total_changes assertion. Open
sessions stay open; missingDB not created, schema/read errors remain failure. Every inspection result
retains journal and denies replay/journal-delete authority, including backup unseen/matched. Existing
receipt is not proof of current history/row integrity or a reservation beyond transaction lifetime.

New39actual synthetic browser/native cases (prior29+10inspection) in
doc/recovery/reconciliation-probe-20261030.json, original19/29reports preserved.6newRustcases,
full168passed/7ignored; fmt/Clippy passed;3normalCLIredaction cases/node syntax passed. Prior736
frontend/typecheck/build not rerun, renderer unchanged; collector unchanged. Engineering/security
final no blocker, read-only static reviews. See plans/2026-10-30-reconciliation-plan.md,
doc/recovery/reconciliation-inspection.md and doc/coding log/log_20261030_reconciliation.md.
Deliver scoped commit/push/update draftPR5; inspect new head CI before subsequent push.

Next bounded software task: explicit cross-store deletion-intent/restore-history policy and startup
recovery decisions before acquisition hookup. Inspection alone cannot authorize append or clearing;
matching backup identities/receipts do not prove latest history. Preserve original binding/payload
and abandoned/incomplete status; do not derive repaired endTime from arbitrary renderer timestamps,
recreate/rebind sessions, resume exercises or silently discard journal. WebView persistence,
quota/eviction/native process interruption remain later software-only gates. No universal school,
country, demographic or clinical acceptance claim. No repeated broad scans.

## Historical checkpoint (2026-10-30 actual native journal oracle)

Baseline6ed5e05 clean; prior CI41030074994 SUCCESS. Initial remaining63%/37%, latest51%/35%.
One bounded task complete: optional actual Rust/SQLite test-only oracle plus real Chrome IDB,
29synthetic cases (19prior+10native). No devices/real app DB/profile/participant/deployment/production
acquisition hookup. Exact ignored helper, fixed ownedtemp DB/request, shared command validation.
Actual commit/parent-discarded reply and browser kill/reopen/retry produce2rows/1receipt; aborted
journal ack/delete retains entry, later complete native success clears. Foreign/missing/deleted/
recreated associations reject without journal loss/rebinding. Consistent VACUUM backup demonstrates
same-lineage identity ambiguity after current deletion; no automatic replay authorization.

Startup init actually marks abandoned/endTime before new tail; staleEnd asserted with future synthetic
timestamp. This is an observed integration gate, not repaired/normal recovery. Source/binary/runtime
hashes and cleanup in doc/recovery/native-journal-probe-20261030.json; helper processes exit normally,
browser only force-killed; no actual Tauri IPC/native kill/power-loss claim. Source-to-binary association
relies on fresh build, not hashes alone. Original19-case artifact remains historical earlier source.

Full Rust162passed/7ignored, fmt/Clippy passed;3normal CLI redaction cases passed. Prior736frontend/
typecheck/build not rerun (test tooling plus shared validator visibility only); collector unchanged.
Engineering final no blocker; security dangling-symlink exists() bypass fixed using symlink_metadata
for DB/sidecars/backup/request plus pre-canonical root check. Normal guard regression, Unix-only
dangling test not run locallyWindows. Narrow final review and scoped delivery recorded in
doc/coding log/log_20261030_native_journal.md. See plans/2026-10-30-native-journal-plan.md and
doc/recovery/native-journal-oracle.md. Inspect new head CI before any next push.

Next bounded software task: decide/test startup reconciliation and explicit recovery status, with
abandoned end-time repair semantics and cross-store deletion/restore generation/tombstone policy.
Keep original binding/payload, failclosed retention; never recreate sessions, refresh binding, resume
exercise or imply complete tail. Keep prototype unconnected until gates pass. Actual WebView
persistence, quota/eviction and native process interruption are later software-only gates.
No broad repeat audits or universal school/country/demographic/clinical claim.

## Historical checkpoint (2026-10-30 isolated journal evidence prototype)

Baseline8ff7662 clean, CI41022604955 SUCCESS. Quota initial90%/41%, latest69%/38% remaining.
One bounded isolated journal task complete; no physical devices, people messages, production changes,
user browser profile or participant data. Current runtime schema12/identity/receipt contracts preserved.

Unconnected typed IDB prototype stores original binding/batch/session/readings. Fixed canonical copies,
transaction-complete success, strict durability hint requested/observed, atomic cursor audit/capacity/
counters;2000rows/128batches/512KiB payload,1..1000rows/batch/128UTF8timestamp. Oldest full original
identity/count ack only, corruption retained/rejected, no silent erase. Never imported by acquisition.
Manual Chrome probe uses own temp profile and same loopback origin across ownedPID-tree force kill.
19actual browser cases passed, source/runtime-hashed JSON in doc/recovery/journal-probe-20261030.json.
Native sink SIMULATED acknowledgement map, not actual Rust/IPC. Temporary browser/profile/server
cleanup confirmed. No WebView, power-loss, eviction, quota exhaustion or production durability claim.

Security final finding fixed: outer CLI error boundary now includes setup/finally/output;3filesystem
error subprocess cases and actual missing-executable/output-directory CLI checks pass without paths.
Engineering/security final reviews no blocker, narrow correction confirmed. Added65-length adapter
binding guard for JS `$` trailing-newline acceptance; prototype65/36 lengths likewise exact. Full
736frontend cases71files/typecheck/build passed. Final stats typing followed by fresh19browser probe
and typecheck. Native/collector unchanged; baseline161Rust/6ignored not rerun. See
plans/2026-10-30-journal-probe-plan.md, doc/recovery/journal-prototype.md and log_20261030_journal_probe.md.
Deliver scoped commit/push/draft PR and inspect new head CI before another push.

Next bounded software task: bridge isolated browser journal to ACTUAL Rust/SQLite receipt oracle,
using only owned temporary DB/profiles and synthetic data. Pin native commit->lost reply->journal
retry/delete interruption, immutable original payload/binding, wrong/missing/deleted native session
and foreign DB fail-closed outcomes. Establish explicit deletion/backup-restore/startup policy before
connecting acquisition. Same-lineage backups preserve IDs, so matching binding alone is insufficient
for all restore histories. Keep prototype unconnected until gates pass, never rebuild missing sessions,
refresh binding, resume exercises or imply complete interrupted tail. Actual WebView persistence and
storage quota/eviction remain later software acceptance gates, not verified by this Chrome probe.
No broad repeated audits; no universal university/country/demographic acceptance claims.


## Historical checkpoint (2026-10-30 persistent storage association verified)

Live quota restored98%/42%, latest93%/41% remaining. The older UNKNOWN hold below is historical;
its blocking transport recovered. Authorized heartbeat work resumed after both known windows>=30%.
Baseline4dc9895, prior CI41002659505 SUCCESS. Finish scoped delivery of this verified bounded task;
no physical devices/participants/production operations, no unrelated changes.

Migration12 adds32hex DB identity and unique32hex session keys (backfill and insert trigger), preserving
existing rows/snapshots/receipt data. Atomic sessions_start returns sessionId/storageIdentity; no new
identity command. Adapter rejects malformed/legacy DTO, controller retains binding through retries
and fixed flush snapshots. Native append requires65ASCII binding, validates prelock and compares
inside receipt/data transaction before ack/empty/write. CrossDB or recreated numeric ID rejects.
Renderer/native must ship together. Keys copied by backup do not distinguish diverging restores or
provide authentication/tombstones; start reply loss can leave abandoned row.

Final full732/732 frontend cases70files, TypeScript/Vite build passed. Initial full730/2 failures were
legacy updater.lifecycle response fixtures, now corrected; focused tests/typecheck then full rerun
passed. Full Rust161passed/6ignored, fmt/Clippy all-targets/all-features -D warnings passed. Six new
SQLite binding tests plus controller/adapter owner/retry/malformed DTO coverage. Engineering final
snapshot-owner correction confirmed; security final foundation review no blocker. Collector unchanged.
See doc/storage-identity.md, plans/2026-10-30-crash-recovery-plan.md and
log_20261030_recovery_binding.md (append-only resume/completion section supersedes earlier WIP).
Inspect this new commit's CI before a subsequent push; no merge/release/deployment.

Next bounded software task: independent pre-IPC durable journal evidence prototype and protocol.
This foundation is NOT completed unsent recovery. Compare actual committed-but-unsent entries with
native receipt drain; preserve original binding, stable batch boundary and ordering, bounded bytes/
rows and explicit incomplete-session state. Startup gate, native deletion/replacement, same-lineage
restore ambiguity, ack/delete interruption and quota/eviction/corruption must be tested before
connecting acquisition. Do not recreate missing native sessions or automatically resume exercises.
No physical device use this session; do not stall unrelated software work on external measurement.
No universal university/country/population acceptance or demographic treatment thresholds.


## Historical checkpoint (2026-10-30 recovery binding WIP / live quota unavailable)

At2026-10-30T12:33+08:00, usage tool twice returned Transport closed. Last known this turn83%/46%
remaining, but live quota is now UNKNOWN: stop new expensive work. No purchases/reset/auth changes.
Recheck live usage when resumed; resume expensive work only every known window>=30%.
The same Transport closed failure now recurred across three consecutive goal turns including its
original occurrence. Goal marked blocked by the quota-unknown guard, not complete. WIP is preserved.
Prior head CI41002659505 SUCCESS; no subsequent push.

Active worktree E:/Monitoring-and-IoT/IRMS-wt/readiness-20261029 at4dc9895. WIP10 scoped source/test
files plus plans/2026-10-30-crash-recovery-plan.md. No staging/commit/push; preserve all changes.
New meeting log log_20261030_recovery_binding.md. No devices, production changes or new sensitive store.

Engineering/security independent positions and cross-critique: same-DB staging adds IO without
protecting pre-IPC data. Immediate append only reduces volatile tail. True unsent replay needs an
independent journal, with native stable DB/session identity and deletion/restore policy first.
Chosen necessary first runtime foundation: migration12 DB32hex+unique session32hex; atomic start_bound
returns sessionId/storageIdentity; renderer retains binding and native append requires/checks it
inside receipt transaction. No new command name. Both wire signatures change, ship matched pair.
Not a substitute completion claim: no durable unsent journal or restart replay implemented yet.
Backup copies preserve these IDs, so this is not a restore generation, authentication or tombstone.

Validation so far: original new binding controller regression failed with undefined identities;
after initial implementation43 targeted controller/adapter cases plus typecheck passed. Native6
storage_binding tests and7existing receipt tests pass. Full checks NOT yet run for this WIP. Reviewers
no blocking foundation defects; engineering recommended snapshot identity across awaits. Lead applied
that correction and added forced same-numeric-id owner replacement case. Its initial1s-timer fixture
caused an early pending-promise/cleanup timeout and cascade in full controller file; changed to60s,
focused replacement case passes. Full controller file/typecheck must be rerun before claiming green.
No native source changes after successful6binding tests, except no later native changes planned.

Resume: first livequota gate. Then finish adapter rich-start validation tests, rerun full controller,
full frontend/typecheck/build and full Rust/fmt/Clippy. Obtain narrow final review of snapshot-owner
correction. Synchronize spec/schema12/cheat sheet/optimization/threat model and honest scope docs,
update meeting log with outcomes, scoped commit/push/draft PR after confirmation checks. Do not
start another task while WIP incomplete. Then plan independent journal evidence prototype with DB
replacement/restore/deletion/eviction and startup barrier; no automatic exercise resume or clinical
completeness inference. Physical/native metrology stays unverified but software work remains active.


## Historical checkpoint (2026-10-30 R05 idempotent reading batches)

Baseline54fa0a5 clean, CI40960899608 SUCCESS. Quota initial98%/48%, latest85%/46% remaining.
No physical devices in this session. Prior external-only waiting interpretation superseded:
software reliability/accessibility/privacy/reproducibility remains actionable. Main long-term plan
updated; one bounded task completed, no broad rescan or unrelated paths changed.

Renderer retains UUIDv4 batch identity AND original chunk size across ambiguous invoke/short ack,
retries before new buffered data. Migration11 adds session-scoped payload-checked receipts with rows
in one SQLite transaction; same identity/contents returns original count, conflict rejects, session
removal cascades. Native identity and existing reading budgets validated before lock. Empty new
batches create no receipt; existing nonempty identity plus empty content conflicts. No timestamp/value
based dedup. Renderer/native signature changes ship together. No unsent crash recovery claim yet.

Full722 frontend cases70files/TypeScript/Vite passed; final added assertion-only changes followed by
39controller tests/typecheck passed. Full Rust155passed/6ignored, fmt/Clippy warnings-denied passed;
7new real SQLite tests include lost reply/reopen/rollback/conflict/cascade/migration. Independent
Python payload-v1 golden-vector assertion added afterward;7receipt tests and Clippy passed again. Engineering and
security final reviewed, corrected security empty-payload finding confirmed. Historical write benchmark
is not current receipt-path performance. See plans/2026-10-30-idempotent-append-plan.md,
doc/storage-batch-retry.md and log_20261030_idempotent_append.md. Scoped commit/push/draft PR delivery;
inspect new head CI before next push.

Next bounded software task: design/implement durable unacknowledged queue and restart reconciliation.
Independent read-only engineering/security review, lead implementation, no hardware. Preserve stable
batch/session/calibration association, ordering, bounds, transaction failure/termination recovery,
privacy/deletion semantics and explicit incomplete-session state. Do not automatically resume an
exercise after restart. Existing receipts persist but cannot reconstruct unsent readings/identities;
new identity after crash can still duplicate content. Hung invoke and total DB size remain open.

Other software accessibility/privacy journeys and academic reproducibility artifacts remain later
batches. External metrology/course/participant/native evidence is explicitly unverified but does not
block independent software work. No universal university/country/demographic acceptance claim.


## Historical checkpoint (2026-10-30 R07 offline receiver bundle)

Baselinebc3abe5 clean; CI40952113301 SUCCESS confirmed. Initial quota47%/50%, latest35%/49%
remaining. New bounded v1 contract/CLI embeds calibration JSON and receiver frame JSONL with exact
UTF-8 identities, strict fields/duplicate/depth/byte/row guards and actual protocol parsing. Fixture
is explicitly synthetic; calibration model/association/origin remain unverified and source clock/
sequence/reference/labels explicitly absent. No collector/recorder or device operations added.

40 CLI subprocess tests, TypeScript, syntax/discovery and committed synthetic fixture pass.
Engineering/security final read-only reviews no blocker. Baseline full680/69 files remains last
full suite, not rerun for offline-only change. No native/firmware/Rust suites rerun. See
plans/2026-10-30-capture-bundle-plan.md, doc/receiver-capture-bundle-v1.md and
log_20261030_capture_bundle.md. Deliver scoped commit/push/draft PR; inspect new head CI next round.

Next gate: inspect new CI and any genuinely new captured/reference/native evidence. R07 remaining
metrology needs timestamped receiver capture with known calibration association and independently
measured reference/labels; v1 is sample-only and cannot establish lossless event capture. Do not
manufacture historical metadata, equate structural success to device/source validity or repeat
stationary analysis/broad scans. Actual recorder design would require separate bounded review of
lifecycle/privacy/error-event preservation; no implicit automatic collection. If only unavailable
hardware, participants or external course/reference/native evidence remains, preserve dependency
and stop expensive work until new evidence. Other readiness/native/institution gates remain open.

## Historical checkpoint (2026-10-30 R07 raw receipt pairing)

Baseline71f4902 CI40943840118 SUCCESS, clean before task. Initial quota60%/53%, latest observed
50%/51% remaining. Client raw-motion/CSV inventory found Wizard B reused latest G: indefinitely
while new V: arrived. Local receipt counter now increments per callback, capture snapshots AFTER
countdown, complete fresh V consumes newer receipt once. Face/any floor correction requires raw;
skip/no-correction keeps V-only and optional gyro without manufacturing old samples. No source time/
sequence, new age threshold or physical synchronization claim. Minimum10/durations/solver/Apply unchanged.

Actual component baseline2 failed/1 passed, final10 new cases plus existing journeys validated.
Full680 tests69 files (including29 offline CLI), TypeScript and Vite build passed. Engineering final
review no blocker. Runtime Rust/firmware/collector unchanged, no native suites rerun. See
plans/2026-10-30-raw-pairing-plan.md, log_20261030_raw_pairing.md and doc/MEASUREMENT_EVIDENCE.md.
Deliver scoped commit/push/draft PR; inspect this new head's CI before subsequent delivery.

Next bounded R07 task: define an offline receiver-capture bundle contract/validator using only
available fields and synthetic fixtures. Explicit clock domain, calibration identity, file hashes,
source-timestamp/sequence absence and reference-evidence absence; no automatic raw recording or
device/participant operations. Inspect any existing equivalent before adding one. This does not
recover missing historical metadata or prove sample age/temporal coverage/sensor sync. Hardware,
native AT/installer/timing, metrology/fit and institution-specific evaluation still need external
evidence; stop expensive work if only unavailable dependencies remain. No broad repeated scan.

## Historical checkpoint (2026-10-30 R07 replay identity)

Baseline156ae17 CI40934031768 SUCCESS, clean before task. Initial quota79%/55%, observed70%/54%
remaining. Scoped inventory found historical calibration trace/sidecar and replay identity gap.
Replay now reports exact packet/settings bytes/hash,3 runtime-source hashes/Node and optional strict
sidecar hash/count verification. Original forensic hashes unchanged; explicit crlf-to-lf-v1 canonical
identity supports Git LF without conflating original bytes. Provided canonical hash must match even
on raw match. Fixed errors expose no private input paths/JSON/metadata paths; no original-source or
settings association inferred. Existing count/angle math untouched. Original CRLF and temporary LF
trace both verify66927 packets/66560 vectors/367 errors; calibrated count remains null.

29 actual CLI subprocess tests, TypeScript, script/test syntax and normal discovery pass. New tests
live under scripts/*.test.mjs in Node Vitest project, avoiding browser Node typings. Runtime app,
Rust and collector unchanged; no unrelated full suites/build rerun or aggregate670-pass claim.
Engineering/security final confirmations accepted canonical consistency correction. See
plans/2026-10-30-replay-provenance-plan.md, doc/MEASUREMENT_EVIDENCE.md and
log_20261030_replay_provenance.md. Deliver scoped commit/push/draft PR and inspect its own CI next.

Next bounded R07 task: inspect existing raw-motion logging/export path for source vs receiver timing,
sequence and calibration linkage before designing any new capture bundle. One evidence-backed gap,
no hardware/participants or invented reference values. Do not rerun old stationary analysis or
broad software audit. Original trace still lacks timestamps/labels/matched settings/reference angles;
native speech/installer/BLE/OS timing, paced performance and institutional/fit evidence remain open.
If only unavailable external evidence remains, save that dependency and stop expensive work.

## Historical checkpoint (2026-10-30 updater feedback)

Baseline432d5fa CI40924530764 SUCCESS, clean before task. Latest observed quota80%/56% remaining;
prior QUOTA HOLD remains released. Installing/install-error(version) status replay, generic localized
error/manual retry and handled rejection implemented. Installer status published after ownership;
observer/replay exceptions isolated, synchronous nested status suppresses obsolete delivery.
Banner owns persistent polite/alert install announcements, Settings static copies avoid duplicate
speech sources. Both locales/remount/pending/success/retry/retained-save and callback races tested.
Final641/641 frontend tests67 files, typecheck/build passed after reviewer correction. Rust/collector
unchanged and not rerun. Engineering/inclusion final reviews no blocker. See
plans/2026-10-30-update-feedback-plan.md and log_20261030_update_feedback.md. Deliver scoped commit/
push/draft PR and inspect this new head's CI next turn; no extra full-suite reruns without changes.

Next bounded task: R07 measurement-evidence inventory of existing raw capture/reference-fixture
schemas, units and provenance. Inspect actual project artifacts, identify one actionable reproducibility
gap and plan before edits; no broad code audit, device run, participant data or invented result. Use
official specific sources for any added institutional claim. Native installer/AT/event timing, paced
performance, anatomical accuracy and human fit remain separate open evidence gates. If only external
evidence remains, checkpoint that dependency and stop expensive work.

## Historical checkpoint (2026-10-30 updater interlock)

QUOTA HOLD released after natural recovery: initial100%/59%, latest95%/58% remaining. No reset,
credits or credential changes. Baseline275336c CI40883973181 SUCCESS; worktree clean before task.
Updater/session-start/idle-close now share symbol-owned synchronous transition lease. Start releases
finally; failed install/destroy release; successful install holds installing/lease until process exit.
Six real adapter/controller lifecycle cases plus obsolete-release regression added. Full630 frontend
tests66 files/typecheck/build passed; Rust/collector unchanged, no new native suite claim. Independent
engineering design/final review no blocker. See plans/2026-10-30-update-exit-plan.md and
log_20261030_update_exit.md. Deliver scoped commit/push/draft PR, check its own CI next turn.

Next bounded task: inspect UpdateBanner restart rejection/status handling. Current source calls
void restartNow without catch and only renders downloaded/APK status; distinguish rejected launch
from successful handoff that remains blocked pending native exit. Plan/reproduce before changing;
do not rerun a full-project audit or execute real installer. Native installer/termination, cooperative
titlebar/AltF4, OS shutdown/crash durability and broad institution/metrology acceptance remain open.
Historical summaries/quota holds below are superseded by this current checkpoint.

Updated: 2026-10-29 R05 native history pages batch. Observed remaining five-hour48%, weekly64%. Previous head `a2ff51b` CI40870617543 confirmed SUCCESS before delivery. Draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5), branch codex/irms-readiness-20261029. Native page cap/index/clamp and renderer fences validated with612 frontend/145 Rust tests; new head CI separate. Next: bounded data_append_batch ingestion/write-budget source review; let latest CI finish before push (local preparation allowed). No native latency/heap/FPS/deployment or institutional/clinical/population acceptance implied. S03 rollout and R05/R07 native-performance/metrology/institution gates remain open. Overall objective not completed.

## Resume here
- Worktree: E:/Monitoring-and-IoT/IRMS-wt/readiness-20261029
- Repository: yuhina0515/IRMS (not IRMS-archive)
- Branch: codex/irms-readiness-20261029
- Base branch: codex/irms-progress-20261020, commit 6c6241765f6ba33a46ff0018143616bffa675875 (draft PR #4; depends on draft #3).
- Plan: 2026-10-29-readiness-plan.md; backlog/evidence: ../doc/RESEARCH_READINESS.md; handoff: ../doc/coding log/log_20261029_squad_readiness.md.
- R01 plan/log: 2026-10-29-hold-continuity-plan.md / ../doc/coding log/log_20261029_hold_continuity.md.
- R02 plan/log: 2026-10-29-download-bounds-plan.md / ../doc/coding log/log_20261029_download_bounds.md.
- R03 plan/log: 2026-10-29-confirmation-access-plan.md / ../doc/coding log/log_20261029_confirmation_access.md.
- R04 plan/log: 2026-10-29-ble-notification-plan.md / ../doc/coding log/log_20261029_ble_notification.md.
- R08 plan/log: 2026-10-29-connect-lifecycle-plan.md / ../doc/coding log/log_20261029_connect_lifecycle.md.
- R05 plan/log: 2026-10-29-performance-threat-plan.md / ../doc/coding log/log_20261029_performance_threat.md.
- S02 plan/log: 2026-10-29-share-revocation-plan.md / ../doc/coding log/log_20261029_share_revocation.md.
- S01 plan/log: 2026-10-29-share-response-plan.md / ../doc/coding log/log_20261029_share_response.md.
- S03 plan/log: 2026-10-29-share-ownership-plan.md / ../doc/coding log/log_20261029_share_ownership.md.
- R06 dropdown plan/log: 2026-10-29-dropdown-keyboard-plan.md / ../doc/coding log/log_20261029_dropdown_keyboard.md.
- R06 hardware plan/log: 2026-10-29-hardware-alert-plan.md / ../doc/coding log/log_20261029_hardware_alert.md.
- R06 calibration controls plan/log: 2026-10-29-calibration-controls-plan.md / ../doc/coding log/log_20261029_calibration_controls.md.
- R06 calibration focus plan/log: 2026-10-29-calibration-focus-plan.md / ../doc/coding log/log_20261029_calibration_focus.md.
- R06 Wizard B access plan/log: 2026-10-29-calibration-b-access-plan.md / ../doc/coding log/log_20261029_calibration_b_access.md.
- R06 A announcement plan/log: 2026-10-29-calibration-announcements-plan.md / ../doc/coding log/log_20261029_calibration_announcements.md.
- R06 B announcement plan/log: 2026-10-29-b-announcements-plan.md / ../doc/coding log/log_20261029_b_announcements.md.
- R05 history review plan/log: 2026-10-29-history-review-plan.md / ../doc/coding log/log_20261029_history_review.md.
- R05 history pages plan/log: 2026-10-29-history-pages-plan.md / ../doc/coding log/log_20261029_history_pages.md.
- Before work: inspect `git status`, PR status and fresh limits. Do not redo the completed audit. Never mix unrelated modifications into a commit.

## Completed batch
Telemetry now has serialized byte/count limits, shared native/frontend payload checks, collector-switch purge and stale-result isolation. Settings number fields have associated labels; toast speech uses persistent polite/error regions. Independent security follow-up found no new regression. Primary-source examples map UW CSE 481S and Edinburgh DISS requirements without claiming general university approval.

Validation: 56 frontend files / 533 tests; TypeScript and Vite build passed. Cargo fmt, 104 Rust tests (3 live tests ignored) and Clippy all-targets/all-features with warnings denied passed. Native screen-reader, BLE/OTA and participant testing were not run. hina-tw.ddns.net collector health returned HTTP 200 / ok; no service changes. Antigravity command absent on PATH.

## Next concrete task
R01 completed locally: original failure reproduced, monotonic receiver clock and >250ms gap/clock-anomaly restart implemented, rest gating preserved, sparse success fixtures explicitly streamed, SessionController zero progress/no GOAL regression added. Latest frontend validation: 56 files / 542 tests, typecheck and production build passed. Prior CI run 40808318776 confirmed SUCCESS before R01 push; check new head independently. Rust unchanged this batch.

R02 completed locally: shared downloader now bounds each accumulated response, with fixed metadata/signature caps and exact verified payload sizes. All call sites migrated; signatures/hashes/cache fallback unchanged. 14 focused firmware tests passed; full Rust 110 passed / 3 live ignored, fmt/Clippy passed. Frontend remains R01's verified 542 tests/typecheck/build. No live release or native OTA acceptance.

R03 completed locally: body portal, original inert-state restoration/observer, keyboard/focus/click containment, 150ms close/replace semantics, message description and immediate hardware emergency takeover. Baseline Tab-wrap regression failed then passed. New tests include emergency focus race and StrictMode replay. Typecheck, 57 frontend files / 553 tests, Vite build passed. Rust unchanged; last R02 result remains 110 passed / 3 live ignored. Native WebView/screen-reader acceptance and other overlays remain open.

R04 completed locally: epoch mutex gates actual native notification/error dispatch and retirement. Stream-end awaits peripheral then checks epoch and clears/emits inside the same callback. No await or recursive BLE locks inside callback; lock order peripheral -> epoch. Actual production helpers cover stale/current angle/raw/OTA, deterministic invalidation ordering, delayed teardown and poison recovery. Full Rust 114 passed / 3 live ignored, fmt/Clippy passed. Frontend still verified at 553 tests/typecheck/build. Native OS scheduling and already-queued renderer events remain unverified.

R08 completed locally: `ble_lifecycle.rs` reserves before await, serializes OS attempts through cleanup and installs/publishes before listener scheduling. Disconnect checks ownership after waits. Native scan has a single stop epilogue; cancellation retains backend/cleanup errors. Nine fake-transport tests exercise shared production orchestration across six stage boundaries, queues/install/disconnect and immediate listener completion. Removed post-connect ownership guard was detected by mutation. Reviewer-found error masking fixed and retested. Final Rust 123 passed / 3 live ignored, fmt/Clippy passed; frontend unchanged at 553 tests/typecheck/build. Native scan epilogue is source-inspection evidence; OS timing, physical cleanup failure, whole-future abort and already-queued renderer events remain open.

R05 offline scope implemented: `IRMS_App_Tauri/scripts/benchmark-readiness.mjs --native` runs actual metric/engine, file-backed WAL DB insert/query and offline telemetry record paths. Protocol/JSON under `doc/performance/`; source manifest/fixture hashes, warmups/repeated distributions, queue/drop accounting and safe environment metadata captured. Independent engineering review corrected indirect-source hash coverage and arbitrary Node-argument metadata. `doc/THREAT_MODEL.md` records code-grounded boundaries/controls/residual gaps. R05 remains partial: paced native UI/IPC/device/network and native memory trend unmeasured. Regular Rust remains 123 passed, now 5 ignored (3 live + 2 manual benchmark tests); both manual benchmarks separately passed. Frontend unchanged at 553 tests/typecheck/build.

S02 completed locally: reproduced removed pending poll returning next state with 200 rather than 401; shared removal/leave/expiry helper revokes membership then wakes only that viewer's polls. Completion revalidates identity and cleans timer/sets/close listener; share closure remains 410. Ten Node service tests passed, syntax/whitespace checks passed; independent security diff review found no blocker. Not deployed. Native/frontend code unchanged; don't rerun broad suites without cause.

S01 completed locally: reproduced actual command accepting 65,537 chunked bytes; incoming declared and accumulated responses now capped at 64 KiB before append on every HTTP status. Outgoing 32 KiB budget and status/JSON/null semantics retained. Eight focused tests (six new) pass, covering chunked/single/header-only/unknown-length overflow, truncation, exact-limit/error/Unicode/null/lossy UTF-8. Full Rust 129 passed / 5 ignored, fmt/Clippy passed; independent security review found no blocker. No native packaged/client or production acceptance. Frontend code unchanged; last frontend validation remains 553 tests/typecheck/build.

S03 completed locally: native per-launch master -> canonical-collector HMAC proof, only in sensitive HTTP header for ingest/create. Bind digest in separate collector run_owners table within first ingest transaction; refuse missing/wrong proof before any metadata/event/share mutation, never upgrade legacy runs. Native module request shape unchanged; capability+response version markers fail closed on legacy collector, generation fences suppress stale code/token, one timeout spans preflight+create, redirects disabled. 138 Rust / 13 collector / 4 focused frontend tests pass; fmt/Clippy pass. Independent security/engineering design and final reviews accepted; lead added actual ingest-failure rollback and total-timeout tests from their suggestions. No production or native/module E2E acceptance. First-writer preclaim remains DoS risk, not device attestation.

R06 dropdown locally completed: select-only combobox relationships, stable field labels/hint, trigger focus/active descendant, candidate vs committed values, arrows/HomeEnd/typeahead and Enter/Space/Tab/click commit/Escape cancel. Shared Escape ownership includes closing interval; closing options hidden/disabled, dynamic/disabled/empty/reopen handled. Display language/theme/pose named; actual zh-Hant -> en -> zh-Hant keyboard/Tab journey tested. Final JSON report 560/560 tests, 57 files; typecheck/Vite build passed. Independent inclusion review found no blocker. Existing Demo persistence test only role queries updated. Native AT/touch/pen/zoom, other fields/overlays remain open; see doc/ACCESSIBILITY_ACCEPTANCE.md. Rust unchanged; last 138 Rust/13 collector/fmt/Clippy result remains S03's.

R06 hardware alert locally completed: independent named/described alertdialog portal, initial/contained focus, Tab/pointer/background protection and non-dismissive priority Escape. Shared reference-counted inert leases and original-invoker handoff preserve real confirmation open/closing interactions in both render orders; disabled/removed-save fallback and StrictMode recovery covered. Baseline focus regression failed before fix. Independent inclusion final review found no blocker. 32 focused and 572/572 full frontend tests (58 files), typecheck/Vite build passed. CSS-only hidden-control eligibility and native WebView/AT remain acceptance gaps. No save/BLE/DB/IPC/schema behavior change; previous native/collector checks were not rerun.

R06 Wizard A control semantics completed locally: localized Close name in both dictionaries and mutually exclusive aria-pressed driven by existing local wearSide. Four new cases plus original gates (7 focused) cover keyboard Space/Tab/Enter, both locales, null/saved left/right and no persistence on selection/close. Full frontend 576/576 tests, 58 files, typecheck/build passed. Independent inclusion review found no blocker. Full Wizard A focus/portal/step announcements, Wizard B and native/hardware acceptance remain open; no calibration math/capture/IPC changes.

R06 Wizard A modal focus implemented: named body portal, Close initial focus, contained Tab/focus/pointers, reversible isolation and eligible invoker restoration. Synchronous store guards plus actual alertdialog presence yield through confirmation closing/emergency and resume remembered wizard control. Escape priorities default 0 / Wizard A 10 / confirmation 20 / hardware 100; capture consumes without closing, explicit Close unchanged. Confirmation paint layer 1200 avoids late-wizard portal overlap (wizard 1100/emergency 1500); actual native paint unverified. Independent inclusion review accepted after this additional fix. Final 586/586 frontend tests in 59 files, typecheck/build passed; ten new focus regressions. See current coding log. Capture/math/settings/BLE/DB/IPC unchanged; native AT, CSS-only visibility, step announcements and Wizard B remain open.

R06 Wizard B access completed locally: localized Close, local-side aria-pressed, named body portal and reuse single-wizard focus/isolation/alert precedence; capture Escape consumes at priority 10. B raw effect/subscription/detection, capture/solver and Apply-only persistence unchanged. Seven new access cases plus original intro test (8 focused) passed; final full frontend 593/593 in 60 files, typecheck/build passed. Independent inclusion review accepted. Mock raw lifecycle/detection/cleanup and alert handoff do not establish actual BLE command/raw validity/calibration/native AT/paint; arbitrary simultaneous A/B mounting unsupported. Step/error announcements and native acceptance remain open.

R06 Wizard A announcement DOM contract implemented: persistent polite atomic status uses existing localized step/capture text; persistent atomic alert follows errMsg and retry clearing. Countdown/raw/preview values excluded, visible layout/timers/math/focus/settings unchanged. Three new cases (both locales plus actual error/retry/text-mutation lifecycle) and existing A tests pass. Final 596/596 frontend tests in 61 files, typecheck/build passed; independent inclusion review accepted. Native speech delivery/order/initial region and post-preemption recovery remain unverified; B announcements remain open.

R06 Wizard B announcement DOM contract implemented: persistent polite detection/stage/face/progress and preparation/recording status, persistent capture/result-stage solver error alert with retry/recalibration clear. Excludes countdown ticks/raw/numeric solve results; progress formula shared with visible text. Four new cases through actual capture/solver rejection plus existing B tests (12 focused) and typecheck pass; final 600/600 frontend tests in 62 files and build passed (details in current log). Independent inclusion review accepted. No raw lifetime/timer/sample/solver/Apply behavior change. Native speech/order/preemption, hardware calibration quality and all research/rollout acceptance remain open.

R05 history review projection completed locally: one SELECT snapshot supplies original knee LTTB chart (max1200) and every timestamp/knee/proximal analysis row. Shared sampler preserves timestamp/id/cursor semantics, Date.parse/metric/module full-resolution analysis and CSV/getData unchanged. Locale-only chart redraw avoids DB refetch; session-bound snapshot catches failures/discards obsolete success/error. Reviewer allocation-lifetime correction accepted (sample first, drop points, move timestamps); no peak-heap claim. 606 frontend/141 Rust tests, typecheck/build/fmt/Clippy pass; 6 Rust ignored (3 live+3 manual), new manual benchmark separately passed. Hashed synthetic15k WAL fixture combined JSON3,311,285 ->1,912,413 bytes (~42.2% lower); p50 query+serialize170.1933ms ->85.9436ms only for this debug workload. Protocol/artifact in doc/performance/history-review-projection.md/json. Full analysis O(n), native IPC/UI/memory and actual packaged module/export acceptance remain open.

R05 native history pages completed locally: additive listPage/sessions_list_page contract caps1..100, count/rows read transaction, clamp before offset, stable startTime DESC,id DESC. Migration10 adds nonunique index only; old list/review/full data/export retained. Renderer request-key loading/stale/resize fences, review-back page refresh and delete/error handling verified. Server page drives navigation without redundant clamp request. 612 frontend/145 Rust tests, typecheck/build/fmt/Clippy pass;6 Rust ignores unchanged. Upgrade/index plan/all1,001 ties across pages/limits/DTO tested; deterministic full345,240 vs100-row34,553 serialized bytes artifact, not a timing/heap claim. COUNT/deep OFFSET, per-row bytes and cross-page mutation shifts remain limits; native migration timing and performance acceptance open.

Next bounded batch: native data_append_batch ingestion/write-budget source review with actual frontend flush/retry path. One verified issue only; preserve complete data/transaction/retry contracts. Let latest-head CI finish before push; local preparation permitted. Do not repeat completed history/UI/full-project audit; native speech/metrology/performance still require actual evidence. Keep native screen-reader/WebView, real user/age/fit and institutional protocol acceptance distinct from DOM tests. S03 rollout remains gated on coordinated native+collector candidate, backup/rollback and actual runtime-module/client verification; old clients lose sharing on upgraded collector and new clients reject old collectors, as documented. No destructive production rollout or participant operations. R05 paced native performance and R07 institution/metrology evidence remain open.

## Quota / environment

Delivery update2026-10-29T13:38Z: previous docs CI40874246554 completed SUCCESS. Normal-close guard
was locally validated at0f47b38 (623 frontend tests64 files/typecheck/build, independent final review);
this checkpoint/log update may amend that unpublished commit. Push gate cleared; complete scoped
delivery and draft PR update only. Remaining quota18%/59%: QUOTA HOLD continues until ALL known
windows>=30%. No new implementation/review/full tests this round. Next heartbeat inspect quota,
actual PR head and its CI (do not reuse the previous head's success as current-head evidence).
Native titlebar/AltF4, forced exit/crash/OS shutdown and durable recovery remain unverified.

QUOTA HOLD: latest observed remaining20% five-hour /59% weekly; stop expensive work now. Resume
only when ALL known windows>=30%; unknown permits short inspection only. No resets/paid credits.
Local normal-close guard commit1340889 (may be amended for this checkpoint) has623 passing frontend
tests/typecheck/build and independent final review. Not pushed: prior docs CI40874246554 still needs
terminal SUCCESS. Next run may briefly inspect quota/that exact CI; preserve local commit, finish
cheap delivery after successful gate when appropriate, but no new implementation/review/full tests
until quota recovery. All native/forced-exit/durability acceptance boundaries above remain open.

Normal-close implementation completed locally (baselinee1ad348): see implementation plan and
log_20261029_close_guard.md. Singleton before render gates start until registration, block-and-save
policy includes pending start/end/retained id/buffer/flushing; idle reservation blocks new start and
destroy failure releases it. Narrow main-window allow-destroy capability added. Engineering final
review no blocker. Full623/623 frontend tests64 files, typecheck/build passed; Rust/collector unchanged
and not rerun. Native titlebar/AltF4, forced exit/crash/durable recovery still unverified. CI40874246554
for previous doc head must finish successfully before push; local commit is allowed. Next run recheck
quota first, finish pending delivery only, and do not open new expensive task near quota hold.

Latest assessment delivery:26%/60% remaining; CI40873513567 for4556b18 verified SUCCESS.
This supersedes the earlier generic next recovery assessment: normal close bypasses save/retry;
see plans/2026-10-29-close-recovery-plan.md and log_20261029_close_recovery_assessment.md.
No implementation yet. Next task install healthy-renderer normal-close coordination with pending
start/end/retained-id protection and actual native-close handler tests. Read plan before editing.
Keep crash durability/forced termination separate. Do not supersede live CI; no reset/paid credits.

Latest storage-write batch: remaining32% five-hour /61% weekly. R05 storage issue below is now
locally completed; this paragraph supersedes the earlier next-batch instruction. Shared JSON caps
native transactions1000 rows/timestamps128 UTF-8 bytes and requires six finite angle/roll fields
before DB lock, after deserialization. Controller pending includes buffer and in-flight suffix;
at2000 stop before accepting another frame, retain complete failed suffix and retire only full-count
acknowledged chunks. Existing end/save/retry remains; no tight failure loop. 616 frontend/148 Rust
tests passed, 6 Rust ignores unchanged, typecheck/build/fmt/Clippy passed. Engineering/security final
reviews found no blocker; prior head157a4f7 CI40872203346 SUCCESS. New log: log_20261029_storage_budget.md.
Next: check quota/latest-head CI, then assess ONE automatic-save failure/recovery gap from current
lifecycle evidence. Do not add durable queue/idempotency schema without scoped design. Lost-reply
duplication/crash recovery/hung native RPC/native IPC acceptance remain open; no new task this round.
Latest observed remaining quota (B announcements delivery): five-hour 86%, weekly 70% after natural window reset; initial 95%/95%. QUOTA HOLD released because all known windows recovered >=30%; no credits/reset used. Stop new expensive work at <=20%; once held, 21-29% is insufficient to resume. These are shared account percentages, not task token counts. Re-check on every run; unknown quota permits short inspection only. No purchases, resets or credential switching. No workers active at checkpoint. Hourly automation can re-evaluate while the app/computer remain running; no instantaneous token interceptor is claimed.

Dependencies installed with `npm.cmd ci --ignore-scripts --no-audit --no-fund`. npm package-script Windows shims failed with `"node" is not recognized` even though direct Node works; changing PATHEXT did not fix it. Verified direct equivalents:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
node node_modules/vite/bin/vite.js build
$env:CARGO_BUILD_JOBS='1'
$env:CARGO_TARGET_DIR='E:\Monitoring-and-IoT\IRMS-wt\squad-20261020\IRMS_App_Tauri\src-tauri\target'
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

Run from IRMS_App_Tauri. The target cache is generated output only; no edits were made to the older worktree's tracked files. Avoid simultaneous Cargo runs on that cache. Vite reports existing large Leg3D chunk / ineffective ToolsView dynamic import warnings; not failures and not fixed in this batch. Crash-recovery test intentionally emits `view crashed` while passing.

## Boundaries
Preserve original archive Cargo.toml/.claude logs and older squad worktree's HOME/architecture notes. No automatic PR merges, production restart/deployment, firmware upload, participant recruitment or private-data publication. Already-issued telemetry requests cannot be recalled. No universal country, university or demographic suitability claims. Use existing scoped authorization; do not repeatedly ask for implementation permission.
