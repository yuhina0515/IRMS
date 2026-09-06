// shared/splashTiming.ts — boot-splash timing constants shared between main/splash.ts (drives the
// real window's bounds-growth animation) and renderer/src/splash.ts (drives the matching CSS).
// Kept in one place so the two can't drift out of sync.

/**
 * When the renderer's logo-assembly animation finishes and it locally starts the orbit spin
 * (local timer, independent of real init speed). 1.1s per Gemini's 2026-09-07 review (tightened
 * from the original 1.4s for a snappier "laser-engraving" precision feel) — last element to
 * finish is a dot at 780ms delay + 300ms duration = 1080ms, rounded up with a small margin.
 */
export const SPLASH_ASSEMBLY_DONE_MS = 1100

/**
 * Minimum time main waits before advancing to stage 2, even if real init finishes instantly.
 * Deliberately LONGER than SPLASH_ASSEMBLY_DONE_MS (not the same constant) — on a fast machine,
 * DB init + IPC registration can finish in a few ms, and if this floor matched the renderer's
 * orbit-start timer exactly, main would send the advance signal at nearly the same instant the
 * orbit starts spinning, making the "still loading" spinner visible for ~0ms (found by testing:
 * captured screenshots kept landing mid-transition no matter when they were taken). The gap here
 * guarantees the orbit is actually visible for a bit before stage 2 can preempt it.
 */
export const SPLASH_ASSEMBLY_FLOOR_MS = SPLASH_ASSEMBLY_DONE_MS + 650

/**
 * Renderer's logo-fade-out / frame-fade-in cross-fade lead time before the window starts growing.
 * Kept at 0 per Gemini's stage-2 review — the frame's glow-in keyframe is itself timed to
 * SPLASH_GROWTH_DURATION_MS (spikes bright, settles as the window finishes growing), so it needs
 * to start at the exact same moment as the bounds-growth animation, not after a separate delay.
 */
export const SPLASH_ADVANCE_LEAD_MS = 0

/** How long the splash window's bounds take to grow from its small stage-1 size to the real window's bounds. */
export const SPLASH_GROWTH_DURATION_MS = 550

/** How long the frame border takes to fade out after the real window is shown underneath it. */
export const SPLASH_FRAME_FADE_OUT_MS = 340
