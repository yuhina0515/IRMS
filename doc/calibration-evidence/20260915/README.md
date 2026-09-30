# Calibration trace preservation

Source: Claude's September 15 supervised-session trace, recovered from the local temporary directory on September 16. See `provenance.json` for source/extracted SHA-256 hashes and extraction details. `packets.txt` preserves all 66,927 trace packets in original order, excluding unrelated console output.

## Reproduce

From `IRMS_App_Tauri`, using Node 24:

```powershell
node scripts/replay-calibration.mjs ../doc/calibration-evidence/20260915/packets.txt
```

Observed: 66,560 angle packets, all containing both vectors; 367 hardware error packets; no malformed or truncated packets. Vector norms range from 0.999217694 to 1.000818165. Error counts are packet counts, not independent incidents. No timestamps survive in this trace, so elapsed time, sustained rate, and movement phases cannot be inferred reliably.

The exact matching `proximalZeroAccel`, `distalZeroAccel`, `proximalHingeAxis`, and `distalHingeAxis` settings are absent from the located log. Claude's report refers to them as logged above, but does not actually include their values. Do not substitute current live settings or infer calibration endpoints from unlabeled packets and call that the original session.

If a matching plain settings JSON is recovered, append its path to the command. This reports the current unsmoothed hinge projection only, not the complete application pipeline, inversion settings, smoothing, or clinical accuracy. The report deliberately leaves calibrated metrics null without settings.

Manual Euler offsets from Claude's log remain useful comparison evidence, but cannot reconstruct the missing hinge frame.

User clarification (2026-09-16): the manual debugging result was found by the user after
Codex hit its five-hour usage limit and was then recorded by Claude at the user's request.
Treat it as user-observed behavior, not an independently validated Claude result. The
clarification does not establish that a separate full settings snapshot was saved.

## Design counterexamples

`src/services/calibration.redesign.test.ts` contains explicitly synthetic evidence:

1. Pure 150-degree hinge flexion produces 180-degree Roll using the current shared-denominator projection. The desired behavior is recorded as an **expected failure**, not a fixed regression.
2. Two limbs moving together with one sensor rotated 90 degrees about the standing axis produce a spurious 60-degree raw inter-vector angle at 45-degree flexion. Standing subtraction does not resolve independent coordinate frames.

These examples constrain the redesign; they do not identify exact real-device mounting or validate a replacement model. The existing pitch improvement remains untouched.

## Statistical stationary-segment check (2026-09-20)

09-17 task schedule listed a low-priority, "not sure if worth it" idea: without timestamps
or movement labels, can purely statistical stationarity detection on the `V:` vectors find
"both limbs simultaneously still" segments usable as an indirect check of whether the
thigh- and shin-derived hinge axes are roughly parallel — the assumption
`reconcileToReferenceFrame` depends on. Ran it; see `stationary-segment-axis-check.mjs`
(reproduce with `node stationary-segment-axis-check.mjs` from this directory).

**Method**: rolling 25-sample window (≈1s at the nominal 25Hz rate — unconfirmed, no
timestamps survive), stationary if max deviation from the window mean stays under 0.02 for
both limbs at once. 118 contiguous stationary runs found; the dominant one (6,907 samples)
is the standing baseline. Of the remaining runs ≥0.6s, 9 differ from standing by >15° on
*both* limbs simultaneously — plausible held poses rather than standing-with-noise. For
each, derived a candidate hinge axis per limb via `cross(standing, held)` (the same method
`deriveHingeAxis` uses) and measured the angle between the thigh- and shin-derived axes.

**Result: inconclusive, not a clean pass or fail.** The 9 derived-axis angles split roughly
in half: four near-parallel (2.0°, 4.7°, 5.4°, 6.3°) and the rest substantially non-parallel
(23.3°, 28.4°, 68.5°, 71.3°, 94.1° — the last is nearly orthogonal). This does not
consistently support or refute the parallel-axis assumption.

**Why this doesn't settle it, and shouldn't be over-read**:
- This is *not* the wizard protocol (which isolates one joint's motion while the other
  stays at standing). These are incidental pauses in an unstructured trace, so a large
  derived-axis angle may reflect genuine coupled motion (e.g. torso/hip rotation between
  squat depths) rather than a clean test of the thigh/shin hinge-axis relationship.
- Only 9 usable candidates out of 66,560 packets, several as short as 22–39 samples
  (~1–1.5s) — thin evidence for a claim either way.
- Consistent with the trace's known limitation (missing hinge-axis/zero-accel settings):
  this data cannot substitute for a real wizard-protocol capture with movement labels.

**Conclusion**: this line of analysis does not change CAL-02/CAL-03's standing decision —
real-hardware A/B validation (see
[[log_20260917_cal02_design_decision|CAL-02 decision doc]] §5) remains required before
`reconcileToReferenceFrame` can be wired to production. Recorded here so the same
"is it worth trying" question doesn't get re-asked and re-attempted from scratch later.

## Next design gate

- Define flexion, relative knee angle, and out-of-plane deviation separately; distinguish a measured tilt/deviation from a full anatomical orientation claim.
- Establish a common calibrated frame or another justified relative-angle method before combining limb readings.
- Specify repeated movement capture, axis-fit quality rejection, return-to-baseline validation, and insufficient-data behavior.
- Recover matching settings and movement annotations, or capture a new supervised labeled dataset with the complete calibration snapshot.
- Select numeric accuracy/repeatability thresholds using a reference measurement and intended operating range; this trace has no ground-truth angles.
- Implement model changes together with capture instructions and versioned settings, after the design gate. Do not silently reinterpret old calibration snapshots.
