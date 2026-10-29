# Measurement evidence inventory and replay boundaries

Scoped inventory2026-10-30, baseline156ae17. This inspects existing repository artifacts only;
no device capture, participant operation or original external trace retrieval occurred.

| Artifact inspected | What is available | What it establishes | Missing evidence |
| --- | --- | --- | --- |
| [20260915 trace](calibration-evidence/20260915/README.md) and sidecar | 66,927 ordered packets, original extracted-byte hash, explicit LF-canonical hash, packet count | Reproducible raw packet audit against supplied sidecar; 66,560 vector pairs, 367 error packets, no malformed/truncated packets on this trace | Timestamps, movement labels, exact matching zero/hinge settings, original temporary source verification and reference angles |
| `IRMS_App_Tauri/fixtures/angle-packets.json` and `vector-packets.json` | Parser boundary examples, including malformed/truncated/vector cases | Protocol parsing expectations | Physical measurement accuracy, sensor synchronization, anatomical reference or population validity |
| [Offline readiness benchmark](performance/README.md) | Seeded synthetic workloads, source/fixture hashes and scoped software measurements | Reproducible software workload evidence within documented debug/offline scope | Actual paced native UI/IPC/device/network/memory and metrology/fit acceptance |

## Replay report contract

`scripts/replay-calibration.mjs packets.txt [settings.json] [--provenance manifest.json]` reads each
input once for both hashing and analysis. Existing counts and unsmoothed hinge math remain unchanged.
The additive `evidence.schemaVersion=1` includes actual packet/settings byte identity, optional
manifest identity/match mode, hashes for the script and its two runtime sources, and Node version.
No private path or raw settings are printed. Fixed error categories replace input paths/JSON snippets
on failure; no successful report is emitted if requested manifest verification fails.

A manifest must provide a64-hex `packetsSha256` and nonnegative safe-integer `packetCount`.
Optional canonical fields must jointly specify `packetsCanonicalization=crlf-to-lf-v1` and a64-hex
`packetsCanonicalLfSha256`. Only `0D 0A` becomes `0A`; all other bytes, order and final newline matter.
Provided canonical identity must match even when raw identity matches. Legacy raw-only metadata
requires byte-exact matching. `packetMatch` names the actually verified mode; `originalSourceVerified`
is false. Consistency with caller-controlled metadata is not authenticity or proof of original data.

Settings byte identity is reported even with a UTF-8 BOM; parsing preserves prior BOM handling and
finite/nonzero vector checks. Settings association remains unverified. Without settings the existing
calibrated metric fields remain null; current live settings are never substituted automatically.
The tool reports the current unsmoothed projection only, not the complete app/calibration pipeline.

## Remaining measurement gate

Obtain timestamped synchronized raw streams and a matched versioned calibration snapshot, label
known bench motions, record reference instrument/procedure and coordinate frames, then evaluate
repeated placement and uncertainty before changing model claims. Decide numerical evaluation limits
from the actual reference/intended range; no demographic-derived treatment thresholds or invented
ground truth. Existing packets cannot recover missing timestamps, labels or exact calibration.
Anatomical angle, clinical validity, fit/usability and institutional approval remain unproven.
