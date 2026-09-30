// Live share — lets other clients follow one telemetry-uploading device in real time.
//
// Model (2026-09-27, requested for demonstrations):
// - Only a device whose telemetry run is live (ingested within RUN_LIVE_MS) may create a share,
//   and the share closes when that run stops ingesting. Nothing else can be shared.
// - The host gets a short share code plus a secret host token. Anyone holding the code may join
//   as a viewer and receives a viewer token. Viewers are read-only by default; the host grants
//   or revokes "may change settings" per viewer, or removes a viewer.
// - A viewer allowed to edit posts commands; the server only queues them. The host app pulls the
//   queue with its next state push and decides whether to apply each one (it re-validates and
//   refuses while a session is running), so the device owner stays authoritative.
// - Everything is in memory. Shares are live-only by design: nothing here is written to the
//   telemetry database, and a restart simply ends all shares.

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

// Crockford-style alphabet without I, L, O, U: codes are read aloud and typed by hand.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 8
export const RUN_LIVE_MS = 60_000
export const HOST_IDLE_MS = 30_000
export const VIEWER_IDLE_MS = 60_000
export const MAX_WAIT_MS = 20_000
export const MAX_VIEWERS = 20
export const MAX_COMMANDS = 20
export const MAX_STATE_BYTES = 16 * 1024
const MAX_SHARES = 500

function newCode() {
  const bytes = randomBytes(CODE_LENGTH)
  let code = ''
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return code
}

/** Accepts "abcd-1234", "ABCD1234" etc.; returns the canonical code or null. */
export function normalizeCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '')
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null
}

const newToken = () => randomBytes(24).toString('base64url')

