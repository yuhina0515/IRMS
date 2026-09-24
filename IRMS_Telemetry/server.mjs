// IRMS telemetry collector — receives batched telemetry from the Tauri app during real-device
// testing and stores it in SQLite so test runs can be queried afterwards.
// Zero dependencies: node:http + node:sqlite (Node >= 24).
//
// Auth: two separate bearer tokens from the environment. INGEST_TOKEN is typed into the app's
// Settings by testers; READ_TOKEN is only for querying. The repo is public, so neither may ever
// be committed.

import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PORT ?? 8120)
const HOST = process.env.HOST ?? '0.0.0.0'
const DATA_DIR = process.env.DATA_DIR ?? './data'
const INGEST_TOKEN = process.env.INGEST_TOKEN ?? ''
const READ_TOKEN = process.env.READ_TOKEN ?? ''
const MAX_BODY_BYTES = 4 * 1024 * 1024
const MAX_EVENTS_PER_BATCH = 20000
const MAX_QUERY_LIMIT = 50000

if (INGEST_TOKEN.length < 16 || READ_TOKEN.length < 16) {
  console.error('INGEST_TOKEN and READ_TOKEN must both be set (>= 16 chars)')
  process.exit(1)
}

mkdirSync(DATA_DIR, { recursive: true })
const db = new DatabaseSync(path.join(DATA_DIR, 'telemetry.sqlite'))
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    app_version TEXT,
    host TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    dropped INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    t TEXT NOT NULL,
    kind TEXT NOT NULL,
    data TEXT,
    UNIQUE (run_id, seq)
  );
  CREATE INDEX IF NOT EXISTS events_run_kind ON events (run_id, kind, seq);
`)

const upsertRun = db.prepare(`
  INSERT INTO runs (id, first_seen, last_seen, app_version, host, event_count, dropped)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (id) DO UPDATE SET
    last_seen = excluded.last_seen,
    app_version = COALESCE(excluded.app_version, runs.app_version),
    host = COALESCE(excluded.host, runs.host),
    event_count = runs.event_count + excluded.event_count,
    dropped = MAX(runs.dropped, excluded.dropped)
`)
// Retried batches resend the same seq numbers; OR IGNORE makes ingest idempotent.
const insertEvent = db.prepare(
  'INSERT OR IGNORE INTO events (run_id, seq, t, kind, data) VALUES (?, ?, ?, ?, ?)',
)

function tokenMatches(req, expected) {
  const header = req.headers.authorization ?? ''
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '')
  const want = Buffer.from(expected)
  return given.length === want.length && timingSafeEqual(given, want)
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max

function ingest(payload) {
  const { runId, appVersion, host, dropped, events } = payload ?? {}
  if (!isStr(runId, 64) || !Array.isArray(events) || events.length > MAX_EVENTS_PER_BATCH) {
    return { status: 400, body: { error: 'expected { runId, events[] }' } }
  }
  for (const e of events) {
    if (!Number.isInteger(e?.seq) || !isStr(e?.t, 40) || !isStr(e?.kind, 40)) {
      return { status: 400, body: { error: 'each event needs integer seq, t, kind' } }
    }
  }
  const now = new Date().toISOString()
  let inserted = 0
  db.exec('BEGIN')
  try {
    for (const e of events) {
      const data = e.data === undefined ? null : JSON.stringify(e.data)
      inserted += Number(insertEvent.run(runId, e.seq, e.t, e.kind, data).changes)
    }
    upsertRun.run(
      runId,
      now,
      now,
      isStr(appVersion, 40) ? appVersion : null,
      isStr(host, 80) ? host : null,
      inserted,
      Number.isInteger(dropped) ? dropped : 0,
    )
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return { status: 200, body: { accepted: events.length, inserted } }
}

function listRuns(params) {
  const limit = Math.min(Number(params.get('limit')) || 50, 500)
  const rows = db
    .prepare('SELECT * FROM runs ORDER BY last_seen DESC LIMIT ?')
    .all(limit)
  const kinds = db.prepare('SELECT kind, COUNT(*) AS n FROM events WHERE run_id = ? GROUP BY kind')
  return rows.map((r) => ({ ...r, kinds: Object.fromEntries(kinds.all(r.id).map((k) => [k.kind, k.n])) }))
}

function listEvents(runId, params) {
  const where = ['run_id = ?']
  const args = [runId]
  const kind = params.get('kind')
  if (kind) {
    const list = kind.split(',').filter(Boolean)
    where.push(`kind IN (${list.map(() => '?').join(',')})`)
    args.push(...list)
  }
  if (params.has('afterSeq')) {
    where.push('seq > ?')
    args.push(Number(params.get('afterSeq')) || 0)
  }
  const limit = Math.min(Number(params.get('limit')) || 5000, MAX_QUERY_LIMIT)
  args.push(limit)
  const rows = db
    .prepare(`SELECT seq, t, kind, data FROM events WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ?`)
    .all(...args)
  return rows.map((r) => ({ ...r, data: r.data === null ? null : JSON.parse(r.data) }))
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local')
  const p = url.pathname.replace(/\/+$/, '') || '/'
  try {
    if (req.method === 'GET' && p === '/v1/health') {
      return send(res, 200, { ok: true })
    }
    if (req.method === 'POST' && p === '/v1/ingest') {
      if (!tokenMatches(req, INGEST_TOKEN)) return send(res, 401, { error: 'unauthorized' })
      let payload
      try {
        payload = JSON.parse(await readBody(req))
      } catch (err) {
        return send(res, err.status ?? 400, { error: err.status ? err.message : 'invalid JSON' })
      }
      const result = ingest(payload)
      return send(res, result.status, result.body)
    }
    if (req.method === 'GET' && p.startsWith('/v1/runs')) {
      if (!tokenMatches(req, READ_TOKEN)) return send(res, 401, { error: 'unauthorized' })
      if (p === '/v1/runs') return send(res, 200, listRuns(url.searchParams))
      const m = p.match(/^\/v1\/runs\/([^/]+)\/events$/)
      if (m) return send(res, 200, listEvents(decodeURIComponent(m[1]), url.searchParams))
    }
    send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(err)
    send(res, 500, { error: 'internal error' })
  }
})

server.listen(PORT, HOST, () => console.log(`irms-telemetry listening on ${HOST}:${PORT}`))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => (db.close(), process.exit(0))))
}
