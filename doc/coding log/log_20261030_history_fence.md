# History-change fence debate, decision and verification — 2026-10-30

Plan:plans/2026-10-30-history-fence-plan.md. Baseline8c7811f clean, prior CI41043282152 SUCCESS.
Initial quota89%/33%, latest80%/31% remaining. One bounded isolated task; no production hookup,
real app/profile/participant data, devices, native schema/IPC change, deployment or people messaging.

Question: retained per-session tombstones versus one unresolved global history-change fence before
native delete/restore. Independent participants: engineering shipping/operations and security risk/
alternative lens, inherited model/backend unverifiable, read-only. Both chose singleton B: fixed
metadata cost avoids undefined tombstone eviction; same entries/meta transaction serializes writer/
ack/fence; older code rejects second meta row. Both require complete canonical intent idempotence,
conflict rejection and retention after lost reply. One cross-critique round found no contradiction.
Security added strict known-second-record audit, not arbitrary meta allowance. Engineering emphasized
append-sent -> fence -> restore -> old-append-commit counterexample. No dissent on bounded prototype.

Chair verdict B only as prerequisite. Strongest surviving objection: it cannot cancel already-sent
native writes; production must freeze acquisition/start and settle native work under an exclusive
history transition before mutation, treating ambiguous completion as blocked. No clear API means
failed/cancelled intent indefinitely blocks all journal writers/ack; unlock/retention UX is unfinished.
No external replacement or both-store rollback detection claim. Native deletion alone does not erase
retained readings in the journal, so this is not complete user-data deletion/privacy acceptance.

Lead implementation: optional fixed historyFence in version1 meta, exact kind/UUID/binding fields,
copy before transaction; restore null-binding, delete original numericID/storage association. Strict
transaction-complete publication; full intent same-value retry, conflicting intent cannot overwrite.
Audit every operation; totals plus at most known validated marker, reject unknown/corrupt records.
Enqueue/ack check inside same transaction and reject; peek/stats expose retained queue/intent. No
native actions or clear API added to journal. Production still does not import the prototype.

Verification:
-53actual Chrome/native cases in doc/recovery/history-fence-probe-20261030.json (39prior+14new).
  Malformed intent; abort after request success; strict fence commit; idempotence/full conflicts;
  enqueue/fullack blocked; matching-backup/native rejection never clears; actual synthetic backup
  delete after fence, discarded reply, owned-browser kill/reopen preserves intent and original queue;
  preceding enqueue retained; following concurrent ack sees fence; restore null-binding survives;
  unknown third meta/corrupt fence reject without erasure. Only owned Chrome force-killed, native
  helpers normal per-request exit. Source/runtime/native executable hashes and cleanup recorded.
- Final engineering/security static reviews found no blocker in52-case version. Engineering suggested
  directly testing mark-first concurrent ack; lead added that meaningful53rd case and reran actual
  probe successfully, no prototype implementation change. Reviews did not separately execute tests.
- TypeScript noEmit/Vite build,3normal CLI redaction subprocess cases/node syntax passed. No runtime
  UI source change; prior736frontend suite not rerun. Native sources unchanged, fresh Cargo no-run
  build selected current cached executable; last full168Rust/7ignored/fmt/Clippy at baseline not rerun.
  Collector unchanged. Original19/29/39reports retained; no full heap/power-loss/WebView claim.
- No product or test failure. One documentation patch used an unmatched context and changed nothing;
  corrected against actual text. Both isolated probe processes completed; final53-case report hashes
  checked against current source, no source edits after final evidence.

Docs/spec/cheatsheet/optimization/HOME/checkpoint updated. Next bounded task: prototype an exclusive
history transition/quiescence barrier for already-submitted native work, with rejection/hung-owner
semantics, before considering production acquisition hookup. Unlock/retention/restore policy remains
separate unfinished work. No automatic resume/rebind/recreate, silent discard or complete-tail claim.
No universal university/country/demographic/clinical acceptance or population-derived thresholds.
Deliver scoped commit/push/update existing draftPR5; no merge. Inspect new head CI next heartbeat.
