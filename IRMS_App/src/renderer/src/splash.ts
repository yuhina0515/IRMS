// renderer/splash.ts — drives the two-stage boot animation's local (stage 1) timing and the
// stage-1 -> stage-2 handoff. No React/framework: this script must be parsed and running before
// the main app's bundle is even requested.
import { SPLASH_ASSEMBLY_DONE_MS } from '@shared/splashTiming'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const orbit = document.getElementById('orbit') as Element
const markWrap = document.getElementById('mark-wrap') as HTMLDivElement
const frame = document.getElementById('frame') as HTMLDivElement

/** Local (pre-translate) coordinates the hand-authored mark geometry was designed around —
 *  matches the old `viewBox="-15 -15 230 230"`'s visual center, kept as the anchor point
 *  #mark-group translates so screen-center placement doesn't require touching any existing
 *  finger/mainstem/arc/dot/orbit coordinate. */
const LOCAL_CENTER = { x: 100, y: 100 }

/** How far past the visible screen edge each traveling line originates, so its earliest drawn
 *  pixels start outside the viewBox (and are clipped) rather than already sitting at the boundary. */
const EDGE_MARGIN = 80

type Edge = 'top' | 'bottom' | 'left' | 'right'

interface TravelSpec {
  /** id of the real finger/mainstem path this lead-in hands off to — its `d`'s start point is
   *  where the generated curve ends, read at runtime rather than duplicated here. */
  finalId: string
  /** id of the empty `<path class="line-travel">` placeholder this curve gets written into. */
  travelId: string
  edgeFrom: Edge
  /** Perpendicular offset (px, local units) for the curve's control point — the "swim" bank.
   *  Sign/magnitude picked per-line so the four strokes don't all bow the same way. */
  bank: number
}

const TRAVEL: TravelSpec[] = [
  { finalId: 'finger-1', travelId: 'travel-finger-1', edgeFrom: 'top', bank: -70 },
  { finalId: 'finger-2', travelId: 'travel-finger-2', edgeFrom: 'left', bank: 55 },
  { finalId: 'finger-3', travelId: 'travel-finger-3', edgeFrom: 'bottom', bank: 50 },
  { finalId: 'mainstem', travelId: 'travel-mainstem', edgeFrom: 'right', bank: -80 }
]

/** Pulls the leading absolute `M x,y` out of an SVG path's `d` — that point is where the
 *  hand-authored geometry actually starts, so the generated lead-in curve can end exactly there
 *  without duplicating the coordinate as a second, driftable source of truth. */
function pathStart(d: string): [number, number] {
  const m = d.match(/^M\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/)
  if (!m) throw new Error(`splash: path 'd' does not start with an absolute M command: ${d}`)
  return [parseFloat(m[1]), parseFloat(m[2])]
}

/**
 * Grows the splash from "small mark in a fixed box" to "lines converging from the edges of the
 * real screen" — the window itself is now sized to the full primary-display work area (see
 * main/splash.ts), so there's genuine off-screen space for the finger/mainstem strokes to travel
 * in from. Runs synchronously at module load, before the CSS draw-in animations are unpaused
 * (see splash.css's `body.ready` gate), so there's no frame where the old small-box geometry could
 * start animating before this rewrite lands.
 */
function setupFullScreenAssembly(): void {
  const svg = document.getElementById('mark')
  const group = document.getElementById('mark-group')
  if (!svg || !group) throw new Error('splash: #mark or #mark-group missing from splash.html')

  const w = window.innerWidth
  const h = window.innerHeight
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)

  const dx = w / 2 - LOCAL_CENTER.x
  const dy = h / 2 - LOCAL_CENTER.y
  const translate = `translate(${dx}, ${dy})`
  group.setAttribute('transform', translate)

  // #orbit gets the exact same translate directly (see splash.html's comment on why it's a
  // sibling of #mark-group, not nested inside it) so its CSS transform-origin: 95px 105px
  // (splash.css, unchanged from before this file was full-screen) keeps rotating around the same
  // local point relative to its own geometry, same as when the window was a small centered box.
  const orbit = document.getElementById('orbit')
  orbit?.setAttribute('transform', translate)

  for (const spec of TRAVEL) {
    const finalPath = document.getElementById(spec.finalId)
    const travelPath = document.getElementById(spec.travelId)
    if (!finalPath || !travelPath) continue
    const [sx, sy] = pathStart(finalPath.getAttribute('d') ?? '')

    let ox: number
    let oy: number
    switch (spec.edgeFrom) {
      case 'top':
        ox = sx
        oy = -dy - EDGE_MARGIN
        break
      case 'bottom':
        ox = sx
        oy = h - dy + EDGE_MARGIN
        break
      case 'left':
        ox = -dx - EDGE_MARGIN
        oy = sy
        break
      case 'right':
        ox = w - dx + EDGE_MARGIN
        oy = sy
        break
    }

    // Single quadratic bezier from the edge-of-screen origin to the real stroke's start point,
    // banked sideways (perpendicular to the direction of travel) so it arrives on a curve instead
    // of a straight diagonal slide — this curve, plus the ease-in-out timing in splash.css, is
    // where the "swimming" quality actually lives (see that file's comment on .line-travel).
    const horizontal = spec.edgeFrom === 'left' || spec.edgeFrom === 'right'
    const midX = (ox + sx) / 2 + (horizontal ? 0 : spec.bank)
    const midY = (oy + sy) / 2 + (horizontal ? spec.bank : 0)

    travelPath.setAttribute('d', `M${ox},${oy} Q${midX},${midY} ${sx},${sy}`)
  }
}

try {
  setupFullScreenAssembly()
} catch (err) {
  // Degrade to the small-box-scale geometry rather than leaving the mark paused/invisible for the
  // whole splash duration — see splash.css's reduced-motion block for the equivalent safety net.
  console.error('splash: full-screen assembly setup failed, falling back to static geometry', err)
} finally {
  document.body.classList.add('ready')
}

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
