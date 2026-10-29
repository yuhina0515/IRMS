// node --test share.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createShareService, normalizeCode, HOST_IDLE_MS, VIEWER_IDLE_MS, MAX_VIEWERS } from './share.mjs'

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

test('removed viewer pending poll cannot receive the next state', async () => {
  const { call } = harness()
  const [, s] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  const [, v] = await call('POST', `/v1/share/${s.code}/join`, { body: {} })
  const pending = call('GET', `/v1/share/${s.code}/state`, { token: v.viewerToken, params: 'after=0' })
  await call('DELETE', `/v1/share/${s.code}/viewers/${v.viewerId}`, { token: s.hostToken })
  await call('POST', `/v1/share/${s.code}/state`, { token: s.hostToken, body: { state: { private: 'new' } } })
  const [status, body] = await pending
  assert.equal(status, 401)
  assert.equal(body.state, undefined)
})

// 各種撤銷方式都必須立即清除所有等待，而非等下一筆狀態才重新檢查。
for (const action of ['remove', 'leave', 'expire']) {
  test(`${action} settles all revoked polls and preserves other viewers`, async () => {
    const { svc, call, advance } = harness()
    const [, s] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
    const [, v] = await call('POST', `/v1/share/${s.code}/join`, { body: {} })
    const [, other] = await call('POST', `/v1/share/${s.code}/join`, { body: {} })
    const share = svc._shares.get(s.code)
    const oldViewer = share.viewers.get(v.viewerId)
    const polls = [1, 2].map(() => call('GET', `/v1/share/${s.code}/state`, { token: v.viewerToken, params: 'after=0' }))
    const authorized = call('GET', `/v1/share/${s.code}/state`, { token: other.viewerToken, params: 'after=0' })
    if (action === 'remove') await call('DELETE', `/v1/share/${s.code}/viewers/${v.viewerId}`, { token: s.hostToken })
    else if (action === 'leave') await call('POST', `/v1/share/${s.code}/leave`, { token: v.viewerToken })
    else {
      // 模擬時鐘跳進閒置清理分支，同時維持 host 與另一觀眾存活，隔離逾期資格判定。
      advance(VIEWER_IDLE_MS + 1)
      share.hostSeen += VIEWER_IDLE_MS + 1
      share.viewers.get(other.viewerId).lastSeen += VIEWER_IDLE_MS + 1
      svc.sweep()
    }
    assert.equal(oldViewer.waiters.size, 0)
    assert.equal(share.waiters.size, 1)
    for (const [status, body] of await Promise.all(polls)) {
      assert.equal(status, 401)
      assert.equal(body.state, undefined)
    }
    await call('POST', `/v1/share/${s.code}/state`, { token: s.hostToken, body: { state: { reps: 2 } } })
    assert.deepEqual((await authorized)[1].state, { reps: 2 })
    assert.equal(share.waiters.size, 0)
    assert.equal((await call('GET', `/v1/share/${s.code}/state`, { token: v.viewerToken }))[0], 401)
  })
}

test('closing a share settles pending poll and removes close listener', async () => {
  const { svc, call } = harness()
  const [, s] = await call('POST', '/v1/share', { body: { runId: 'run-live-1' } })
  const [, v] = await call('POST', `/v1/share/${s.code}/join`, { body: {} })
  const res = new EventEmitter()
  const share = svc._shares.get(s.code)
  const viewer = share.viewers.get(v.viewerId)
  const pending = svc.route('GET', `/v1/share/${s.code}/state`, { headers: { authorization: `Bearer ${v.viewerToken}` } },
    res, async () => null, new URLSearchParams('after=0'))
  await call('DELETE', `/v1/share/${s.code}`, { token: s.hostToken })
  assert.equal((await pending)[0], 410)
  assert.equal(res.listenerCount('close'), 0)
  assert.equal(viewer.waiters.size, 0)
  assert.equal(share.waiters.size, 0)
})
