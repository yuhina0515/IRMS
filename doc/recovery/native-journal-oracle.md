# Isolated browser journal with actual Rust/SQLite receipts

The [recorded result](native-journal-probe-20261030.json) covers29 synthetic cases:19 existing
Chrome IndexedDB cases and10 additional native integration cases. The prototype remains unconnected
to production acquisition. No real devices, participant data or application database are used.

The native side is an ignored unit-test helper, compiled only under `cfg(test)`, not an installed
CLI or IPC endpoint. Each operation starts a fresh test process and calls actual `init_database`,
`sessions_repo::start_bound`, `data_repo::append_bound_batch`, or session deletion. Append also uses
the production command's shared reading-budget validator. DB/session binding, receipts and schema12
are unchanged. This does not exercise Tauri command dispatch, state locks or WebView storage.

## Reproduce on Windows

From `IRMS_App_Tauri`, use the normal configured Cargo toolchain and installed Chrome. Build the
library unit-test executable from the current source before invoking the probe:

```powershell
$env:CARGO_BUILD_JOBS='1'
cargo test --manifest-path src-tauri/Cargo.toml --lib --no-run --message-format=json > "$env:TEMP/irms-oracle-build.jsonl"
if ($LASTEXITCODE -ne 0) { throw 'Oracle build failed' }
$artifact=Get-Content "$env:TEMP/irms-oracle-build.jsonl" | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.reason -eq 'compiler-artifact' -and $_.executable -and $_.target.name -eq 'irms_app_tauri_lib' } | Select-Object -Last 1
if (-not $artifact) { throw 'Oracle executable missing' }
node scripts/probe-recovery-journal.mjs 'C:/Program Files/Google/Chrome/Application/chrome.exe' --native-oracle $artifact.executable --output ../doc/recovery/native-journal-probe-20261030.json
if ($LASTEXITCODE -ne 0) { throw 'Probe failed' }
```

Only the exact `recovery_oracle::manual_recovery_oracle` ignored test runs. Do not run all ignored
tests: others require devices or are separate benchmarks. The helper requires a fixed request file
inside a direct child of the OS temporary directory named `irms-journal-probe-*`. Request reads cap
at1MiB, database names are a fixed native/foreign/backup enum, and direct files/SQLite sidecars reject
symlinks (including dangling links). Only explicit init creates a DB; missing-DB append never creates
one. The test fixture explicitly reassigns a newly created session's numeric ID while preserving its
new storage key to test old-binding rejection; production never performs that reassignment.

Node invokes the executable without a shell, captures bounded output, sets30-second timeout, and
requires exactly one structured result marker. Raw native output/errors never enter the public
report. Only an owned browser child tree is force-killed; native helpers exit normally per operation.
The browser profile, request and three databases are temporary, removed before reporting success.
These local test tools are not a sandbox against a hostile process concurrently changing files.

The report records source and executable SHA256 values and runtime versions. Hashes identify tested
bytes, not authenticity or a reproducible-build proof. Source-to-binary association relies on the
fresh-build procedure above; an arbitrary supplied executable could be stale. Preserve historical
reports rather than editing their hashes. The original19-case report is an earlier source snapshot.

## Observations and decisions

| Scenario | Observed result | Decision |
| --- | --- | --- |
| Actual native commit, parent discards acknowledgement, browser forced stop/reopen | Original journal payload/binding survives; fresh native process returns original count,2rows/1receipt | Only full matching success permits journal acknowledgement |
| Native success, journal delete request succeeds then transaction aborts | Original entry survives browser restart; native retry still2rows/1receipt; later complete ack removes entry | Request success is insufficient for deletion |
| Same batch with changed payload | Native conflict; no duplicate rows; journal retained | Never change original payload or batch identity |
| Missing database/session, foreign DB with same numeric ID, deleted or recreated session | Append rejects or reports missing; journal unchanged; deleted rows/receipts cascade | Never create replacement sessions or refresh binding |
| Consistent pre-deletion backup (`VACUUM INTO`), then current DB session deletion | Backup retains same identity and accepts pending batch, even though current DB rejects it | Matching binding cannot authorize restore replay |
| Actual startup before new tail append | Session becomes abandoned with endTime before the synthetic tail | Startup reconciliation remains an explicit blocking gate |

The future2099 synthetic timestamp intentionally exposes stale end-time behavior; it is not a source
clock, physiological measurement, native timestamp correctness claim or treatment threshold. Each
request initializes the DB, so the first append runs after orphan finalization. Accepted new tail
rows do not automatically repair the abandoned session's already recorded endTime.

Conservative integration policy: keep acquisition/start gated while a journal needs reconciliation;
retain original entries on any uncertain append or association. Never auto-resume an exercise, call
an interrupted tail complete, erase corrupt queues, recreate missing sessions or bind to another DB.
User-intended deletion and backup restoration must coordinate both stores with an explicit durable
policy/generation or tombstone design before production replay. This document establishes that gate;
the prototype does not implement it. A cloned identity is neither authentication nor current-history
proof. Even an existing receipt in an older backup cannot establish global deletion intent.

Next bounded software task: design and test startup reconciliation plus an explicit recovery status,
including abandoned end-time handling and cross-store deletion/restore decisions, before any
acquisition hookup. Separate later software gates remain actual Tauri WebView persistence, storage
quota/eviction, and native process-interruption timing. This probe proves neither power-loss nor all
precommit kill points, metrology, clinical efficacy or universal institutional/population readiness.
