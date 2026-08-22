# IRMS UI Handoff for Gemini (2026-08-20)

Snapshot of the current IRMS_App UI, prepared for design work in Gemini
(web app, Gemini 3.1 Pro). Screenshots were captured live from the running
dev build; nothing here is mocked.

## What IRMS is

智慧復健監測系統 (Smart Rehabilitation Monitoring System) — an Electron +
React + TypeScript desktop app that pairs with an ESP32 wearable (BLE) worn
on a patient's leg. It shows real-time joint-angle guidance during
rehab exercises, lets a therapist define custom exercise templates, and
keeps a session history for review/export.

## Tech / rendering notes for context

- Renderer: React 18 + plain CSS (no Tailwind/CSS-in-JS) — one global
  stylesheet at `src/renderer/src/styles/global.css`.
- Charts: Chart.js (2D line chart). 3D leg pose: Three.js (`Leg3D.tsx`).
- Window chrome: `titleBarStyle: 'hidden'` with a native
  `titleBarOverlay` (Windows min/max/close buttons float over the
  top-right corner — see the top bar's right-side padding in every
  screenshot).
- Theme follows the OS (`prefers-color-scheme`), light + dark tokens
  both defined; screenshots here are all dark mode since that's the
  dev machine's current OS theme.

## Current visual language

Self-described in the CSS comments as "Apple Liquid Glass": translucent
frosted-glass panels (`backdrop-filter: blur(20px) saturate(1.8)`) over
a fixed full-window background of two hand-made aurora-gradient SVGs
(`assets/bg-light.svg` / `bg-dark.svg`) plus three slow-drifting radial
gradient "blobs" for ambient motion. Cards have a soft top-edge highlight
+ outer shadow to fake a beveled glass edge. Buttons are full-pill
(`border-radius: 999px`). Nav (bottom icon bar) and tab switches
(secondary in-page tabs) share a custom "liquid knob" indicator that
slides and squashes/stretches between items with an SVG goo filter
(`LiquidKnob.tsx`, `#liquid-gooey-filter`).

Color system (semantic CSS custom properties in `global.css`, light
value → dark value):

| token | role | light | dark |
|---|---|---|---|
| `--bg-0` | base background under the glass | `#eef2fb` | `#0b0f1f` |
| `--accent` | primary brand blue | `#007aff` | `#0a84ff` |
| `--accent-2` | secondary purple (used in bg blob) | `#5856d6` | `#5e5ce6` |
| `--success` | in-range / holding | `#34c759` | `#30d158` |
| `--warning` | advisory | `#ff9500` | `#ff9f0a` |
| `--danger` | over-limit / alarm | `#ff3b30` | `#ff453a` |
| `--thigh` | thigh-segment series color | `#ff9500` | `#ff9f0a` |
| `--shin` | shin-segment series color | `#34c759` | `#30d158` |

Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui,
'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', sans-serif` — i.e.
deliberately chasing an Apple system-font look even on Windows.

This is a clinical/medical tool used by physical therapists, not a
consumer app — legibility and unambiguous status color-coding
(green=in range, orange=warning, red=danger/over-limit) take priority
over decoration.

## Screens (bottom nav, in order)

1. **Dashboard — "Guided Monitoring"** (`01-dashboard.png`)
   The main/home screen, shown while a session is running. Left: a big
   semicircular gauge (`MetricGauge.tsx`) showing the live joint angle
   against target zone + safety limit, with a coach-hint bar below it
   ("請先於頂部連線裝置" etc.). Right: a progress ring (reps/hold %)
   and a session control panel. Below: a tabbed secondary panel
   (trend chart / 3D pose / 2D pose / raw numbers).
2. **Actions — "Custom Actions"** (`02-actions.png`, modal:
   `05-action-modal.png`) Card grid of exercise templates the
   therapist has defined (name, trigger type badge, target/tolerance/
   hold, derived safety limit). "+ 新增動作" opens a glass modal form
   (`05-action-modal.png`) with a custom dropdown (`GlassDropdown.tsx`,
   not a native `<select>`) and a "Record Pose" live-capture row.
3. **History — "Rehabilitation History"** (`03-history.png`) Table of
   past sessions; empty state shown here. Row action opens an analysis
   modal with a Chart.js replay of the session plus CSV export
   (not screenshotted — same modal chrome as the Actions modal).
4. **Settings** (`04-settings.png`) Sensor calibration section
   (wizard entry point + collapsible advanced manual-calibration
   fields) and general app settings (default protocol, chart/flush
   tuning).

Not captured (state-dependent, needs a connected BLE device or an
active alarm to reach): `CalibrationWizard.tsx` (multi-step modal
wizard), `ErrorOverlay.tsx` (full-screen red hardware-error takeover),
`ToastHost.tsx` / `ConfirmDialog.tsx` (small transient UI already
visible in miniature via the `.toast` / `.dialog` CSS rules).

## Files to submit to Gemini

**Screenshots (the actual visual reference — always include all 5):**
- `01-dashboard.png`
- `02-actions.png`
- `03-history.png`
- `04-settings.png`
- `05-action-modal.png`

**Design-system source (only if Gemini needs to reason about exact
tokens/structure rather than just eyeball the PNGs):**
- `src/renderer/src/styles/global.css` — every color/radius/blur/
  spacing token, all component CSS.
- `src/renderer/src/assets/bg-light.svg` + `bg-dark.svg` — current
  background art, if the ask involves the wallpaper/brand art.
- `src/renderer/src/assets/logo-transparent.png` +
  `logo-icon-only.png` — current logo, if the ask involves branding.

Don't submit `.tsx` component files to Gemini — it's a design/art tool,
not a code collaborator; the screenshots + CSS already carry everything
relevant to a visual redesign. Bring any output (new SVGs, color
palettes, icon sets) back for manual integration into the code above.
