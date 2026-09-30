---
tags: [irms, release, merge, dpi]
date: 2026-09-27
summary: "Merged PR stack #9 → #12 → #13 → #14 into main, released v1.2.0-beta.15, verified PR #11 window clamp at real 125%."
---

# PR stack merged, beta.15 released, #11 checked at 125%

## Priority order used

1. Land the stacked PRs #9 → #12 → #13 → #14 (user chose sequential merges).
2. Publish `v1.2.0-beta.15` prerelease (user approved).
3. PR #11 window work-area clamp: resolve conflict, verify on real Windows.
4. Issue #3 hardware acceptance — needs the device, left to the user.

## Merge

Each PR was retargeted to `main` after the one below it merged, then merged with a merge
commit (repo convention). `main` = `cdce4d6`. The lower branches carried commits that were
not in the #14 tip (`cdb2fec` telemetry docker gateway trust, guidance fix + v3 review log on
#12), so CI was re-run on merged `main` rather than trusting the earlier tip run:
vitest 40 files / 376 tests, cargo 73 passed (3 live ignored), clippy clean.

## Release

No migration changes since beta.14 (`git diff v1.2.0-beta.14 main -- src-tauri/src/migrations*`
empty), so the release binary was smoke-launched against the real profile: main window
"IRMS Dashboard" appeared. Published by hand per the Tauri pipeline (`tauri build` with the
updater key from `IRMS_secrets`, hand-built `latest.json`, asset renamed to
`IRMS.Dashboard_…` before upload so the URL matches). `latest.json` uploaded to both
`v1.2.0-beta.15` and `beta-latest` (`--clobber`); verified `beta-latest` serves 1.2.0-beta.15
and the installer URL returns 200. Tag points at `cdce4d6`.

IRMS-Modules was not re-released (user chose app-only).

Note: `tauri build` rewrites `src-tauri/Cargo.toml` line endings (LF → CRLF, no content
change); `git checkout --` it afterwards or branch switches abort.

## PR #11

Merged `main` in; only conflict was `doc/HOME.md` (kept both entries). CI green, cargo 80
(adds the 7 dpi_guard tests). Real Win11 check on a **1920×1200 monitor at 125%**:
`target=1280×820 drift=(0,0)` — the work area (1140 px) is tall enough, so no shrink; the
startup nudge moved the window from y=128 to y=68, bottom exactly at 1140. Posted on the PR.
Still unverified: the shrink path (1080p at 125%, or 175%) and the 175% click-offset
regression. PR stays draft.

## Handoff

- Issue #3 with beta.15: power-cycle the device first (stale beta.14 OTA session), then
  OTA READY→DONE→reboot, alarm mute/re-arm, power-cut reconnect, force-kill → `abandoned`.
- The "R1–R5 from the 09-24 review" referenced by PR #9 are not listed anywhere in the repo
  (only R1 = Windows adapter-level disconnect is named). Needs the original list.
