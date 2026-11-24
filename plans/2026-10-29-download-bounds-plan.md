# R02: bound untrusted download responses before full buffering

Baseline df2c5bd, clean readiness worktree, existing draft PR #5. Quota remaining 73% five-hour / 92% weekly. Earlier batches changed authoritative state; continue, do not mark the overall objective complete.

Scope: `IRMS_App_Tauri/src-tauri/src/firmware_update.rs` shared downloader and all `modules.rs` call sites. Independent SEC finding already accepted: `Response::bytes()` buffers an entire response before manifests/binary checks reject oversized assets. Reproduce with a local HTTP response, implement caller-specific byte budgets while retaining signature, hash, version, compatibility and fallback checks. No secret/signing-key/endpoint changes or deployments.

Budgets: firmware manifest 64 KiB; module index 1 MiB; base64 Ed25519 signature text 1 KiB; payload bytes limited to their verified manifest/index size (already constrained to <=4 MiB firmware / <=512 KiB module). Treat Content-Length as early rejection only; count every received chunk before extending the owned buffer. These are response-body budgets, not a process-heap measurement.

Tests: small/boundary response succeeds; oversized declared length rejects without requiring that body; chunked and close-delimited overflow rejects; HTTP error/short payload remain failures at their proper layer; downloaded valid signed manifest and matching binary still verify. Use ephemeral loopback server only, no external collector traffic.

Lead alone edits; `/root/security` inherited-model reviewer inspects current baseline/scoped diff read-only, <=250 words, no edits/deploy/restart/commit/other-chat messages. Existing snapshot/SEC report recorded in readiness plan. Run Cargo fmt, all Rust tests and Clippy; no frontend code changes. Log outcomes, refresh checkpoint/evidence and draft PR description. R03 focus follows, then R04 BLE notification-generation gating.
