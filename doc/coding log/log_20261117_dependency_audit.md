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
