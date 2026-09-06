// renderer/splash.ts — drives the two-stage boot animation's local (stage 1) timing and the
// stage-1 -> stage-2 handoff. No React/framework: this script must be parsed and running before
// the main app's bundle is even requested.
import { SPLASH_ASSEMBLY_DONE_MS } from '@shared/splashTiming'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const orbit = document.getElementById('orbit') as Element
const markWrap = document.getElementById('mark-wrap') as HTMLDivElement
const frame = document.getElementById('frame') as HTMLDivElement

function startOrbit(): void {
  orbit.classList.add('spin')
}

let stage2Started = false
function triggerStage2(): void {
  if (stage2Started) return
  stage2Started = true
  // Deliberately NOT removing 'spin' here — the rings keep rotating underneath the burst
  // (scale+fade) so the burst reads as carrying the spin's own momentum outward, not an abrupt cut.
  orbit.classList.add('bursting')
  markWrap.classList.add('fading')
  frame.classList.add('visible')
}

/** Fades the frame border out — called once the real window has faded in and is about to close this splash. */
function fadeOutFrame(): void {
  frame.classList.add('fading-out')
}

// main's floor before it's allowed to advance to stage 2 (SPLASH_ASSEMBLY_FLOOR_MS) is
// deliberately longer than this — see that constant's comment for why they aren't the same value.
setTimeout(startOrbit, reduceMotion ? 0 : SPLASH_ASSEMBLY_DONE_MS)

interface SplashBridge {
  onAdvance(cb: () => void): void
  onFadeOutFrame(cb: () => void): void
}
declare global {
  interface Window {
    irmsSplash?: SplashBridge
    /** test-only hook so Playwright can drive the stage-2 transition without a real Electron IPC round trip */
    __splashDebug?: { triggerStage2: () => void; fadeOutFrame: () => void }
  }
}

window.irmsSplash?.onAdvance(triggerStage2)
window.irmsSplash?.onFadeOutFrame(fadeOutFrame)
window.__splashDebug = { triggerStage2, fadeOutFrame }
