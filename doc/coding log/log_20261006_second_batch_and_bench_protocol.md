---
tags: [irms, knowledge, literature, calibration, validation]
date: 2026-10-06
summary: "Extract ten more full texts, preserve batch-specific appraisal scope and prepare V01/V02 evidence requirements."
---

# Second full-text batch and bench protocol

## Goal continuity

Continue the seven-item objective. While the required Zotero execution confirmation and usable browser tab remain pending, finish independent literature/data preparation. Do not redefine browser acceptance or hardware measurement as a documentation task.

## Additional full-text evidence

Select eleven existing abstract sources by relevance to placement/calibration, known-angle reference, rater/session repeatability and pathological gait. Retrieve ten primary XML texts and verify each DOI, SHA-256 and MED/XML author count. PMID 41569824 returns HTTP 500 and remains abstract-only. Do not infer its methods from the abstract.

Complete located design/population/equipment/protocol/reference/analysis/results/limitations for the ten sources. Total counts are now 202 unique sources, 24 full-text extractions, 133 abstracts, one designated section review, 42 primary-page excerpts and two metadata-only documents. No additional source or duplicate preprint is counted.

Preserve critical distinctions: mechanical encoder resolution versus accuracy, RMS versus maximum error, body-segment versus joint angles, study-specific ROM versus max/min, absolute versus centered error, reference-assisted timing, endpoint drift interpolation, clinical cases versus diagnostic validity, and consistency ICC versus absolute agreement. Version checks cover 25 MED records: 24 extracted sources plus the original ICC guideline.

The first fourteen sources retain their explicitly scoped educational domain appraisals. New extractions are not automatically labelled appraised. Change schema validation to allow different batch access dates while preventing access later than the review update. The quality target set remains explicit.

## Bench and human-reference preparation

Create `BENCH_PROTOCOL.md` with required version/calibration/device/reference/trial/analysis assets, V01 independent-reference conditions, V02 rater/day/remount distinctions and a prospective human-reference planning outline. Existing Claude hardware A/B and raw-packet evidence are retained but cannot satisfy missing known-angle and complete repeatability data.

V01/V02 have not been executed by this task. The human-reference plan is preparation only, with no recruitment or human experiment. Existing app behavior, firmware and release gates are unchanged.

## Verification and next dependencies

Source/audit/appraisal identities, date/depth consistency, generated note sets, 25-claim/all-12-activity mappings, JSONL location/restriction retention, SQLite integrity/FTS, deterministic output, Python syntax, CLI and Node minimal-DOM checks passed. Browser/keyboard/Zotero and true V01/V02 acceptance remain open. PR merge remains pending the earlier acceptance step; later sections must not be reported as completing these prerequisites.
