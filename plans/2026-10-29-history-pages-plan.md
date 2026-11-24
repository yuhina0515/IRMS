# R05 history list native pagination

Baseline a2ff51b clean worktree; quota62%/66%. CI40870617543 live; local preparation permitted,
push only after terminal success/failure resolution. Snapshot %TEMP%/irms-history-pages-snapshot.
Current History loads all sessions including calibration JSON then slices locally. One bounded fix:
add sessions.listPage/native list_page returning sessions,total,page,pageSize, capped1..100, clamp
past-end pages after deletion. Same read transaction count/page; deterministic startTime DESC,id DESC.
Migration10 adds nonunique sorting index only, preserves rows and prior migrations. Old list/getData/
getReview/export retained. Count/large OFFSET costs remain; no global byte/latency/heap claim.

| ID | Model | Scope | Focus |
| --- | --- | --- | --- |
| Engineering | Inherited; backend ID unavailable | Snapshot History/DB/migration + final diff | Stable ordering, same-snapshot totals, cap/clamp, resize/delete/stale integration |
| Lead | Current | Failing regression, additive native/renderer integration, tests/docs/delivery | All pages accessible, page retention/review/deletion, current failure and stale fencing |

Readonly worker: no edits/deploy/commit/heavytests/otherchats; <=250words BUG/RISK scenario/fix/
uncertainty. Renderer async per page/size/refresh, loading state/pager guards; ignore obsolete results
and retain active-session delete checks. Reopen list after review refreshes current page. Native
migration-upgrade/index query-plan + bounds/ties/page availability tests, wire shape and frontend
navigation/resize/stale/error/delete clamp. Test stub may adapt old list fixtures, never production
fallback to unbounded list. Typecheck/frontend/build + Rust fmt/test/Clippy. New log/index/spec/
cheat-sheet/optimization/readiness/checkpoint. No actual DB/device/deployment/native FPS claims.

Outcome: baseline unbounded-list regression failed; final612 frontend/145 Rust tests passed,
6 Rust ignores unchanged, typecheck/build/fmt/Clippy passed. Engineering review no blocker.
Migration9->10 preserves rows/index plan verified; deterministic1,001-row budget artifact committed.
Old version7-upgrade expected migration list extended to include10 without relaxing data assertions.
