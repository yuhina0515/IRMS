# IRMS follow-up audit (2026-10-14)

## Goal
Answer the owner's decisions from the 2026-10-13 status review:
1. Explain the deferred signing/update-contract items (S1) in detail.
2. Voice cues: self-trained vs off-the-shelf speech (lead decides inline).
3. Documentation check: config files and narrative docs.
4. Android toolchain (lead verifies inline).
5. Analysis of calibration strategies A / B / C.
6. Push (done by lead: 5 commits ported onto `feat/calibration-b` in the new public repo clone as branch `fix/ota-truncated-link-flow-control`).

## Constraints and known facts
- Owner's own project (IRMS, Tauri app + ESP32 firmware for knee rehabilitation). Read-only audit, do not edit the snapshot, do not touch the live repo or network.
- Snapshot root: `<scratchpad>/audit/` (copy of the new-IRMS working tree without node_modules, target, .git, gen). Live repo is `E:\Monitoring-and-IoT\_repo-migration\new-IRMS`.
- Latest release in this repo line is v1.2.0-beta.24 (calibration C shipped). Docs may still say beta.19.
- Deferred S1 items were listed in `doc/coding log/log_20261009_proactive_audit.md` and `log_20261010_risk_hardening_and_voice.md`.

## Tasks
| ID | Model | Scope | Focus |
|----|-------|-------|-------|
| W1 | opus | updater, module loader, firmware auto-update: `IRMS_App_Tauri/src-tauri/src/**`, `src/services/{modules,firmwareAutoUpdate*}.ts`, `tauri.conf.json`, `capabilities/`, `.github/workflows`, `doc/MODULE_CONTRACT.md` | Explain S1 (index version/expiry, TOCTOU, IPC gating, endpoint pinning) in plain terms with concrete attack scenarios, current behaviour with file:line, options with cost, recommendation |
| W2 | sonnet | narrative docs: `README.md`, `doc/*.md`, `doc/coding log` index entries in `doc/HOME.md`, `plans/` | Stale or contradictory statements vs code (versions, feature lists, calibration A/B/C status, module list, repo/URL names, broken wikilinks/paths) |
| W3 | haiku | config files: every `package.json`, `Cargo.toml`, `tauri.conf.json`, `capabilities/*.json`, `.github/workflows/*.yml`, `tsconfig*`, `vite*`, firmware `platformio.ini`/manifest | Version mismatches across files, dead references, wrong repo/URL names, missing/unused permissions, CI steps referring to missing files |
| W4 | opus | calibration: `src/services/calibration*.ts`, `mobilityC.ts`, `doc/plans/*calibration*`, `doc/calibration-evidence/`, `doc/*calibration*` | Compare strategy A, B, C: what each measures, assumptions, failure modes, hardware evidence available, which entry points exist in code, recommendation on which to keep/merge/hide |

## Report format
`file:line | BUG/RISK/NIT | what is wrong | concrete failing scenario | one-line fix` for findings; only verified ones; under 400 words. W1 and W4 are analyses: under 600 words, verdict first.

## Done criteria
Findings triaged by the lead, real ones fixed in a separate commit, results logged in `doc/coding log/`, branch pushed to the new public repo only.
