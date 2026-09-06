// renderer/splash.ts — drives the two-stage boot animation's local (stage 1) timing and the
// stage-1 -> stage-2 handoff. No React/framework: this script must be parsed and running before
// the main app's bundle is even requested.
import { SPLASH_ASSEMBLY_FLOOR_MS } from '@shared/splashTiming'

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
  orbit.classList.remove('spin')
  markWrap.classList.add('fading')
  frame.classList.add('visible')
}

/** Fully hides the frame border — called once the real window has faded in and is about to close this splash. */
function fadeOutFrame(): void {
  frame.classList.remove('visible')
}

// SPLASH_ASSEMBLY_FLOOR_MS also gates main's advance-to-stage-2 timing (see main/splash.ts) — kept
// in one shared constant so the local "logo finishes drawing" moment and main's floor can't drift.
setTimeout(startOrbit, reduceMotion ? 0 : SPLASH_ASSEMBLY_FLOOR_MS)

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
