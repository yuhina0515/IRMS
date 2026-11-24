# R07 calibration replay input/source identity

Baseline156ae17 clean, CI40934031768 SUCCESS; initial quota79%/55%. Readiness artifact inventory
found committed20260915 packets/provenance and offline replay. Snapshot %TEMP%/irms-replay-provenance-
snapshot contains5 source/metadata/docs files; large existing packet fixture unchanged, hash verified.
No new participant/device capture, live settings, installer, network or production activity.

Verified existing report only emits aggregate counts; script does not verify manifest hash/count or
identify packet/settings/code/runtime inputs. Existing provenance preserves original66927-packet
CRLF extraction hash; git stores LF and Windows checkout is CRLF. Current checkout matches original
hash. Cross-platform verification needs explicit additional canonical LF hash, preserving original.
No timestamps/movement labels/exact session settings/ground truth survive; do not infer them.

Design: preserve legacy positional invocation and all analysis/math semantics. Always report actual
packet/settings SHA256+byte lengths, script/parser/math source hashes and Node version with versioned
evidence block, without paths/raw settings. Optional --provenance manifest validates required raw
SHA256/count and optional explicit crlf-to-lf-v1 canonical hash. Normalize only CR immediately before
LF at byte level; no trim/reorder/prefix/encoding normalization. Reject malformed metadata, hash/count
mismatch, unknown flags before emitting a successful report. Consistency against caller-provided
manifest is NOT authenticity, original-source verification, calibration association or accuracy.
Add canonical fields to historical sidecar without changing original forensic hashes/trace/claims.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | replay/provenance identity and runtime source closure | cross-OS byte identity, unchanged metrics, meaningful offline regressions |
| Security | inherited/backend unknown | CLI/manifest validation and report metadata | no arbitrary metadata paths/secret values/authenticity overclaim |
| Lead | current | reproduce/implement/verify/docs/Git | current trace audit plus malformed/tampered synthetic subprocess tests |

Workers read-only/no edits/deploy/commit/heavytests/network/other chats, <=200words verified findings
and uncertainty. Tests invoke actual CLI with synthetic temp files: metadata always present, optional
legacy settings, raw/LF equivalent identity, changed packets/count mismatch and invalid fields/options
reject, no raw private metadata/paths printed. Replay existing committed trace with manifest and compare
counts/mode with README, no fake timing/phase/accuracy. Script-specific tests/check syntax; native
and unrelated frontend suites not rerun unless runtime application code changes. New log/index/
evidence README/checkpoint, scoped commit/push/draft PR after previous CI success. R07 remains partial.
