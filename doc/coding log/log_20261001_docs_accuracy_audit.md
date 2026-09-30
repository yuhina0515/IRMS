---
tags: [irms, docs, audit]
date: 2026-10-01
summary: Audited top-level docs against the Tauri code after the repo migration; fixed Electron-as-current claims and stale facts
---

# Docs accuracy audit (2026-10-01)

Trigger: user noticed the docs still described Electron ("v2") as the current app.

Cause: the root README and several top-level docs were written in the Electron era and only partly reconciled when the app moved to Tauri.

Changed: README.md (rewritten for Tauri, firmware/modules repos), doc/README.md, PROJECT_STATUS.md (beta.19, 34 IPC commands, update channels, Tools view, module list), ROADMAP.md (status note, migration/i18n/updater items), OPTIMIZATION.md (header, schema version), AI_CODING_RULES.md (Tauri rules, protocol/schema sources, user_version 8, no CMD:SYNC), HOME.md, TAURI_MIGRATION_PLAN.md and HANDOFF_20260926.md (status notes), MODULE_CONTRACT.md.

Method: two read-only auditors compared docs to code; findings were applied by the lead. Dated coding logs were left as history.

Not fixed / unverified:
- Test counts are static-grep estimates; `npm run ci` was not run (no node_modules here).
- PROJECT_STATUS still says the Tauri app has no full real-device E2E; real-device sessions happened 2026-09-25 (beta.11/12), needs the owner to decide the wording.
- PROJECT_STATUS/ROADMAP still contain Electron-era sections marked as history; `IRMS_架構圖.canvas` not opened.
- IRMS_Telemetry README says "the Caddy desktop"; Caddy moved to hina-server.
