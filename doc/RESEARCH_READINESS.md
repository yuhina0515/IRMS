# Research and inclusive engineering readiness

Reviewed: 2026-10-29 (Asia/Taipei). Baseline: beta.25 plus draft PR #4; this batch is a stacked change, not a release.

IRMS is an educational engineering demonstration. A passing software test does not establish clinical validity, suitability for an individual, or acceptance by a university. This document turns the broad international/university goal into bounded, reviewable work.

## University evidence mapping

These are examples from specific courses, not university-wide or admission requirements. No target institution/program was supplied. Re-check the target's current rubric and permitted AI assistance before submitting; retain author contributions, sources and AI work logs. Do not invent affiliation, approval, participants or results.

| Official source, checked 2026-10-29 | Source scope | IRMS deliverable | Current gap |
| --- | --- | --- | --- |
| [University of Washington CSE 481S, Spring 2026](https://courses.cs.washington.edu/courses/cse481s/26sp/deliverables.html) | Security capstone deliverables include design, peer security analysis, test environment and final demonstration | Versioned architecture/threat model; reproducible isolated test setup; findings/fixes linked to commits; demo recording | No course submission or rubric acceptance claimed; independent review here is engineering input only |
| [University of Edinburgh Informatics DISS project assessment](https://opencourse.inf.ed.ac.uk/diss/project-assessment) | MSc dissertation guidance covers objectives, background, design/implementation, critical evaluation and limitations | Research question, related work, justified alternatives, evaluation against objectives and reference measurements, reproducibility appendix | Software alone is insufficient; no dissertation, original contribution or marking result claimed |

## Evidence gates

| Gate | Evidence to capture | Present boundary |
| --- | --- | --- |
| Reproducibility | Source revision, lockfiles, OS/runtime/tool versions, exact commands, fixtures, expected failures, data provenance | Automated checks are logged per batch; native environment and hardware must be recorded separately |
| Measurement | Timestamped synchronized raw streams, reference instrument/procedure, axis/mount calibration, missing-data behavior, repeated placement and uncertainty | Synthetic tests do not establish anatomical accuracy; thigh inclination without pelvis reference is not anatomical hip angle |
| Reliability | Disconnect/stall/reconnect, failed storage/retry, cancellation, update deferral and restart behavior | In-memory failed-save recovery is not crash durability; device E2E remains open |
| Security/privacy | Data-flow/trust-boundary inventory, opt-in semantics, retention/access control verification, download/input/resource budgets and review trace | Health endpoint liveness is not security acceptance; never include credentials or participant data in public PRs |
| Performance | Reproducible 25 Hz fixture plus outage/recovery workload; record memory trend, queue/drop counts, UI latency and DB batch duration on named hardware | This batch bounds telemetry by serialized bytes; no measured FPS, latency or heap ceiling claimed |
| Institution-specific | Institution, country, department, course/year, official rubric URL/date, required artifacts and AI-use policy | Two illustrative mappings above; target-specific approval unknown |

## Inclusive scope and acceptance

The initial supported interface languages remain Traditional Chinese and English. A locale fallback or translation does not validate usability in another country. Keep degrees and UTC storage semantics explicit; format displayed values using the locale layer. Add a language only with dictionary completeness, native-language terminology review, layout/number/date tests and an explicit fallback. RTL, additional languages and regional formats are unverified.

| Dimension | Engineering action and acceptance evidence | Status |
| --- | --- | --- |
| Language/country | Task completion in supported languages, reviewed instructions, local date/number behavior; assess deployment/data flow for the intended institution and country | zh-Hant/en implemented; terminology/native speech review open; no country-wide compliance claim |
| Vision, hearing and motor access | Named controls, keyboard operation, visible focus, readable zoom, non-color status, text alternatives to speech; actual screen-reader/native WebView checks | Settings labels, toast live regions and singleton confirmation focus/isolation implemented; complete native journeys and other overlays remain open |
| Age and ability | Clear instructions, adjustable display and input, body-fit assessment, comprehension and task observations appropriate to intended users | No child, older-adult or disability population validation claimed |
| Sex, gender and ethnicity | Do not assume these determine movement goals or limits. Preserve personal measured settings; document recruitment and analysis choices only where scientifically relevant | No demographic treatment rules added; representative evidence absent |
| Fit and measurement | Record placement, limb dimensions where justified, motion/task, reference error, failed captures and repeated donning; evaluate variation and failure rates | Sensor fit and measurement generalization require real observations |
| Human evaluation | Define task, outcome, consent/data minimization, withdrawal/deletion and institutional review needs before recruiting; obtain required institutional decisions for the actual protocol | No participants recruited, human experiments performed or approval inferred |

If participant characteristics are collected for an approved evaluation, use only justified, optional fields where possible, permit self-description/declining to answer, and avoid publishing small identifiable subgroups. Do not add mandatory demographic profile fields simply to claim inclusivity. Report sample counts, exclusions, missing data and uncertainty; untested groups remain unvalidated.

The label implementation follows [W3C WAI form-label guidance](https://www.w3.org/WAI/tutorials/forms/labels/). Confirmation keyboard containment, background isolation and invoker restoration are informed by the [W3C APG modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) (read 2026-10-29). These improvements do not constitute a WCAG conformance audit. Live-region DOM tests do not prove actual screen-reader announcements.

## Department intervention and meeting rules

| Role | Intervene when | Required output |
| --- | --- | --- |
| Engineering/measurement | Timing, calibration, persistence, protocol or resource budgets change | Failure reproduction, invariants, regression checks, native acceptance boundary |
| Security/privacy | New endpoint, uploads, executable downloads, credentials, exposed services or participant data | Trust/data-flow assessment, bounded inputs, retention/access expectations and verified findings |
| Inclusion/accessibility | New controls, locale changes, speech, instructions, keyboard paths or target population | Accessible names/behavior tests plus specific manual checks and supported-language statement |
| Research/academic | New performance/measurement claims or target institution | Official source mapping, reproducible evaluation design, provenance and explicit unsupported claims |
| Lead | Reports disagree or scope grows | Recorded accept/reject/defer decision, rationale, smallest verifiable batch, scoped delivery |

Use asynchronous independent reports, then one written triage meeting. Do not manufacture consensus or run meetings without a concrete decision. Reviewers stay read-only. Antigravity is optional and was not found on PATH in this batch; do not install or route to an unverified account just to increase agent count.

## Ordered next batches

| ID | Priority | Concrete next action | Acceptance |
| --- | --- | --- | --- |
| R01 | Fixed locally, 2026-10-29 | TriggerEngine now restarts holds after >250 ms reception gaps or invalid/backwards timing, with a monotonic clock | Original regression failed before fix; focused engine/controller/scenario tests cover silence, 250/251ms boundary, 25 Hz, hysteresis, clock anomalies and rest gating; native timing remains open |
| R02 | Fixed locally, 2026-10-29 | Shared downloader applies caller-specific caps before appending each body chunk, including metadata/signatures and exact verified payload sizes | Local HTTP tests cover header-only oversize, single/multiple chunks, close-delimited overflow, exact-limit signed/hash-valid artifact, HTTP failure and short artifact rejection; live release/OTA remains open |
| R03 | Fixed locally, 2026-10-29 | Singleton confirmation portal contains focus/keyboard, isolates background through closing, restores invoker and yields immediately to hardware errors | Eleven DOM/keyboard cases include replacement, StrictMode, dynamic siblings, inert cleanup and emergency focus; native keyboard/screen-reader acceptance open |
| R04 | Medium | Gate every BLE notification by connection generation | Stale notification cannot emit sensor/calibration input; hardware race acceptance tracked separately |
| R05 | Medium | Capture an offline performance baseline and threat/data-flow model | Named machine, fixtures, exact commands, latency/memory/drop measurements and unresolved risks |
| R06 | Medium | Audit locale and full accessibility journeys, including toast announcements | Screen-reader/keyboard/zoom checks on supported client; reviewed translations and documented exclusions |
| R07 | Evidence gate | Extend institution mapping and measurement/fit evaluation when actual target or device evidence is available | No inferred institutional or population approval; protocol-specific evidence recorded |

## Autonomous continuation and quota

Automation `irms-squad` wakes this chat hourly. Read the [checkpoint](../plans/2026-10-29-readiness-checkpoint.md), inspect status and check live account limits before expensive work. Work on at most one bounded task per run. Stop starting expensive work at <=20% remaining in either known window, checkpoint, and resume only when every known window is >=30%. Unknown quota permits status inspection only. This is a cooperative check at task boundaries, not a hard per-token interceptor. Account quota percentages are not measured tokens or cost savings.

Do not purchase credits, consume resets, substitute credentials, merge PRs or claim deployment/hardware acceptance. Existing pre-authorized scoped commit/push/draft-PR work may proceed after validation. Already-sent telemetry requests cannot be recalled by changing settings. Use verified project endpoints only; no host-wide scan or deployment is needed for this batch. Report meaningful progress, new failures or required user input; unchanged waits remain quiet.
