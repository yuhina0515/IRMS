---
tags: [irms, native, security, dependencies]
summary: cargo audit on the native crates found a bundled-SQLite CVE; rusqlite upgraded 0.32 to 0.43, locks refreshed, zero vulnerabilities left.
date: 2026-11-17
---

# Dependency audit (cargo audit)

Installed `cargo-audit 0.23.0` (dev tool in `~/.cargo/bin`) and ran it on `IRMS_App_Native` and `IRMS_Core` against the advisory database (1509 advisories, up to Nov 2026).

- **RUSTSEC-2026-0459** (`libsqlite3-sys` 0.30.1, bundled SQLite C library, medium 6.8): in use, the database and the Tauri import go through it. Fix: `rusqlite` 0.32 to 0.43 in both crates (`libsqlite3-sys` 0.40, patched from 0.39). No source changes were needed; core 195 tests and native 46 pass, Clippy clean. An ignored live test imported a copy of this machine's real Tauri database (5 prescriptions) correctly with the new SQLite.
- **RUSTSEC-2026-0383** (`webpki-root-certs` 1.0.9, distrusted emSign intermediates): not in the Windows dependency tree (`cargo tree --target x86_64-pc-windows-msvc` prints nothing), only in the lock file; updated to 1.0.12 in both locks.
- **RUSTSEC-2026-0486** (`rustix` 1.1.4, unsound xattr): updated to 1.1.6.
- Left as they are: 6 "unmaintained" warnings (`bincode`, `pin-utils`, `ttf-parser`, `zbus_names`, `zvariant`, `zvariant_derive`), all transitive through Slint/winit and with no fixed version available.
- Result: `cargo audit` reports no vulnerabilities for either crate. Not released yet: the next beta will carry the new SQLite.

## Follow-up: the Tauri app shares IRMS_Core

- Upgrading `IRMS_Core` to rusqlite 0.43 broke the Tauri crate's build (it depends on `IRMS_Core` by path and needs the same SQLite binding): `cargo` reported "failed to select a version for libsqlite3-sys". Found only because the Tauri crate was audited next; fixed by bumping its `rusqlite` to 0.43 as well (commit `9739c5f`, the previous commit `69c2d66` left the branch with a Tauri build that did not compile). Tauri Rust: 43 tests pass, Clippy clean.
- `cargo audit` on `IRMS_App_Tauri/src-tauri`: 12 vulnerabilities before, 4 after. Fixed by the SQLite bump and a lock refresh of rustls 0.23.46, rustls-webpki 0.103.17, webpki-root-certs 1.0.12, tokio 1.54.1, rustix 1.1.6 (all semver-compatible). `npm audit --omit=dev`: 0 vulnerabilities.
- **Left open:** `zip` 4.6.1 (RUSTSEC-2026-0367, -0368, -0369, -0429, up to 7.5 high), pulled in by `tauri-plugin-updater` 2.11.0; the fix needs zip 9, and the only updater release that has it is `3.0.0-alpha.3`. These advisories concern extracting untrusted zip archives; the Tauri updater on Windows installs an `.exe` downloaded from the owner's own release, so exposure looks low (inference, not tested). Revisit when a stable updater plugin ships. Also `glib` 0.18 (Linux/GTK only, not in the Windows build) and unmaintained-crate warnings.
