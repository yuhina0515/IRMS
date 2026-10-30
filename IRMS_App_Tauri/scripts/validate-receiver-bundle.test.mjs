import { afterEach, beforeEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./validate-receiver-bundle.mjs', import.meta.url))
const hash = text => createHash('sha256').update(text).digest('hex')
const raw = 'G:0/0/0/0/0/0/0/0/1/0/0/1'
const angle = 'T:0,S:0,K:0,V:0/0/1/0/0/1'
const row = (rxSequence = 0, rxMonotonicMs = 0, channel = 'raw', packet = raw) => ({ rxSequence, rxMonotonicMs, channel, packet })
const artifact = utf8 => ({ utf8, sha256: hash(utf8) })
function bundle(rows = [row(), row(2, 0, 'angle', angle)]) {
  return { schemaVersion: 1, dataOrigin: 'synthetic', receiverClock: 'receiver-monotonic-ms',
    sourceClock: null, sourceSequence: null, reference: null, labels: null, producerRevision: null,
    artifacts: { 'calibration.json': artifact('{"synthetic":true,"modelValidated":false}'),
      'frames.jsonl': { ...artifact(rows.map(value => JSON.stringify(value)).join('\n')), count: rows.length } } }
}
let directory, input
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'irms-bundle-')); input = join(directory, 'private-input.json') })
afterEach(() => {
  // 遞迴刪除前確認絕對路徑仍在本測試的暫存範圍內。
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('irms-bundle-')) throw new Error('Unsafe cleanup')
  rmSync(target, { recursive: true, force: true })
})
function run(value = bundle()) {
  writeFileSync(input, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
  return spawnSync(process.execPath, [script, input], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 })
}
function rejects(value, message) {
  const result = run(value)
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe(message)
  expect(result.stderr).not.toContain(directory)
}
it('reports exact identities, receiver gaps and ties without source or model claims', () => {
  const value = bundle(), result = run(value)
  expect(result.status).toBe(0)
  const report = JSON.parse(result.stdout)
  expect(report.records).toEqual({ total: 2, raw: 1, angle: 1, receiverSequenceGaps: 1, receiverDurationMs: 0 })
  expect(report.hashes).toEqual({ bundle: hash(readFileSync(input)), calibration: value.artifacts['calibration.json'].sha256, frames: value.artifacts['frames.jsonl'].sha256 })
  expect(Object.values(report.scope).filter(value => typeof value === 'boolean')).toEqual(Array(8).fill(false))
  expect(report.sources['scripts/validate-receiver-bundle.mjs']).toBe(hash(readFileSync(script)))
  expect(result.stdout).not.toContain('modelValidated')
})
it.each([0, 1])('accepts %i records with explicit empty/single duration', count => {
  const result = run(bundle(count ? [row()] : []))
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).records.receiverDurationMs).toBe(count ? 0 : null)
})
it('preserves CRLF, emoji and escaped JSON strings in artifact identity', () => {
  const value = bundle(); value.artifacts['calibration.json'] = artifact('{"note":"😀 \\" {}"}\r\n')
  value.artifacts['frames.jsonl'].utf8 += '\r\n'
  value.artifacts['frames.jsonl'].sha256 = hash(value.artifacts['frames.jsonl'].utf8)
  expect(run(value).status).toBe(0)
})
it.each([
  ['rxSequence', -1, 'Invalid frame fields'], ['rxSequence', 1.5, 'Invalid frame fields'],
  ['rxSequence', Number.MAX_SAFE_INTEGER + 1, 'Invalid frame fields'],
  ['rxMonotonicMs', -1, 'Invalid frame fields'], ['channel', 'private-path', 'Invalid frame fields'],
  ['packet', 'G:1', 'Invalid raw frame packet']
])('rejects invalid %s=%s', (key, value, error) => rejects(bundle([{ ...row(), [key]: value }]), error))
it.each([0, 1])('rejects duplicate/decreasing receiver sequence %i', value => rejects(bundle([row(1), row(value)]), 'Receiver sequence must increase'))
it('rejects decreasing receiver time', () => rejects(bundle([row(0, 2), row(1, 1)]), 'Receiver clock must not decrease'))
it.each(['90', 'T:1,S:2,K:1', 'ERR:1', 'T:0,S:0,K:0,V:0/0/1/0/0', 'T:0,S:0,K:0,V:NaN/0/1/0/0/1'])('rejects incomplete/error angle %s', packet => rejects(bundle([row(0, 0, 'angle', packet)]), 'Invalid angle frame packet'))
it('rejects nonfinite raw values', () => rejects(bundle([row(0, 0, 'raw', raw.replace('G:0', 'G:Infinity'))]), 'Invalid raw frame packet'))
it('rejects tampered artifacts', () => { const value = bundle(); value.artifacts['calibration.json'].utf8 += ' '; rejects(value, 'Artifact hash mismatch') })
it('rejects count mismatch', () => { const value = bundle(); value.artifacts['frames.jsonl'].count = 1; rejects(value, 'Frame count mismatch') })
it.each(['sourceClock', 'sourceSequence', 'reference', 'labels'])('rejects invented %s evidence', key => rejects({ ...bundle(), [key]: {} }, 'Invalid bundle declarations'))
it.each(['top', 'artifact', 'row'])('rejects extra %s fields without reading metadata paths', level => {
  const value = bundle(level === 'row' ? [{ ...row(), path: input }] : undefined)
  if (level === 'top') value.path = input
  if (level === 'artifact') value.artifacts['calibration.json'].path = input
  rejects(value, 'Invalid bundle fields')
})
it('rejects escaped duplicate keys', () => rejects(JSON.stringify(bundle()).replace('"schemaVersion":1', '"schemaVersion":1,"\\u0073chemaVersion":1'), 'Duplicate JSON field'))
it('rejects duplicate embedded calibration keys', () => { const value = bundle(); value.artifacts['calibration.json'] = artifact('{"x":1,"x":2}'); rejects(value, 'Duplicate JSON field') })
it.each(['\ud800', '\udfff'])('rejects isolated surrogate', text => { const value = bundle(); value.artifacts['calibration.json'] = artifact(JSON.stringify({ text }).replace(/\\u(d800|dfff)/, text)); rejects(value, 'Invalid artifact fields') })
it('rejects invalid UTF-8', () => rejects(Buffer.from([0xff]), 'Invalid bundle UTF-8'))
it('redacts malformed JSON', () => rejects('{"secret-path":private-value}', 'Invalid bundle JSON'))
it('rejects depth 33 before parsing', () => rejects('['.repeat(33) + ']'.repeat(33), 'JSON depth budget exceeded'))
it('rejects embedded depth 33', () => { const value = bundle(); value.artifacts['calibration.json'] = artifact('['.repeat(33) + ']'.repeat(33)); rejects(value, 'JSON depth budget exceeded') })
it('rejects calibration over 64KiB', () => { const value = bundle(); value.artifacts['calibration.json'] = artifact(' '.repeat(65537)); rejects(value, 'Artifact byte budget exceeded') })
it('rejects rows over 4096 bytes', () => rejects(bundle([row(0, 0, 'raw', ' '.repeat(4097))]), 'Frame row byte budget exceeded'))
it('rejects actual input over 8MiB', () => rejects(Buffer.alloc(8 * 1024 * 1024 + 1, 32), 'Bundle input byte budget exceeded'))
it('accepts 50000 rows and rejects 50001 regardless of declared count', () => {
  const rows = Array.from({ length: 50000 }, (_, index) => row(index, index))
  expect(run(bundle(rows)).status).toBe(0)
  rows.push(row(50000, 50000)); const value = bundle(rows); value.artifacts['frames.jsonl'].count = 50000
  rejects(value, 'Frame count budget exceeded')
})
