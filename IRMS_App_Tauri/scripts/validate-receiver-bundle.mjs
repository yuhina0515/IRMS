// 離線、單檔證據包核對；不讀 metadata 路徑、不連線、不執行校準或收集。
import { openSync, readSync, fstatSync, closeSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { parseAnglePacket, parseRawPacket } from '../src/shared/protocol.ts'

const LIMITS = { inputBytes: 8 * 1024 * 1024, calibrationBytes: 64 * 1024, rowBytes: 4096, rows: 50000, depth: 32 }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
class BundleError extends Error {}
const fail = message => { throw new BundleError(message) }

// 預算在累積前確認；檔案長度不是可信任的配置大小。只接受明確指定的一般檔案。
function readInput(path) {
  let fd
  try {
    fd = openSync(path, 'r')
    if (!fstatSync(fd).isFile()) fail('Bundle input must be a regular file')
    const chunks = []
    let total = 0
    for (;;) {
      const chunk = Buffer.alloc(Math.min(65536, LIMITS.inputBytes - total + 1))
      const count = readSync(fd, chunk, 0, chunk.length, null)
      if (count === 0) break
      if (total + count > LIMITS.inputBytes) fail('Bundle input byte budget exceeded')
      total += count
      chunks.push(chunk.subarray(0, count))
    }
    return Buffer.concat(chunks, total)
  } catch (error) {
    if (error instanceof BundleError) throw error
    fail('Cannot read bundle input')
  } finally { if (fd !== undefined) closeSync(fd) }
}

// 解析前限制深度與重複 key；字串內括號不算深度，跳脫 key 以解碼後名稱核對。
function json(text) {
  const stack = []
  try {
    for (let index = 0; index < text.length; index++) {
      const char = text[index]
      if (char === '"') {
        const start = index
        for (index++; index < text.length; index++) {
          if (text[index] === '\\') index++
          else if (text[index] === '"') break
        }
        if (index >= text.length) fail('Invalid bundle JSON')
        let next = index + 1
        while (/\s/.test(text[next] ?? '') && next < text.length) next++
        if (text[next] === ':') {
          const frame = stack.at(-1)
          if (!frame || frame.char !== '{') fail('Invalid bundle JSON')
          const key = JSON.parse(text.slice(start, index + 1))
          if (frame.keys.has(key)) fail('Duplicate JSON field')
          frame.keys.add(key)
        }
      } else if (char === '{' || char === '[') {
        stack.push({ char, keys: new Set() })
        if (stack.length > LIMITS.depth) fail('JSON depth budget exceeded')
      } else if (char === '}' || char === ']') {
        const frame = stack.pop()
        if (!frame || (char === '}' ? frame.char !== '{' : frame.char !== '[')) fail('Invalid bundle JSON')
      }
    }
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof BundleError) throw error
    fail('Invalid bundle JSON')
  }
}

// 固定欄位，不把額外的路徑、來源聲明或人口資料誤當可驗證 metadata。
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail('Invalid bundle fields')
}

// UTF-8 identity 核對原字串位元組，不 parse/re-serialize；孤立 surrogate 不可替換後算通過。
function artifact(value, keys, maxBytes) {
  object(value, keys)
  if (typeof value.utf8 !== 'string' || !value.utf8.isWellFormed() ||
      typeof value.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(value.sha256)) fail('Invalid artifact fields')
  const bytes = Buffer.from(value.utf8, 'utf8')
  if (bytes.length > maxBytes) fail('Artifact byte budget exceeded')
  const sha256 = hash(bytes)
  if (sha256 !== value.sha256.toLowerCase()) fail('Artifact hash mismatch')
  return sha256
}

