# Isolated history transition owner plan

Baseline f2ad909 clean, priorCI41050986613 SUCCESS; initialremaining76%/31%.
Snapshot:C:/Users/Yuhina/AppData/Local/Temp/irms-history-transition-20261030-snapshot.
One bounded software-only task: unconnected history-transition gate, controlled promise tests.
No production acquisition/IPC/UI/schema/deployment or hardware. Existing53browser/native artifact
remains historical and is not upgraded to a native cancellation claim.

Gate tracks at most one submitted append synchronously before callback. Full expected count only
settles successfully. History transition reserves owner before await, blocks new append/transition,
waits active append acknowledgement with bounded deadline, then persists fence, then requests native
mutation. Any append throw/reject/short reply, timeout, fence or mutation uncertainty causes sticky
hold; late resolution never releases. Even successful history change remains held pending future
resolution policy. No reset/unlock/cancel-native API. Must ultimately own ALL relevant native work.

| ID | model | scope | focus |
| --- | --- | --- | --- |
| ENG | inherited | async ordering/reentrancy | submitted work and late settlement |
| SEC | inherited | failure/timeout trust | fixed errors, sticky uncertainty |

Read-only workers no edits/deploy/restart/commit/otherchats/heavytests. <=180words concrete findings.
Lead implements/tests, English log/HOME/checkpoint, scoped commit/push/update existing draftPR5.
Done: controlled pending/rejected/short/late/hung/reentrant ordering; typecheck/build; documented
simulation limits, source import check. No universal school/population or complete recovery claim.
