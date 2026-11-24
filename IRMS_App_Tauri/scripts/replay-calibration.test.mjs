import { afterEach, beforeEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./replay-calibration.mjs', import.meta.url))
const packet = 'T:1,S:2,K:1,V:0/1/0/0/0/1'
const hash = data => createHash('sha256').update(data).digest('hex')
let directory
let packets

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'irms-replay-evidence-'))
  packets = join(directory, 'packets.txt')
  writeFileSync(packets, `${packet}\r\nERR:1\r\n`)
})
afterEach(() => {
  // 遞迴清理前確認只刪除本測試在系統暫存目錄建立的目錄。
  const target = resolve(directory)
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith('irms-replay-evidence-')) {
    throw new Error('Unsafe test cleanup path')
  }
  rmSync(target, { recursive: true, force: true })
})

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 })
}
function manifest(extra = {}) {
  const path = join(directory, 'manifest.json')
  writeFileSync(path, JSON.stringify({ packetsSha256: hash(readFileSync(packets)), packetCount: 2, ...extra }))
  return path
}

it('identifies exact input and runtime sources without claiming missing calibration or source proof', () => {
  const result = run(packets)
  expect(result.status).toBe(0)
  const report = JSON.parse(result.stdout)
  expect(report).toMatchObject({ packets: 2, angles: 1, errors: 1, shinRollAbove150: null,
    evidence: { schemaVersion: 1, packets: { sha256: hash(readFileSync(packets)), bytes: readFileSync(packets).length },
      settings: null, provenance: null, runtime: { node: process.version } } })
  expect(Object.keys(report.evidence.sources)).toEqual(['scripts/replay-calibration.mjs', 'src/shared/protocol.ts', 'src/services/angleMath.ts'])
  for (const [path, sha256] of Object.entries(report.evidence.sources)) {
    expect(sha256).toBe(hash(readFileSync(new URL('../' + path, import.meta.url))))
  }
})

it('verifies caller manifest consistency without reading or printing its private paths', () => {
  const path = manifest({ source: 'private-source-sentinel/absent.log', settings: 'private-settings-sentinel.json' })
  const result = run(packets, '--provenance', path)
  expect(result.status).toBe(0)
  const report = JSON.parse(result.stdout)
  expect(report.evidence.provenance).toMatchObject({ packetMatch: 'raw-sha256', packetCountMatch: true,
    originalSourceVerified: false })
  expect(result.stdout + result.stderr).not.toContain('private-source-sentinel')
  expect(result.stdout + result.stderr).not.toContain(directory)
})

it('fails without leaking a private input path or a successful report', () => {
  const result = run(join(directory, 'private-path-sentinel.txt'))
  expect(result.status).not.toBe(0)
  expect(result.stdout).toBe('')
  expect(result.stderr).toContain('Cannot read packet input')
  expect(result.stderr).not.toContain('private-path-sentinel')
  expect(result.stderr).not.toContain(directory)
})

it('distinguishes original bytes from explicit CRLF-to-LF consistency', () => {
  const lf = `${packet}\nERR:1\n`
  const path = manifest({ packetsCanonicalization: 'crlf-to-lf-v1', packetsCanonicalLfSha256: hash(lf) })
  expect(JSON.parse(run(packets, '--provenance', path).stdout).evidence.provenance.packetMatch).toBe('raw-sha256')
  writeFileSync(packets, lf)
  const result = run('--provenance', path, packets)
  expect(result.status).toBe(0)
  const report = JSON.parse(result.stdout)
  expect(report.evidence.provenance.packetMatch).toBe('canonical-lf-sha256')
  expect(report.evidence.packets.sha256).toBe(hash(lf))
})

