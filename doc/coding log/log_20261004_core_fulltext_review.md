---
tags: [irms, knowledge, literature, evidence]
date: 2026-10-04
summary: "Extract 14 core full texts with located methods/results, provenance and searchable correction notices."
---

# IRMS core full-text extraction

## Request and scope

The user selected the proposed next step: deeply read 10–15 core references and extract populations, samples, equipment, methods, errors, limitations and evidence locations. Continue the existing knowledge-base branch and PR #1; retain the 202-source catalog and 2026-10-03 literature cutoff. The extraction update is dated 2026-10-04.

## Decisions and deliverables

- Extract 14 selected primary full texts covering lower-limb validation, calibration, axis identification, orientation fusion, agreement statistics, rehabilitation feedback and patient/clinician usability.
- Store original extractions in `data/full-text-reviews.json`, with six located method fields, located results/limitations, separately labelled engineering implications and unresolved source discrepancies. Generate 14 readable review notes and `FULL_TEXT_REVIEW.md`.
- Identify each raw JATS XML by DOI/PMCID and SHA-256; record access URL/date and extractor. Raw publisher XML and temporary full-text transcriptions remain outside Git.
- Link extractions by stable source ID. Extend HTML/CLI/JSONL/SQLite retrieval to include full-text facts, locations, limitations and correction notices. Keep 202 unique sources, 22 topics and 157 DOIs.
- Reading depths are now 14 structured full-text extractions, 143 abstracts, one designated section review, 42 primary-page excerpts and two metadata-only documents. These depths are not evidence-quality scores.
- ICC guideline PMID 27330520 remains at abstract depth after failed full-text access. Record its 2017 erratum PMID 29276468 without inventing the corrected formula. MED/XML version checks are limited, not an exhaustive Crossmark or retraction audit.
- Correct the duplicated Koo author in the ICC API metadata using the publisher/NLM author list; retain an explicit bibliographic override and rebuild citations. Synchronize the 14 general source summaries, study designs and limitations with their full-text findings.
- Preserve discrepancies in Olsson's success percentages, Seel's retrieved XML table mean and Bowman's subgroup confidence interval/p-value. Do not silently repair reported values or use them as confirmed performance thresholds.

## Validation and boundaries

All 14 retrieved XML hashes and DOIs matched their source records; XML and MED author counts also matched. All 1,474 knowledge-base Markdown local links passed. Located extraction schema, generated review identities, citation exports, local Markdown links, JSONL evidence retention, SQLite integrity/foreign keys and deterministic rebuild passed. CLI Chinese/full-text/correction queries and Node minimal-DOM search/filter/citation/evidence-link/correction-display checks passed. Python scripts use the standard library and passed syntax checks.

This is a single-reviewer thematic extraction, not exhaustive systematic review, independent double extraction or formal risk-of-bias assessment. XML evidence is located by section/table, not guessed PDF pagination. Mechanical trials, healthy gait studies, neurological interventions and usability studies cannot establish IRMS accuracy or efficacy. Offline optimization, optical initialization and reference-mean correction are explicitly distinguished from real-time absolute angle estimation.

No application, firmware or user-data behavior changed. No native-device, human, browser rendering/accessibility or citation-manager import acceptance was performed. Prior built-in browser file-URL rejection was not bypassed. See [verification](../knowledge-base/VERIFICATION.md) and [full-text comparison](../knowledge-base/FULL_TEXT_REVIEW.md).

Delivery updates the existing PR through a scoped commit and push; merging remains a separate user action.
