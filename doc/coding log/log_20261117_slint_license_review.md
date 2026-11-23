---
tags: [irms, license, slint, native]
summary: Slint Royalty-free 2.0 read against the IRMS Source-Available License draft; no conflict, conditions listed.
date: 2026-11-17
---

# Slint license review (plan decision D5)

Read `slint-1.18.1/LICENSES/LicenseRef-Slint-Royalty-free-2.0.md` against root `LICENSE` (IRMS draft).

- Grant (s1): royalty-free use and distribution as part of a Desktop Application. The native app is a Windows desktop program: covered.
- Attribution (s2a): `AboutSlint` in an About dialog reachable from the top level. `app.slint` has a top-bar "關於" button opening a dialog that contains `AboutSlint`: met. The installer also writes a third-party notice naming the license.
- Limitations (s3): no embedded-system use (the ESP32 firmware does not use Slint; the app runs on PCs), no Slint API exposed to third parties (IRMS exposes none), license notices in Slint source kept (we depend on the unmodified crate).
- No copyleft: the Slint license does not impose conditions on IRMS source or on the IRMS license. The IRMS draft's limits (no redistribution, modification, commercial use) apply to IRMS material only and do not restrict Slint's own grant.
- Residual points: (1) the IRMS license is still a DRAFT pending legal review; (2) crate license is a triple choice (GPL-3.0 OR Royalty-free-2.0 OR Software-3.0); we use Royalty-free-2.0 only; (3) transitive crates keep their own licenses (not reviewed here); (4) this is an engineering reading, not legal advice.
