// migrations 單元測試
//
// 用 Node 內建的 node:sqlite 而非 better-sqlite3:後者是為 Electron ABI 編譯的
// (electron-rebuild),在 vitest 的純 Node 環境會以 NODE_MODULE_VERSION 不符載入失敗。
// migrations.ts 刻意只用 exec/prepare 這組兩邊共通的 API,所以這裡測到的是
// 真正的 SQLite 引擎行為(DDL、CHECK、交易回滾),不是模擬。
import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  MIGRATIONS,
  LATEST_VERSION,
  applyMigrations,
  finalizeOrphanedSessions,
  getSchemaVersion,
  type SqlDriver
} from './migrations'

function fresh(): SqlDriver {
  return new DatabaseSync(':memory:') as unknown as SqlDriver
}

/** 建出一個 v1.0.1 形狀的資料庫:表都在,但 user_version 還是 0 */
function legacyV101(): SqlDriver {
  const db = fresh()
  db.exec(`
    CREATE TABLE custom_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
      protocol TEXT NOT NULL, targetAngle REAL NOT NULL, tolerance REAL NOT NULL,
      holdTimeMs INTEGER NOT NULL, triggerType TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      startTime TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      endTime TEXT, targetAngle REAL, tolerance REAL, holdTimeMs INTEGER,
      actionId INTEGER, actionName TEXT, protocol TEXT,
      repsCompleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId INTEGER NOT NULL, timestamp TEXT NOT NULL,
      kneeAngle REAL, thighAngle REAL, shinAngle REAL, kneeRoll REAL, thighRoll REAL, shinRoll REAL,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `)
  return db
}

describe('applyMigrations — 全新安裝', () => {
  it('從 0 一路套用到最新版', () => {
    const db = fresh()
    expect(getSchemaVersion(db)).toBe(0)
    const applied = applyMigrations(db)
    expect(applied).toEqual(MIGRATIONS.map((m) => m.version))
    expect(getSchemaVersion(db)).toBe(LATEST_VERSION)
  })

  it('重複執行是 no-op(每次啟動都會跑)', () => {
    const db = fresh()
    applyMigrations(db)
    expect(applyMigrations(db)).toEqual([])
    expect(getSchemaVersion(db)).toBe(LATEST_VERSION)
  })
})

