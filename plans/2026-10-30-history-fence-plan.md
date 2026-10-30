# History-change fence policy and evidence plan

Baseline8c7811f clean, CI41043282152 SUCCESS; initial quota89%/33% remaining.
Snapshot:C:/Users/Yuhina/AppData/Local/Temp/irms-history-fence-20261030-snapshot.
One bounded isolated software task: durable history-change intent before delete/restore.
No production acquisition/UI/native schema/IPC/deployment or real device/participant operations.

Decision candidates: A per-session tombstones need retention/capacity/backup lifecycle; B singleton
unresolved history-change fence blocks enqueue/ack globally, preserves existing queue, exposes pending
intent and has no automatic clear. Propose B as conservative bounded prerequisite, not completed
recovery UX. A history mutation may execute only after strict IDB transaction completes. Native
failure/ambiguous reply/backup match never clears intent; observation cannot authorize replay.
No claim that a local marker detects uncoordinated external replacement or rollback of both stores.

| ID | model | scope | focus |
| --- | --- | --- | --- |
| ENG | inherited | shipping/operation lens | bounded singleton vs retained tombstones |
| SEC | inherited | alternative/risk lens | interruption/restore/corruption limits |

Read-only workers, no edits/deploy/restart/commit/other chats/heavytests. Definite position<=180words,
3source-backed arguments/scenario and weakest point; cross-critique once then chair decision.
Lead implements only accepted bounded prototype, real Chrome/native probes, typecheck/relevant tests,
English minutes/log+HOME/checkpoint and scoped commit/push/draftPR5. Never merge. No full repo rescan.
