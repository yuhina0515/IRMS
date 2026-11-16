// Contract test shared with the Rust port (IRMS_Core/src/angle_math.rs).
//
// fixtures/angle-math.json records calls of every exported function in angleMath.ts with their
// results. This test checks the functions still reproduce the file; the Rust test replays the same
// calls. Non-finite numbers are written as strings because JSON has no NaN or Infinity.
//
// To regenerate after an intended change (then mirror it in angle_math.rs):
//   IRMS_WRITE_FIXTURES=1 node node_modules/vitest/vitest.mjs run src/services/angleMath.contract.test.ts
import { describe, expect, it } from 'vitest'
import storedJson from '../../fixtures/angle-math.json'
import * as m from './angleMath'

type Vec = { x: number; y: number; z: number }
type Json = number | string | Json[] | { [k: string]: Json }
interface Case { fn: string; args: Json[]; out: Json[] }

function prng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const enc = (n: number): Json => (Number.isFinite(n) ? n : String(n))
const encVec = (v: Vec): Json => ({ x: enc(v.x), y: enc(v.y), z: enc(v.z) })
type Result = number | Vec | { pitch: number; roll: number } | { ax: number; ay: number; az: number }
const flat = (r: Result): Json[] =>
  typeof r === 'number'
    ? [enc(r)]
    : 'pitch' in r
      ? [enc(r.pitch), enc(r.roll)]
      : 'ax' in r
        ? [enc(r.ax), enc(r.ay), enc(r.az)]
        : [enc(r.x), enc(r.y), enc(r.z)]

function build(): Case[] {
  const rand = prng(20261116)
  const deg = (span = 720): number => Math.round((rand() - 0.5) * span * 100) / 100
  const comp = (): number => Math.round((rand() - 0.5) * 2 * 1000) / 1000
  const vec = (): Vec => ({ x: comp(), y: comp(), z: comp() })
  const cases: Case[] = []
  const add = (fn: string, args: Json[], out: Result): void => {
    cases.push({ fn, args, out: flat(out) })
  }
  // Fixed edge inputs first, then random ones.
  for (const d of [0, 180, -180, 190, -190, 360, 540, -540, 179.6, -179.8, NaN, Infinity, -Infinity]) {
    add('normalizeDeg', [enc(d)], m.normalizeDeg(d))
  }
  for (const [a, b] of [[179, -179], [-179, 179], [0, 180], [10, 350], [90, -90]]) {
    add('shortestArcDelta', [a, b], m.shortestArcDelta(a, b))
    add('jointAngleDeg', [a, b], m.jointAngleDeg(a, b))
  }
  for (const list of [[], [42], [42, 42, 42], [0, 180], [179.6, -179.8, 179.9, -179.7], [0, 90, 180, 270]]) {
    add('circularMeanDeg', [list], m.circularMeanDeg(list))
    add('circularStdDevDeg', [list], m.circularStdDevDeg(list))
  }
  const zero: Vec = { x: 0, y: 0, z: 0 }
  const up: Vec = { x: 0, y: 0, z: 1 }
  add('vectorAngleDeg', [encVec(zero), encVec(up)], m.vectorAngleDeg(zero, up))
  add('rotateAccelerationVector', [encVec(zero), 30], m.rotateAccelerationVector(zero, 30))
  add('deriveHingeAxis', [encVec(up), encVec(up)], m.deriveHingeAxis(up, up))
  add('projectOntoHingeFrame', [encVec(zero), encVec({ x: 1, y: 0, z: 0 }), encVec(up)], m.projectOntoHingeFrame(zero, { x: 1, y: 0, z: 0 }, up))
  for (const p of [0, 30, 89.99, 90, 90.01, 150, 180, -150, 210]) {
    add('reconstructTiltVector', [p, 5], m.reconstructTiltVector(p, 5))
    add('rotateRawAxes', [p, 5, 90], m.rotateRawAxes(p, 5, 90))
  }

  for (let i = 0; i < 60; i++) {
    const [a, b, c] = [deg(), deg(), deg(360)]
    add('normalizeDeg', [a * 3], m.normalizeDeg(a * 3))
    add('shortestArcDelta', [a, b], m.shortestArcDelta(a, b))
    add('jointAngleDeg', [a, b], m.jointAngleDeg(a, b))
    // A cluster around a random centre (often straddling the +/-180 cut) and a wide scatter.
    const centre = deg(360)
    const cluster = Array.from({ length: 12 }, () => Math.round((centre + (rand() - 0.5) * 4) * 100) / 100)
    const scatter = Array.from({ length: 9 }, () => deg(360))
    for (const list of [cluster, scatter]) {
      add('circularMeanDeg', [list], m.circularMeanDeg(list))
      add('circularStdDevDeg', [list], m.circularStdDevDeg(list))
    }
    const [pitch, roll] = [deg(360), deg(120)]
    add('reconstructTiltVector', [pitch, roll], m.reconstructTiltVector(pitch, roll))
    add('rotateRawAxes', [pitch, roll, c], m.rotateRawAxes(pitch, roll, c))
    const [v1, v2, v3, v4, v5] = [vec(), vec(), vec(), vec(), vec()]
    add('rotateAccelerationAxes', [encVec(v1), c], m.rotateAccelerationAxes(v1, c))
    add('rotateAccelerationVector', [encVec(v1), c], m.rotateAccelerationVector(v1, c))
    add('vectorAngleDeg', [encVec(v1), encVec(v2)], m.vectorAngleDeg(v1, v2))
    add('deriveHingeAxis', [encVec(v1), encVec(v2)], m.deriveHingeAxis(v1, v2))
    const hinge = m.deriveHingeAxis(v1, v2)
    add('projectOntoHingeFrame', [encVec(v3), encVec(hinge), encVec(v1)], m.projectOntoHingeFrame(v3, hinge, v1))
    const hinge2 = m.deriveHingeAxis(v4, v5)
    add(
      'reconcileToReferenceFrame',
      [encVec(v3), encVec(hinge), encVec(v1), encVec(hinge2), encVec(v4)],
      m.reconcileToReferenceFrame(v3, hinge, v1, hinge2, v4)
    )
  }
  return cases
}

describe('angleMath contract fixture (shared with IRMS_Core/src/angle_math.rs)', () => {
  // Through JSON, so the comparison sees what the file can hold (JSON has no negative zero).
  const actual = JSON.parse(JSON.stringify(build())) as Case[]

  // This project's tsconfig has no Node types, so the write path reaches Node through names the
  // type checker does not resolve.
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  if (env?.IRMS_WRITE_FIXTURES === '1') {
    it('writes fixtures/angle-math.json', async () => {
      const fsModule: string = 'node:fs'
      const fs = await import(/* @vite-ignore */ fsModule)
      const target = new URL('../../fixtures/angle-math.json', import.meta.url)
      fs.writeFileSync(target, JSON.stringify(actual) + String.fromCharCode(10))
    })
    return
  }

  const stored = storedJson as unknown as Case[]

  it('records every exported function', () => {
    const exported = Object.keys(m).filter((k) => typeof (m as Record<string, unknown>)[k] === 'function').sort()
    expect([...new Set(stored.map((c) => c.fn))].sort()).toEqual(exported)
  })

  it('the functions reproduce the stored results', () => {
    expect(actual.length).toBe(stored.length)
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i], `case ${i}`).toEqual(stored[i])
    }
  })
})
