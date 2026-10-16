---
tags: [irms, knowledge, literature, hyperextension, feedback]
date: 2026-10-16
summary: "Record gaps G1/G2 and add 20 verified sources, C26-C30 and guide 13 on knee hyperextension thresholds and alert wording."
---

# Hyperextension and alert-wording evidence

## Trigger

Unified calibration (`feat/unified-calibration` 3c1c57d) produces a signed knee angle and alarms below -5° (`HYPEREXTENSION_TOLERANCE_DEG`, marked provisional) with the banner `膝蓋過度伸直 {deg}°,請放鬆,不要向後頂`. A KB search found no hyperextension/recurvatum content and no guidance on alert wording.

## Changes

- `MAINTENANCE.md`: new "已知證據缺口" table with G1 (hyperextension evidence) and G2 (patient-facing alert wording), including the parts that are still missing.
- 20 sources added (202 -> 222) through `data/catalog.json`, plus two topics, `hyperextension` and `alert-language` (22 -> 24). Each source was identity-checked by a Europe PMC `EXT_ID` lookup (PMID, title, authors, year, DOI), and its record hash is stored. 17 are abstract-level. PMID 34820464 and 33573624 have located full-text section checks with XML SHA-256. Beighton 1973 (PMID 4751776) is `metadata-only`: there is no abstract, and the PMC PDF was blocked.
- `data/query-manifest.json` now has a `supplements` block with the 2026-10-16 discovery queries and hit counts.
- `data/evidence-map.json` and `CLAIMS.md` add C26-C30. `audit.py` now accepts contiguous claim IDs beyond C25 and renders the claim count and supplement note. `check_search.js` derives the metadata-only count from the catalog.
- `guides/13-hyperextension-and-alert-wording.md` covers definitions and physiological range, threshold grounding (SEM/MDC95, V01/V02), and alert-wording principles with three ranked zh-Hant/en candidates. All candidates are marked as expert reasoning.
- Entry points updated: README, READING_PATHS, IRMS_MAPPING, VALIDATION_PLAN, VERIFICATION, GLOSSARY (63 terms), ACCEPTANCE_CHECKLIST B01, and HOME.

## Findings

- 5° appears only as a static or passive convention: Loudon's operational definition, passive cut-offs under anesthesia in ACL cohorts, and the TKA recurvatum grade. 6° and 10° (Beighton) are also used. No verified study derives or validates a dynamic wearable alarm threshold.
- Guimarães 2021 states that there are no data to fully support restricting postoperative hyperextension to under 5°. Shelbourne 2009 treats restoring hyperextension symmetric with the uninvolved knee as normal motion. A fixed default can therefore conflict with ACL rehab goals.
- The signed angle carries calibration-zero error. The code comment estimates a 2-4° budget (unverified). Without IRMS SEM, 5° cannot be shown to clear noise.
- Wording evidence is indirect: low back pain qualitative work, viewpoints and reviews, healthy-participant putting experiments, and OPTIMAL theory. No study compares hyperextension alert phrases, and no Chinese prompt study was found.

## Verification

`build.py`, `check.py` (222 sources, 24 topics, deterministic rebuild, SQLite), `check_search.js` and a CLI query for `過伸` passed. Not done: Zotero re-import of the 20 new records, browser acceptance, and any change to app thresholds or strings.

## Open

- Retrieve the full texts of Roach 1991, Soucie 2011 and Beighton 1973 to get the actual knee extension norms and scoring text.
- V01 negative-angle known-angle error, V02 SEM/MDC95, V08 false-alarm and dwell behavior, and V11 wording comprehension. The owner still decides the threshold and wording.
