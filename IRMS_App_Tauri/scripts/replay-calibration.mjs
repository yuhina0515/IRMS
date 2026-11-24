import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseAnglePacket } from '../src/shared/protocol.ts'
import { projectOntoHingeFrame } from '../src/services/angleMath.ts'

// Node 24 可直接載入純 TypeScript；只讀檔案，不啟動 BLE 或改寫設定。
class ReplayError extends Error {}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
// 只刪除緊接 LF 前的 CR，不改動編碼、空白、順序或最後一個換行。
const canonicalLf = bytes => bytes.filter((byte, index) => byte !== 13 || bytes[index + 1] !== 10)
// 僅讀明確指定的檔案；失敗訊息不包含私人路徑。
function readBytes(path, kind) {
  try { return readFileSync(path) } catch { throw new ReplayError(`Cannot read ${kind} input`) }
}
// BOM 僅於解析時移除，原始位元組仍完整參與雜湊；不回顯 JSON 錯誤片段。
function parseJson(bytes, kind) {
  try { return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) }
  catch { throw new ReplayError(`Invalid ${kind} JSON`) }
}

// 純離線審計，保留既有計數與數學，只有明確提供清單時才核對身分。
function replay() {
  const positional = []
  let provenancePath = null
  const args = process.argv.slice(2)
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--provenance') {
      if (provenancePath !== null || !args[index + 1] || args[index + 1].startsWith('-')) {
        throw new ReplayError('Invalid provenance option')
      }
      provenancePath = args[++index]
    } else if (args[index].startsWith('-')) throw new ReplayError('Unknown replay option')
    else positional.push(args[index])
  }
  if (positional.length < 1 || positional.length > 2) {
    throw new ReplayError('Usage: node scripts/replay-calibration.mjs packets.txt [settings.json] [--provenance manifest.json]')
  }
  const [packetPath, settingsPath] = positional
  // 同一個 Buffer 同時用於身分核對與分析，避免重複讀檔造成錯誤關聯。
  const packetBytes = readBytes(packetPath, 'packet')
  const packetHash = hash(packetBytes)
  const canonicalHash = hash(canonicalLf(packetBytes))
  const provenanceBytes = provenancePath ? readBytes(provenancePath, 'provenance') : null
  const provenance = provenanceBytes ? parseJson(provenanceBytes, 'provenance') : null
  let packetMatch = null
  if (provenanceBytes) {
    const validHash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value)
    if (!provenance || Array.isArray(provenance) || !validHash(provenance.packetsSha256) ||
        !Number.isSafeInteger(provenance.packetCount) || provenance.packetCount < 0) {
      throw new ReplayError('Invalid packet provenance fields')
    }
    const hasCanonical = Object.hasOwn(provenance, 'packetsCanonicalLfSha256') || Object.hasOwn(provenance, 'packetsCanonicalization')
    if (hasCanonical && (!validHash(provenance.packetsCanonicalLfSha256) || provenance.packetsCanonicalization !== 'crlf-to-lf-v1')) {
      throw new ReplayError('Invalid packet canonicalization fields')
    }
    if (hasCanonical && canonicalHash !== provenance.packetsCanonicalLfSha256.toLowerCase()) {
      throw new ReplayError('Packet provenance hash mismatch')
    }
    if (packetHash === provenance.packetsSha256.toLowerCase()) packetMatch = 'raw-sha256'
    else if (hasCanonical && canonicalHash === provenance.packetsCanonicalLfSha256.toLowerCase()) packetMatch = 'canonical-lf-sha256'
    else throw new ReplayError('Packet provenance hash mismatch')
  }
  const settingsBytes = settingsPath ? readBytes(settingsPath, 'settings') : null
  const settings = settingsBytes ? parseJson(settingsBytes, 'settings') : null
  if (settingsBytes && (!settings || typeof settings !== 'object' || Array.isArray(settings))) {
    throw new ReplayError('Invalid calibration settings')
  }
  if (settings) {
    for (const key of ['proximalZeroAccel', 'distalZeroAccel', 'proximalHingeAxis', 'distalHingeAxis']) {
      const vector = settings[key]
      if (!vector || !['x', 'y', 'z'].every((axis) => Number.isFinite(vector[axis])) || Math.hypot(vector.x, vector.y, vector.z) < 1e-6) {
        throw new ReplayError(`Missing or invalid calibration vector: ${key}`)
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
  for (const line of packetBytes.toString('utf8').split(/\r?\n/)) {
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
  if (provenanceBytes && report.packets !== provenance.packetCount) throw new ReplayError('Packet provenance count mismatch')
  const sourceRoot = new URL('../', import.meta.url)
  report.evidence = {
    schemaVersion: 1,
    packets: { sha256: packetHash, bytes: packetBytes.length, canonicalLfSha256: canonicalHash, canonicalization: 'crlf-to-lf-v1' },
    settings: settingsBytes ? { sha256: hash(settingsBytes), bytes: settingsBytes.length, association: 'caller-supplied; original session match not verified' } : null,
    provenance: provenanceBytes ? { sha256: hash(provenanceBytes), packetMatch, packetCountMatch: true,
      scope: 'caller-manifest consistency only', originalSourceVerified: false } : null,
    sources: Object.fromEntries(['scripts/replay-calibration.mjs', 'src/shared/protocol.ts', 'src/services/angleMath.ts']
      .map(path => [path, hash(readBytes(new URL(path, sourceRoot), 'replay source'))])),
    runtime: { node: process.version }
  }
  console.log(JSON.stringify(report, null, 2))
}

try { replay() } catch (error) {
  // 不回顯私人檔案路徑、JSON 片段或原生堆疊；失敗時不輸出成功報告。
  console.error(error instanceof ReplayError ? error.message : 'Replay failed')
  process.exitCode = 1
}
