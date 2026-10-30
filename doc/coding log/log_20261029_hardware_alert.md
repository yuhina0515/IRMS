# R06 hardware emergency keyboard ownership

Baseline 2376a02, clean readiness worktree; CI 40846105740 confirmed SUCCESS. Plan:
`plans/2026-10-29-hardware-alert-plan.md`; source snapshot `%TEMP%/irms-hardware-alert-snapshot`.
Quota initially remaining 62%/77%; observed before delivery 50%/75% (shared account windows,
not exact task token accounting). Lead alone edited/tested/delivered.

Independent read-only `/root/inclusion`, inherited model (exact backend ID unavailable), confirmed
missing ErrorOverlay semantics/focus/isolation and incidental dependency on ConfirmDialog. It
identified disabled/removed-save focus loss and handoff hazards. Lead reproduced standalone alert
leaving focus on an obscured prior button; baseline regression failed before implementation.

Implemented a named/described body-portal alertdialog with own initial/contained focus, reversible
background isolation and unchanged SessionSaveControl/disconnect behavior. Mutation observation
keeps focus on enabled escape controls when save disables/disappears; no-controls fallback is the
focusable alert. Escape consumes without clearing hardwareError. Optional priority extension
keeps ordinary priority-0 LIFO and reserves 100 for emergency ownership over later ordinary layers.
Existing useGlobalShortcut source skips actions whenever escapeStackDepth >0; no separate global
shortcut rewrite was needed.

Confirmed handoff required shared reference-counted inert leases and explicit original-invoker
transfer. Confirmation releases only its own lease and avoids incidental focus assignment to a
real emergency owner; legacy fixture fallback retained. Alert cleanup removes guards/observer,
releases isolation and restores an eligible target or available background fallback. No rewriting
other modals, BLE/DB/IPC/schema or save truthfulness. New modalIsolation service scopes these two
singleton overlays; it is not a general proof of every nested-modal implementation.

Final independent frozen-diff review found no blocker. CSS-only hidden-control detection remains
a bounded acceptance gap: current emergency controls do not use that condition; eligibility
checks disabled/inert/hidden/aria-hidden. Reviewer did not rerun tests or verify native behavior.
No false-positive reports rejected.

Validation: typecheck and Vite build pass. Thirty-two focused tests across four files pass. Final
full JSON report: 572/572 frontend tests, 58 files, zero failures. Twelve new tests cover standalone
focus/semantics, Tab/background/pointer/Escape containment, actual saving/disconnect transitions,
StrictMode/recovery, real open/closing confirmation in both render orders, late confirmation,
all-disabled fallback, overlapping leases/new siblings and priority release to ordinary LIFO.
Existing confirmation, dropdown and shortcut tests retained. Baseline tests initially emitted
unavailable native feedback errors; fixture core/IRMS stubs were added for isolated DOM execution.
Known intentional crash-recovery stderr and pre-existing Vite chunk/import warnings remain.
Rust/collector code unchanged; previous S03 results 138 Rust / 13 collector tests/fmt/Clippy were
not rerun or transferred to a new native acceptance claim.

Docs/spec/cheat-sheet/HOME/readiness/checkpoint/native acceptance protocol updated. No real hardware
error injection, native WebView/AT/touch/pen/zoom, participant or institutional/population acceptance.
No production requests/deployment. Remaining R06 overlays/native journeys, R05 paced performance,
S03 coordinated rollout and R07 institution/metrology evidence remain open.
