---
tags: [irms, ui, design, v3, proposal]
summary: "Rehabilitation Workbook: a warm, typography-led desktop direction with a paired metric/pose stage, bounded settings, and full-page session review."
date: 2026-09-25
---

# IRMS v3 — Rehabilitation Workbook / 復健工作簿

**Status: design proposal for the user's decision, not an application implementation.**

The direction is a **quiet rehabilitation workbook**: ivory paper, plum ink, generous type, rounded working sheets, and horizontal navigation. A patient sees one instruction and one meaningful number. A therapist sees the pose beside it, the prescription above it, and the session controls below it.

Open the three HTML files directly in a browser. They contain their own CSS, scripts and SVG; no network or server is required. The default theme is light; the top-right button previews dark. All figures are fictional design examples. The mockups do not access BLE, local records, telemetry, or application settings.

## 1. Concrete review of the current UI and v2

| Evidence | Keep | Change in v3 |
|---|---|---|
| Current Dashboard screenshot: disconnected arc, six equally prominent numeric cards, large empty lower surface | Clear action identity and explicit connection state | No idle instrument illusion. A missing measurement is `—`; raw values do not become the fallback content when space is tight. |
| Current `DashboardView.tsx`: pose and trend default off; compact fallback repeats six values | The action-specific metric layer and existing session controller | Metric and pose become the two main visual anchors. Their position no longer depends on competing evidence tabs. |
| Current Actions screenshot: an English trigger label wraps, and row controls drop below the content | Search, sort, group, restore, record-pose and validation behavior | Two-line entries with named parameter columns; trigger labels use short translated names. Editing belongs in an adjacent inspector. |
| Current Settings screenshot: telemetry reached near the end of a long scroll | Existing consent copy and operational restrictions | A category index replaces vertically stacked panels. Only the selected, bounded settings pane may scroll. |
| Current History after the fix: useful summary, but a small chart modal and persistent Roll series | Full-resolution statistics, prescription/calibration snapshots, source labels | Analysis becomes a full work page with attempts, holds, exceptions and a guarded comparison. |
| v2 §§1, 3, 8: state first, semantic colors, HTML primary number, patient focus mode | These are useful principles; v3 retains them | v2 deliberately preserves the 84 px rail, 72 px bar, 4 px surfaces, dominant arc and lower evidence shelf. v3 changes the navigation, geometry, typography and spatial hierarchy. |
| v2 §9: Settings keeps the workbench and History keeps the modal | Functional IA remains recognizable | Those structures do not solve the brief's crowded settings and limited review space. |

The current CSS already prevents `body` scrolling, but `.workspace-main` is a full-workspace scroller. The brief asks for a stricter result: **even that large workspace must stay still**. Long content needs an explicitly bounded list, inspector or settings pane.

### Inputs reviewed

- `doc/UI_REDESIGN.md` (beta8).
- `origin/claude/irms-ui-redesign-38fvnr:doc/UI_DESIGN_LANGUAGE_V2.md`, read directly from Git without checkout or configuration changes.
- The four Tauri views; related pose, gauge, session, calibration and telemetry components; `src/styles/tailwind.css`.
- `movementMetric.ts`, `sessionAnalysis.ts`, and `src-tauri/tauri.conf.json` for behavioral and size constraints.
- All five PNGs in `current/`, including the earlier real-device blank analysis modal.

The brief and explicit user request authorize this design draft despite older design-authority wording in `AI_CODING_RULES.md`. The writing restriction takes priority over that document's normal logging location. This folder contains the handoff log; no global project log or source file was changed.

## 2. Principles and structural decisions

1. **One instruction, one judged metric.** A large primary angle supports the current instruction. No six-card numeric dashboard.
2. **Pose earns equal space, not equal authority.** It explains direction and movement. Only the engine's primary metric determines the displayed target/hold status; 3D appearance cannot certify anatomical alignment.
3. **The window is a working sheet.** Global navigation, primary actions, alerts and page headings stay fixed. Overflow belongs to one labeled region.
4. **Trust is stated, never scored without evidence.** “校準完成 · 14:02” describes a completed procedure. It does not imply “98% accurate.” Unknown confidence remains unknown.
5. **Review exceptions before celebrating peaks.** A higher peak can be an over-limit event. Do not turn it into an improvement badge.

