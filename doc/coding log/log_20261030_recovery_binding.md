# Recovery journal architecture and persistent identity foundation (WIP)

Plan: plans/2026-10-30-crash-recovery-plan.md. Baseline4dc9895 clean. Previous goal turn progress;
CI41002659505 confirmed SUCCESS during work. Initial quota83%/46%, now unknown after two Transport
closed responses at12:33+08:00. Stop expensive verification; no commit/push or completion claim.

Snapshot %TEMP%/irms-crash-recovery-snapshot, six files. Engineering/security read-only inherited
models/backend unknown, independent positions then cross-critique. Engineering recommends independent
IndexedDB journal for genuinely unsent IPC recovery. Security prefers immediate native append for
smaller sensitive-storage surface but accepts it cannot recover pre-IPC tail. Both reject sameDB
staging as redundant and require stable cross-store binding before independent journal integration.
Lead verdict: implement necessary persistent association prerequisite first; do not label it completed
crash recovery. Independent journal evidence/deletion/restore policy remains later bounded subplan.

Migration12 creates32hex DB identity, backfills unique32hex session key and assigns future keys by
insert trigger, preserving old rows/IDs/receipt data. sessions_start returns atomic snapshot+binding.
Controller retains original binding; native append requires fixed65ASCII identity and checks inside
transaction before receipt/empty/data. Same numeric ID in another DB or recreated session rejects.
No independent journal activated; no device/hardware, production changes or sensitive sidecar store.

Validation: missing-binding controller reproduction failed as intended; initial implementation43
controller/adapter cases and typecheck passed.6new native binding tests and7receipt tests passed,
including twoDB sameID rejection, reused/deleted session, v11 data/snapshot/receipt preservation,
reopen, failed creation rollback, wire shape and malformed identity redaction. Full suite pending.

Review: security no blockers, warns backup/restore copies preserve IDs and lost session-start reply
can leave abandoned row. Engineering no blocker but recommends fixed flush-snapshot binding; lead
accepted and added same-ID owner replacement regression. Initial1s flush timer caused early failed
assertion with unresolved deferred write and subsequent test cascade;60s fixture corrects it and
focused regression passes. Fullfile and typecheck must be rerun. Snapshot/catch now both verify stored
identity; narrow final reviewer confirmation still pending. Do not claim all current checks passed.

Resume from main checkpoint after livequota known/all>=30%. Complete tests/docs/review and scoped
Git delivery. No activation until verification; no journal, crash recovery, restore generation,
authentication, deletion-tombstone or clinical/institution-wide acceptance claim.

## Resume and completion of identity prerequisite (2026-10-30T15:49+08:00)

The WIP/unknown-quota paragraphs above are historical. Livequota restored98%/42%; latest93%/41%
remaining, so authorized verification resumed. Prior4dc9895 CI41002659505 SUCCESS rechecked. No change
was discarded during hold; no reset, purchase, credentials substitution or physical devices.

Final runtime contract uses atomic sessions_start reply rather than a new get-identity command.
Both start reply and append argument change, matched renderer/native required. The65ASCII binding
is checked inside the receipt transaction before acknowledgement, empty return or insertion.
Engineering narrow final re-review confirms fixed snapshot binding and same-ID owner replacement
case; no blocker. Security's prior final review approved foundation with backup/start-reply limits.
No UI change requiring a new inclusion reviewer; no demographic or treatment rule introduced.

Focused52controller/adapter cases and typecheck passed after adding complete rich-start validation
and fixed owner-race test. First full frontend run730passed/2failed: updater.lifecycle fixtures still
returned a legacy numeric sessions_start reply. Updated ONLY those fixtures to the new DTO; focused
updater/typecheck passed, then final full732/732 across70files, TypeScript and Vite build passed.
Existing injected ErrorBoundary traces and ToolsView/chunk-size warnings are known test/build output.
Full Rust161passed/6ignored (existing live/manual checks), fmt --check and Clippy all-targets/all-features
with -D warnings passed. Six new binding tests run against actual SQLite, including persistent reopen,
foreign same-ID, deleted/recreated row, migration12 snapshot/receipt fidelity and creation rollback.
Collector unchanged/not rerun; no Tauri transport, WebView persistence or power-loss claim.

Updated schema12/spec/cheat sheet/optimization/threat model/research readiness and association/retry
contracts. No independent journal store, unsent replay or actual capture added. Native keys survive
backup/restore, not a restore generation/tombstone/authentication mechanism. Lost session-start reply
may leave orphaned session. Native startup abandoned-session handling is unchanged.

Deliver scoped commit/push and update draft PR5 after prior CI success; inspect new head CI before
another push. Next bounded subplan: independent pre-IPC journal evidence prototype with stable binding,
startup barrier, byte/count budgets, interrupted commit/ack/delete, native deletion, replacement and
same-lineage restore ambiguity, quota/eviction/corruption. Demonstrate failure semantics before
connecting live acquisition; never recreate missing sessions, resume exercises or claim complete tail.
Broad project goal remains unfinished; software-only reliability work continues under quota checks.
