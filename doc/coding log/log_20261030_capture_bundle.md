# R07 offline receiver sample bundle v1

Plan: `plans/2026-10-30-capture-bundle-plan.md`. Baselinebc3abe5, clean;
previous CI40952113301 SUCCESS confirmed before delivery. Initial quota47%/50%; latest35%/49%
remaining. One bounded task; no unrelated tracked changes or archive paths touched.

Implemented one self-contained envelope with embedded calibration JSON/frames JSONL and exact
UTF-8 hashes. Strict schema, receiver sequence/time, actual protocol parsing with complete V vectors,
duplicate keys/encoding/depth and byte/row budgets. Output includes validator/protocol source hashes,
runtime and explicit unverified/missing evidence flags. Added English contract and clearly synthetic
fixture. No app acquisition/export/UI/math, dependencies, Rust/firmware/collector changes.

Meeting: engineering and security independently reviewed design then final source, read-only,
inherited models/backend unknown. Accepted design findings: complete vectors beyond legacy parser
success; receiver ties/global sequence; exact bytes; source hashes; depth budget and lone surrogate
rejection. Both final reviews no blocker. Input limits are not heap bounds; recomputed hashes cannot
authenticate a producer. No UI change requiring additional inclusion review. No demographic criteria.

Verification:40 CLI subprocess tests passed (50000 accepted/50001 rejected,8MiB input,64KiB calibration,
4096-byte row,depth,duplicate keys,UTF-8/surrogates,tamper,redaction,time/sequence/protocol). First run
32passed/8failed due to comma-delimited synthetic G setup and a negative-sequence expectation;
corrected fixture to authoritative slash parser and separate monotonic case, final40passed.
TypeScript noEmit, validator syntax, normal Vitest discovery and committed synthetic fixture execution
passed. Fixture2records,1raw/1angle,0gaps,duration0. Last full frontend suite remains680/69 files from
baseline; not rerun or inflated into a new aggregate claim. No native/hardware tests or deployment.

Limitations: v1 valid samples cannot preserve error/disconnect/malformed events; no lossless capture
claim. Placeholder calibration is unvalidated. Receiver declarations do not prove acquisition timing,
source sequence, calibration association, sensor sync, reference metrology or physical validity.
No actual recorder added. Hardware/native AT/installer/timing and institution-specific evaluation
remain open. Next consume new evidence without repeating whole audits; inspect new head CI before
further delivery. Missing metrology/device/participant evidence cannot be synthesized from hashes.