The four IA destinations remain **即時監測 / 動作處方 / 療程紀錄 / 設定**. Moving them to horizontal text tabs removes the technical command-rail silhouette and gives the leg a wider stage. The native Windows title bar remains native; the mockups represent the client area and do not reproduce Windows controls.

One large rounded sheet is the organizing surface. Internal sections use whitespace and rules, not a grid of interchangeable cards. Plum is for navigation, focus and action; green is only for target/hold success; red is for active alarms and hardware failure; amber is for uncertainty or a condition requiring attention.

## 3. Design tokens

### Colors

| Token | Day / light | Night / dark | Purpose |
|---|---|---|---|
| canvas | `#EEEAE2` | `#201E23` | Window background |
| paper | `#FFFCF6` | `#29262D` | Main working sheet |
| soft | `#E8E2D8` | `#36313A` | Pose stage, secondary controls |
| ink | `#29252D` | `#F4EEE6` | Primary text and numbers |
| muted | `#625C65` | `#C3B8C5` | Supporting text; never opacity-reduced body text |
| line | `#CFC6BD` | `#514853` | Decorative separators only |
| edge | `#827784` | `#A698AA` | Input and interactive control boundaries |
| accent | `#684563` | `#D9B6D0` | Plum action, selected state, primary chart series |
| on-accent | `#FFFFFF` | `#29252D` | Filled action-button text |
| tint | `#EDE1EA` | `#463443` | Selected navigation/tab background |
| good / good-bg | `#286047` / `#E0EBDF` | `#ACD7B8` / `#2D4033` | Target and hold |
| warn / warn-bg | `#805017` / `#F4E7CF` | `#F0C182` / `#493922` | Missing calibration, comparison caveats |
| danger / danger-bg | `#B02D32` / `#FAE5E0` | `#FFA7A0` / `#502D30` | Over-limit and hardware failure |
| on-danger | `#FFFFFF` | `#29252D` | Filled alarm-action text |

Computed ratios below are **foreground/background**. The calculation uses the sRGB relative-luminance formula. Pass/fail uses unrounded ratios; displayed values are rounded to two decimals. Reproduce with `node doc/ui-v3-gpt/verify_static.cjs`; full results are in `verification/static-results.json`.

| Pair | Day | Night |
|---|---:|---:|
| ink / paper | 14.68:1 | 12.93:1 |
| ink / canvas | 12.53:1 | 14.33:1 |
| ink / soft | 11.67:1 | 10.99:1 |
| muted / paper | 6.33:1 | 7.79:1 |
| muted / canvas | 5.41:1 | 8.64:1 |
| muted / soft | 5.03:1 | 6.63:1 |
| accent / paper | 7.83:1 | 8.20:1 |
| accent / tint | 6.32:1 | 6.30:1 |
| on-accent / accent | 8.02:1 | 8.27:1 |
| good / good-bg | 6.00:1 | 6.96:1 |
| warn / warn-bg | 5.58:1 | 6.69:1 |
| danger / danger-bg | 5.31:1 | 6.42:1 |
| danger / paper | 6.28:1 | 8.01:1 |
| on-danger / danger | 6.43:1 | 8.08:1 |
| edge / paper | 4.17:1 | 5.46:1 |
| edge / soft | 3.31:1 | 4.64:1 |

Text pairings exceed 4.5:1. Control edges exceed 3:1. `line` is not suitable for a control outline, focus indicator, meaningful chart line or text. The target band has a contrasting outline and a written range; its pale fill alone carries no information. These thresholds follow [W3C text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). Token checks are not a claim of whole-application WCAG conformance.

### Type, spacing, shape and motion

