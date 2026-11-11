---
tags: [irms, architecture, ipc, docs]
date: 2026-11-12
summary: "Architecture review: ble:packet sent has_roll while the frontend reads hasRoll (fixed with serde rename_all_fields + wire-shape test); TopNav pulled the lazy ToolsView into the first bundle (hook moved to hooks/, main 252.6 -> 242.7 KB); new doc/architecture/ARCHITECTURE.md with six Mermaid diagrams and PNG exports; Canvas updated. 711 frontend / 121 Rust tests pass."
---

# Architecture review and diagrams (2026-11-12)

Requested by the owner: review the overall architecture, optimize it, and save diagrams for the
portfolio and for future agents. Scope kept to evidence-backed, low-risk fixes because of the
12/03 code freeze and the 修缺陷,不擴大議程 rule; larger restructuring is written down as proposals.

## Method

- Static import graph of `src/` (85 runtime modules, type-only imports excluded): cycles, layer
  direction, fan-in. Script kept out of the repo; result: no runtime cycles.
- IPC payload check: serialized `ParsedPacket` from Rust and compared the keys with
  `shared/protocol.ts`.
- `vite build` chunk list before and after.
- Schema read from `migrations.rs` for the data model diagram.

## Fixed

1. **`ble:packet` key mismatch.** `#[serde(tag = "kind", rename_all = "camelCase")]` on an enum
   renames only the variants, so the real-device path sent `has_roll` while the frontend type reads
   `hasRoll` (always `undefined`). No production code reads `hasRoll` yet, so nothing visible broke;
   the shared fixtures did not catch it because they test parsing, not serialization. Fix:
   `rename_all_fields = "camelCase"` in `protocol.rs`, plus `wire_shape_tests` (keys of angles /
   error / malformed payloads). Verified the new test fails without the attribute (`left:
   ["has_roll", ...]`). Stale comment about the Electron copy updated.
2. **Lazy ToolsView defeated.** `components/TopNav.tsx` imported `useToolModules` from
   `views/ToolsView`, so the page shipped in the first bundle. Moved the hook to
   `hooks/useToolModules.ts`. Build: new `ToolsView` chunk (1.94 kB), `main` 252.55 -> 242.74 kB.
3. **Docs.** New `doc/architecture/ARCHITECTURE.md`: system context, firmware tasks, app layers,
   real-time sequence, data model (from the real schema), release pipeline, review findings and
   proposals P1-P6. PNGs rendered with mermaid 11 in Chrome into `doc/architecture/img/`.
   `IRMS_架構圖.canvas` corrected (25 Hz, user_version 10, 44 commands, unified calibration, no
   physical buzzer/LED) and linked to the new doc.

## Not done (proposals in ARCHITECTURE.md section 7)

P1 split `useStore` (930 lines, 13 services write it), P2 split `sessionController`, P3 multi-
subscriber BLE events, P4 remove legacy calibration A/B/C after unified calibration passes the
goniometer check, P5 keep two parsers for now, P6 store/i18n direction. All after `v1.2.0`.

## Verification

`tsc --noEmit` clean; vitest 71 files / 711 tests; cargo test 121 passed (3 ignored); cargo fmt
check and clippy `-D warnings` clean; six diagrams render without errors. No device test (the
change to `ble:packet` keys is additive for consumers: `kind`, `raw`, `truncated` unchanged).
