// shared/splashTiming.ts — boot-splash timing constants shared between main/splash.ts (drives the
// real window's bounds-growth animation) and renderer/src/splash.ts (drives the matching CSS).
// Kept in one place so the two can't drift out of sync.

/** Minimum time stage 1 (logo assembly + orbit) stays on screen before the real app is allowed to advance to stage 2, even if init finishes instantly. */
export const SPLASH_ASSEMBLY_FLOOR_MS = 1400

/** Renderer's logo-fade-out / frame-fade-in cross-fade, played before the window starts growing. */
export const SPLASH_ADVANCE_LEAD_MS = 250

/** How long the splash window's bounds take to grow from its small stage-1 size to the real window's bounds. */
export const SPLASH_GROWTH_DURATION_MS = 550

/** How long the frame border takes to fade out after the real window is shown underneath it. */
export const SPLASH_FRAME_FADE_OUT_MS = 340
