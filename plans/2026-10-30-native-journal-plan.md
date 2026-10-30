# Actual native journal oracle plan

Baseline:6ed5e059fb05f5e845eab3eae507614a9d38be51, clean; prior CI41030074994 SUCCESS.
Quota initial63%/37% remaining. One bounded synthetic integration task, no hardware, deployment,
production acquisition hookup or unrelated changes. Snapshot:C:/Users/Yuhina/AppData/Local/Temp/irms-native-journal-20261030-snapshot.

Goal: connect existing real IndexedDB probe to actual Rust DB initialization, atomic bound session
creation and receipt append using a test-only ignored oracle. Each request runs in a fresh process
and owned temporary database. Keep SQLite commit, lost transport reply, browser interruption and
journal acknowledgement/deletion distinct. Missing/foreign/deleted association must retain entries.
Demonstrate same-lineage backup ambiguity; define conservative startup/deletion/restore policy.

| ID | model | scope | focus |
| --- | --- | --- | --- |
| ENG | inherited | Rust oracle and replay cases | real receipt/state observations and startup limits |
| SEC | inherited | subprocess/temp boundary and browser integration | isolation, redaction, cleanup, restore claims |

Workers read-only; no edits, deployment, commit, other chats or heavy tests. Report<=250 words,
file:line BUG/RISK/NIT with concrete scenario/fix; uncertainty explicit. Lead verifies and edits.
Done: actual SQLite + browser evidence, relevant Rust/JS checks, documented limits/policy, meeting
log/HOME/checkpoint, scoped commit/push/draftPR. No automatic acquisition or recovery acceptance claim.
