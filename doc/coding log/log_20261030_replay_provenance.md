# R07 calibration replay identity and evidence inventory

Baseline156ae17 clean, CI40934031768 SUCCESS; initial quota79%/55%, observed70%/54% during checks.
Plan plans/2026-10-30-replay-provenance-plan.md; snapshot %TEMP%/irms-replay-provenance-snapshot
(5 source/metadata/doc files, unchanged packet fixture hash checked separately). Lead implements/
tests/Git; independent engineering/security design/final reviews, inherited model/backend unknown.
No capture, participant/production/service/installer/network operation; no new university claim.

Inventory found preserved trace sidecar but replay neither checked it nor recorded input/code/runtime
identity. Git blob is LF, Windows file CRLF; existing raw hash matches historical extraction. Kept
original source/packet hashes, added explicit crlf-to-lf-v1 canonical hash only. Script/parse/math
runtime source closure is exactly3 files; current algorithms and count semantics unchanged.

Initial3 subprocess regressions failed before fix. New evidence block reports actual bytes/hash for
single-read packet/settings buffers, optional manifest hash/match mode,3 source hashes and Node.
Optional flag validates raw hash, safe nonnegative packet count and explicit canonical fields. Only
CR immediately before LF is removed; no other normalization. Manifest paths never followed/reported;
settings remain caller supplied. Fixed CLI error categories avoid raw path/JSON/stack leaks and no
successful report on failure. Consistency is not authenticity/source proof/calibration association.

Meeting accepted engineering single-buffer/count semantics/source-closure findings and security
redaction/strict metadata/flags risks. Both final reviewers independently found raw match bypassed
contradictory valid-format canonical hash; lead reproduced1 failed/28 passed, added unconditional
provided-canonical check, then29/29 passed. Final short confirmations requested. No reviewer ran tests.

Tests cover real CLI subprocesses, raw/LF identity, changed order/space/BOM/bare CR/final LF/readings,
legacy raw-only behavior, contradictory/invalid metadata/count/options, private sentinels, optional
BOM settings and nonblank error/malformed/prefixed packet counts. Initial TS test failed compiler
because browser project lacks Node typings; moved test to scripts/*.test.mjs and included it in the
existing Node Vitest project, without dependencies or weakening app types. Discovery confirms it is
included in normal CI. Earlier shell sequence did not propagate initial tsc failure; corrected final
commands explicitly gate each exit, then tsc and node --check pass. Initial guessed IRMS_Protocol/
Windows glob searches were corrected to actual artifacts; not product defects.

Actual preserved CRLF trace and temporary LF equivalent both replay after final fix:66927 packets,
66560 angles/vector pairs,367 hardware-error packets,0 malformed/truncated; norm range
0.9992176939986601..1.0008181653027686. Raw vs canonical match modes correctly differ. Calibrated
shin-roll counter remains null; no timestamp/rate/phase/reference/clinical claim inferred. Existing
stationarity analysis not repeated. Temp reports kept outside repo; packets and original hashes unchanged.

Final29 focused subprocess tests, TypeScript, script/test syntax and normal test discovery pass.
No runtime application/native/collector source change, so unrelated full suites/build/native tests
not rerun. Previous641 frontend result is historical; do not add29 and claim a full670 suite passed.
R07 still needs matched calibration/timestamps/labels/reference instruments and actual evaluation.

Both reviewers then confirmed the canonical correction, no scoped blocker. Source-hash assertions
also compare all3 reported hashes to actual file bytes. No raw packet/settings content added to PR.
