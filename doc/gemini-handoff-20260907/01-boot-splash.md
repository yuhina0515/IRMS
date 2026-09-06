You are acting as a senior motion/product designer for a real desktop application's boot/loading
animation. I'm attaching the app's real logo (`logo-icon-only.png`, `logo-transparent.png`) and
three screenshots of the current implementation's stage-1 sequence
(`gemini_shot_1_assembling.png` → `gemini_shot_2_assembled.png` → `gemini_shot_3_orbiting.png`).
This brief is about the boot splash animation **only**.

**What the app is:** IRMS (智慧復健監測系統 / Smart Rehabilitation Monitoring System) — an
Electron desktop app pairing with one wearable BLE sensor during physical therapy. Clinical tool,
"data console" tone, dark cyan/blue palette. See `doc/gemini-handoff-20260902/` for the established
visual direction and `doc/gemini-handoff-20260905/03-animations.md` for the existing motion
language (a "mechanical/clinical-instrument" vocabulary — displacement/snap curves with no
overshoot, distinct enter/exit easing — not a bouncy/playful one).

**Scope guardrail — read this before anything else:**
- This is about the **boot splash sequence only** — the animation that plays before the main app
  window exists. Do not propose changes to the Dashboard, sidebar, or any other in-app screen.
- Everything you propose must be achievable as a **CSS/SVG animation in a plain HTML document with
  no framework** (this splash is deliberately not React — it has to paint before the main app's
  bundle even loads). No canvas particle systems, no WebGL, no JS animation libraries.
- The window-growth part of stage 2 is a **real OS window resize** (Electron `BrowserWindow.
  setBounds()`, stepped manually since Windows has no native animated resize), not a CSS transform
  on content inside a fixed-size window. Anything you propose for "lines forming the window
  border" has to work with that constraint — see "Current implementation" below for exactly how
  this is currently solved.
- Two previous rounds of this kind of design handoff came back as unusable AI-generated mockup
  images (fabricated UI, illegible text, scope drift). If you're not confident an image will be
  precise and faithful, skip it — a precise written spec beats a misleading image.

## The original spec (from the app's developer, verbatim intent)

1. Modularize the app's functionality so modules load in stages (separate, already implemented —
   not part of this brief).
2. Two-stage boot animation. Stage 1 = waiting for load to finish. Stage 2 = a transition once
   everything has loaded.
3. **Stage 1:** lines converge from all directions to form the complete logo. Once complete, two
   lines orbit clockwise around the logo, keeping a comfortable distance from it.
4. **Stage 2:** all the (glowing) lines spread apart to trace/surround the app window's outline,
   then the detailed UI gradually fades in.
5. During stage 1, the real app window does not exist yet — the user should only see the lines
   floating over whatever was already on their screen (desktop, other windows, etc.).
6. During stage 2's window-encircling moment, only the border is traced (not a filled shape); then
   the window gradually appears, and the lines fade out at the same time.

## Current implementation (what exists right now — your job is to refine, not replace, unless you have a strong reason)

