---
tags: [irms, ui, design, handoff]
summary: "v3 design deliverables, decisions, checks and remaining rendering verification."
date: 2026-09-25
---

# UI v3 design handoff

## Scope

Read `BRIEF.md`, beta8 spec, the remote-tracking v2 proposal, current views/components/styles and relevant metric/analysis code. Reviewed all supplied current screenshots. Created design artifacts only under `doc/ui-v3-gpt/`. The brief, reference screenshots, application source, Git configuration and existing project logs were not edited.

Git initially rejected reads because of repository ownership. Read-only Git commands used a command-local `-c safe.directory=E:/Monitoring-and-IoT/IRMS`; no persistent exception was written. Starting status had only this untracked design folder.

## Decisions

- Chose **Rehabilitation Workbook / 復健工作簿**: warm paper/plum palette, serif headings, horizontal navigation, one rounded working sheet.
- Paired the primary metric with a large pose stage; removed the six clinical stat cards. Roll remains diagnostic, without anatomical varus/valgus claims.
- Preserved existing trigger distinctions, knee-straight gate, rest behavior and effective limit semantics in the proposal.
- Split Settings into six categories with one bounded content scroller.
- Replaced the analysis modal with a full review page and explicit changed-calibration comparison caveat.
- Specified attempt-event persistence/reconstruction as new work; did not imply existing schema supports authoritative per-rep analysis.
- Used system fonts, inline CSS/JS and hand-authored SVG for fully offline HTML. The 3D control is labeled as a concept rather than an actual WebGL implementation.

## Authored files

- `PROPOSAL.md`
- `mockup-dashboard.html`
- `mockup-settings.html`
- `mockup-history-review.html`
- `build_mockups.py`
- `verify_static.cjs`
- `verify.cjs`
- `verification/static-results.json`
- `WORK_LOG.md`

## Verification

Executed:

```powershell
python doc/ui-v3-gpt/build_mockups.py
node doc/ui-v3-gpt/verify_static.cjs
```

Result: **80 checks passed**, including **36 contrast pairs**. Other checks cover script syntax, local dependency independence, unique IDs, local navigation, theme switches, Dashboard states, calibration badge consistency, pose switch, Settings categories, telemetry consent/endpoint lock and rep selection. Dialog open/close is simulated in JSDOM, not a native-browser accessibility test.

Attempted `node doc/ui-v3-gpt/verify.cjs`. Browser process creation was denied with `spawn EPERM`. The available browser-control inventory was empty; creating an IAB tab returned “Browser is not available: iab”. Consequently there are **no rendered verification screenshots or claimed measured viewport results**. `verification/static-results.json` explicitly records this limitation. JSDOM cannot validate geometry, clipping, typography, WebGL, native focus behavior or physical viewing distance.

The static verifier uses the repository's existing `IRMS_App_Tauri/node_modules/jsdom` without installing packages. The browser verifier's defaults refer to this machine's existing Playwright and Chromium locations; environment overrides `IRMS_PLAYWRIGHT_MODULE` and `IRMS_BROWSER_EXECUTABLE` can point to other existing installations. No helper is required to open the finished HTML files.

## Next review

Open each HTML at 1280×720, switch themes and review Dashboard alert states. Run the included browser verifier where process creation is available, then check native Windows 100/125/150/175% scaling and 2 m legibility. Do not interpret the calculated layout allocations as measured overflow acceptance. Resolve the logical-versus-physical minimum-window interpretation before production acceptance.

No application tests/build were run: no application code changed. Approval of the design direction and production implementation remain separate future work; this task only produces the requested proposal and mockups.
