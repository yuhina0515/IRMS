# Read-only reconciliation evidence — 2026-10-30

Plan:plans/2026-10-30-reconciliation-plan.md. Baseline f7cd1d4 clean, prior CI41036086380 SUCCESS.
Initial live quota100%/34%, latest92%/33% remaining. One bounded test-only software task, no physical
devices, participant/app data, deployment, production acquisition/UI/schema/IPC change or messages.

Lead added cfg(test) RecoveryInspection and inspect_recovery_batch beside the actual receipt hash.
Shared bounded input validation, canonical identity, one read transaction/SELECT for association,
receipt digest/count and abandoned/ended state. Explicit rejected/conflict/unseen/matched states.
No write/repair/append/acknowledgement action. Oracle successful inspection envelope explicitly denies
automatic replay and journal-deletion authority. No raw readings/calibration/stored hash in output.

Meeting: engineering and security independent read-only (inherited model, backendID unverifiable),
design plus final review. Both identified init_database's hidden migration/orphan-finalization side
effects. Initial draft reused init before inspection, corrected before evidence: reconcile now
dispatches first and uses SQLITE_OPEN_READ_ONLY on existing DB plus query_only and total_changes
assertion. Other test operations intentionally retain init behavior. Missing DB does not create;
schema/read errors remain failures, never needsDecision. Both final reviews found no blocker.
No inclusion worker needed for this no-UI/no-locale internal prototype. No demographic thresholds.

Accepted policy: receiptMatched proves only original hash/count in this snapshot; not current backup
history, native authentication, full row-integrity scan or journal deletion authority. needsDecision
does not permit append. Read transaction ends before future actions, so status is not a reservation;
later append must verify original association/receipt again. Preserve original payload/binding,
abandoned/incomplete status and journal across all inspection outcomes. No end-time repair from
arbitrary renderer timestamps. Cross-store deletion/restore intent remains a separate gate.

Verification:
-39actual Chrome/native synthetic cases (29previous+10inspection), fresh current Rust executable,
  new doc/recovery/reconciliation-probe-20261030.json. Each inspection compares journal before/after;
  covers open unseen, committed abandoned matched, conflict, missing DB/session, foreign/deleted/
  recreated binding and backup unseen/matched, all without journal loss. Original process interruption/
  native dedup cases retained. Only Chrome force-killed; native helpers exit normally, not Tauri IPC.
-6new Rust cases: query_only/no writes and complete open-session preservation, abandoned/normal
  ended state, all7payload fields/count conflict, signed-zero equivalence, association precedence,
  budgets/invalid identity and missing schema without migration. Targeted first4passed, then full
  final168passed/7ignored. fmt check, Clippy all-targets/all-features -D warnings passed.
-3normal Node CLI redaction subprocess cases and node --check passed. No renderer/runtime behavior
  changed; prior736frontend/typecheck/build not rerun. Collector unchanged. Historical19/29reports
  preserved. Source and executable hashes identify working bytes; fresh build supplies association,
  not attestation/reproducible-build proof. No source change after final evidence.
- No failing test or environment setup failure this task. Draft's init coupling was identified and
  corrected before successful inspection evidence, not presented as a read-only result.

Docs: recovery/reconciliation-inspection.md, system spec/cheatsheet/optimization/HOME/checkpoint.
Next bounded software work: explicit cross-store deletion-intent/restore-history policy and startup
recovery decisions before acquisition hookup; no implicit resumption, rebind/recreate or silent
discard. Actual WebView storage/quota/eviction/native termination timing remain later software gates.
No metrology/clinical/universal institution/country/population acceptance claim.

Delivery: scoped commit/push/update draftPR5, no merge. Inspect new head CI next heartbeat before
another push. Broad goal unfinished. Quota guard persists without purchases/reset/auth substitution.
