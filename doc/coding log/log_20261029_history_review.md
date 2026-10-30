# R05 history review query/projection

Baseline05a223f clean readiness worktree. Plan plans/2026-10-29-history-review-plan.md; source snapshot
%TEMP%/irms-history-review-snapshot. Initial quota remaining84%/69%; pre-delivery observed66%/67%.
Previous head05a223f CI40868891187 confirmed SUCCESS before delivery. Lead alone edits/tests/Git;
engineering reviewer read-only, inherited model (exact backend ID unavailable).

Meeting: source verified chart getData(1200) queried/materialized entire session for native LTTB,
then getData() repeated full query for statistics; locale changes repeated both. Baseline regression
failed on two legacy calls. Accepted one-read additive getReview DTO/native command with chart and
complete analysis projection. Engineer verified timestamp/knee/proximal cover all three metrics,
knee personal-range statistics and extension analyzer complete t/v inputs. Preserve original Date.parse
vs Rust LTTB fallback distinction; no sampled analysis or generic native-time substitution.

Implementation: getReview calls one SELECT through get_data(None), shares original knee-LTTB/cursor
helper for fixed1,200 chart, projects every timestamp/knee/proximal row. CSV/getData thresholds/schema
unchanged. Session-bound data effect catches errors/discards obsolete outcomes; chart locale effect
reuses snapshot, memo analysis retains complete points/metric sign/ranges/module hook. Snapshot is
point-in-time; reopening refreshes, no new live-refresh claim. Development StrictMode replay can
issue an extra request; existing native work is not cancelled. Calibration snapshot variable was
renamed separately to retain its original render condition; no calibration/clinical/default change.

Reviewer identified avoidable simultaneous rows/projection/LTTB-points allocation. Lead accepted:
borrow-sample chart first, let points drop, then into_iter moves timestamps into analysis. Small-chart
clone remains necessary for separate returned collections. Final re-review accepted, no blocker.
No native peak-heap improvement claimed. Full analysis stays O(n) and lacks a total response byte cap.

Validation: 13 focused History tests and typecheck pass. Coverage includes one getReview/no legacy
read, locale redraw without fetch, current failure caught, obsolete resolve/reject after another
session, full projected segment-elevation/extension mapping and CSV containing rows absent in chart.
New Rust parity tests cover empty/small/other session,1,500-row full analysis/chart cap, duplicate
same-time/same-knee rows with distinct proximal, malformed/epoch-zero timestamp preservation and
exact serialized DTO keys. Existing all-row/maxPoints and LTTB tests retained. Full Rust141 passed,
6 ignored (3 live +3 manual), main/doc targets passed; fmt --check and all-target/all-feature Clippy
with warnings denied pass. New manual15k-row WAL benchmark separately passed with exact fixture
hash and source/Cargo/toolchain artifact. Returned JSON bytes3,311,285 ->1,912,413 (~42.2% lower),
p50 query+serialization170.1933ms ->85.9436ms on this debug synthetic workload only. No IPC/FPS/
WebView/analyzer/native memory measurement. See doc/performance/history-review-projection.md/json.

Setup/query corrections: initial typecheck caught duplicate snapshot local name (fixed calibration
name and condition); new command helper corrected to existing lock_db before Rust checks. Legacy
export fixture now supplies explicit new review result separately from full export; earlier empty
default intentionally kept export disabled. Metric test now scopes peak vs equal-valued mean and
uses existing one-decimal format. These were test/setup/refactor corrections, not relaxed contracts.

No product deployment, private DB, device or participant operations. All current frontend tests/build
results recorded below. Docs/index/spec/cheat sheet/readiness/optimization/threat/performance/checkpoint
updated. R05 paced native UI/IPC/memory, R07 institution/metrology and S03 rollout acceptance remain
open. Next bounded task: history list query/pagination budget source review; preserve sorting, deletion,
full record availability and export. Do not repeat full project or completed Wizard A/B audit.

Final frontend verification: 606/606 tests across62 files, zero failures; Vite build passed. Existing
large chunk/ToolsView import warnings and intentional crash stderr unchanged. Native packaged UI,
actual live database/device and performance acceptance remain unverified; no production deployment.
