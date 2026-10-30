# Cooperating browser-context ownership prototype

Baseline5f74c37 clean, CI41074620172 SUCCESS; initialquota43%/26%, no quota hold. One bounded task.
Snapshot:C:/Users/Yuhina/AppData/Local/Temp/irms-context-lease-20261030-snapshot.
Use same-origin Web Locks exclusive ifAvailable fixed name, no queue/steal. Acquire BEFORE audited
startup; hold for returned owner's lifetime. Busy/unsupported/requestfailure/timeouts failclosed
without owner or reader. Released proxy refuses further work; release refuses pending/uncertain
native activity. Context death releases browser lease, so persistent journal/fence startup check still
mandatory. Not native cross-process/globalDB lock, eviction/restore detector or productionhook.

| ID | model | scope | focus |
| --- | --- | --- | --- |
| ENG | inherited | owner lifetime | audit inside lease, no use after release |
| SEC | inherited | API/deadline/failure | late grant, bypasses and redaction |

Read-only reviewers no edits/deploy/restart/commit/otherchats/heavytests,<=150words findings.
Lead implementation + actual two-target Chrome probe/targeted tests/typecheck/build, preserving69case
artifact. English log/HOME/checkpoint, scopedcommit/push/update draftPR5; no merge/deployment/devices.
