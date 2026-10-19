---
tags: [irms, knowledge, literature, documentation]
date: 2026-10-03
summary: "Add 202 traceable references, 22 topics, 12 guides, offline search and citation exports."
---

# IRMS professional reference knowledge base

## Request and decisions

Build a substantial IRMS reference library that supports research background, engineering choices and future validation. Use the active `yuhina0515/IRMS` repository; the existing E: checkout points to `IRMS-archive` and contains a pre-existing Cargo.toml edit. Preserve it by working in an isolated clone at `E:\Monitoring-and-IoT\IRMS-wt\knowledge-base` on `codex/irms-knowledge-base-20261003`.

Pin application source mapping to `af65daa2c4eb29b2e296c2023caf07d0e4b4a9e1` and separately inspect firmware `15c5c709ba12603454449a2311faf3489ac7f96e`. Treat source logic as authoritative where historical comments disagree. Do not change application behavior, firmware, clinical targets or existing user data.

## Deliverables

- `doc/knowledge-base/`: 202 unique references across 22 topics, with original Traditional Chinese summaries, project applications, limitations and review depth.
- 157 journal/method references, 35 technical documents, 6 guidance resources, 3 dataset entries and 1 author technical report; 29 prioritized readings and 157 DOIs.
- 12 professional guides, 25 bounded citation claims, 12 proposed validation activities, 60 glossary entries, source methods, pinned code mapping, reading paths and assistant retrieval rules.
- Catalog JSON, source/topic Markdown, BibTeX, RIS, retrieval JSONL, standalone offline HTML and locally generated SQLite. SQLite is rebuildable and ignored by existing Git rules.
- Dependency-free Python maintenance/search scripts and an optional Node search-logic check. Link from root README and doc/HOME.

## Provenance and limits

Search 27 API batches returning 576 candidate records, including relevance and citation-count discovery plus targeted CONSORT/SPIRIT 2025. Editorial selection is by IRMS relevance and identifiable sources; this is not an exhaustive systematic review or evidence quality ranking.

Reading depths: 156 abstracts, 2 designated full-text section reviews, 42 official page excerpts/identities, 2 metadata-only documents. TDK MPU6050 PDFs were blocked/unavailable or redirected; official catalog identity is retained, without pretending to have reviewed their contents. No publisher full-text redistribution. Open-access flags are not redistribution or training licenses.

Different sensor hardware, populations and calibration methods do not establish IRMS accuracy or rehabilitation outcomes. In particular, current normalized-vector/angle records are insufficient to rerun full raw-IMU fusion. Hinge estimation, vector fallback and legacy-angle paths require separate validation; kneeRoll is not established clinical varus/valgus.

## Validation

- Catalog identity/date/required fields, 202 source cards and 22 topic indexes passed.
- All 156 MED titles, DOIs and authors matched source candidate API records after removing title markup; restored seven collective-author entries and protected them in BibTeX.
- 1,389 local Markdown links passed; BibTeX/RIS identity and structural checks passed. Actual citation-manager import was not tested.
- Retrieval limits/depth retained, SQLite integrity/foreign keys/English FTS passed, deterministic generated outputs passed.
- Python 3.9.13 syntax and CLI Chinese/core, Bland/topic and dataset JSON queries passed.
- Node v24.13.0 minimal-DOM tests passed: Chinese/English/PMID search, empty results, filters, pagination, citation display and retained limitations.
- Built-in browser rejected local file URLs by security policy. No browser rendering/accessibility acceptance was performed; no bypass was attempted.
- No app CI, native-device or human validation: application code was not changed.

See [verification details](../knowledge-base/VERIFICATION.md) and [maintenance](../knowledge-base/MAINTENANCE.md). Delivery follows the repository commit/push/PR workflow; this log is part of the reviewable change.
