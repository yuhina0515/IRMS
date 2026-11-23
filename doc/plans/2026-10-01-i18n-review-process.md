# i18n review process (2026-10-01)

English strings in `IRMS_App_Tauri/src/i18n/en.ts` are a first translation written by Claude. Wording that a
patient reads or that implies clinical meaning (pain, limits, joint terms) needs two review stages.
Stage 1 is a cheap preliminary pass by ChatGPT. **It never replaces stage 2**: a clinician or physical
therapist must sign off before the English UI is described as clinically reviewed.

## Stage 1: ChatGPT preliminary review
Scope: every key under `clinical.*` in `en.ts` (full list: `doc/coding log/log_20261001_i18n_views_p1.md`,
section "needs clinician review"), plus the calibration wizard strings.

Steps:
1. Export the zh-Hant / en pairs for the scope (key, zh-Hant, en) as a table. Do not paste credentials,
   patient data or anything outside the dictionary.
2. Send the prompt below with the table.
3. Record every suggestion in a review sheet (key | current | suggestion | reason | decision). Apply only
   changes that keep the zh-Hant meaning; ChatGPT output is a suggestion, not an authority.
4. Keep `en.ts` and `zh-Hant.ts` key parity (the i18n tests enforce it); run `npm test` after edits.

Prompt template:

```
You are reviewing English UI strings for a knee rehabilitation motion-monitoring app. Each row has a key,
the Traditional Chinese source (the intended meaning) and the current English. Review for:
1. Meaning drift from the Chinese source.
2. Clinical terminology (use standard physical-therapy terms: flexion/extension, tibia/shin, varus/valgus).
3. Patient-facing tone: plain, calm, no alarming wording; pain-related lines must not instruct beyond comfort.
4. Instructions that could be misread and lead to unsafe movement.
5. Length (mobile UI): flag strings that are long.
Return a table: key | verdict (ok / change) | suggested English | one-line reason. Do not rewrite rows that are ok.
Flag anything you are unsure is clinically correct as "NEEDS CLINICIAN".
```

## Stage 2: professional review (required)
- Reviewer: a licensed physical therapist or rehabilitation physician (not the developers).
- Input: the review sheet from stage 1 plus the final strings in context (screenshots of dashboard,
  calibration wizard, history).
- Focus: `clinical.overComfort` ("this may start to hurt"), `clinical.dashboard.overLimit*`,
  `clinical.terms.*` (comfort angle, limit range, target zone, shin rendered as "Lower leg"),
  `clinical.protocol.*`, `clinical.calibration.*` movement instructions.
- Output: signed-off sheet stored in `doc/` with reviewer role and date. Until it exists, release notes
  must say the English clinical wording is unreviewed.

## Done criteria
Stage 1 sheet complete and applied; stage 2 sign-off recorded; both locales still pass the parity tests.