| Role | Specification |
|---|---|
| Page title | 32/40 px, 600; 40/50 on large desktop; 27/34 compact. Serif title gives the workbook its editorial character. |
| Primary angle | 112–120 px at 1280; 176 px at 1920; 88 px at 1024; sans, 500, tabular numerals. Always HTML text. |
| Critical alarm | 40/48 px, 700, explicit `!` or `×`; full-width 112 px band. Do not shrink to a toast. |
| Coaching instruction | 27/34 px, 600; 36/44 on large desktop. |
| Completed reps / hold | 28/34 px, 600; 36/43 large; 25/30 compact. |
| Section / body / label | 20/28, 15/22.5, 13/19.5 px. Chart ticks and incidental metadata: minimum 12 px. |
| Fonts | Production: existing offline Inter Variable for UI/numbers, JetBrains Mono for diagnostic codes. Bundle Noto Serif TC for Chinese page titles with its license if approved; otherwise use an installed MingLiU serif fallback. No runtime font CDN. |
| Mockup fonts | Entirely installed system fonts: Segoe UI / Microsoft JhengHei; Georgia / PMingLiU titles. No downloaded or embedded font dependencies. Font substitution must be checked in the implementation. |
| Space | 4, 8, 12, 16, 20, 24, 32, 48 px; normal page inset 32 px; large 48 px; compact 20 px. |
| Radius | Main sheet 20 px; pose inset 14 px; controls 10 px; badge 999 px. No glow or glass blur. |
| Rules and focus | Decorative rules 1 px; controls 1 px `edge`; focus outline 3 px `accent`, offset 4 px. Alarm frame 4 px. |
| Motion | Optional hover/selection color fade 120 ms; panel opacity 160 ms. No bounce, auto-orbit, alarm blinking or number tweening. |
| Data motion | Preserve the current display update cadence. Do not interpolate a reassuring angle across packet gaps or delay alarms behind animation. Reduced motion disables decorative transitions and camera easing, not actual measured updates. |

Production patient-focus mode hides navigation detail, prescription editing and small metadata, uses a 160–176 px angle, 56 px instruction and large rep count, and keeps end-session and alarm controls visible. This is specified here, not implemented in the static specimens. A physical 2 m reading test on the intended monitor is required; CSS font size alone cannot prove distance legibility.

## 4. Fixed-window layout contract

Use `100dvh`, `minmax(0,1fr)`, `min-width:0` and `min-height:0` through the shell. `html`, `body`, app, page and main sheet have no scrollbars. Do not “solve” overflow by clipping inaccessible text: allow it only in the named region, paginate it, or switch the relevant subview.

The following are **client-area CSS pixels**, excluding native decorations. Border rounding may differ by 1–2 px. These are design allocations, not measured screenshots.

| Allocation | 1280×720 | 1920×1080 | 1024×600 |
|---|---|---|---|
| Top navigation / footer | 72 / 28 | 72 / 28 | 60 / 24 |
| Content width | 1216 | 1824 | 984 |
| Page top/bottom inset | 24 / 20 | 32 / 28 | 14 / 12 |
| Heading + gap | 60 + 16 | 80 + 24 | 52 + 10 |
| Main sheet height | 500 | 816 | 428 |
| Dashboard coach / dock | 68 / 92 | 92 / 112 | 58 / 78 |
| Dashboard central stage | about 338 | about 610 | about 290 |
| Settings index / body | 216 / remaining | 260 / remaining | 180 / remaining |
| History summary / remaining body | 88 / 410 | 110 / 704 | 76 / 350 |

### Dashboard / 即時監測

```text
IRMS       即時監測   動作處方   療程紀錄   設定       device / theme
坐姿屈膝                  prescription                  calibration
┌──────────────────────────────────────────────────────────────┐
│ ✓ 很好，保持這個位置                         再保持 1.2 秒    │
├─────────────────────────────┬────────────────────────────────┤
│ PRIMARY ANGLE               │ 動作姿態       [2D] [3D]       │
│          86°                │                                │
│                             │       LARGE LEG STAGE          │
│ 80–100° target / 135° limit  │                                │
│ ──────────▣─┃────────┆───    │ calibration scope / caveat     │
├─────────────────────────────┴────────────────────────────────┤
│ 已完成 6 次    保持 1.8 / 3.0 秒    02:18         結束療程    │
└──────────────────────────────────────────────────────────────┘
```

At 1280 and 1920 use approximately 51.5% metric / 48.5% pose; additional height enlarges the stage, not the amount of telemetry. At 1024 keep both anchors and dock; shorten secondary copy. No Dashboard scrolling. Diagnostic detail is a bounded drawer opened deliberately, replacing the pose region while leaving the metric and end-session control visible. The alarm uses a taller reserved band; compact alert states drop the decorative target ruler first.

