// 每次啟動的持有證明只在 HTTP header 傳入；資料庫只保存其雜湊，不與 reader 查詢連接。
import { createHash, timingSafeEqual } from 'node:crypto'

export const OWNER_HEADER = 'x-irms-run-owner'
const validProof = proof => typeof proof === 'string' && /^[a-f0-9]{64}$/.test(proof)
const digest = proof => createHash('sha256').update(proof, 'ascii').digest()

export function createRunOwnership(db) {
  db.exec('CREATE TABLE IF NOT EXISTS run_owners (run_id TEXT PRIMARY KEY, proof_hash BLOB NOT NULL)')
  const find = db.prepare('SELECT proof_hash FROM run_owners WHERE run_id = ?')
  const exists = db.prepare('SELECT 1 FROM runs WHERE id = ?')
  const insert = db.prepare('INSERT INTO run_owners (run_id, proof_hash) VALUES (?, ?)')
  const remove = db.prepare('DELETE FROM run_owners WHERE run_id = ?')

  // 格式檢查後才做固定長度 digest 比對；不傳回儲存的 digest 或原始證明。
  function isOwner(runId, proof) {
    if (!validProof(proof)) return false
    const stored = find.get(runId)?.proof_hash
    const supplied = digest(proof)
    return stored != null && stored.length === supplied.length && timingSafeEqual(stored, supplied)
  }

  // 必須在 ingest 的同一交易內呼叫，再與 run/events 一起提交或回滾。
  function authorizeIngest(runId, proof) {
    if (proof !== undefined && !validProof(proof)) return { status: 400, body: { error: 'invalid run ownership header' } }
    if (find.get(runId)) {
      return isOwner(runId, proof) ? null : { status: 403, body: { error: 'run ownership proof required' } }
    }
    if (exists.get(runId)) {
      return proof === undefined ? null : { status: 409, body: { error: 'legacy run cannot acquire ownership; restart the upgraded app' } }
    }
    if (proof !== undefined) insert.run(runId, digest(proof))
    return null
  }

  return { isOwner, authorizeIngest, remove: runId => remove.run(runId) }
}
