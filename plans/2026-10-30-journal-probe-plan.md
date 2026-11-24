# R05 isolated pre-IPC journal evidence prototype

Baseline8ff7662 clean, CI41022604955 SUCCESS. Initial quota90%/41%. Snapshot
%TEMP%/irms-journal-probe-snapshot contains current identity/retry contracts and tsconfig.
No device/hardware/participants/production service/profile use. One bounded task, lead owns edits.

Implement an UNCONNECTED typed IndexedDB prototype and reproducible local Chrome probe. Chrome
C:/Program Files/Google/Chrome/Application/chrome.exe156.0.8078.79 verified. Launch headless with a
new task-specific temporary profile, loopback-only HTTP source, no default profile/account. No new
dependency/download. Existing TypeScript transpiles the isolated module for the browser. Production
acquisition does not import it. Headless browser protocol is test infrastructure, not desktop UI work.

Protocol: persist original native storageIdentity/sessionId/batchId/readings before native append;
fixed batch boundary, canonical payload, sameidentity+changedpayload conflict, enqueue success only
at IDB transaction complete. Serial ordered queue, only full count of oldest batch may acknowledge;
unknown/wrong/out-of-order acknowledgement retains data. Bounds2000rows/128batches/512KiB canonical
payload bytes, each batch1..1000 and timestamp128UTF8, six finite fields. Strict transaction durability
requested. Audit bounded store/counters on each operation, fail closed on corruption, no silent purge.
No await inside active transaction callbacks. Queue and counters update atomically. No raw data or
profile/private paths in reports/errors. No whole-heap/disk/power-loss guarantee.

Probe actual IDB with synthetic data: reopen/process interruption after journal commit, repeat/lost
ack simulation, conflict, partial/out-of-order ack, concurrent capacity, transaction abort, corrupt
counters/record, row/byte/batch bounds and invalid payloads. Native sink may be a clearly labelled
simulated acknowledgement only; actual Rust/IPC drain, WebView origin/persistence and double-store
deletion/restore reconciliation remain subsequent gates. Do not create missing native sessions or
automatically resume exercises. Same-lineage backup identity ambiguity remains unresolved.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | inherited/backend unknown | IDB transaction/order/capacity design and final | commit point, concurrency, interrupted browser evidence |
| Security | inherited/backend unknown | isolation/bounds/corruption/claims | no sensitive real store, fixed errors, profile cleanup |
| Lead | current | typed prototype/probe/docs/Git | actual browser result and exact source/runtime hashes |

Workers read-only/no edits/deploy/commit/network/heavytests/other chats; <=250words exact source
locations and uncertainties. Read primary IndexedDB editor draft29Oct2026 transaction lifecycle;
cite as draft, not conformance. https://w3c.github.io/IndexedDB/ . Verification: probe/syntax/typecheck,
normal test discovery; app runtime unchanged so no unrelated full frontend/native rerun unless
failures justify it. Scoped docs/log/HOME/checkpoint and commit/push/draft PR after review and checks.
Stop expensive work <=20% any known quota; unknown status-only, resume all>=30%; no reset/purchase.

Design/final reviews accepted atomic cursor audit/write, fixed IDs and exact oldest ack. Added meta
row-count audit. Security found incomplete CLI error boundary, corrected by outer wrapper covering
setup/finally/output;3actual filesystem-error subprocess tests and manual fullCLI checks passed,
reviewer confirmed. Initial probe startup expression used top-level await; changed to async IIFE.
Initial TS narrowing corrected with declared never-returning fail function. New newline-input probe
expression corrected to String.fromCharCode(10); no durability claim based on setup failures.

Confirmed nearby adapter regex `$` accepted an extra final newline. Added explicit65-length guard
and regression; prototype identity/batch use exact65/36 lengths. This production guard warrants full
frontend/typecheck/build; native unchanged. Final browser19cases passed, source/runtime-hashed JSON
committed with cleanup and explicit nativeSink=simulated. Final full736/736frontend cases71files,TypeScript/Vite passed; browser19cases reported separately.
Final stats typing followed by fresh19browser probe and typecheck. Latestquota69%/38%. Native unchanged.
