# R06 calibration Wizard A modal focus

Baseline 61351c9, clean readiness worktree, CI 40861529361 confirmed SUCCESS. Plan:
`plans/2026-10-29-calibration-focus-plan.md`. Snapshot `%TEMP%/irms-calibration-focus-snapshot`.
Initial quota remaining 45%/74%, observed before delivery 37%/73%; shared account, not task tokens.
Lead edits/tests/delivery; independent read-only inclusion reviewer uses inherited model, backend ID
unavailable. No deployment or hardware/participant operations.

Meeting decisions: reviewer confirmed ordinary wizard overlay had no initial/contained focus,
dialog semantics or isolation. Lead reproduced initial focus remaining behind wizard; baseline test
failed. Capture removed Escape registration, allowing background handlers. Accept both issues.
Use body portal/named dialog and a wizard-specific lifecycle with reversible shared inert lease,
contained Tab/focus/pointer, enabled-control repair and eligible invoker restoration. Yield from
synchronous hardware/confirm store state and actual alertdialog presence, so confirmation closing
animation keeps ownership. Remember wizard-local control and resume after higher portal removal.
Controls/body observers and store subscriptions clean up with guards; StrictMode replay supported.

Corrected plan/reviewer suggestion: Wizard Escape -10 loses to ordinary background priority 0.
Use wizard 10, confirmation 20, emergency 100; default 0 LIFO unchanged. Always consume while
capturing or blocked. Real regression registers a background handler after mounting wizard and
verifies no capture close/leak, while explicit close remains available. Confirmation callsite is
changed only to reserve precedence; no resolution/persistence or alert implementation rewrite.
Calibration capture/sample math, auto-capture timings, settings/DB/BLE/IPC contracts unchanged.

Validation in progress: 38 focused tests across four files and typecheck passed. Ten new focus
cases cover StrictMode portal/name/isolation/restore; Tab/background focus/pointer; disabled/removed
controls; capture Escape; both component orders of real confirmation open/closing and emergency
recovery; unmount while emergency active; late wizard below existing emergency. One initial unmount
fixture changed fragment structure and remounted ErrorOverlay, causing legitimate emergency cleanup
focus restoration; fixed stable fragment index instead of changing product behavior. Initial typecheck
before test expansion reported unused imports; all imports then exercised by final integration cases.

Native WebView/inert enforcement, screen-reader speech, CSS-only hidden-control filtering, full
step announcements and Wizard B remain unverified. Escape protects overlay ordering, not hardware
sampling validity or native cancellation. S03 coordinated native/collector rollout and R05/R07
performance/institution/metrology gates remain open. No broad accessibility/clinical/country/population
acceptance claimed. Next bounded work: Wizard B control/overlay source review, preserve its separate
capture and preview contract; do not repeat the completed A modal audit.

Final-review adjustment: reviewer verified same-z-index portal insertion-order bug. Confirmation
now declares z-index 1200 above ordinary wizard 1100 and below emergency 1500. Added late wizard
mount under an already visible confirmation; focus/isolation/Escape/closing recovery and explicit
layer declaration asserted. Reviewer final re-review accepted, no remaining blocker. Actual native
painting/AT remains unverified; this is source/CSS and DOM evidence only. Final test count below.

Final validation: 586/586 frontend tests across 59 files, zero failures; typecheck and Vite build
passed. Final Wizard/Confirm subset 21 tests passed after stacking fix; earlier four-file focused
run passed 38 before that last case. Existing Vite chunk/ToolsView warnings and intentional crash
recovery stderr unchanged. Rust/collector unchanged and not rerun. No native acceptance inferred.
