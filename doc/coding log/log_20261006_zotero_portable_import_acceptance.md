---
tags: [irms, knowledge, literature, validation, zotero]
date: 2026-10-06
summary: "Execute official portable Zotero BibTeX/RIS imports and record saved-field checks with remaining export/browser gaps."
---

# Portable Zotero import acceptance

The user explicitly authorized the official portable distribution. Download the vendor Windows x64 ZIP, verify Zotero 10.0.5 and a valid Corporation for Digital Scholarship executable signature, and run without executing an installer. Record ZIP/executable SHA-256. Create independent temporary profiles with explicitly separated custom data directories before launching; no account login or sync initiated.

Use the actual Windows File > Import wizard for each format against source commit b2ebbaf7402294956202c0d6e7ef07857c516cb0. Both completion dialogs show 202 imported items. Preserve the RIS completion screenshot in the knowledge base. Compare closed saved SQLite databases in read-only mode against the canonical catalog: 202 items/URLs, 157 DOIs, publication fields, page/article numbers, years, creator count/order/names and corporate field mode match in both formats. Both integrity checks return ok. Raw audit script/reports and profiles remain in the acceptance temporary directory; selected public samples and file hashes are recorded in data/zotero-acceptance.json.

Retain three BibTeX title double-hyphen to en-dash transformations and the Madgwick report descriptor absent from publicationTitle; both imported item types remain report. Do not rewrite original metadata or call a punctuation transformation exact textual equality. No Chinese metadata fixture was injected into the actual library, and no export encoding claim is made.

Export dialog inspection succeeded, but controlling its owned windows failed (cached element unavailable / input point over non-target window). Refresh and recovery did not allow reliable format/save operations. No exported file or round-trip validation is confirmed. Stop the BibTeX test process after verifying its path; subsequent saved database integrity is ok. Close the RIS instance with Alt+F4. Do not automate the user's existing library or change security settings.

Chrome initially exposes only the Zotero welcome page. Direct knowledge-base file URL navigation is rejected by browser security policy; do not use alternative protocols/surfaces or indirect launch to evade it. Request manual B01-B09 results. Task 4 remains partly complete; task 5 merge and task 7 known-angle/remount hardware acceptance remain open. Continue PR #1, without declaring the full goal complete.

Update ACCEPTANCE_RESULTS.md, checklist, progress ledger, README, VERIFICATION and HOME. Run the knowledge-base integrity/link checks and whitespace validation; attach the existing PR and commit/push only these evidence changes.
