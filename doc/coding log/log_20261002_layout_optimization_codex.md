---
tags: [ui, android, layout]
date: 2026-10-02
summary: Codex (GPT) optimized phone and desktop layout; verified on the Android emulator only.
---

# Layout optimization (GPT via Codex CLI)

- Codex edited `workbench.css` (media queries, density, tab strip scroll, touch targets via `--touch-target`/`--viewport-height` on `html.android-phone`) and `App.tsx` (update banner now in its own `.v3-update-slot` row). A stray `workbench-layout.md` it created was removed.
- Verified: `npm run ci` 463 FE tests + 84 Rust tests pass; debug APK on the emulator, Live / Exercises / Settings screenshots fill the screen, footer clear of the gesture bar, tab strip fits.
- Not verified: History and Tools tabs on phone, desktop (>=1024px) visually, real phone, update banner row.
- Process note: I misread Codex as finished while it was still running (log was mid-run), then tried a resume that failed on a writer conflict; waited for the process to exit instead.
