// main/db.ts
// --- 資料持久層 (better-sqlite3,同步 API) ---
// 取代舊版的 sqlite3(非同步、原生模組版本可疑)。
// 資料庫檔存於 Electron userData 目錄,不再置於專案原始碼樹中。

import Database from 'better-sqlite3'
import { join } from 'path'
import type {
  CustomAction,
  CustomActionInput,
  Session,
  SessionStartInput,
  SensorReading,
  StoredReading
} from '@shared/types'
import { DEFAULT_ACTIONS } from '@shared/defaults'
import { applyMigrations, finalizeOrphanedSessions } from './migrations'

let db: Database.Database

/** 於 app ready 後呼叫,在 userData 目錄建立/開啟資料庫並初始化結構 */
export function initDatabase(userDataDir: string): void {
  const dbPath = join(userDataDir, 'irms.sqlite')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // schema 演進走 user_version migration(見 migrations.ts / ROADMAP D4)
  applyMigrations(db, (m) => console.log(m))

  // 上次執行若是被關窗/強殺中斷,會留下 endTime=NULL 的孤兒 session。
  // 啟動時不可能有進行中的 session,一律收尾並標記 abandoned。
  finalizeOrphanedSessions(db, (m) => console.log(m))

  // 首次啟動且無任何動作時,自動載入預設範本
  const count = db.prepare('SELECT COUNT(*) AS n FROM custom_actions').get() as { n: number }
  if (count.n === 0) {
    insertDefaultActions()
  }
}

/** 於 app 結束前呼叫:關閉連線並 checkpoint WAL,避免 -wal 檔無限增長 */
export function closeDatabase(): void {
  if (db && db.open) db.close()
}

function insertDefaultActions(): void {
  const insert = db.prepare(
    `INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
     VALUES (@name, @description, @protocol, @targetAngle, @tolerance, @holdTimeMs, @triggerType)`
  )
  const tx = db.transaction((actions: CustomActionInput[]) => {
    for (const a of actions) insert.run(a)
  })
  tx(DEFAULT_ACTIONS)
}

// ─────────────────────────────────────────────────────────────
// 自訂動作 (custom_actions)
// ─────────────────────────────────────────────────────────────

export const actionsRepo = {
  list(): CustomAction[] {
    return db.prepare('SELECT * FROM custom_actions ORDER BY id ASC').all() as CustomAction[]
  },

  create(input: CustomActionInput): CustomAction {
    const info = db
      .prepare(
        `INSERT INTO custom_actions (name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
         VALUES (@name, @description, @protocol, @targetAngle, @tolerance, @holdTimeMs, @triggerType)`
      )
      .run(input)
    return db
      .prepare('SELECT * FROM custom_actions WHERE id = ?')
      .get(info.lastInsertRowid) as CustomAction
  },

  update(id: number, input: CustomActionInput): CustomAction {
    db.prepare(
      `UPDATE custom_actions
       SET name=@name, description=@description, protocol=@protocol,
           targetAngle=@targetAngle, tolerance=@tolerance, holdTimeMs=@holdTimeMs, triggerType=@triggerType
       WHERE id=@id`
    ).run({ ...input, id })
    return db.prepare('SELECT * FROM custom_actions WHERE id = ?').get(id) as CustomAction
  },

  delete(id: number): { success: true } {
    db.prepare('DELETE FROM custom_actions WHERE id = ?').run(id)
    return { success: true }
  },

  /** 清空現有動作並重新載入預設範本(避免重複) */
  restoreDefaults(): CustomAction[] {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM custom_actions').run()
      insertDefaultActions()
    })
    tx()
    return this.list()
  }
}

// ─────────────────────────────────────────────────────────────
// 復健歷程 (sessions)
// ─────────────────────────────────────────────────────────────

export const sessionsRepo = {
  start(input: SessionStartInput): { sessionId: number } {
    const info = db
      .prepare(
        `INSERT INTO sessions (targetAngle, tolerance, holdTimeMs, actionId, actionName, protocol)
         VALUES (@targetAngle, @tolerance, @holdTimeMs, @actionId, @actionName, @protocol)`
      )
      .run(input)
    return { sessionId: Number(info.lastInsertRowid) }
  },

  /**
   * 逐次更新 reps(每完成一下呼叫一次)。
   * 過去 repsCompleted 只在 end() 寫入,所以關窗/強殺會讓一場真實的 12 下
   * Session 永遠顯示 0 reps,而且無法從 sensor_data 回推。
   * reps 之間至少隔一個 holdTime(≥500ms),寫入頻率遠低於感測資料批次。
   */
  updateReps(sessionId: number, repsCompleted: number): { success: true } {
    db.prepare('UPDATE sessions SET repsCompleted = ? WHERE id = ?').run(repsCompleted, sessionId)
    return { success: true }
  },

  end(sessionId: number, repsCompleted: number): { success: true } {
    db.prepare(
      `UPDATE sessions
       SET endTime = strftime('%Y-%m-%dT%H:%M:%fZ','now'), repsCompleted = ?
       WHERE id = ?`
    ).run(repsCompleted, sessionId)
    return { success: true }
  },

  list(): Session[] {
    return db.prepare('SELECT * FROM sessions ORDER BY startTime DESC').all() as Session[]
  },

  getData(sessionId: number): StoredReading[] {
    return db
      .prepare('SELECT * FROM sensor_data WHERE sessionId = ? ORDER BY timestamp ASC, id ASC')
      .all(sessionId) as StoredReading[]
  },

  delete(sessionId: number): { success: true } {
    // sensor_data 透過 FK ON DELETE CASCADE 一併刪除
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    return { success: true }
  }
}

// ─────────────────────────────────────────────────────────────
// 高頻感測資料 (sensor_data)
// ─────────────────────────────────────────────────────────────

export const dataRepo = {
  /** 以單一交易批次寫入(取代舊版的逐筆 HTTP POST) */
  appendBatch(sessionId: number, readings: SensorReading[]): { count: number } {
    const insert = db.prepare(
      `INSERT INTO sensor_data (sessionId, timestamp, kneeAngle, thighAngle, shinAngle, kneeRoll, thighRoll, shinRoll)
       VALUES (@sessionId, @timestamp, @kneeAngle, @thighAngle, @shinAngle, @kneeRoll, @thighRoll, @shinRoll)`
    )
    const tx = db.transaction((rows: SensorReading[]) => {
      for (const r of rows) insert.run({ sessionId, ...r })
    })
    tx(readings)
    return { count: readings.length }
  }
}
