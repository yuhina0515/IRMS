# Read-only startup reconciliation evidence plan

Baseline f7cd1d49ab453564c17163507c2bdbd7baa5e137 clean, CI41036086380 SUCCESS.
Initial quota100%/34%. One bounded task, no production replay/UI/IPC/schema/deployment or devices.
Snapshot:C:/Users/Yuhina/AppData/Local/Temp/irms-reconcile-20261030-snapshot.

Goal: test-only native read-only reconciliation inspection over one SQLite transaction. Distinguish
association rejection, matching receipt, conflict, and unseen batch needing explicit decision.
Expose abandoned/ended state without repairing timestamps, writing rows, or authorizing journal
acknowledgement. Extend existing actual browser/native probe; original journal retained for every
inspection. Matching receipt/association does not prove current history after backup restore.

| ID | model | scope | focus |
| --- | --- | --- | --- |
| ENG | inherited | SQLite inspection/status semantics | consistent snapshot and no mutation |
| SEC | inherited | policy and caller use | failclosed identity, backup and privacy limits |

Read-only reviewers: no edits, deploy, commit, other chats, heavy tests. <=200word findings with
file:line, concrete scenario/fix and uncertainty. Lead implements/tests. Done: scoped evidence and
status protocol, reviews/log/HOME/checkpoint, checks, commit/push/update existing draftPR5. No new
production dead-code surface: prototype remains cfg(test) until deletion/restore/startup gates pass.
