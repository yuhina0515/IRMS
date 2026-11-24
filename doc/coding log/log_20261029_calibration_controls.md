# R06 calibration control names and selection state

Baseline 752d475, clean worktree; previous CI 40854564965 SUCCESS. Plan:
`plans/2026-10-29-calibration-controls-plan.md`; snapshot `%TEMP%/irms-calibration-controls-snapshot`.
Quota remaining initially 49%/75%, observed before delivery 46%/74%; account windows, not task tokens.

Read-only inclusion reviewer (inherited model, exact backend ID unavailable) independently confirmed
close accessible name was only the multiplication symbol and side selection was exposed only by CSS.
Lead accepted both defects. Three baseline regression cases failed for missing pressed state; DOM
role output confirmed close name was only the symbol. Initial reviewer suggestion assumed common.close
existed; lead verified it did not and added ordinary UI translations Close / 關閉 to both dictionaries.
No clinical dictionary change or demographic inference. Reviewer corrected that assumption in final review.

Implemented localized close aria-label and aria-pressed for both existing side buttons. Preserve
native button Space/Enter and Tab behavior, visuals, local wearSide state, and final-apply persistence.
Four new regression cases cover both supported languages, null/saved left/saved right selection,
Space -> Tab -> Enter changing mutually exclusive states, close callback and unchanged stored settings.
Original connection/side/start gating tests remain. No capture/algorithm/BLE/IPC/schema change.

Final independent frozen-diff review found no blockers; reviewer did not rerun tests. Lead validation:
7 focused tests and TypeScript passed. Full frontend/build results recorded below after completion.
Native AT speech, complete modal focus containment/restoration/portal and step announcements remain
open. Wizard B is a separate path, not covered by this change. No hardware, participant, country,
institutional or conformance acceptance; no service requests/deployment. S03 coordinated rollout,
R05 paced performance and R07 institution/metrology gates remain open. HOME/spec/cheat sheet/readiness/
optimization/checkpoint updated; next bounded work must address the remaining modal focus contract
without changing capture interruption or calibration math.

Final validation: 576/576 frontend tests across 58 files passed, zero failures; Vite build passed.
Existing large-chunk/ToolsView import warnings and intentional crash-recovery test stderr remain.
Rust/collector unchanged, not rerun; previous S03 native results do not prove current native AT behavior.
