# S01 bounded live-share response bodies

Baseline fd66f2d. Existing local checkpoint-only edit was lead-owned CI status evidence and preserved.
Plan `plans/2026-10-29-share-response-plan.md`; source-only snapshot `%TEMP%/irms-share-response-snapshot`.
Quota recovered to five-hour 100%, weekly 83%; work resumed through the authorized heartbeat. No
credits/resets/credential changes. Before delivery: remaining 97% / 82%; percentages are shared
account quota, not exact task tokens. Lead alone edited/tested/delivered.

Baseline regression: actual native command accepted a chunked body of 65,537 bytes; test failed
the expected-error assertion. Added independent incoming 64 KiB cap: reject excessive declared
length before reading; check remaining budget before appending each received chunk. Apply to
all statuses, including HTTP failures and unknown-length bodies. Do not allocate by remote length.
Retain status, lossy UTF-8 decoding and non-JSON -> null, plus unchanged outbound 32 KiB body
limit, routing, authentication and timeouts. Current collector state is capped at 16K UTF-16 units;
64 KiB permits worst-case UTF-8 expansion plus its envelope. Not a total memory ceiling or complete
JSON/transport-complexity defense. HTTP wire chunks need not match reqwest-delivered chunks.

Independent `/root/security`, inherited model (exact backend ID unavailable), read-only frozen
diff review found no blocker/bypass. Verified cumulative budget arithmetic, all-status enforcement,
current collector compatibility and test scope. Reviewer did not independently execute tests. No
rejected findings; S03 independent run ownership and actual native/deployment acceptance deferred.

Validation: 8 focused live-share tests pass (6 new); includes cumulative chunks, single oversized
error chunk, header-only excessive length, close-delimited overflow, truncation, exact-limit JSON
on 401, multibyte state, invalid/empty JSON and lossy UTF-8. These exercise the actual command over
local loopback, not a copied parser. Full Rust 129 passed / 5 ignored (3 live + 2 manual benchmark);
main/doc targets pass. Cargo fmt and Clippy all-targets/all-features -D warnings pass. Frontend
product code unchanged; last full frontend verification remains 553 tests / 57 files, typecheck/build.
No benchmark rerun needed: R05 JSON remains its recorded historical source baseline.

Docs/spec/cheat-sheet/HOME/threat/checkpoint updated; preserve previous logs. Prior-head remote CI
40813351062 was confirmed success; do not transfer that result to this new head. No production
network requests, collector deployment/restart, firmware upload, private telemetry or participant
testing. Next bounded batch: S03 ownership proof design with source-grounded compatibility plan,
then native performance/locale/accessibility and institution/measurement evidence gates.