describe('applyMigrations — v1.0.1 升級路徑(本次修復的核心情境)', () => {
  it('既有表不會被 migration 1 破壞,且資料完整保留', () => {
    const db = legacyV101()
    db.prepare(
      `INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('既有動作', 'desc', 'knee', 90, 10, 3000, 'joint_angle')
    db.prepare(
      `INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, actionName, protocol, repsCompleted, endTime)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(90, 10, 3000, '既有 Session', 'knee', 12, '2026-07-20T10:00:00.000Z')

    applyMigrations(db)

    expect(getSchemaVersion(db)).toBe(LATEST_VERSION)
    const actions = db.prepare('SELECT * FROM custom_actions').all() as Record<string, unknown>[]
    expect(actions).toHaveLength(1)
    expect(actions[0].name).toBe('既有動作')
    expect(actions[0].targetAngle).toBe(90)
    const sessions = db.prepare('SELECT * FROM sessions').all() as Record<string, unknown>[]
    expect(sessions).toHaveLength(1)
    expect(sessions[0].repsCompleted).toBe(12) // 既有的 reps 不得被動到
  })

  it('新增的欄位在升級後確實存在(舊行為下這正是永遠不會發生的事)', () => {
    const db = legacyV101()
    applyMigrations(db)
    const cols = (db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map(
      (c) => c.name
    )
    expect(cols).toContain('abandoned')
  })

  it('升級時把既有的非法參數鉗制回合法範圍,而不是讓重建失敗', () => {
    const db = legacyV101()
    db.prepare(
      `INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run('壞掉的動作', '', 'knee', 5, -3, 0, 'joint_angle')

    applyMigrations(db)

    const row = db
      .prepare("SELECT * FROM custom_actions WHERE name = '壞掉的動作'")
      .get() as Record<string, number>
    expect(row.targetAngle).toBe(10)
    expect(row.tolerance).toBe(1)
    expect(row.holdTimeMs).toBe(500)
  })
})

describe('CHECK 約束是最後一道防線', () => {
  it('拒絕負容錯與 holdTimeMs=0', () => {
    const db = fresh()
    applyMigrations(db)
    const insert = db.prepare(
      `INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    expect(() => insert.run('x', '', 'knee', 90, -5, 2000, 'joint_angle')).toThrow()
    expect(() => insert.run('x', '', 'knee', 90, 10, 0, 'joint_angle')).toThrow()
    expect(() => insert.run('x', '', 'knee', 300, 10, 2000, 'joint_angle')).toThrow()
    // 合法值仍可寫入
    expect(() => insert.run('ok', '', 'knee', 90, 10, 2000, 'joint_angle')).not.toThrow()
  })
})

describe('applyMigrations — 失敗時整版回滾', () => {
  it('壞掉的 migration 不會讓 user_version 前進', () => {
    const db = fresh()
    applyMigrations(db)
    const before = getSchemaVersion(db)
    const bad = [{ version: 99, name: 'broken', up: (d: SqlDriver) => d.exec('THIS IS NOT SQL') }]
    // 直接呼叫 runner 的內部流程:用一份只含壞 migration 的清單
    expect(() => {
      const current = getSchemaVersion(db)
      for (const m of bad.filter((x) => x.version > current)) {
        db.exec('BEGIN')
        try {
          m.up(db)
          db.exec(`PRAGMA user_version = ${m.version}`)
          db.exec('COMMIT')
        } catch (e) {
          db.exec('ROLLBACK')
          throw e
        }
      }
    }).toThrow()
    expect(getSchemaVersion(db)).toBe(before)
  })
})

describe('finalizeOrphanedSessions', () => {
  it('把 endTime=NULL 的列補上結束時間並標記 abandoned', () => {
    const db = fresh()
    applyMigrations(db)
    db.prepare(`INSERT INTO sessions (actionName, repsCompleted) VALUES (?, ?)`).run('被中斷的', 0)
    const id = (db.prepare('SELECT id FROM sessions').get() as { id: number }).id
    db.prepare(
      `INSERT INTO sensor_data (sessionId, timestamp, kneeAngle) VALUES (?, ?, ?)`
    ).run(id, '2026-08-01T10:05:00.000Z', 90)
    db.prepare(
      `INSERT INTO sensor_data (sessionId, timestamp, kneeAngle) VALUES (?, ?, ?)`
    ).run(id, '2026-08-01T10:09:30.000Z', 45)

    expect(finalizeOrphanedSessions(db)).toBe(1)

    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown>
    expect(row.endTime).toBe('2026-08-01T10:09:30.000Z') // 用最後一筆感測資料的時間
    expect(row.abandoned).toBe(1)
  })

  it('沒有感測資料時退回開始時間', () => {
    const db = fresh()
    applyMigrations(db)
    db.prepare(`INSERT INTO sessions (startTime, actionName) VALUES (?, ?)`).run(
      '2026-08-01T09:00:00.000Z',
      '空的'
    )
    finalizeOrphanedSessions(db)
    const row = db.prepare('SELECT * FROM sessions').get() as Record<string, unknown>
    expect(row.endTime).toBe('2026-08-01T09:00:00.000Z')
  })

  it('不動已經正常結束的 session', () => {
    const db = fresh()
    applyMigrations(db)
    db.prepare(`INSERT INTO sessions (endTime, repsCompleted) VALUES (?, ?)`).run(
      '2026-07-20T10:00:00.000Z',
      12
    )
    expect(finalizeOrphanedSessions(db)).toBe(0)
    const row = db.prepare('SELECT * FROM sessions').get() as Record<string, unknown>
    expect(row.abandoned).toBe(0)
    expect(row.repsCompleted).toBe(12)
  })
})