**Stage 1 — logo assembly + orbit** (see the three attached screenshots, in order):
- No vector version of the real logo exists (only the attached PNGs), so I hand-approximated it as
  SVG line art: 4 diagonal "finger" strokes converging toward a point, a palm/wrist curve, a short
  "R" stem+leg, two concentric signal arcs, and 3 dots (1 medium solid, 1 small solid, 2 with a
  ringed outer circle + filled center — matching the PNG's two-tone dot style).
- Colors: structural lines (fingers/palm/R) use `#1d6fd6` (blue), the signal arcs use `#22d3ee`
  (the app's existing `--color-accent` cyan), dots are filled cyan with a `drop-shadow` glow.
  Stroke width 7 for lines, 5-6 for arcs/rings.
- Each path has `pathLength="1"` (SVG2) with `stroke-dasharray:1; stroke-dashoffset:1 → 0` animated
  via CSS (`640ms cubic-bezier(0.16, 1, 0.3, 1)`, the same curve as this app's
  `--motion-ease-mechanical` token), staggered per path via `animation-delay` (fingers first at
  0/60/120/180ms, palm+R at 420-560ms, arcs+dots at 700-1040ms). Total assembly ≈ 1.4s.
- After assembly, an orbit group (`#orbit`, containing two ~100°-long arcs at radius ~116 around
  the logo's center) fades in and rotates continuously clockwise
  (`animation: orbit-spin 1.8s linear infinite`) — this is the "still loading" indicator, and its
  visible duration is **unpredictable** (could be ~0.6s on a fast machine, could be several seconds
  on a slow one) since it loops until the real app is actually ready.
- Full current SVG markup and CSS: `IRMS_App/src/renderer/splash.html` and
  `IRMS_App/src/renderer/src/splash.css` if you have repo access; otherwise the screenshots +
  description above should be enough to critique/refine.

**Stage 2 — window outline + reveal:**
- Not implemented as literal per-line morphing (tracing exact vector paths into a rectangle would
  require complex per-vertex interpolation of hand-drawn curves — impractical for this format).
  Instead: the logo/orbit group cross-fades out (~220ms) while a SEPARATE, always-present
  `position:fixed; inset:8px` div with a glowing border (`3px solid cyan`, rounded corners,
  box-shadow glow) cross-fades in. This div's `inset` (not fixed px) means it automatically
  re-renders larger on every frame as the actual OS window is resized — so "the border grows to
  match the window" happens for free, no coordinate math needed.
- Main process grows the splash window's real bounds from a small ~260×260 box to the real app
  window's exact bounds (ease-out-cubic, 550ms, stepped at 60fps since Windows can't animate
  `setBounds` natively).
- Once the window reaches full size, the real app window is shown underneath the splash (same
  bounds, splash is `alwaysOnTop`), the border fades out (~340ms), and the splash window closes.

## What's genuinely open — where I want your input

1. **Logo line-art fidelity.** My hand-approximated paths are a rough guess at the real logo's
   geometry (see the PNG vs. the screenshots) — can you give more precise path/coordinate
   descriptions (or exact SVG `d` data if you can reason about it precisely) that read as more
   faithful to the actual mark, while still being a small number of simple strokes (this has to
   stay animatable via the dashoffset technique — no filled/complex shapes)?
2. **Color/weight spec.** Is the blue-structural / cyan-signal split right, or should this be
   simpler (e.g. everything cyan, varying only in glow intensity)? Exact hex + stroke-width numbers
   please.
3. **Timing.** Does 1.4s total assembly feel right for a loading screen, or too slow/fast? Should
   the per-path stagger be more/less pronounced? Should easing differ from
   `--motion-ease-mechanical` for this specific "materializing" moment (vs. this app's other UI
   motion which is about displacement, not creation)?
4. **Orbit design.** Two arcs at fixed radius, rotating together — is this the right "still
   loading" visual given it might be visible for well under a second OR indefinitely? Should the
   two arcs move independently (different speeds/phase) rather than rigidly together?
5. **Stage 2 approach.** Given the technical constraint above (real OS window resize + a
   percentage-inset CSS border, not true path morphing), does the cross-fade approach read as a
   reasonable interpretation of "lines spread apart to trace the window outline," or is there a
   better achievable version within the same constraints (e.g., the border briefly inheriting the
   glow color/motion of the orbit rings at the exact moment of the cross-fade, rather than a flat
   fade)?

## Deliverable — in this priority order

1. **Required: a written spec.** Exact colors, stroke widths, path/geometry description, timing in
   ms, easing curves, and anything about the orbit/stage-2 approach you'd change. This is what
   actually gets implemented.
2. **Optional: a reference image**, only if you're confident it's precise — a small, clean line-art
   mark on a plain background, not a full UI mockup (this brief has no "surrounding UI" to render,
   so there's no scope-drift risk here the way there was for the sidebar brief — but precision on
   the actual line geometry still matters more than a polished-looking but inaccurate image).