### Actions / 動作處方

At 1280: heading + 52 px search/protocol/sort row + 12 px gap + **500×1216 working sheet** split 58% list / 42% inspector, with the toolbar allocation subtracted from the list area. Each action is a 96 px two-line entry. Available row count is computed from the remaining height; default four rows and page navigation in the fixed 44 px footer. At 1920: a 52 px toolbar, list about 58% wide, six or seven entries depending on grouping; keep the inspector around 680–760 px. At 1024: 55/45 split with three rows; descriptions move to the inspector.

Entry line 1: translated name, short trigger type, selected indicator. Line 2: three explicit cells — **target / hold / over-limit**. Safety is never a hidden “third tier.” Long names may wrap to two lines; use a higher row preset and reduce rows per page. English secondary name is optional. Full text is available on selection and keyboard focus, not solely hover.

Trigger names: 關節角度 / 肢段抬高 / 肢段後伸. The underlying enum remains unchanged. Description, protocol, numeric editing, record-current-pose and delete live in the inspector. Save/cancel stay in its fixed footer; only the form body can scroll. Restore defaults and destructive deletion keep existing confirmation rules. Group headings count toward page capacity; do not create a new full-page scroll. Empty search and empty library have different messages and exits.

The HTML navigation's action button opens a small layout sample, not a fourth full mockup; the brief requests three full HTML files.

### History list and full review / 療程紀錄

List view retains filters, timestamps, action, completed count, source and incomplete-session status. Allocate 48 px to filters, 40 px to table header and 44 px to pagination; use the remainder for 56 px rows (about six at 1280, twelve at 1920, four at 1024 after borders/gaps). Page count adapts to available height; keyboard selection is retained when page size changes. No whole-table workspace scroll.

Opening a session replaces the list with review and stores filter/page/selection for Back. At 1280, a fixed 88 px summary sits above a chart + attempt strip on the left and a **310 px bounded detail/comparison pane** on the right. At 1920 the detail pane is 390 px, and the chart takes the new space. At 1024 it is 280 px; side content may scroll within its visible boundary. For very long sessions, a fixed time-window control and a paginated attempt strip replace an endlessly expanding timeline. Only one detail pane scrolls.

The full-page review is the largest IA behavior change. It makes space for post-session work and avoids obscuring the history context behind a blurred modal.

### Settings / 設定

```text
系統設定
┌───────────────────┬──────────────────────────────────────────┐
│ 裝置與連線        │ Selected category title                  │
│ 校準              │                                          │
│ 顯示與語言        │   bounded settings body                  │
│ 軟體與韌體        │   (only this region may scroll)          │
│ 資料與隱私  ←     │                                          │
│ 示範模式          ├──────────────────────────────────────────┤
│                   │ Save/state feedback           Back       │
└───────────────────┴──────────────────────────────────────────┘
```

At all supported sizes, switching a category replaces the right pane. It never expands the page. The right footer is 54 px; the selected body takes the rest. At 1920, cap paragraphs at a readable width rather than stretching every line across the window. At 1024, opening telemetry advanced options scrolls that pane, with its category and footer still visible.

| Category | Contents and behavior |
|---|---|
| Device | Connect/disconnect, protocol support, data freshness, sensor fault summary. Connection alone does not mean valid measurement. |
| Calibration | Existing six steps, one screen per step, previous/next fixed. Retain mounting confirmation, stable capture, forward thigh, backward shin, optional side direction and final preview. Manual zero/invert settings under advanced; keep the session-running lock. |
| Display/language | Theme, language, preferred pose view, patient focus. Trend and raw diagnostics can be opened here; chart point limits and flush interval move to advanced. |
| Software/firmware | Separate App update and OTA tabs; channel, status, file selection, progress and retry stay within one body. No OTA during an active session; preserve existing backend locks and signature checks. |
| Data/privacy | Plain-language disclosure before switch; original sensitive-name consent retained; endpoint locked while enabled; queued/sent/dropped/last error/run ID in a compact expandable status section. Default remains off. |
| Demo | Scenario selector, start/stop, conspicuous source banner, count of demo records and explicit clear confirmation. Demo records remain visible and labeled in History and exports. |