function sameToken(given, expected) {
  const a = Buffer.from(given ?? '')
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function bearer(req) {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

const cleanName = (v) =>
  typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) : ''

/**
 * @param {{ isRunLive(runId: string): boolean, now?: () => number }} deps
 */
export function createShareService({ isRunLive, now = Date.now }) {
  /** @type {Map<string, any>} code → share */
  const shares = new Map()

  function viewerList(share) {
    return [...share.viewers.values()].map((v) => ({
      id: v.id,
      name: v.name,
      canEdit: v.canEdit,
      joinedAt: new Date(v.joinedAt).toISOString(),
      lastSeen: new Date(v.lastSeen).toISOString()
    }))
  }

  function close(share, reason) {
    share.closed = reason
    shares.delete(share.code)
    for (const wake of share.waiters) wake()
    share.waiters.clear()
  }

  /** Drops idle viewers, and closes shares whose host or telemetry run went quiet. */
  function sweep() {
    const t = now()
    for (const share of shares.values()) {
      if (t - share.hostSeen > HOST_IDLE_MS) close(share, 'host idle')
      else if (!isRunLive(share.runId)) close(share, 'telemetry stopped')
      else for (const [id, v] of share.viewers) if (t - v.lastSeen > VIEWER_IDLE_MS) share.viewers.delete(id)
    }
  }

  function create(body) {
    const runId = body?.runId
    if (typeof runId !== 'string' || !isRunLive(runId)) {
      return [409, { error: 'telemetry run is not live; enable live telemetry upload first' }]
    }
    // One share per run: creating again replaces the previous code.
    for (const s of shares.values()) if (s.runId === runId) close(s, 'replaced')
    if (shares.size >= MAX_SHARES) return [503, { error: 'too many active shares' }]
    let code
    do code = newCode()
    while (shares.has(code))
    const t = now()
    const share = {
      code,
      runId,
      hostToken: newToken(),
      createdAt: t,
      hostSeen: t,
      version: 0,
      state: null,
      stateAt: null,
      viewers: new Map(),
      commands: [],
      waiters: new Set(),
      closed: null
    }
    shares.set(code, share)
    return [200, { code, hostToken: share.hostToken }]
  }

  function pushState(share, body) {
    if (!isRunLive(share.runId)) {
      close(share, 'telemetry stopped')
      return [409, { error: 'telemetry run is no longer live; share closed' }]
    }
    const state = body?.state
    if (state === undefined || JSON.stringify(state).length > MAX_STATE_BYTES) {
      return [400, { error: `expected { state } under ${MAX_STATE_BYTES} bytes` }]
    }
    share.hostSeen = now()
    share.state = state
    share.stateAt = share.hostSeen
    share.version += 1
    for (const wake of share.waiters) wake()
    share.waiters.clear()
    const commands = share.commands
    share.commands = []
    return [200, { version: share.version, viewers: viewerList(share), commands }]
  }

  function join(share, body) {
    if (share.viewers.size >= MAX_VIEWERS) return [403, { error: 'viewer limit reached' }]
    const t = now()
    const viewer = {
      id: randomUUID(),
      token: newToken(),
      name: cleanName(body?.name) || 'Viewer',
      canEdit: false,
      joinedAt: t,
      lastSeen: t
    }
    share.viewers.set(viewer.id, viewer)
    return [200, { viewerId: viewer.id, viewerToken: viewer.token, canEdit: false }]
  }

  function viewerView(share, viewer) {
    return {
      version: share.version,
      state: share.state,
      updatedAt: share.stateAt == null ? null : new Date(share.stateAt).toISOString(),
      canEdit: viewer.canEdit
    }
  }

  /** Long poll: answers at once if the state moved past `after`, otherwise waits for a push. */
  function readState(share, viewer, after, res) {
    viewer.lastSeen = now()
    if (!(share.version > after)) {
      return new Promise((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          clearTimeout(timer)
          share.waiters.delete(finish)
          viewer.lastSeen = now()
          resolve(share.closed ? [410, { error: 'share ended', reason: share.closed }] : [200, viewerView(share, viewer)])
        }
        const timer = setTimeout(finish, MAX_WAIT_MS)
        share.waiters.add(finish)
        res.on('close', finish)
      })
    }
    return [200, viewerView(share, viewer)]
  }

  function setViewer(share, viewerId, body) {
    const viewer = share.viewers.get(viewerId)
    if (!viewer) return [404, { error: 'no such viewer' }]
    if (typeof body?.canEdit !== 'boolean') return [400, { error: 'expected { canEdit: boolean }' }]
    viewer.canEdit = body.canEdit
    return [200, { viewers: viewerList(share) }]
  }

  function queueCommand(share, viewer, body) {
    if (!viewer.canEdit) return [403, { error: 'the host has not allowed this viewer to change settings' }]
    const type = body?.type
    const params = body?.params
    if (type !== 'setParams' || typeof params !== 'object' || params == null) {
      return [400, { error: 'expected { type: "setParams", params }' }]
    }
    const clean = {}
    for (const key of ['targetAngle', 'tolerance', 'holdTimeMs']) {
      if (params[key] === undefined) continue
      if (typeof params[key] !== 'number' || !Number.isFinite(params[key])) {
        return [400, { error: `${key} must be a finite number` }]
      }
      clean[key] = params[key]
    }
    if (Object.keys(clean).length === 0) return [400, { error: 'no parameters given' }]
    if (share.commands.length >= MAX_COMMANDS) return [429, { error: 'command queue full' }]
    const command = { id: randomUUID(), type, params: clean, viewerId: viewer.id, viewerName: viewer.name, at: new Date(now()).toISOString() }
    share.commands.push(command)
    viewer.lastSeen = now()
    return [202, { queued: true, id: command.id }]
  }

  /**
   * Routes /v1/share/*. Returns null for paths it does not own.
   * @returns {Promise<[number, object] | null>}
   */
  async function route(method, p, req, res, readJson, params) {
    if (!p.startsWith('/v1/share')) return null
    sweep()
    if (p === '/v1/share' && method === 'POST') return create(await readJson())

    const m = p.match(/^\/v1\/share\/([^/]+)(\/[a-z]+)?(?:\/([^/]+))?$/)
    if (!m) return [404, { error: 'not found' }]
    const code = normalizeCode(decodeURIComponent(m[1]))
    const share = code && shares.get(code)
    if (!share) return [404, { error: 'no such share code (it may have ended)' }]
    const sub = m[2] ?? ''
    const token = bearer(req)
    const isHost = sameToken(token, share.hostToken)
    const viewer = [...share.viewers.values()].find((v) => sameToken(token, v.token))

    if (sub === '' && method === 'GET') {
      // Public probe: lets a client check a code before joining. No live data.
      return [200, { code: share.code, viewers: share.viewers.size, live: share.state != null }]
    }
    if (sub === '' && method === 'DELETE') {
      if (!isHost) return [401, { error: 'host token required' }]
      close(share, 'ended by host')
      return [200, { ended: true }]
    }
    if (sub === '/join' && method === 'POST') return join(share, await readJson())
    if (sub === '/state' && method === 'POST') {
      if (!isHost) return [401, { error: 'host token required' }]
      return pushState(share, await readJson())
    }
    if (sub === '/state' && method === 'GET') {
      if (!viewer) return [401, { error: 'viewer token required' }]
      return readState(share, viewer, Number(params.get('after') ?? -1), res)
    }
    if (sub === '/viewers' && m[3]) {
      if (!isHost) return [401, { error: 'host token required' }]
      if (method === 'POST') return setViewer(share, m[3], await readJson())
      if (method === 'DELETE') {
        return share.viewers.delete(m[3]) ? [200, { viewers: viewerList(share) }] : [404, { error: 'no such viewer' }]
      }
    }
    if (sub === '/commands' && method === 'POST') {
      if (!viewer) return [401, { error: 'viewer token required' }]
      return queueCommand(share, viewer, await readJson())
    }
    if (sub === '/leave' && method === 'POST') {
      if (!viewer) return [401, { error: 'viewer token required' }]
      share.viewers.delete(viewer.id)
      return [200, { left: true }]
    }
    return [404, { error: 'not found' }]
  }

  return { route, sweep, _shares: shares }
}
