---
tags: [irms, native, modules, meeting, architecture]
date: 2026-11-22
summary: Meeting minutes. Owner's note reverses D2 (modules compiled in). Verdict - phase 1 signed module packages with a host-rendered declarative screen engine, registry, rollback and a management page; phase 2 wasmi logic modules behind a narrow capability API. No runtime .slint, no Rhai, no DLLs.
---

# Meeting: independently updatable modules in the native app (2026-11-22)

## Question

Owner's handwritten note (2026-11-22): "嘗試拆分為多個模組,使 App 不用更新,只需更新部分模組
(可能需要一個管理模組的機制與頁面)", sketch of the app branching into many feature arrows. This
reverses plan decision D2 (2026-11-17: modules compiled in). Which mechanism for the native app
(Rust, Slint 1.18, Windows, no WebView)?

- (A) WASM logic + `slint-interpreter` loading each module's own .slint
- (B) `slint-interpreter` + embedded script (Rhai)
- (C) data-driven modules: content, config and declarative screens built from host widgets; code compiled in
- (D) native DLL plugins

## Participants (all sonnet, general-purpose, ownership block attached)

1. Pragmatist: C now, a narrow Rhai hook for tips later; "C now, A later" keeps the path open.
2. Risk analyst: C only, because `panic = "abort"` (release profile) would let any plugin take down the
   angle alerts; host-API versioning burden; interpreter size.
3. User/operations: C; challenged the premise (the silent self-updater already updates the whole app
   unattended, beta.9 to beta.11); management page sketch (rows, states, fallback banner).

All three named the same weakness: C cannot ship new behaviour without an app release.

## Cross-examination

The risk analyst was given the owner's note and asked to attack C and to verify its numbers:

- C fails the owner's intent for features: angle-range (flow, metrics, record shape), live-share
  (protocol, viewer features), any new module; only session-tips is pure content. C withdrawn as the
  whole answer.
- Checked 2026-11-22: `wasmi` 2.0.2 is a pure interpreter (no JIT), `no_std`-capable, built-in fuel; no
  component-model layer needed for a core-wasm host API. Its binary-size cost is unmeasured (earlier
  "few MB" was a guess). `slint-interpreter` 1.19.0 links `i-slint-compiler` (confirmed) and would
  need to track the app's Slint version.
- Corrected claim: a wasmi trap (including out-of-fuel) returns `Err`; `panic = "abort"` only matters
  for host-side panics, so the capability glue that decodes module memory must be panic-free.
- Remaining real flaws of a wasmi phase: UI stalls unless modules run off the UI thread with a small
  per-event fuel budget; the widget vocabulary becomes a permanent API (version it); host bounds checks
  are the attack surface (fuzz them); network permission must be enforced by the host (HTTPS, declared
  host, no redirects to local addresses); one more toolchain target (`wasm32`) to maintain.

## Verdict (chair)

Two phases, one design:

1. **Phase 1, foundation (also C):** signed module packages (CI-signed index, sha256 per package,
   pinned minisign key, `min_app`, `schema_version`), versioned install directories with an active
   pointer and automatic rollback, a module registry in the app, a declarative screen engine (fixed
   host widget vocabulary rendered by one generic Slint component, actions from an allowlist), and the
   Settings → 模組 management page (version, available version, status, signature, enable/disable,
   update, roll back, check now, restore built-in). First package: session-tips as a pure content pack.
   Built-in fallbacks stay compiled in, so a failed or missing package never blanks a feature.
2. **Phase 2, feature modules:** wasmi logic per module behind a narrow capability API (read live
   angle and calibrated vectors, own key-value storage, show screen/notice, HTTPS to the declared host
   only), run on a worker thread with fuel, trap or validation failure = module disabled and rolled
   back, never on the angle-alert path. Pilot: angle-range as a wasm module, live-share after it.

Rejected: runtime .slint (compiler in the app, two UI paths, version lock with Slint, resource paths as
a file-read primitive), Rhai (dynamic typing found at runtime, same interpreter-UI cost), DLLs (native
code from the network in an unsigned app, a panic aborts the process).

Reasons: phase 1 is needed under every option and keeps safety by construction; wasmi is the only
code-carrying option whose failures can be contained in-process; the declarative screen engine avoids
shipping a UI compiler.

Dissent to monitor: the operations view that the existing silent self-updater already gives "no
reinstall" for code; if phase 2 slips, phase 1 alone still meets the content half of the request.
Binary-size impact of wasmi is unmeasured: measure before committing to phase 2.
