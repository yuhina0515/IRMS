# Actual native journal oracle — 2026-10-30

Plan:plans/2026-10-30-native-journal-plan.md. Baseline6ed5e05 clean; CI41030074994 SUCCESS before
this push. Initial live remaining63%/37%, latest51%/35%. One bounded software-only synthetic task,
no devices, participant data, real profile/app DB, deployments, people messaging or production hook.

Lead added a cfg(test)-only ignored native oracle and optional browser probe --native-oracle mode.
Exact filtered executable runs per request; actual schema12 init/start_bound/append_bound_batch/
delete and VACUUM INTO backup. Shared reading validator visibility changed to pub(crate), behavior
unchanged. No schema/IPC/production acquisition change. Normal test suite never launches this ignored
helper or Chrome. Request<=1MiB, fixed native/foreign/backup filenames under owned direct temp child;
regular-file/symlink guards include SQLite sidecars. Bounded30s/1MiB subprocess capture, fixed error
redaction; no raw native output reaches report. Cleanup precedes success publication.

Meeting: engineering/security reused as independent read-only reviewers (inherited model/backend
unknown), design then final/narrow confirmation. No UI/locale change needing inclusion review.
Accepted shared command validator, fresh-process startup observations, unique exact-result marker,
consistent backup rather than mainfile/WAL copy, explicit no-Tauri/no-native-kill boundaries.
Engineering final found no blocker; provenance risk accepted/documented: hashes identify source/
binary separately, fresh build provides association, not a reproducible-build/attestation proof.
Security final found concrete dangling-symlink bypass through exists(); lead replaced it with
symlink_metadata allowing only regular files or NotFound. Checked request/root before following,
DB/sidecars and backup target. Added ordinary regular/missing/directory guard regression; Unix-only
dangling-link test is present but not executed on this Windows run. No hostile local-process sandbox
or TOCTOU resistance claim. Security narrow follow-up confirmed the dangling fix and found no
new blocker; static read-only confirmation, not an additional test run.

Evidence:
-29realChrome/native synthetic cases: original19 plus10 native cases. Original binding enqueue;
  actual commit with parent-discarded reply, browser kill/reopen and exact retry gives2rows/1receipt;
  changed payload conflict; aborted journal deletion after native success retains entry across kill,
  retry still2rows/1receipt, full success later deletes; missing DB/session, foreign same numeric ID,
  deleted/recreated numeric ID reject without creating/rebinding or erasing journal.
- Consistent pre-deletion backup retains same binding and accepts pending new batch after current
  DB deletion. This is observed ambiguity, not acceptance: journal remains pending, no auto replay
  authorization. Every helper initializes DB; actual startup marks abandoned/endTime before the
  future2099 synthetic tail. staleEnd is asserted, not silently repaired or called normal recovery.
- Source/executable/runtime hashes in doc/recovery/native-journal-probe-20261030.json; temporary
  browser/profile/request/DB/server cleanup confirmed. Native helpers exit normally; browser alone
  force-killed. Parent discards a real committed reply, not actual Tauri IPC transport fault injection.
- Final full Rust162passed/7ignored, fmt and Clippy all-targets/all-features -D warnings passed.
  Seventh ignored case is manual oracle; six earlier ignored cases not run. Fresh build and29case
  probe repeated after guard corrections; no source edits after final evidence.
- Three existing normal Node CLI error-boundary subprocess cases passed. No renderer/UI/type source
  behavior changed this batch; prior full736frontend/typecheck/build not rerun. No collector changes.

Correction: first integration run failed in CDP expression setup due top-level await; converted to
promise expression, then29cases passed. This was probe setup, not SQLite data loss. A doc patch missed
an exact context and changed nothing; corrected against current lines. No false success published.

Policy/doc: doc/recovery/native-journal-oracle.md records conservative reconciliation gate. Keep
acquisition gated when pending journal exists; never recreate, refresh binding, resume exercises,
discard corrupt data or claim complete interrupted tail. Cross-store deletion/restore generation/
tombstone and abandoned end-time semantics remain unimplemented prerequisites. WebView persistence,
quota/eviction/native interruption timing remain further software-only gates. No universal school,
country, population or clinical acceptance claim; no demographic thresholds.

Delivery: scoped commit/push/update existing draft PR5; no merge. Check new head CI next heartbeat
before another push. Next bounded task: independently decide/test startup reconciliation and explicit
recovery status using these observations, before acquisition hookup. Broad goal remains unfinished.
