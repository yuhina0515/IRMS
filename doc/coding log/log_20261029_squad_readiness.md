---
tags: [irms, squad, security, accessibility, research, automation]
date: 2026-10-29
summary: "Bounded telemetry resources and collector generations, fixed Settings labels and toast announcement semantics, documented university/inclusion evidence gates, and enabled hourly quota-aware continuation."
---

# Squad readiness batch

Delivery: implementation commit `1aec6a6`, pushed as draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5) against `codex/irms-progress-20261020`. PR attached to this chat. Remote CI is separate from the passing local checks; inspect its live status before the next batch. No merge or release.

## Scope and baseline
User authorized autonomous squad progress, departmental intervention/meetings, university/international inclusion goals, security/performance work, optional Hina host/Antigravity and quota-aware stop/resume. Plan: `plans/2026-10-29-readiness-plan.md`. Resume: `plans/2026-10-29-readiness-checkpoint.md`.

Initial cwd targets `IRMS-archive` at a9df227, with pre-existing Cargo.toml and .claude/log changes. Active repository was verified with local Git remotes plus `gh repo view`; new isolated worktree `E:/Monitoring-and-IoT/IRMS-wt/readiness-20261029` starts at 6c62417 on `codex/irms-readiness-20261029`. The prior squad checkout has uncommitted architecture notes/HOME changes; neither checkout was edited. This delivery stacks on draft PR #4, which stacks on draft #3; no merging or release.

Snapshot: `C:/Users/Yuhina/AppData/Local/Temp/irms-readiness-20261029-snapshot`, initially 173 tracked source/document files, later supplemented with collector mjs and Tauri capability/config files. Secrets, .env, binary assets, dependencies and generated output excluded. Baseline differences: none in the new worktree.

## Team and recorded triage meeting
Actual workers: `/root/security`, `/root/engineering`, `/root/inclusion`; each inherited the current model, with no model override (exact backend identifier not exposed). All were read-only, given disjoint scopes and <=400-word reports. Lead alone edited and ran checks. Security worker then performed a focused read-only post-fix review and found no new regression. No Antigravity agent launched: command absent on PATH.

| Finding | Decision | Evidence/reason |
| --- | --- | --- |
| SEC telemetry queue and batch memory amplification | Accept/fix | 200,000 accepted 64 KiB data events could approach 12.2 GiB serialized data alone, plus batch clones. Add 8 MiB queue / 512 KiB batch wire budgets and reduce count ceiling to 20,000; native sources share validation. These budgets are not an exact process-heap ceiling. |
| SEC collector switch retains old pending data | Accept/fix | Existing configuration overwrote endpoint while leaving queued events. Clear/count drops on destination or enabled-state changes; generation-gate completion. Same configuration preserves queue. Already-issued requests may still reach old collector. |
| SEC full-buffer downloads before validation | Accept/defer R02 | Shared downloader buffers before signed artifact size validation. Separate bounded streaming change requires chunked-response tests; no signing-contract rewrite in this batch. |
| ENG stalled hold completes from silence | Accept/defer R01, next | Code inspection confirms only out-of-zone grace rejects gaps; two in-zone samples 3 seconds apart can satisfy a 1-second hold. Fix needs explicit continuity policy and continuous timing fixtures; not claimed fixed. |
| ENG stale BLE listener notifications | Accept risk/defer R04 | Generation check occurs after stream completion, not before each notification; actual buffered delivery ordering requires native reproduction. |
| INC unnamed Settings number fields | Accept/fix | Sibling labels had no association. useId/htmlFor gives distinct accessible names and clickable labels. |
| INC unannounced toasts | Accept/fix | Add persistent polite status and urgent error regions; maintain visual notification layout. Test DOM updates; native announcements remain unverified. |
| INC modal focus escape/restoration | Accept/defer R03 | Existing dialog focuses Cancel but does not contain/restore focus. Requires background-interaction and keyboard regression coverage. |
| University/population universality | Reject as unsupported claim | No actual target rubric, representative study or country-specific approval evidence. Add a sourced, dated matrix and honest gates rather than invented compliance. |

Decision: ship the smallest independently verifiable privacy/resource and accessibility batch; preserve measurement contracts and schedule timing/download/focus follow-up in explicit order. No demographic-derived treatment rules or mandatory demographic profile fields added. No unproductive meeting loop.

## Changes and verification
Updated telemetry queue accounting on enqueue/evict/clear/success/permanent rejection, bounded batch before cloning, and isolated configuration generations. Regression checks cover oversized native data, many legal large events, collector switches, stale success/error completion, identical settings and disabling. Settings tests verify named spinbuttons and label-click focus; toast test verifies stable live regions and error routing.

- Dependencies: `npm.cmd ci --ignore-scripts --no-audit --no-fund` succeeded.
- TypeScript passed via direct Node invocation. Focused frontend run: 14 tests passed. Full frontend: 56 files / 533 tests passed. Vite production build passed.
- Cargo fmt check passed; telemetry focused run 9 passed / 1 live ignored. Full Rust: 104 passed / 3 live ignored; main/doc tests passed; Clippy all-targets/all-features `-D warnings` passed. Jobs=1, reused existing generated Cargo cache; exact commands in checkpoint.
- `git diff --check` passed again after documentation additions, before commit.
- Existing Vite warnings: large Leg3D chunk and statically imported ToolsView limiting split. No performance acceptance inferred.
- Collector `GET https://hina-tw.ddns.net/irms-api/v1/health` returned HTTP 200 / `{"ok":true}`. No sensitive telemetry read, host scan, upload, deployment or restart.

## Tool failures and corrected claims
- First heartbeat call failed validation because it omitted destination/thread targeting; retry with `destination=thread` created automation `irms-squad`, ACTIVE, hourly. View call succeeded.
- npm script wrappers reported `"node" is not recognized` despite working Node v24.22.1. Process-local PATHEXT adjustment did not help. Direct Node calls to tsc/Vitest/Vite passed; do not label wrapper failure a code defect or claim literal `npm run ci` passed.
- Initial snapshot filter omitted collector mjs files; supplemented after the security review reported the limitation. First audit's collector claims remain limited; lead verified local 4 MiB request cap and health only, not server authorization/retention in production.
- Account quota remaining changed from 95%/95% to 82%/93% (five-hour/weekly). No exact token count or savings measured; no reset/credits consumed.

## Continuation and acceptance
Automation `irms-squad` checks live quota before each bounded task, stops expensive work at <=20% in any known window, resumes when all known windows >=30%, and does status-only work when unknown. Reports only meaningful changes; unchanged quota/hardware waits stay quiet. Quota checks are cooperative boundaries, not per-token enforcement. Local scheduled work needs the computer and app available; see [official scheduled-task documentation](https://learn.chatgpt.com/docs/automations?surface=app).

Official UW/Edinburgh course mappings and W3C label guidance were fetched and read; links/scope in `doc/RESEARCH_READINESS.md`. Neither those examples nor automated tests establish acceptance by every institution/country/population. Native screen-reader/keyboard, BLE/OTA, real sensor accuracy/repeated placement, English terminology and demographic usability evidence remain open. Human studies and medical claims are not performed or approved by this engineering work.