### Windows scaling and smaller effective viewports

Do not multiply a fixed 1280 px canvas by DPI or use CSS transforms to shrink the entire interface. Layout follows actual `innerWidth`/`innerHeight`; renderer pixel density is a separate concern. Test 100%, 125%, 150% and 175% scaling on the native Tauri window, including title-bar and taskbar deductions.

There is a real distinction between **1024×600 logical client pixels** and a **1024×600 physical display at 175%**, which could leave only roughly 585×343 logical pixels before decorations. They cannot promise the same simultaneous content. The config names a minimum window size, not a proven physical-screen compatibility matrix.

Proposed fallback below 800 px effective width: keep the primary angle, state and end-session action; use tabbed pose/detail, three-item paged summary and a full-width comparison subview. Settings uses a compact category selector rather than a second scroller. Below 450 px effective height reduce secondary visual evidence and use single-task pages. Never downsize alarm copy to fit a dense dashboard. The specimens include basic small-screen CSS, but **the fully accessible sub-minimum fallback is an implementation requirement, not a verified deliverable claim**. The supported logical minimum and physical display combinations need the user's decision in §9.

## 5. Live-monitoring hierarchy and value decisions

Priority is: **blocking fault / over-limit → coaching state → primary metric → pose → reps and hold → setup context → optional diagnostic evidence**. Actual data freshness and calibration scope are always visible to the therapist. Color never carries the state alone.

| Existing value | Decision | Exact destination / language |
|---|---|---|
| Action-specific primary angle | **Keep, promote** | One 88–176 px number with explicit metric name and unit. Use `computeMetricSample` and `computeMetricZone`, not a new interpretation. |
| Knee angle | **Keep conditionally** | Primary for joint-angle actions. For segment actions, expose only the prerequisite text `膝蓋需保持近直` with pass/fail. Optional numerical detail uses the actual engine threshold. No duplicate knee card. |
| Thigh pitch | **Demote unless primary** | In segment elevation use calibrated thigh; in extension use negated calibrated thigh. Otherwise diagnostic detail: `大腿角度（相對站直零位）`, with calibration state. Raw pitch never masquerades as the judged angle. |
| Shin pitch | **Demote** | Diagnostic view only: `小腿角度（相對站直零位）`; hide quantitative interpretation when uncalibrated. Pose may use valid calibrated orientation. |
| Thigh Roll | **Remove from clinical overview** | Advanced sensor diagnostics: `大腿感測器 Roll · 安裝／軸向排錯用`. Retain data, not the anatomical implication. |
| Shin Roll | **Remove from clinical overview** | Same treatment; never a progress score or coaching cue. |
| Varus/valgus / kneeRoll | **Remove anatomical label and default graph** | Advanced `兩感測器 Roll 差（未驗證）`. No inward/outward knee diagnosis, no “normal” band, no target or over-limit rule. |
| Six-card strip | **Remove** | Space goes to pose. Compact layout must not resurrect it as a fallback. |
| Reps, hold, session time | **Keep** | Fixed bottom dock; completed count has no fabricated prescribed denominator. A future prescribed rep goal must be an explicit field. |
| Target, hold requirement, limit | **Keep** | Read-only prescription summary during running session; setup/editor before start. Seconds for users, existing milliseconds in storage. |
| BLE/calibration | **Keep with scope** | Connected / waiting / stale / fault are distinct. “Completed at…” and “side direction unverified” may coexist. |

Important engine semantics: joint-angle target is `target ± tolerance`. Segment elevation and extension are `metric ≥ target`, with a knee-straight prerequisite `knee ≤ max(15°, tolerance)`; their upper bound is not `target + tolerance`. Rest is `min(30°, targetLowerBound − 5°)`. Use the existing effective safety limit calculation, including fallback/clamping; do not draw a contradictory limit from the raw action object. Segment target success and over-limit can coexist in the current engine; the alert wins visually. UI redesign must not silently change rep-counting behavior.

### State contract

