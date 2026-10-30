# Offline receiver sample bundle v1

Run from `IRMS_App_Tauri` using Node24:

```sh
node scripts/validate-receiver-bundle.mjs fixtures/receiver-bundle-v1.synthetic.json
```

This CLI checks one explicitly supplied regular file. It performs no collection, calibration,
network access or metadata-driven file reads. The committed example is synthetic, with an
unvalidated placeholder calibration object. No real device or participant data was captured.

The UTF-8 JSON envelope has exactly these fields:

| Field | Contract |
| --- | --- |
| schemaVersion | 1 |
| dataOrigin | `synthetic` or `receiver-declared`; caller declaration, never authenticated |
| receiverClock | `receiver-monotonic-ms`; declared receiver clock, not source acquisition time |
| sourceClock, sourceSequence, reference, labels | All explicitly null in v1 |
| producerRevision | null or 40 hexadecimal characters; unverified producer declaration |
| artifacts | Exactly `calibration.json` and `frames.jsonl`, embedded content, never paths |

Each artifact has `utf8` (a well-formed Unicode string) and `sha256` (64 hex characters).
The frames artifact additionally has `count` (safe nonnegative integer, at most50000).
SHA256 is computed from the embedded string encoded as UTF-8, preserving whitespace/newlines.
It is not computed by parsing and reserializing the JSON. Uppercase digests are accepted.
Outer file bytes have their own hash; reformatting the envelope changes that hash without
necessarily changing artifact hashes. Recomputed hashes prove no authenticity or custody.

Calibration content must parse as a JSON object. The validator does not validate its calibration
model, units, application settings schema, fitness or association with frames/session. An initial
calibration BOM is accepted but included in its hash. Outer UTF-8 BOM is accepted and hashed too.

Frames are JSONL with exactly `rxSequence`, `rxMonotonicMs`, `channel`, `packet` in each row.
One final newline and CRLF are accepted; blank rows are rejected. Sequence is a safe nonnegative
integer strictly increasing across both channels. Gaps count missing receiver numbers, never
device packet loss. Time is finite nonnegative and nondecreasing; ties are valid. Duration is
last minus first receiver time, null for no records and zero for one record. No sample rate,
physical synchronization, age, independence or temporal coverage is certified.

Channel `raw` requires the current application's twelve finite slash-separated G fields, interpreted
by `parseRawPacket`. Channel `angle` requires `parseAnglePacket` success, no detected truncation and
both V acceleration vectors. Parser acceptance is not physical range/unit/firmware verification.
This v1 is a valid-sample container: it rejects hardware errors, malformed samples and missing V.
It cannot represent a lossless event log, disconnections or all excluded notifications. A future
capture tool must preserve those events separately or define a reviewed versioned extension;
silently dropping them cannot establish complete capture. Existing app acquisition is unchanged.

Input budgets:8MiB envelope,64KiB calibration content,4096UTF-8 bytes per frame line,50000 rows,
JSON nesting depth32. These are engineering input budgets, not heap/latency guarantees or accuracy
thresholds. JSON duplicate keys (including escaped spellings), unknown schema fields, invalid
UTF-8 and lone surrogate artifact text reject. Error output uses fixed categories without input
paths/content. Successful output includes counts/hashes, Node version and validator/protocol source
hashes, with origin/producer revision/source clock/calibration association/model explicitly unverified
and source sequence/reference/labels unavailable. No demographic or treatment threshold is inferred.

Verification covers synthetic subprocess inputs only. Actual receiver capture/export, timestamp
origin, matched calibration, synchronization, reference instrument/labels, metrology, native hardware
and institution-specific assessment remain external evidence gates. See [inventory](MEASUREMENT_EVIDENCE.md).
