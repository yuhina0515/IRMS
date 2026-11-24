# R05 reproducible performance and threat-model batch

Goal: measure accelerated production metric/engine, file-backed database and offline telemetry paths; document actual trust boundaries, controls and unverified security/performance gates.

Baseline: b3012f0, clean worktree. Snapshot: `%TEMP%/irms-readiness-r05-snapshot`. No credentials, dependencies, private data or production probes. Synthetic fixture only. Lead alone edits, tests, commits and pushes. Existing quota policy applies (stop new expensive work at <=20%; resume at >=30% in every known window).

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Security | Inherited, backend ID unavailable | collector/share, native live-share, module/firmware and capabilities | Source-grounded controls and highest-priority trust-boundary gaps |
| Engineering | Inherited, backend ID unavailable | new benchmark harness and native benchmark tests after implementation | Workload validity, timing boundaries, reproducibility and unsupported claims |
| Lead | Current session | implementation, threat model, evidence and delivery | Verify reviewer claims and preserve research/native acceptance limits |

Workers are read-only. Reports <=300 words: file:line, BUG/RISK/NIT, concrete scenario, fix and uncertainty. Initial source snapshot precedes review; new harness is reviewed at an explicitly identified live diff with lead edits frozen.

Done criteria: reproducible commands and safe environment/source metadata; warmup and repeated timing distributions; explicit correctness/bounds assertions; actual recorded JSON artifact; distinguish accelerated logic/debug native work from end-to-end paced UI/hardware measurements. Publish data-flow/trust-boundary model and prioritized remaining acceptance, review/test outcomes in a new coding log and HOME. Keep R05 open for unmeasured native UI/network/device behavior; no universal university, clinical, country or population approval.