| State | Presentation and interaction |
|---|---|
| Ready, connected and calibrated | `準備開始`; valid current metric/pose may display; start enabled only under existing prerequisites. |
| Holding | `✓ 很好，保持這個位置`; elapsed/required hold and remaining seconds; no invented accuracy percentage. |
| Completed, awaiting rest | `✓ 已完成，請回到起始位`; increment only from the controller's completion event. Do not count again until the real rest condition is met. |
| Over-limit | Full-width red-tinted band, 4 px frame, 40 px instruction, `! 超出上限，請停止加深`, current value + threshold; retain valid measurement and pose. Place 48 px mute control by end-session. Static alerts; no flashing dependency. |
| Alarm muted | Same alert and limit; `靜音中 · 28 秒`. Mute changes sound only; it never converts state to “safe.” |
| Hardware `ERR:1` | `× 感測器異常 · ERR:1`, primary value `—`, pose explicitly unavailable. Keep fault actions/end visible. Never show a normal-looking zero leg or hold progress. Preserve existing backend write/fault recovery behavior. |
| Disconnected/stale | `裝置未連線` or `資料中斷 · 最後更新…`; no animated hold/pose. A historical value may appear only in diagnostic detail with its timestamp, not the main angle. |
| Unsupported protocol | Named blocking panel + `前往設定`; do not ask the user to fix it by connecting. |
| Uncalibrated | Amber `請先完成校準`; no confident target instruction. This proposal recommends withholding patient coaching until calibration succeeds. Whether to hard-block session start is an explicit product decision, not a backend change made here. |
| Demo | Persistent `示範資料` text in shell and exports; never substitute it for connection/fault information. |

Fault/unsupported/missing measurement take priority over progress. An already-recorded over-limit event remains in the timeline even when the live hardware faults. Use assertive announcements for a newly entered critical state, polite announcements for completion, and never announce the changing angle at 25 Hz.

## 6. Pose specification: measured orientation, honest limits

**2D default during repetitions. 3D available beside it for setup and spatial inspection.** Both occupy the same large right-hand stage. A visual pose is useful, but “trustworthy pose” cannot imply reliable anatomical Roll or measured Yaw: the current `Leg3D` fixes Yaw and drives lateral appearance from Roll.

- **2D**: orthographic sagittal view, visible hip/knee/ankle, stable camera and floor reference, large upper/lower segments. Show front direction and label the observed side only if the operator has actually selected it. Do not infer left/right from a screenshot or mirror the leg automatically.
- For a knee action, place a small local angle arc at the knee. For elevation/extension, emphasize the thigh-to-standing reference instead. Avoid a second large numerical gauge competing with the primary number.
- **3D**: three.js, neutral matte geometry, fixed oblique-side default, one side-view/reset control, no automatic orbit. User rotation changes the camera, not sensor coordinates. Hide axes/grid unless explicitly requested.
- Default 3D uses the supported sagittal movement with lateral movement constrained; label `側向角度未驗證`. An advanced diagnostic toggle may show measured Roll, with persistent `安裝／軸向示意，非內外翻量測`. Do not fabricate full 3D accuracy from two gravity vectors.
- Any target ghost is a dashed schematic of the judged movement, not a claim that the patient must match a complete anatomical pose. Segment actions also need a knee-straight prerequisite label.
- Scope of calibration is expressed independently: `零位已捕捉`, `大腿軸已建立`, `小腿軸已建立`, `側向未驗證`. Use established flags/errors; no computed “confidence score” unless a validated definition is implemented later.
- Failed/unstable capture: explain the existing error (`保持靜止後重試`, insufficient movement, singular baseline) and let the operator retry the relevant step. A new attachment or recalibration invalidates the previous confirmation.
- Missing/stale/error: suppress live movement; show an explicit unavailable state rather than a convincing frozen unlabelled leg. WebGL failure falls back to 2D with a concise message; it does not block primary metric monitoring.
- three.js uses a ResizeObserver on the actual bounded stage, bounded render pixel ratio, and stops rendering when hidden. Reduced motion disables camera damping; it does not suppress medically relevant data changes. Treat these as implementation criteria, not changes to this prototype.

The HTML uses a hand-authored SVG pose. Its “3D 概念” control changes the view presentation only and explicitly labels it as a concept; it is not a real three.js simulation. Alarm and error previews suppress that fixed illustrative pose so it cannot contradict the chosen state.

