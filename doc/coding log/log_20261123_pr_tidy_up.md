---
tags: [irms, git, housekeeping]
date: 2026-11-23
summary: PR and branch tidy-up after the native merge. Merged #14 (mobile port log), #15 (code fixes from #7/#8), #16 (evidence library, supersedes #1); closed #7/#8; #5 kept open with an assessment and label needs-split; 11 merged branches deleted; iOS branch kept.
---

# PR and branch tidy-up (2026-11-23)

Owner asked to tidy every PR after the native stack (#9 to #13) was merged on 2026-11-22. Assessment by
three squad workers (eng-qa x2 sonnet, general-purpose haiku), decisions by the owner where unique work
was involved.

| Item | Result |
|---|---|
| Remote branches fully contained in main (11) | deleted |
| `docs/mobile-port-plan-log` (1 doc file) | #14 merged |
| #7 thigh shift check + voice-cue hold, #8 `ble:packet` camelCase fix + lazy ToolsView + wikilinks | code commits cherry-picked as #15 and merged (IRMS_Core 232, Tauri Rust 43, native 67, tsc, vitest 728); #7/#8 closed; their stale doc commits (beta.26 status, pre-Core architecture diagrams) left on the branches |
| #5 Codex readiness (40 commits) | kept open by the owner ("維持並標注"); comment with the assessment (7 commits already on main, 10 conflicts, migration 10 collision, IRMS_Core build failure, old src-tauri BLE files) and label `needs-split` |
| #1 + `kb/hyperextension-and-alert-wording` evidence library | merged as #16 after removing local paths and remapping code paths moved into IRMS_Core (`scripts/check.py` passes); #1 auto-marked merged; both branches deleted |
| `feat/ios-unsigned-ipa` | kept (owner; iOS paused) |

Correction recorded: the haiku worker reported "132 Europe PMC abstracts" in the library; the lead and
the cleaning worker checked the data: the hits were the project's own `review_level: abstract` tag and a
stats counter, the retrieval texts are citations plus project-written Chinese notes (longest English run
43 words). Nothing third-party was removed because nothing was found.

Left open: #5; branches `arch/review-20261112`, `feat/thigh-slip-check` (stale docs to redraw),
`codex/irms-progress-20261020` (base of #5), `codex/irms-readiness-20261029` (#5), `feat/ios-unsigned-ipa`.
The architecture document (`8be7fd1` on `arch/review-20261112`) should be redrawn for IRMS_Core and the
native app before it is merged.