# Native feature migration squad

## Goal and constraints

Continue the complete Windows Rust/Slint migration described in
`doc/plans/2026-11-16-rust-native-ui-plan.md`, prioritizing the missing session
controller and mobility measurement behavior and their actual native UI integration.
The owner explicitly stopped Smart App/signing investigation. Do not research or
change that area. Preserve existing Tauri operation, separate native data, and all
unrelated changes. No hardware acceptance claim from simulation or tests.

Baseline: `2629926400ea955e18fc100fbeced4d9484ea308`, clean worktree.
Snapshot: `C:\Users\Yuhina\AppData\Local\Temp\irms-native-port-20261116-2629926`.
It contains tracked native/core source, Tauri frontend/services/fixtures/backend
source and the migration plan; no target, node_modules or credential directories.

## Independent read-only workers

| ID | Model | Scope | Focus |
|---|---|---|---|
| controller | inherited current Codex model, no override | Tauri sessionController*, triggerConfig, voice; native main.rs and core judge | Concrete parity gaps in session/BLE feedback/lifecycle; actionable port contract and tests |
| mobility | inherited current Codex model, no override | Tauri mobilityC*, MobilityWizard/MobilityTrend; native pipeline/store and core db | Complete mobility algorithm, record identity/trend contracts and native integration requirements |
| native-ui | inherited current Codex model, no override | native ui/*.slint; Tauri views/components and core types | Visible inert/misleading controls and missing feature paths; prioritize real behavior over placeholder UI |

Workers must not edit files, commit, deploy, restart services or message other chats.
Review snapshot source; use live worktree only for locating existing tools and
read-only baseline checks. Reports at most 400 words, snapshot `file:line |
BUG/RISK/NIT | issue | concrete failing scenario | proposed fix`. Distinguish
verified gaps from uncertainty. Lead alone verifies findings and changes code.

## Implementation and verification

1. Verify worker claims against current source and relevant Tauri tests.
2. Port missing logic to the toolkit-independent core, preserving temporal,
   identity, persistence and feedback semantics. Integrate actual native controls.
3. Add meaningful contract/behavior tests, using shared TypeScript/Rust fixtures
   where applicable. Run bounded relevant frontend/core/native checks, Clippy and
   release build. Inspect runtime rendering and persisted state in isolated data.
4. Record accepted/rejected/deferred findings, actual workers/model selections,
   evidence and remaining migration gates in a new coding log and HOME index.
5. Deliver task-scoped commits/PR updates. Do not overwrite published beta.1 assets
   or force a Tauri updater cutover. A later beta package can follow verified work.

## Done criteria

The overall goal remains the full migration plan, not just this review or one port.
For each completed slice require actual native access, tests matching the original
contract, and recorded limitations. Keep the goal active while parity, platform
services, module design or native/device acceptance remain incomplete. Owner-only
decisions and physical-device gates must be reported accurately without stopping
independent migration work that can still proceed.