it.each([
  ['bare CR', `${packet}\rERR:1\n`],
  ['missing final LF', `${packet}\nERR:1`],
  ['extra space', ` ${packet}\nERR:1\n`],
  ['changed order', `ERR:1\n${packet}\n`],
  ['BOM', `\uFEFF${packet}\nERR:1\n`],
  ['changed reading', `${packet.replace('T:1', 'T:4')}\nERR:1\n`]
])('does not normalize %s into manifest equivalence', (_, changed) => {
  const path = manifest({ packetsCanonicalization: 'crlf-to-lf-v1', packetsCanonicalLfSha256: hash(`${packet}\nERR:1\n`) })
  writeFileSync(packets, changed)
  const result = run(packets, '--provenance', path)
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe('Packet provenance hash mismatch')
})

it('does not infer canonical matching for a legacy raw-only manifest', () => {
  const path = manifest()
  writeFileSync(packets, `${packet}\nERR:1\n`)
  expect(run(packets, '--provenance', path).status).toBe(1)
})

it('rejects a contradictory canonical hash even when the raw hash matches', () => {
  const path = manifest({ packetsCanonicalization: 'crlf-to-lf-v1', packetsCanonicalLfSha256: '0'.repeat(64) })
  const result = run(packets, '--provenance', path)
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe('Packet provenance hash mismatch')
})

it.each([
  { packetsSha256: 'not-a-hash' }, { packetCount: -1 }, { packetCount: 1.5 },
  { packetCount: Number.MAX_SAFE_INTEGER + 1 }, { packetsSha256: null },
  { packetsCanonicalLfSha256: 'a'.repeat(64) },
  { packetsCanonicalization: 'unknown', packetsCanonicalLfSha256: 'a'.repeat(64) },
  { packetsCanonicalization: 'crlf-to-lf-v1', packetsCanonicalLfSha256: 'bad' }
])('rejects malformed provenance fields %# without a report', (extra) => {
  const result = run(packets, '--provenance', manifest(extra))
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toMatch(/^Invalid packet (provenance|canonicalization) fields\s*$/)
})

it('keeps the nonblank-packet count definition including malformed/error and trace prefixes', () => {
  writeFileSync(packets, `\n \t\n[calibration-trace] ${packet}\r\nERR:1\ninvalid\n`)
  const path = manifest({ packetCount: 3 })
  const report = JSON.parse(run(packets, '--provenance', path).stdout)
  expect(report).toMatchObject({ packets: 3, angles: 1, errors: 1, malformed: 1 })
  const result = run(packets, '--provenance', manifest({ packetCount: 2 }))
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe('Packet provenance count mismatch')
})

it.each(['settings', 'provenance'])('redacts malformed %s JSON rather than printing input snippets', (kind) => {
  const path = join(directory, `private-path-sentinel-${kind}.json`)
  writeFileSync(path, '{"private":"private-json-sentinel",')
  const result = kind === 'settings' ? run(packets, path) : run(packets, '--provenance', path)
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr.trim()).toBe(`Invalid ${kind} JSON`)
  expect(result.stderr).not.toContain('sentinel')
  expect(result.stderr).not.toContain(directory)
})

it.each([['--provenance'], ['--provenance', '--unknown'], ['--unknown'], ['--provenance', 'a', '--provenance', 'b'], ['-x']])(
  'rejects invalid CLI options %#', (...args) => {
    const result = run(packets, ...args)
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toMatch(/^(Invalid provenance option|Unknown replay option)\s*$/)
  }
)

it('preserves optional settings input bytes including BOM without inferring session association', () => {
  const settings = { proximalZeroAccel: { x: 0, y: 1, z: 0 }, distalZeroAccel: { x: 0, y: 1, z: 0 },
    proximalHingeAxis: { x: 1, y: 0, z: 0 }, distalHingeAxis: { x: 1, y: 0, z: 0 },
    privateField: 'private-settings-sentinel' }
  const bytes = Buffer.from('\uFEFF' + JSON.stringify(settings))
  const path = join(directory, 'settings.json')
  writeFileSync(path, bytes)
  const result = run(packets, path)
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout).evidence.settings).toEqual({ sha256: hash(bytes), bytes: bytes.length,
    association: 'caller-supplied; original session match not verified' })
  expect(result.stdout).not.toContain('private-settings-sentinel')
})