## 7. Session review specification

### Therapist's reading order

1. Which action, prescription, source and session is this? Was it completed normally?
2. How many attempts were completed? Were there over-limit or missing-data intervals?
3. Which repetition needs review, and why?
4. What changed from a comparable previous session, and is comparison defensible?

### Summary and trace

The fixed summary shows completed/attempted reps, peak, time-weighted mean, time in target, over-limit event count and duration, and valid measurement duration. Show wall-clock duration and excluded-gap duration in the detail pane. Missing values use `—`, never zero; unknown target settings yield an unknown time-in-target percentage.

Retain the current whole-session statistics but calculate all statistics from full-resolution readings. The Chart.js display may be decimated; export and calculations may not use decimated points. Label degrees, elapsed time, target band and safety threshold directly. Use an opaque 3 px primary trace; comparison is dashed with a text legend. Remove the default Varus/Valgus overlay. A gap breaks the line and has a hatched `資料中斷` span; never smooth or interpolate across it.

Preserve time-weighted statistics and the current gap policy (the reviewed analyzer skips non-positive intervals and intervals over 1000 ms). A missing sample should remain an explicit gap, not disappear and join two valid intervals. Confirm boundary parity during implementation: the reviewed analyzer uses `>=` at the over-limit threshold while the written live rule says `>`; v3 must not hide or silently redefine that discrepancy.

### Attempts, peaks and hold

The strip represents **attempts**, including unsuccessful and interrupted efforts; it does not pretend every curve hump was a completed repetition. Each item contains sequence number and `✓ 完成`, `○ 未達標`, `! 超限` or `× 中斷`. Selecting an item highlights its chart interval and opens:

- start/end time, peak of the judged metric, longest continuous qualifying hold and required hold;
- completion state, failed knee-straight prerequisite if applicable, and the reason the attempt ended;
- over-limit duration and sensor gaps; incomplete metrics are marked unavailable;
- links to preceding/following attempt and a keyboard-accessible numeric table equivalent to the chart.

No rep boundary events are currently persisted in the reviewed sensor-data schema. **Per-rep analysis is new work.** Preferred implementation records the controller's rest/holding/completion/interrupt events with session-relative timestamp, prescription snapshot and algorithm version. For older sessions, deterministic replay must use the historical trigger type, parameters and original timing, including hysteresis/grace and rest gating. Label replayed boundaries `重建估計`; if snapshots are insufficient, show the stored completed count and waveform but no invented per-rep precision. Interrupted attempts at a data gap do not bridge the gap. A manually detected chart peak is not a controller rep.

The HTML strip and detail values are illustrative fixtures. It supports selecting an attempt but does not implement replay, chart interval selection, exporting, or a real database query.

### Comparison eligibility and calibration warnings

“Same action” means the same stable action identity **and** compatible protocol, metric type and prescription snapshot, not merely the same display name. Compare only sessions known to belong to the same intended participant/context; the current model must not infer patient identity. The user explicitly selects a prior session. Demo and device records are never mixed.

| Eligibility | UI behavior |
|---|---|
| Same context/action/settings and compatible saved calibration | Optional aligned overlay and numerical differences, with both dates and durations. A difference is descriptive, not a diagnosis or improvement claim. |
| Different prescription | Side-by-side actual values with both prescriptions; no percent-improvement badge or merged target band. |
| Different saved calibration | Persistent `校準已變更：零位／鉸鏈軸不同`; default side-by-side only, no overlaid curves or delta score. Details show changed fields. |
| Missing calibration snapshot | `無校準快照，無法確認可比性`; never “unchanged.” |
| Historical calibration differs from current app settings | Separate notice: this affects today's interpretation/setup; it does not by itself prove two historical sessions differ from one another. Compare their saved snapshots separately. |
| Missing trigger snapshot, interrupted session, inadequate data | Label fallback/uncertainty. Do not provide precision the record cannot support. |

The mockup deliberately shows a changed-calibration comparison and one large over-limit peak. The design must make it difficult to misread “142°” as better than “96°.” Holding-time median is defined over completed attempts with valid boundaries; “time in target” uses valid measured time as denominator, not wall-clock session time.

