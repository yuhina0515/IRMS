---
tags: [irms, modules, lifecycle, live-share]
date: 2026-09-27
summary: Standalone module pages, immediate reactivation, lifecycle contract and live-share fixes.
---

# Module pages and lifecycle

## Decisions and changes

- User requires management-only module listings; module operation UI gets its own page.
- Added a standalone module route and navigation selector; management only links to pages.
  Explicit re-enable opens the newly activated page. Legacy panels route through the same host.
- Retain verified entries for immediate local reactivation. Serialize activations, abort and
  dispose on disable/replacement/failure, reject late registration and unknown contract revisions.
- Companion IRMS-Modules change rejects locally generated share codes, stops sessions on
  disposal, cleans late start/join responses, ignores stale push results, and registers a page.
- Added contract revision 1, lifecycle rules and a mandatory build validator in IRMS-Modules.
  Optional metadata/capabilities and arbitrary internal page workflows remain extensible.
- Stored the user's management-only rule as an explicitly requested memory update note.

## Validation

- App: `npm run ci:frontend` passed, 398 tests across 43 files, typecheck and production build.
- Modules: 14 Node tests passed; unsigned index build and contract validation passed.
- No Rust changes. Native Windows rendering and a two-device collector session were not run.
- Existing large Leg3D bundle warning remains non-blocking.

## Integration and release

Work is isolated from the original dirty checkouts:
- App branch: `codex/module-lifecycle-pages-20260927`, based on beta.16 main `915a0ec`.
- Modules branch: `codex/live-share-lifecycle-20260927`, based on `0f9f378`.
- Original angle-range/history WIP is untouched. Integrate its context capability carefully
  when merging `services/modules.ts`; migrate angle-range metadata/page before release.
- Release the compatible app first (planned beta.17), then modules live-share/session-tips
  1.0.1. No release tag or merge is part of this change.
- Client self-join protection covers shares generated in the same running app capability;
  it is a usability guard, not a server-side identity/authentication change.

## Rebase onto beta.18 (2026-09-30)

- Rebased onto `main` after beta.17 (angle-range, personal `limits`) and beta.18 (工具 tab).
- Kept main's Tools tab as the only host for module UI: `registerPage` pages (and adapted
  legacy `registerPanel`) appear as tools titled by the page title; the standalone
  `module:<id>` route, navigation selector and `ModulePageView` were dropped.
  Management "開啟" and explicit re-enable call `openModuleTool(id)`.
- Kept main's `angleRange` capability and `checkModuleUpdates`; `setModuleEnabled` uses this
  branch's immediate reactivation. Lifecycle UI test moved to `views/ToolsLifecycle.test.tsx`.
