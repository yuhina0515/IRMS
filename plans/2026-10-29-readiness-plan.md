# IRMS inclusive research readiness and autonomous delivery

## Goal and constraints
Advance verified engineering readiness for university evaluation and diverse users. Do not claim universal university admission, clinical efficacy, demographic validity, legal compliance, or support for every language. No demographic-derived treatment thresholds. Local educational/demo scope remains authoritative.

The user authorizes squad review, implementation, scoped Git delivery, ongoing meetings and scheduled continuation, with optional use of hina-tw.ddns.net and Antigravity. External service changes must follow verified deployment instructions and backups. Do not send messages to people. Preserve unrelated work and secrets. Workers are read-only; only the lead edits.

## Known facts and baseline
- The initial checkout targets IRMS-archive and has pre-existing Cargo.toml/.claude log changes; left untouched.
- Active repository: https://github.com/yuhina0515/IRMS. This worktree starts at 6c6241765f6ba33a46ff0018143616bffa675875 (draft PR #4, itself above draft PR #3). Deliver as a stacked draft PR against codex/irms-progress-20261020; do not merge other PRs.
- Worktree: E:/Monitoring-and-IoT/IRMS-wt/readiness-20261029. No initial differences. Separate older worktree has uncommitted architecture notes; not imported.
- Read-only code snapshot: C:/Users/Yuhina/AppData/Local/Temp/irms-readiness-20261029-snapshot (173 selected tracked source/config/document files; no .env, secrets, dependencies, binary assets, generated output).
- Usage snapshot: both five-hour and weekly remaining 95%; no reset credit. Percentage is account quota, not token count.

## Team
| ID | model | scope | focus |
| --- | --- | --- | --- |
| SEC | inherited | IRMS_Telemetry; Rust telemetry/modules/firmware/export IPC | privacy, trust boundaries, bounded inputs |
| ENG | inherited | frontend services except voice; Rust database/BLE | lifecycle, measurement integrity, performance |
| INC | inherited | i18n, voice, views/components, README/documentation | locale/accessibility defects, evidence needed for diverse users and university review |

Workers independently inspect their disjoint scope and self-select relevant escalation. Reports <=400 words, `file:line | BUG/RISK/NIT | issue | failing scenario | fix`; verified findings only, explicit uncertainty, snapshot line numbers. No edits/deploys/restarts/commits/other-chat messages. Lead reproduces findings and records accept/reject/defer decisions in the coding log.

## Execution and done criteria
1. Independent audit, then lead triage meeting recorded as decisions with evidence.
2. Implement bounded confirmed defects with meaningful regression coverage, document unresolved evidence gates and a prioritized backlog.
3. Frontend typecheck/tests/build; Rust checks when Rust changes. Distinguish environment failures from product defects; no hardware claims.
4. Publish scoped commit and stacked draft PR, handoff log and HOME entry; preserve user changes.
5. Save checkpoint and configure a heartbeat in this chat. Each run reads checkpoint first, checks quota, performs at most one bounded task, records validation and next step. Stop expensive work when any known remaining quota <=20%; resume only when all known windows >=30%. Unknown quota allows status inspection only. No paid credits/resets or alternate credentials. At most 3 reviewers; reuse findings rather than repeated broad scans. Inform only meaningful progress/failure/user decisions; otherwise quiet.
6. Subsequent batches address university-specific rubrics only from primary sources and mark applicability by institution, program and date. Human studies, minors, clinical claims and country-specific requirements need verified evidence and appropriate institutional review before acceptance claims.

## Software-only continuation (2026-10-30 user clarification)

No physical devices in this session. External measurement/institution evidence gates do not block
independent software reliability/accessibility/privacy work. Prior external-only idle interpretation
was too broad. Priority: batch retry deduplication, then durable unsent queue/restart reconciliation,
then remaining software-only accessibility/privacy journeys and reproducible academic artifacts.
Each remains a bounded independently reviewed/tested batch. See2026-10-30-idempotent-append-plan.md.
No demographic thresholds or universal acceptance claim. Physical acceptance remains unverified.
