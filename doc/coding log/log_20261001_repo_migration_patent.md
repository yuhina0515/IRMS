---
tags: [irms, license, repos, patent]
date: 2026-10-01
summary: "Old repos archived privately; new public repos under the original names with a source-available, no-patent-grant license."
---

# Repository migration (patent retention)

- Earlier repositories were renamed to `*-archive` and made private. They are no longer maintained.
- New public repositories reuse the original names so the app's updater, module sync and firmware OTA URLs keep working. Releases were re-uploaded with identical tags and assets; signing keys are unchanged.
- LICENSE: source-available, no patent license granted (draft, pending legal review). Releases up to v1.2.0-beta.19 stay under MIT (LICENSE-MIT-HISTORICAL).
- Verified: update, module and firmware URLs return 200 from the new repos; the updater manifest reports 1.2.0-beta.19 with a 436-char signature.
- Not verified: an installed app actually updating from the new repo; Firmware/Modules release workflows with the re-set signing secrets.
