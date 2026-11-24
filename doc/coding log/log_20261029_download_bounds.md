---
tags: [irms, squad, security, downloads, tests]
date: 2026-10-29
summary: "Bound firmware/module HTTP responses before full buffering; 110 Rust tests passed, 3 live tests ignored, fmt and Clippy passed."
---

# R02: bounded firmware and module downloads

Plan: `plans/2026-10-29-download-bounds-plan.md`. Baseline `df2c5bd`, clean readiness worktree, continuing existing draft [PR #5](https://github.com/yuhina0515/IRMS/pull/5). R01 changed authoritative state and remains delivered. Quota at R02 start: 73% five-hour / 92% weekly remaining; no quota/credits/credential changes.

## Independent review and decision
Prior SEC finding accepted from the first snapshot: `Response::bytes()` fully buffered arbitrary responses before signature/size/hash validation. `/root/security` (inherited model, no override; exact backend ID unavailable) reviewed the scoped current baseline and completed a post-fix read-only diff check. No blocking regression found. Lead alone edited, tested and delivered. No worker edits, restarts, deployment, commit or other-chat messages.

Meeting decision: put byte budgets into the shared downloader, not just the firmware caller, because module index/signature/bundles use it too. Fixed budgets protect unverified metadata; payload limits use already-verified signed sizes. Do not replace authenticity checks or change signed formats. Retain verified-cache fallback and skip failed module downloads without partial writes. Do not claim a precise process-heap bound.

## Reproduction and changes
- A valid multi-chunk nine-byte HTTP response was accepted by the original downloader when the test required rejection for the intended eight-byte scenario. Baseline regression failed before implementation. New API explicitly takes the eight-byte cap in that regression.
- `get_bytes` rejects excessive Content-Length early, then checks every received chunk against remaining budget before extending its owned buffer. No allocation based on untrusted declared length.
- All callers, including ignored live tests, supply a limit: firmware manifest 64 KiB, module index 1 MiB, base64 signature 1 KiB, firmware/module payload exactly the verified signed size. Existing maxima remain 4 MiB firmware / 512 KiB module.
- Signature, final length, SHA-256/MD5, channel/minAppVersion and module rollback checks remain intact. No IPC, DB, BLE or release-format changes. Cache reads on local disk are unchanged; no claim that every disk/network allocation elsewhere is bounded.

## Validation
Local ephemeral loopback HTTP servers exercise multiple individually-small chunks whose total exceeds cap, one oversized chunk, close-delimited overflow, a header-only excessive Content-Length with connection held open until client close/timeout, HTTP 404, short artifact rejection at verification, and an exact-limit manifest/signature/binary path retaining signature/hash validation. Test server sockets have two-second read/write timeouts; no external service writes or real releases used.

- Focused firmware suite: 14 passed, including six new HTTP regression tests.
- Full Cargo test: 110 passed / 3 live ignored; main/doc targets passed. Cargo fmt check and Clippy all-targets/all-features `-D warnings` passed, jobs=1, reused generated target cache.
- Frontend unchanged since R01: last complete verified result remains 542 tests plus typecheck/production build, not rerun for Rust-only changes.
- `git diff --check` passed before delivery. No implementation/setup/model failure beyond the intentional baseline regression.
- Native OTA/BLE, live GitHub releases, network intermediaries and mobile clients remain unverified. The helper limits accumulated response bytes; reqwest internals and allocator overhead are separate resource costs.

## Next
R03: confirmation-dialog keyboard focus containment/restoration and background interaction, with keyboard regression and native acceptance boundaries. R04 per-notification BLE generation follows; then threat/performance baseline and full inclusion/research evidence work. Overall objective remains active; no universal institutional, national, clinical or demographic acceptance claim.
