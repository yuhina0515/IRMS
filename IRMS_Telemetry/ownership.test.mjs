// 真正的 collector 子程序、HTTP 與暫存 SQLite；不連線到部署環境。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRunOwnership, OWNER_HEADER } from './runOwnership.mjs'

const reader = 'read-only-fixture-token-not-a-run-owner'
const proof = 'a'.repeat(64)
const impostor = 'b'.repeat(64)

async function startCollector(dataDir) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: dataDir, READ_TOKEN: reader,
      RETENTION_DAYS: '90', MAX_DB_GB: '20', TRUSTED_PROXY: '', RATE_MAX_REQUESTS: '1000', RATE_MAX_EVENTS: '100000', SHARE_RATE_MAX_REQUESTS: '1000' },
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  })
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('collector start timeout')) }, 10000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`collector exited during startup: ${code}`)) })
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/listening on 127\.0\.0\.1:(\d+)/)
      if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`) }
    })
    // 排空 stderr，避免無人讀取的 pipe 阻塞；不把環境或任意診斷寫入公開結果。
    child.stderr.resume()
  })
  return { endpoint, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await exited
  } }
}

test('ownership binding rolls back atomically and cannot upgrade a legacy run', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE runs (id TEXT PRIMARY KEY)')
  const owners = createRunOwnership(db)
  db.exec('BEGIN')
  assert.equal(owners.authorizeIngest('new-run', proof), null)
  db.exec('ROLLBACK')
  assert.equal(owners.isOwner('new-run', proof), false)
  assert.equal(owners.authorizeIngest('new-run', impostor), null)
  assert.equal(owners.isOwner('new-run', impostor), true)
  db.exec("INSERT INTO runs VALUES ('legacy-run')")
  assert.equal(owners.authorizeIngest('legacy-run', proof).status, 409)
  assert.equal(owners.isOwner('legacy-run', proof), false)
  assert.equal(owners.authorizeIngest('legacy-run', undefined), null)
  assert.equal(owners.authorizeIngest('bad-run', 'bad').status, 400)
  db.close()
})

test('real collector binds only first ingest, rejects known-runId attackers, persists and prunes proof', async t => {
  const tempRoot = path.resolve(tmpdir())
  const dataDir = await mkdtemp(path.join(tempRoot, 'irms-ownership-'))
  assert.ok(path.resolve(dataDir).startsWith(tempRoot + path.sep))
  let collector
  t.after(async () => { await collector?.stop(); await rm(dataDir, { recursive: true, force: true }) })
  collector = await startCollector(dataDir)
  const call = async (method, route, body, owner, readToken) => {
    const response = await fetch(collector.endpoint + route, { method,
      headers: { 'content-type': 'application/json', ...(owner === undefined ? {} : { [OWNER_HEADER]: owner }),
        ...(readToken ? { authorization: `Bearer ${readToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }
  const payload = runId => ({ runId, appVersion: 'fixture', events: [{ seq: 1, t: '2026-10-29T00:00:00Z', kind: 'fixture', data: { n: 1 } }] })
  const runId = 'run-owned-fixture'
  assert.equal((await call('GET', '/v1/share/capabilities')).body.ownershipVersion, 1)
  assert.equal((await call('POST', '/v1/ingest', payload(runId), proof)).status, 200)
  assert.equal((await call('POST', '/v1/ingest', payload(runId), proof)).body.inserted, 0)
  const initial = await call('GET', '/v1/runs', undefined, undefined, reader)
  for (const owner of [undefined, impostor]) {
    assert.equal((await call('POST', '/v1/share', { runId }, owner, reader)).status, 403)
    const forged = payload(runId)
    forged.appVersion = 'attacker'
    forged.events[0].seq = 2
    assert.equal((await call('POST', '/v1/ingest', forged, owner)).status, 403)
  }
  assert.deepEqual(await call('GET', '/v1/runs', undefined, undefined, reader), initial)
  const share = await call('POST', '/v1/share', { runId }, proof)
  assert.equal(share.status, 200)
  assert.equal(share.body.ownershipVersion, 1)
  assert.equal((await call('POST', '/v1/share', { runId }, impostor)).status, 403)
  assert.equal((await call('GET', `/v1/share/${share.body.code}`)).status, 200)
  const replacement = await call('POST', '/v1/share', { runId }, proof)
  assert.equal(replacement.status, 200)
  assert.notEqual(replacement.body.code, share.body.code)
  assert.equal((await call('GET', `/v1/share/${share.body.code}`)).status, 404)

  const legacy = 'legacy-run-fixture'
  assert.equal((await call('POST', '/v1/ingest', payload(legacy))).status, 200)
  assert.equal((await call('POST', '/v1/ingest', payload(legacy), proof)).status, 409)
  assert.equal((await call('POST', '/v1/share', { runId: legacy }, proof)).status, 403)
  assert.equal((await call('POST', '/v1/ingest', payload('bad-run-fixture'), 'bad')).status, 400)
  for (const route of ['/v1/runs', `/v1/runs/${runId}/events`]) {
    const read = JSON.stringify((await call('GET', route, undefined, undefined, reader)).body)
    assert.ok(!read.includes(proof))
    assert.ok(!read.includes('proof_hash'))
    assert.ok(!read.includes('run_owners'))
  }

  // 在 owner/event 已寫入後，強制 run 寫入失敗，檢查真正的 ingest 交易有完整回滾。
  const failingRun = 'rollback-run-fixture'
  const faultDb = new DatabaseSync(path.join(dataDir, 'telemetry.sqlite'))
  faultDb.exec(`CREATE TRIGGER fail_fixture BEFORE INSERT ON runs WHEN NEW.id='${failingRun}' BEGIN SELECT RAISE(ABORT, 'fixture insert failure'); END`)
  assert.equal((await call('POST', '/v1/ingest', payload(failingRun), proof)).status, 500)
  for (const [table, column] of [['runs', 'id'], ['events', 'run_id'], ['run_owners', 'run_id']]) {
    assert.equal(faultDb.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`).get(failingRun).n, 0)
  }
  faultDb.exec('DROP TRIGGER fail_fixture')
  faultDb.close()
  assert.equal((await call('POST', '/v1/ingest', payload(failingRun), impostor)).status, 200)

  await collector.stop()
  collector = await startCollector(dataDir)
  assert.equal((await call('POST', '/v1/ingest', payload(runId), impostor)).status, 403)
  assert.equal((await call('POST', '/v1/share', { runId }, proof)).status, 200)
  await collector.stop()
  const db = new DatabaseSync(path.join(dataDir, 'telemetry.sqlite'))
  const stored = db.prepare('SELECT proof_hash FROM run_owners WHERE run_id=?').get(runId).proof_hash
  assert.equal(stored.length, 32)
  db.prepare("UPDATE runs SET last_seen='2000-01-01T00:00:00Z' WHERE id=?").run(runId)
  db.close()
  collector = await startCollector(dataDir)
  const pruned = new DatabaseSync(path.join(dataDir, 'telemetry.sqlite'))
  for (const [table, column] of [['runs', 'id'], ['events', 'run_id'], ['run_owners', 'run_id']]) {
    assert.equal(pruned.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column}=?`).get(runId).n, 0)
  }
  pruned.close()
  assert.equal((await call('POST', '/v1/ingest', payload(runId), impostor)).status, 200)
})
