import { readFileSync } from 'node:fs'
import { parseAnglePacket } from '../src/shared/protocol.ts'
import { projectOntoHingeFrame } from '../src/services/angleMath.ts'

// Node 24 可直接載入純 TypeScript；只讀檔案，不啟動 BLE 或改寫設定。
const [packetPath, settingsPath] = process.argv.slice(2)
if (!packetPath) throw new Error('Usage: node scripts/replay-calibration.mjs packets.txt [settings.json]')
const settings = settingsPath ? JSON.parse(readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '')) : null
if (settings) {
  for (const key of ['proximalZeroAccel', 'distalZeroAccel', 'proximalHingeAxis', 'distalHingeAxis']) {
    const vector = settings[key]
    if (!vector || !['x', 'y', 'z'].every((axis) => Number.isFinite(vector[axis])) || Math.hypot(vector.x, vector.y, vector.z) < 1e-6) {
      throw new Error(`Missing or invalid calibration vector: ${key}`)
    }
  }
}
const report = {
  packets: 0, angles: 0, errors: 0, malformed: 0, truncated: 0, vectorPairs: 0,
  mode: settings ? 'unsmoothed hinge projection; caller-supplied settings, provenance not inferred' : 'raw packet audit only; exact calibration settings unavailable',
  normRange: { min: Infinity, max: -Infinity },
  shinRollAbove150: settings ? 0 : null,
  firstLargeRollPacket: null
}
for (const line of readFileSync(packetPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue
  report.packets++
  const result = parseAnglePacket(line.replace(/^\[calibration-trace\] /, ''))
  if (result.kind === 'malformed') { report.malformed++; continue }
  if (result.kind === 'error') { report.errors++; continue }
  report.angles++
  if (result.truncated) report.truncated++
  const { thighAccel: thigh, shinAccel: shin } = result.raw
  if (!thigh || !shin) continue
  report.vectorPairs++
  for (const v of [thigh, shin]) {
    const norm = Math.hypot(v.x, v.y, v.z)
    report.normRange.min = Math.min(report.normRange.min, norm)
    report.normRange.max = Math.max(report.normRange.max, norm)
  }
  if (settings) {
    const projected = projectOntoHingeFrame(shin, settings.distalHingeAxis, settings.distalZeroAccel)
    if (Math.abs(projected.roll) > 150) {
      report.shinRollAbove150++
      report.firstLargeRollPacket ??= report.packets
    }
  }
}
console.log(JSON.stringify(report, null, 2))
