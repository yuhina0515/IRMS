# IRMS beta.25 progress audit

## Goal and constraints
Verify outstanding beta.25 mobility measurement and session lifecycle defects, fix confirmed issues, and deliver an independently reviewed PR. Do not enable unified calibration, change calibration formulas requiring bench evidence, release, deploy, or access devices. Preserve other checkouts and their local changes. Workers are read-only; the lead alone edits.

## Baseline
- Public repository: yuhina0515/IRMS; beta.25 draft PR #3 targets main.
- Baseline: cd4fd6696832de210c483dd0fcf4aa1ebbbd2b0b, clean task worktree.
- Worktree: E:/Monitoring-and-IoT/IRMS-wt/squad-20261020.
- Snapshot: C:/Users/Yuhina/AppData/Local/Temp/irms-squad-20261020-cd4fd66 (tracked source, fixtures and selected config only; no credentials or dependencies).
- Earlier calibration findings are unverified claims. Unified calibration awaits real-device bench data and stays outside this task.

## Team
| ID | model | scope | focus |
|---|---|---|---|
| W1 | inherited | services/mobilityC.ts and its tests | timing, stable holds, correctness of capture lifecycle |
| W2 | inherited | MobilityWizard, MobilityTrend and related views | capture transitions, persistence, truthful UI behavior |
| W3 | inherited | services/sessionController.ts, voice.ts and tests | stale asynchronous work, speech cleanup, session boundaries |

## Report format
At most 400 words: snapshot file:line | BUG/RISK/NIT | issue | concrete failing scenario | proposed fix. Verify claims, state uncertainty, and do not edit, deploy, restart, commit, or message other chats.

## Done criteria
Reproduce accepted findings on current source; fix confirmed bugs and inexpensive risks with meaningful regression tests. Record false positives and deferrals. Run relevant tests and full frontend/Rust CI when tooling permits; clearly separate environment failures from product failures. Obtain independent read-only review of the final diff. Write an English Obsidian coding log and HOME index entry, commit only task files, push, and open a draft PR based on the beta.25 branch. No merging or releases. Native/client/hardware acceptance remains unverified.