function validate(bytes) {
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  catch { fail('Invalid bundle UTF-8') }
  const bundle = json(text)
  object(bundle, ['schemaVersion', 'dataOrigin', 'receiverClock', 'sourceClock', 'sourceSequence', 'reference', 'labels', 'producerRevision', 'artifacts'])
  if (bundle.schemaVersion !== 1 || !['synthetic', 'receiver-declared'].includes(bundle.dataOrigin) ||
      bundle.receiverClock !== 'receiver-monotonic-ms' || bundle.sourceClock !== null || bundle.sourceSequence !== null ||
      bundle.reference !== null || bundle.labels !== null ||
      !(bundle.producerRevision === null || typeof bundle.producerRevision === 'string' && /^[a-f\d]{40}$/i.test(bundle.producerRevision))) fail('Invalid bundle declarations')
  object(bundle.artifacts, ['calibration.json', 'frames.jsonl'])
  const calibration = bundle.artifacts['calibration.json']
  const frames = bundle.artifacts['frames.jsonl']
  const calibrationHash = artifact(calibration, ['utf8', 'sha256'], LIMITS.calibrationBytes)
  const calibrationObject = json(calibration.utf8.replace(/^\uFEFF/, ''))
  if (!calibrationObject || typeof calibrationObject !== 'object' || Array.isArray(calibrationObject)) fail('Invalid calibration JSON object')
  const framesHash = artifact(frames, ['utf8', 'sha256', 'count'], LIMITS.inputBytes)
  if (!Number.isSafeInteger(frames.count) || frames.count < 0 || frames.count > LIMITS.rows) fail('Frame count budget exceeded')
  const lines = frames.utf8.split('\n')
  if (lines.at(-1) === '') lines.pop()
  if (lines.length > LIMITS.rows) fail('Frame count budget exceeded')
  let previousSequence = null, firstTime = null, lastTime = null, gaps = 0, raw = 0, angle = 0
  for (const line of lines) {
    if (Buffer.byteLength(line, 'utf8') > LIMITS.rowBytes) fail('Frame row byte budget exceeded')
    const frame = json(line)
    object(frame, ['rxSequence', 'rxMonotonicMs', 'channel', 'packet'])
    if (!Number.isSafeInteger(frame.rxSequence) || frame.rxSequence < 0 || !Number.isFinite(frame.rxMonotonicMs) ||
        frame.rxMonotonicMs < 0 || typeof frame.packet !== 'string' || !['raw', 'angle'].includes(frame.channel)) fail('Invalid frame fields')
    if (previousSequence !== null && frame.rxSequence <= previousSequence) fail('Receiver sequence must increase')
    if (lastTime !== null && frame.rxMonotonicMs < lastTime) fail('Receiver clock must not decrease')
    if (previousSequence !== null) gaps += frame.rxSequence - previousSequence - 1
    previousSequence = frame.rxSequence
    firstTime ??= frame.rxMonotonicMs
    lastTime = frame.rxMonotonicMs
    if (frame.channel === 'raw') {
      if (!parseRawPacket(frame.packet)) fail('Invalid raw frame packet')
      raw++
    } else {
      const parsed = parseAnglePacket(frame.packet)
      if (parsed.kind !== 'angles' || parsed.truncated || !parsed.raw.thighAccel || !parsed.raw.shinAccel) fail('Invalid angle frame packet')
      angle++
    }
  }
  if (lines.length !== frames.count) fail('Frame count mismatch')
  const sourceRoot = new URL('../', import.meta.url)
  return { reportSchemaVersion: 1, structurallyValid: true, dataOrigin: bundle.dataOrigin,
    hashes: { bundle: hash(bytes), calibration: calibrationHash, frames: framesHash },
    records: { total: lines.length, raw, angle, receiverSequenceGaps: gaps,
      receiverDurationMs: firstTime === null ? null : lastTime - firstTime },
    scope: { clock: 'receiver-monotonic-ms', originVerified: false, producerRevisionVerified: false,
      sourceClockVerified: false, sourceSequenceAvailable: false, calibrationAssociationVerified: false,
      calibrationModelVerified: false, referenceAvailable: false, labelsAvailable: false },
    sources: Object.fromEntries(['scripts/validate-receiver-bundle.mjs', 'src/shared/protocol.ts']
      .map(path => [path, hash(readFileSync(new URL(path, sourceRoot)))])), runtime: { node: process.version } }
}

try {
  if (process.argv.length !== 3 || process.argv[2].startsWith('-')) fail('Usage: node scripts/validate-receiver-bundle.mjs bundle.json')
  console.log(JSON.stringify(validate(readInput(process.argv[2])), null, 2))
} catch (error) {
  console.error(error instanceof BundleError ? error.message : 'Bundle validation failed')
  process.exitCode = 1
}