### Export

Keep CSV, now labeled `匯出紀錄`. Provide raw samples and a summary/attempt table with session ID, source, actual metric name, prescription snapshot, calibration snapshot/status, timestamps/timezone, missing-data flags, completion/reconstruction flags and analysis version. Raw Roll fields remain clearly diagnostic. The exported target and limit come from that session, never today's edited action. A design mockup must not silently download fabricated patient records, so its export button explains the intended output.

## 8. Accessibility and verification handoff

Use semantic buttons, labels, native form controls and table headings. Selected states have text/shape as well as color; selected navigation has an underline. Dialogs take focus, contain keyboard navigation and return focus to the invoking control. Escape closes noncritical dialogs; it must not dismiss an active fault. Every chart result must have a keyboard-accessible data alternative. Touch targets are 40 px or larger for normal controls, 48 px for live session/alarm actions; compact design-preview controls may be 34 px.

### What was actually checked

- **80 static/DOM checks passed**, including all three inline scripts, unique IDs, local links, theme switches, settings categories, consent and endpoint lock, Dashboard states, pose selector and attempt selection.
- **36 token contrast pairs passed** as part of those 80 checks. See the JSON for values and thresholds.
- The files have no external assets, scripts, fonts, fetch, WebSocket or persistence APIs. The telemetry endpoint appears only as editable example text.
- A browser verification script is included for 1024×600, 1280×720 and 1920×1080, both themes, states, clipping checks and screenshots.
- **Browser rendering was not run successfully:** the sandbox denied the headless browser process with `spawn EPERM`. The browser tool reported no enabled browser, and IAB was unavailable. No screenshots were fabricated. JSDOM exercises DOM events but does not measure layout or prove no clipping.

### Required implementation acceptance

At every supported native size/scaling combination: `documentElement.scrollWidth == innerWidth` and `scrollHeight == innerHeight`, and no hidden content outside intended bounded regions. Check both themes, long translated names, 100+ actions/sessions, all calibration steps, expanded telemetry, updater progress/errors, demo banner, disconnected, uncalibrated, alarm and ERR states. Test 200% text size using adaptive subviews, keyboard-only navigation and screen-reader announcements. Check bottom controls after resizing while a dialog is open.

Run the native Windows DPI matrix and a physical 2 m reading test of normal, over-limit, mute and ERR:1 states. Confirm that the large state text, angle and end action remain available; a layout passes only if it remains usable, not merely because `overflow:hidden` conceals excess content.

## 9. Open questions for the user

These questions do not block the draft; the chosen defaults are already visible in the mockups.

1. Does **復健工作簿**, with horizontal navigation and a light default, feel appropriate for IRMS? Proposed default is day theme, with night always available; production can follow the system preference.
2. Is 2D the right default during repetitions, with 3D used mainly for setup and inspection? This proposal chooses 2D to avoid suggesting validated lateral anatomy.
3. Should uncalibrated sessions be hard-blocked, or may a therapist explicitly enter a labeled diagnostic session? The draft withholds coaching but does not change existing controller permissions.
4. Does “1024×600 at 175%” mean a logical app client area or the physical display resolution? Recommend defining supported **logical client dimensions** and separately validating available monitor sizes/scales.
5. Can the system record attempt events and an explicit comparison context? Without those additions, per-rep and longitudinal precision must remain limited and clearly marked as reconstructed or unknown.
6. Is bundling a Chinese serif for titles acceptable, or should production retain only current fonts and Windows serif fallback? The standalone mockups need no new font installation.

## 10. Files and review order

1. `mockup-dashboard.html` — judge the new hierarchy; switch light/dark and preview over-limit/ERR:1.
2. `mockup-settings.html` — inspect the category model; expand advanced telemetry and preview consent.
3. `mockup-history-review.html` — select attempts 8 and 9 and inspect the comparison caveat.
4. This proposal — approve or revise the direction before application implementation.

Supporting files: `build_mockups.py` regenerates the specimens; `verify_static.cjs` and `verification/static-results.json` capture executed checks; `verify.cjs` provides the unexecuted browser-layout check; `WORK_LOG.md` records decisions and verification limitations. None is a runtime dependency of the HTML files.
