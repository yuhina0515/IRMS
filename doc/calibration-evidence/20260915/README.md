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

## Next design gate

- Define flexion, relative knee angle, and out-of-plane deviation separately; distinguish a measured tilt/deviation from a full anatomical orientation claim.
- Establish a common calibrated frame or another justified relative-angle method before combining limb readings.
- Specify repeated movement capture, axis-fit quality rejection, return-to-baseline validation, and insufficient-data behavior.
- Recover matching settings and movement annotations, or capture a new supervised labeled dataset with the complete calibration snapshot.
- Select numeric accuracy/repeatability thresholds using a reference measurement and intended operating range; this trace has no ground-truth angles.
- Implement model changes together with capture instructions and versioned settings, after the design gate. Do not silently reinterpret old calibration snapshots.
