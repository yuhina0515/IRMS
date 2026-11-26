// node --test server.test.mjs
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'

const TOKEN = 'test-read-token-0123456789'
let proc, dir, base

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => resolve(port))
    })
  })

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'irms-telemetry-'))
  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  proc = spawn(process.execPath, ['server.mjs'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, READ_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/v1/health`)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('server did not start')
})

after(() => {
  proc?.kill()
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 200).unref()
})

test('a malformed percent escape in a run id is a 400', async () => {
  const res = await fetch(`${base}/v1/runs/%E0%A4%A/events`, { headers: { authorization: `Bearer ${TOKEN}` } })
  assert.equal(res.status, 400)
})

test('a declared body over the limit is rejected with 413 before it is read', async () => {
  const res = await fetch(`${base}/v1/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: Buffer.alloc(4 * 1024 * 1024 + 1, 0x20),
  })
  assert.equal(res.status, 413)
})
