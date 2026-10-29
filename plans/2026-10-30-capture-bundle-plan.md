# R07 self-contained offline receiver evidence bundle v1

Baselinebc3abe5 clean, CI40952113301 SUCCESS; initial quota47%/50%. Snapshot
%TEMP%/irms-capture-bundle-snapshot4 relevant contract/tool/doc files. No existing equivalent found
in scripts/fixtures/measurement docs. One bounded task, no actual capture/device/participant activity.

Define a single bounded UTF-8 JSON envelope with two embedded UTF-8 artifacts (calibration.json and
frames.jsonl content plus SHA256). Fixed artifact labels, no metadata-driven filesystem reads/paths.
This avoids traversal/symlink races and keeps validation offline. Strict schemaVersion1/dataOrigin
synthetic|receiver-declared; clock domain receiver-monotonic-ms; sourceClock/sourceSequence/reference/
labels null explicitly. Producer revision null or40hex is only a declaration, not source attestation.
Calibration identity is verified bytes of a JSON object, not model correctness/session association.

Rows: rxSequence safe nonnegative integer strictly increasing (gaps reported, not source loss proof),
rxMonotonicMs finite nonnegative nondecreasing, channel raw|angle, packet string. Validate raw G with
actual parseRawPacket and angle V packets with actual parseAnglePacket, reject malformed/truncated
or hardware error rows (the v1 receiver sample contract cannot represent those yet). No inferred
sensor acquisition time, synchronous pairing, rate/clinical/ground-truth thresholds. Rows do not claim
independent device samples; receiver gap/duration are declared receiver metadata only.

Bound envelope8MiB with capped read, calibration64KiB, frame line4KiB, rows50000. These are engineering
resource budgets, not measurement limits. Strict object fields/UTF-8 and fixed error categories; no
raw content/private paths/error snippets in output. Report only counts/hash/clock-scope and explicit
origin/calibration/source/reference unverified flags. Preserve UTF-8 bytes (no line normalization),
no automatic raw recording/network. Synthetic fixture clearly marked, producerRevision null.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | format/time/sequence/protocol design and final | available fields, unchanged math, no source-truth inference |
| Security | inherited/backend unknown | bounded input, embedded hashes, strict fields/error redaction | no metadata paths, resource limits/encoding/malformed input |
| Lead | current | new validator/fixture/docs/tests/Git | actual subprocess tests and scoped delivery |

Workers read-only/no edits/deploy/commit/heavytests/network/other chats, <=200word verified findings/
uncertainty. CLI-specific synthetic tests: valid/ties/gaps, tampered embedded content/hash, invalid
fields/time/sequence/protocol/encoding/budgets, redaction. Add to existing scripts Node Vitest discovery;
typecheck/syntax, no unrelated full frontend/native rerun if runtime application unchanged. New log/
HOME/evidence contract/checkpoint, scoped commit/push/draft PR gated on previous CI success. All native
measurement/institution/population acceptance stays open; do not label synthetic example device data.

Final design: JSON depth32 before parse and decoded duplicate-key rejection at each JSON layer; fatal outer UTF-8 and well-formed artifact strings. Budgets are not heap guarantees.40 subprocess tests and TypeScript passed; engineering/security final reviews found no blocker. First test setup used comma-separated G fields, corrected to authoritative slash format; no protocol changes.
