# S01 bounded live-share responses

Baseline fd66f2d. Existing local checkpoint edit records CI success and is lead-owned; preserve and
include it. Quota recovered to five-hour 100%, weekly 83%; hold released. Snapshot:
`%TEMP%/irms-share-response-snapshot` (live_share.rs and collector share.mjs only, no secrets).

Goal: bound every incoming live-share body before appending, including non-2xx responses, unknown
length and cumulative chunks. Preserve HTTP status + JSON body/null contract, outbound body/method/
path/token/timeout behavior and long-poll compatibility. No production calls/deployment or API format
change. A byte cap is not an exact heap ceiling or protection against every JSON complexity attack.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Lead | Current | Native bridge implementation/local HTTP tests | Failing-before regression, bounded read, exact-limit/error/truncation compatibility |
| Security | Inherited, backend ID unavailable | Frozen final live_share.rs diff | Read-only size-cap bypasses, status preservation and test validity |

Lead alone edits/tests/commits/pushes. Reviewer: no edits, deployment, secrets or messages to chats;
<=200 words source:line BUG/RISK scenario/fix and uncertainty. Reuse known S01 finding instead of
another broad audit. Done: focused/full Rust/fmt/Clippy, independent review, docs/log/HOME/checkpoint
and scoped PR update. S03 ownership design and native/research/inclusion gates remain separate.
