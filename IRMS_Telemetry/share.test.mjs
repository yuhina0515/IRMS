// node --test share.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createShareService, normalizeCode, HOST_IDLE_MS, MAX_VIEWERS } from './share.mjs'

function harness() {
  let t = 1_000_000
  const live = new Set(['run-live-1'])
  const svc = createShareService({ isRunLive: (id) => live.has(id), now: () => t })
  const call = (method, p, { token, body, params = '' } = {}) =>
    svc.route(
      method,
      p,
      { headers: token ? { authorization: `Bearer ${token}` } : {} },
      new EventEmitter(),
      async () => body ?? null,
      new URLSearchParams(params),
    )
  return { svc, live, call, advance: (ms) => (t += ms) }
}

test('only a live telemetry run can create a share', async () => {
  const { call } = harness()
  assert.equal((await call('POST', '/v1/share', { body: { runId: 'run-dead' } }))[0], 409)
  const [status, body] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  assert.equal(status, 200)
  assert.equal(normalizeCode(body.code), body.code)
})

test('share closes when the telemetry run stops or the host goes idle', async () => {
  const { call, live, advance } = harness()
  const [, a] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  live.delete('run-live-1')
  assert.equal((await call('POST', `/v1/share/${a.code}/state`, { token: a.hostToken, body: { state: {} } }))[0], 404)

  live.add('run-live-1')
  const [, b] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  advance(HOST_IDLE_MS + 1)
  assert.equal((await call('GET', `/v1/share/${b.code}`))[0], 404)
})

test('creating again for the same run replaces the old code', async () => {
  const { call } = harness()
  const [, a] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  const [, b] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  assert.notEqual(a.code, b.code)
  assert.equal((await call('GET', `/v1/share/${a.code}`))[0], 404)
})

test('viewers are read-only until the host grants edit, and the limit holds', async () => {
  const { call } = harness()
  const [, s] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  const [, v] = await call('POST', `/v1/share/${s.code}/join`, { body: { name: 'x' } })
  const cmd = { type: 'setParams', params: { holdTimeMs: 3000 } }
  assert.equal((await call('POST', `/v1/share/${s.code}/commands`, { token: v.viewerToken, body: cmd }))[0], 403)
  // A viewer token must not work as the host token.
  assert.equal((await call('POST', `/v1/share/${s.code}/viewers/${v.viewerId}`, { token: v.viewerToken, body: { canEdit: true } }))[0], 401)
  await call('POST', `/v1/share/${s.code}/viewers/${v.viewerId}`, { token: s.hostToken, body: { canEdit: true } })
  assert.equal((await call('POST', `/v1/share/${s.code}/commands`, { token: v.viewerToken, body: cmd }))[0], 202)
  const [, pushed] = await call('POST', `/v1/share/${s.code}/state`, { token: s.hostToken, body: { state: { a: 1 } } })
  assert.deepEqual(pushed.commands.map((c) => c.params), [{ holdTimeMs: 3000 }])

  for (let i = 1; i < MAX_VIEWERS; i++) await call('POST', `/v1/share/${s.code}/join`, { body: {} })
  assert.equal((await call('POST', `/v1/share/${s.code}/join`, { body: {} }))[0], 403)
})

test('a viewer with an up-to-date version waits, then gets the next push', async () => {
  const { call } = harness()
  const [, s] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  const [, v] = await call('POST', `/v1/share/${s.code}/join`, { body: {} })
  const pending = call('GET', `/v1/share/${s.code}/state`, { token: v.viewerToken, params: 'after=0' })
  await call('POST', `/v1/share/${s.code}/state`, { token: s.hostToken, body: { state: { reps: 1 } } })
  const [status, body] = await pending
  assert.equal(status, 200)
  assert.deepEqual(body.state, { reps: 1 })
})
