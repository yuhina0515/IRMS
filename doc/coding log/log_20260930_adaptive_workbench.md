# Adaptive clinical workbench — 2026-09-30

## Scope and decisions

- Read AI_CODING_RULES and Tauri README; clean starting worktree on `codex/ui-adaptive-refresh-20260930`, HEAD `4a7eec8`.
- Researched generic UI conventions and audited active v3 versus legacy CSS; findings and sources in `doc/UI_DE_AI_NOTES.md`.
- Current user authorization supersedes historical Gemini-only design delegation. No agents delegated.
- Added a centralized presentation layer: chalk/graphite/petrol palette, ruled surfaces, operational headings and monospace readings, larger primary metric region.
- Dynamic viewport shell, safe-area insets, fluid tokens, 720px content container and 760px navigation breakpoint, bounded inner scrolling, narrow 44px controls.
- History retains aligned columns in an inner horizontal scroller, preserves the measured list body for pagination, and renders all seven summary metrics in an explicit strip. Tools gain a bounded module region.
- No services, stores, native Rust, protocol, calibration, clinical judgment, IPC, dependencies or translated strings changed. Existing tests unchanged.

## Verification and delivery

- `npm ci`: passed, 201 packages, audit reported zero vulnerabilities.
- `npm run ci`: typecheck passed; Vitest default config loading blocked by `spawn EPERM` in Vite Windows realpath handling.
- `npx vitest run --configLoader native`: fork workers also blocked by `spawn EPERM`.
- `npx vitest run --configLoader native --pool threads`: 44 files / 410 tests passed.
- `npx vite build --configLoader native`: passed. Existing large Leg3D chunk and mixed static/dynamic ToolsView import warnings remain.
- `npm run ci:rust`: passed (rustfmt, Rust tests, Clippy with warnings denied). Final TypeScript check and `git diff --check` passed.
- Calculated token contrast (not rendered accessibility certification): day text/surface 13.90:1, muted/surface 6.40:1, white/accent 8.00:1, control edge/surface 3.98:1; night muted/surface 8.05:1, on-accent/accent 9.68:1.
- Browser preview attempted; browser security policy denied localhost access. No workaround attempted. Viewport screenshots, keyboard reachability, light/dark rendered contrast, long content and native DPI remain unverified.
- Commit attempt blocked: Git cannot create `E:/Monitoring-and-IoT/IRMS/.git/worktrees/ui-refresh/index.lock` outside the writable root. No commits or push performed. Intended logical commits: audit documentation; workbench presentation/adaptive layout; verification/handoff notes.

## Follow-up review

- The native window sizing policy was intentionally untouched; CSS support at 360px does not establish that the current Windows shell permits that size or that an Android build exists.
- Test actual nested scroll/touch/keyboard behavior, particularly prescription inspector, history horizontal scrolling, diagnostics and third-party module content. Module authors can still introduce their own fixed widths.
- Shared legacy CSS remains available for existing dialogs/components; the new stylesheet explicitly owns current layout rather than deleting unrelated component styles.
