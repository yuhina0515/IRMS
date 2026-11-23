---
tags: [irms, docs, mobile, ios]
date: 2026-10-15
summary: "iOS development paused by the owner on 2026-10-15; HOME and ROADMAP now say so. Fixed two doc-debt items from the 2026-10-14 audit (mobility_records in AI_CODING_RULES 4.3, ROADMAP D5 marked superseded). Docs only, no code."
---

# iOS paused, doc sync (2026-10-15)

Branch: `fix/ota-truncated-link-flow-control`. Docs only; nothing committed or pushed.

## Request
Mark iOS as paused, keep the facts about what exists, and clear two known doc-debt items from `log_20261014_followup_audit.md`.

## Files changed
- `doc/HOME.md`: new top status bullet (iOS paused); note appended to the 2026-09-01 mobile-decision entry saying it was superseded.
- `doc/ROADMAP.md`: D5 heading and a "current state" block (React Native superseded by Tauri mobile; iOS paused); the status note at the top also states iOS is paused.
- `doc/AI_CODING_RULES.md`: section 4.3 gains a `mobility_records` entry (migration 9).
- `doc/coding log/log_20261015_ios_paused_doc_sync.md`: this entry.

## What exists for iOS (unchanged)
Branch `feat/ios-unsigned-ipa` holds an unsigned IPA GitHub Actions workflow (macOS runner). It is not merged into the current branch. Its own log (`log_20261005_ios_unsigned_ipa.md`) exists only on that branch. Install on a real iPhone, BLE and app launch were never verified.

## Doc-debt checks
- `mobility_records`: columns and checks taken from `migration_9` in `IRMS_App_Tauri/src-tauri/src/migrations.rs`. Verified.
- D5: the decision text still said React Native. `TAURI_MIGRATION_PLAN.md` line 7 and `log_20261001_android_apk_beta21.md` show mobile moved to Tauri mobile, so D5 was marked superseded and the original text kept.

## Not verified / not touched
- No other plan doc mentions iOS as in progress. `TAURI_MIGRATION_PLAN.md` still has a historical "Correction" section describing React Native; left as is.
- The ROADMAP note says mobile planning docs were not published; I did not locate any.
- Calibration docs were not edited.
