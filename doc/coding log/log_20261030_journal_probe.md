# R05 isolated pre-IPC journal evidence prototype

Plan: plans/2026-10-30-journal-probe-plan.md. Baseline8ff7662 clean, CI41022604955 SUCCESS.
Quota initial90%/41%, latest69%/38% remaining. Snapshot %TEMP%/irms-journal-probe-snapshot contains
current identity/retry contracts and tsconfig. No devices/participants/production service or profile.

Lead implemented typed unconnected IndexedDB prototype and manual Chrome probe using existing
TypeScript, Node built-in HTTP/WebSocket and installed Chrome156.0.8078.79. New temporary profile,
loopback-only test server/CDP, no default/user profile. Original fixed native binding/batch payload
preserved; canonical copies before transaction, exact rows/fields/lengths,2000rows/128batches/512KiB
payload capacity. Every operation audits cursor records and exactly-one metadata counter row;
writers audit/check/change atomically, no await inside transaction callbacks. Enqueue publishes only
on transaction complete. Only oldest original session/binding/batch/fullcount acknowledgement deletes.
Corruption rejects without erasure. Prototype not imported by production acquisition.

Meeting: engineering/security read-only, inherited model/backend unknown, design then final review.
Accepted transaction-scope/callback/order/claim limits and forced kill after commit barrier. Both
final core reviews no blocker. Security identified missing CLI outer-error boundary: setup stat,
finally cleanup or output write could print private paths. Corrected with outer wrapper including
dynamic TypeScript import, cleanup and output;3subprocess filesystem setup/output/cleanup errors
assert fixed stderr/nonzero/empty stdout. Actual fullCLI missing-executable and output-directory
failures verified too; reviewer confirmed correction. Report printed only after cleanup/output success.

Nearby confirmed bug: JS regex `$` permits a final newline; existing adapter accepted66-character
binding that native would reject. Added explicit65-length guard plus regression. Prototype likewise
checks exact65/36 lengths. This runtime guard justified full frontend verification beyond manual probe.
No schema/Rust/collector changes. No UI/locale change requiring inclusion review; no demographic rules.

Setup corrections: initial TypeScript control-flow narrowing required a declared never-returning fail
function. Initial CDP startup expression used unsupported top-level await, corrected to async IIFE.
A new newline test expression accidentally contained a literal line break; corrected with
String.fromCharCode(10). These setup failures are not storage failures and produced no success claim.

Final verification:
-19actual Chrome IDB cases passed, including transaction-complete->owned PID-tree force kill->same
  profile/origin restart, samebatch retention/simulated lost ack; concurrent row/batch/byte bounds;
  wrong owner/binding/key/order/count acknowledgements; abort after request success; immutable input;
  malformed payload, corrupt record/counters and unexpected metadata without erasure.
- Final source/runtime-hashed doc/recovery/journal-probe-20261030.json records Node24.22.1,
  TypeScript5.9.3, Chrome156.0.8078.79/Win32, strict durability hint observed, synthetic-only sink and
  successful owned browser/temp profile/server cleanup. Later stats return type annotation followed
  by a fresh19case probe and typecheck, no runtime change after final evidence.
- Full736/736frontend cases across71files, TypeScript noEmit and Vite build passed. Includes3normal
  CLI error-boundary cases and1additional adapter regression. Chrome19cases separate, not counted in
  Vitest total. Known ErrorBoundary test traces/ToolsView and chunk warnings remain. Normal CI does
  not require a browser; no browser launched by the3subprocess unit cases.
- Native unchanged: last full161passed/6ignored at baseline; no unrelated native/collector reruns.
- Primary source: W3C IndexedDB editor draft29Oct2026, transaction lifecycle/scheduling/durability
  sections read30Oct. Cited as work-in-progress, not conformance or power-loss certification.

Limits: actual browser IDB plus SIMULATED native acknowledgement map, not actual Rust/IPC drain.
No Tauri WebView persistence, power loss, every precommit kill point, eviction/quota exhaustion,
double-store deletion, backup/restore generation, startup gate or production unsent recovery proof.
Source hashes identify tested working bytes, not authenticity. Queue payload bounds are not a heap/
full database disk bound. No real sensitive data store activated or native sessions created/replayed.

Next bounded task: isolated actual Rust/SQLite receipt oracle plus browser journal, preserving binding
and immutable payloads. Verify native commit/lost reply/journal-delete interruption, foreign/missing/
deleted session and restore ambiguity; decide fail-closed outcomes before startup/acquisition hookup.
Never recreate missing sessions, refresh binding, resume exercises or label interrupted tails complete.
Scoped commit/push/draft PR after prior CI success; inspect new head CI next. Broad goal remains open.
