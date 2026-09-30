// Statistical exploration of packets.txt (see README.md "Statistical stationary-segment
// check" section for context/results). Answers a narrow question: without timestamps or
// movement labels, can purely statistical stationarity detection on the V: vectors surface
// candidate held poses usable to derive a per-limb hinge axis (same cross-product method as
// deriveHingeAxis) and check whether the thigh- and shin-derived axes are roughly parallel —
// an indirect, best-effort check of the assumption reconcileToReferenceFrame depends on.
//
// This is NOT equivalent to the wizard protocol (which isolates one joint's motion at a
// time with the other held at standing) — it uses whatever incidental pauses exist in this
// unstructured trace, so a derived-axis angle reflects both limbs' natural coupled motion
// at that moment, not an isolated single-joint capture. Treat results as a rough signal,
// not calibration-grade evidence — see provenance.json for why this trace can't be replayed
// through the real calibrated pipeline at all (missing hinge-axis settings).
//
// Run from doc/calibration-evidence/20260915/:
//   node stationary-segment-axis-check.mjs
import { readFileSync } from 'node:fs'

const lines = readFileSync(new URL('./packets.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter(Boolean)

function parseVector(line) {
  const m = line.match(/V:([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)\/([-\d.]+)/)
  if (!m) return null
  const n = m.slice(1).map(Number)
  return { thigh: [n[0], n[1], n[2]], shin: [n[3], n[4], n[5]] }
}

const vecs = lines.map(parseVector)
console.log(`total lines: ${lines.length}, with V: field: ${vecs.filter(Boolean).length}`)

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function mag(a) { return Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) }
function normalize(a) { const m = mag(a); return [a[0] / m, a[1] / m, a[2] / m] }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function angleDeg(a, b) { return (Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) * 180) / Math.PI }

// Rolling-window stationarity detector: window of W samples is "stationary" if the max
// pairwise deviation from the window's mean vector stays under EPS for BOTH limbs at once.
const W = 25 // ~1s at nominal 25Hz if samples are evenly spaced (unconfirmed — no timestamps)
const EPS = 0.02 // loose bound on unit-gravity-vector wobble

const stationaryRuns = []
let runStart = null
for (let i = 0; i + W <= vecs.length; i++) {
  const window = vecs.slice(i, i + W).filter(Boolean)
  if (window.length < W) { if (runStart != null) { stationaryRuns.push([runStart, i]); runStart = null }; continue }
  const meanThigh = window.reduce((acc, v) => [acc[0] + v.thigh[0] / W, acc[1] + v.thigh[1] / W, acc[2] + v.thigh[2] / W], [0, 0, 0])
  const meanShin = window.reduce((acc, v) => [acc[0] + v.shin[0] / W, acc[1] + v.shin[1] / W, acc[2] + v.shin[2] / W], [0, 0, 0])
  const stationary =
    Math.max(...window.map((v) => mag(sub(v.thigh, meanThigh)))) < EPS &&
    Math.max(...window.map((v) => mag(sub(v.shin, meanShin)))) < EPS
  if (stationary && runStart == null) runStart = i
  if (!stationary && runStart != null) { stationaryRuns.push([runStart, i]); runStart = null }
}
if (runStart != null) stationaryRuns.push([runStart, vecs.length])

// Merge overlapping/adjacent windows into contiguous runs
const merged = []
for (const [s, e] of stationaryRuns) {
  if (merged.length && s <= merged[merged.length - 1][1] + W) {
    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e)
  } else {
    merged.push([s, e])
  }
}
console.log(`stationary windows found: ${stationaryRuns.length}, merged into ${merged.length} contiguous run(s)`)

function meanOf(seg, key) {
  return seg.reduce((acc, v) => [acc[0] + v[key][0] / seg.length, acc[1] + v[key][1] / seg.length, acc[2] + v[key][2] / seg.length], [0, 0, 0])
}

const runsWithMeans = merged
  .map(([s, e]) => {
    const seg = vecs.slice(s, e).filter(Boolean)
    return { s, e, len: e - s, meanThigh: meanOf(seg, 'thigh'), meanShin: meanOf(seg, 'shin') }
  })
  .filter((r) => r.len >= 15) // drop sub-0.6s noise blips

// Standing baseline candidate: the single longest run (dominant pose across the trace)
const standing = runsWithMeans.reduce((a, b) => (b.len > a.len ? b : a))
console.log(
  `\nstanding baseline candidate: run [${standing.s},${standing.e}) len=${standing.len} ` +
  `meanThigh=${standing.meanThigh.map((x) => x.toFixed(3))} meanShin=${standing.meanShin.map((x) => x.toFixed(3))}`
)
console.log(`runs >=0.6s: ${runsWithMeans.length}`)

// Held-pose candidates that differ meaningfully from standing on BOTH limbs (>15deg —
// plausibly a genuine held pose, not standing-with-noise). For each, derive a candidate
// hinge axis per limb via cross(standing, held) — same method as deriveHingeAxis — and
// report the angle between the thigh- and shin-derived axes.
const candidates = runsWithMeans.filter((r) => {
  return r !== standing && angleDeg(r.meanThigh, standing.meanThigh) > 15 && angleDeg(r.meanShin, standing.meanShin) > 15
})

console.log(`\nheld-pose candidates differing >15deg from standing on BOTH limbs: ${candidates.length}`)
for (const c of candidates) {
  const axisAngle = angleDeg(cross(standing.meanThigh, c.meanThigh), cross(standing.meanShin, c.meanShin))
  console.log(
    `  run [${c.s},${c.e}) len=${c.len} thighDelta=${angleDeg(c.meanThigh, standing.meanThigh).toFixed(1)}deg ` +
    `shinDelta=${angleDeg(c.meanShin, standing.meanShin).toFixed(1)}deg ` +
    `=> derived-axis angle(thigh,shin)=${axisAngle.toFixed(1)}deg`
  )
}
