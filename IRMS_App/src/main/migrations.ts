// main/migrations.ts
// --- SQLite schema 版本化(ROADMAP 決策 D4 的實作)---
//
// 2026-08-01 會議 F5:db.ts 原本只有 `CREATE TABLE IF NOT EXISTS`,schema 無法演進。
// 具體後果:v1.0.1 已經在使用者手上,下一次加欄位時,全新安裝會正常建表,
// 但升級的安裝因為表已存在而整段 CREATE 空轉,新欄位不會出現,第一次 INSERT
// 就丟 `no such column`,使用者只能刪掉整個資料庫(連同歷史)才能繼續錄製。
// 開發者永遠看不到這個失效,因為他的 dev DB 想刪就刪。
//
// 設計:
//   - `PRAGMA user_version` 記錄已套用到第幾版,每次啟動補跑缺的版本。
//   - migration 1 就是 v1.0.1 的 schema,且完全冪等,所以既有安裝跑過之後
//     原地升到 version 1,不會動到任何資料。
//   - 每個版本在單一交易內套用,失敗就整個回滾,不會留下半套 schema。
//   - 刻意不依賴 better-sqlite3 的專屬 API(如 .pragma()),只用 exec/prepare,
//     這樣測試可以用 Node 內建的 node:sqlite 跑真正的 SQLite 引擎——
//     better-sqlite3 是為 Electron ABI 編譯的,在 vitest 的純 Node 環境載不進來。

/** 兩種 driver(better-sqlite3 / node:sqlite)共通的最小介面 */
export interface SqlStatement {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): unknown
}
export interface SqlDriver {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
}

export interface Migration {
  version: number
  name: string
  up(db: SqlDriver): void
}

/**
 * 判定參數的 DB 層界限。
 * 與 shared/validation.ts 的數值一致——那裡是輸入端的鉗制,這裡是最後一道防線:
 * 即使有程式路徑繞過 UI(舊資料、未來的匯入功能),也寫不進會讓 zone 退化的值。
 */
const BOUNDS = {
  targetMin: 10,
  targetMax: 170,
  toleranceMin: 1,
  toleranceMax: 30,
  holdMin: 500,
  holdMax: 20_000
}

const CUSTOM_ACTION_CHECKS = `
      CHECK (targetAngle >= ${BOUNDS.targetMin} AND targetAngle <= ${BOUNDS.targetMax}),
      CHECK (tolerance   >= ${BOUNDS.toleranceMin} AND tolerance <= ${BOUNDS.toleranceMax}),
      CHECK (holdTimeMs  >= ${BOUNDS.holdMin} AND holdTimeMs <= ${BOUNDS.holdMax})`

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'base schema (v1.0.1 shape)',
    // 完全冪等:既有 v1.0.1 安裝跑這一版是 no-op,只是把 user_version 標成 1
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS custom_actions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          protocol    TEXT    NOT NULL,
          targetAngle REAL    NOT NULL,
          tolerance   REAL    NOT NULL,
          holdTimeMs  INTEGER NOT NULL,
          triggerType TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          startTime     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          endTime       TEXT,
          targetAngle   REAL,
          tolerance     REAL,
          holdTimeMs    INTEGER,
          actionId      INTEGER,
          actionName    TEXT,
          protocol      TEXT,
          repsCompleted INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sensor_data (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          sessionId  INTEGER NOT NULL,
          timestamp  TEXT    NOT NULL,
          kneeAngle  REAL,
          thighAngle REAL,
          shinAngle  REAL,
          kneeRoll   REAL,
          thighRoll  REAL,
          shinRoll   REAL,
          FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_sensor_data_sessionId ON sensor_data(sessionId);
      `)
  },
  {
    version: 2,
    name: 'custom_actions: clamp existing rows and add CHECK constraints',
    // SQLite 無法對既有表加 CHECK,必須重建。既有列在搬移過程中一併鉗制回合法範圍,
    // 否則重建會因為違反新約束而失敗——而失敗的正是那些已經壞掉的資料。
    up: (db) => {
      db.exec(`
        CREATE TABLE custom_actions_v2 (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          description TEXT,
          protocol    TEXT    NOT NULL,
          targetAngle REAL    NOT NULL,
          tolerance   REAL    NOT NULL,
          holdTimeMs  INTEGER NOT NULL,
          triggerType TEXT    NOT NULL,${CUSTOM_ACTION_CHECKS}
        );

        INSERT INTO custom_actions_v2
          (id, name, description, protocol, targetAngle, tolerance, holdTimeMs, triggerType)
        SELECT
          id, name, description, protocol,
          min(${BOUNDS.targetMax},    max(${BOUNDS.targetMin},    targetAngle)),
          min(${BOUNDS.toleranceMax}, max(${BOUNDS.toleranceMin}, tolerance)),
          CAST(min(${BOUNDS.holdMax}, max(${BOUNDS.holdMin}, holdTimeMs)) AS INTEGER),
          triggerType
        FROM custom_actions;

        DROP TABLE custom_actions;
        ALTER TABLE custom_actions_v2 RENAME TO custom_actions;
      `)
    }
  },
  {
    version: 3,
    name: 'sessions: abandoned flag for sessions never properly ended',
    // 沒有這個旗標,一場被強殺/關窗中斷的 session 會以 repsCompleted=0 呈現,
    // 而那是一個「看起來像事實」的假數字。標記為 abandoned 才是誠實的做法。
    up: (db) =>
      db.exec(`ALTER TABLE sessions ADD COLUMN abandoned INTEGER NOT NULL DEFAULT 0;`)
  },
  {
    version: 4,
    name: 'sessions: triggerType snapshot for history analysis',
    // History 的分析圖原本只畫 knee + 內外翻,但 SLR / 後擺是以 angles.thigh 判定的,
    // 督導看到的是一條貼近 0 的平坦膝線,完全看不出腿有沒有抬起來——App 的臨床輸出
    // 漏掉了它自己實際判定的那個變數。要畫對就必須知道當時的 triggerType,
    // 而動作可能事後被刪改,所以跟 actionName 一樣存成當場快照。
    // 既有列為 NULL,UI 端退回舊行為(畫膝角)。
    up: (db) => db.exec(`ALTER TABLE sessions ADD COLUMN triggerType TEXT;`)
  },
  {
    version: 5,
    name: 'independent safety limit on actions and sessions',
    // 超限警報門檻原本是從 target + tolerance + 10 導出的,於是「為了寬容而放寬容錯」
    // 會連帶把患者的安全上限往外推——那是兩個不該綁在一起的決定:容錯是「算不算達標」,
    // 安全上限是「這個關節不該超過幾度」。後者由解剖決定,與處方的寬鬆程度無關。
    // NULL = 沿用舊的導出值,既有動作與歷史紀錄行為不變。
    up: (db) =>
      db.exec(`
        ALTER TABLE custom_actions ADD COLUMN safetyLimit REAL;
        ALTER TABLE sessions       ADD COLUMN safetyLimit REAL;
      `)
  },
  {
    version: 6,
    name: 'sessions: calibration snapshot in force at session start',
    // sensor_data 只存校準後的數值,而產生那些數值的仿射轉換活在 localStorage,
    // 會被下一次校準就地覆蓋。後果不是資料變髒,是資料變得無法解讀:錄了 20 場,
    // 第 21 場才發現 shinInvert 反了、重跑精靈,前 20 場沒有任何東西說明它們
    // 是由哪一組轉換算出來的,連「往前抬還是往後擺」都無法回推。
    //
    // 單一 JSON 欄位而非逐欄位攤平(2026-08-12 會議裁決):校準欄位本身仍在演進
    // (v1.0.1 的 offset → v4 的 zeroRaw 就是一次),攤平會讓每次改欄位都得再開
    // 一個 migration;這個欄位是「當時是什麼」的存證,不是查詢維度。
    //
    // 同次會議否決了 sensor_data 的四個原始角度欄位:三方各自實跑證明
    // 校準轉換可逆,存原始值等於 +54MB/百場買到零資訊。要回推原始值,
    // 用這個快照反算即可。
    up: (db) => db.exec(`ALTER TABLE sessions ADD COLUMN calibration TEXT;`)
  }
]

/** 目前程式碼期望的 schema 版本 */
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

export function getSchemaVersion(db: SqlDriver): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  return row?.user_version ?? 0
}

/**
 * 補跑所有尚未套用的 migration。
 * 每一版包在自己的交易裡:中途失敗就回滾該版,user_version 停在前一版,
 * 下次啟動會從同一版重試,不會留下半套 schema。
 * @returns 實際套用的版本號清單
 */
export function applyMigrations(db: SqlDriver, log: (m: string) => void = () => {}): number[] {
  const current = getSchemaVersion(db)
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
  const applied: number[] = []

  for (const m of pending) {
    db.exec('BEGIN')
    try {
      m.up(db)
      // PRAGMA user_version 不吃參數綁定,只能字串插入;version 來自本檔常數,非外部輸入
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
      applied.push(m.version)
      log(`[db] migration ${m.version} applied: ${m.name}`)
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${m.version} (${m.name}) failed: ${(err as Error).message}`)
    }
  }
  return applied
}

/**
 * 收尾上次執行留下的孤兒 session。
 *
 * `sessions.end()` 只在使用者按「結束」或斷線收尾時執行,關窗/強殺/當機都不會跑到。
 * 那些列會留下 endTime = NULL、repsCompleted = 0,而 sensor_data 裡卻有整場資料——
 * History 對一場真實的 12 下 session 顯示「0 reps」,且無法回推。
 *
 * App 啟動時不可能有進行中的 session,所以任何 endTime IS NULL 的列都是孤兒:
 * 以該場最後一筆感測資料的時間戳補上結束時間(沒有資料就用開始時間),
 * 並標記 abandoned=1,誠實表示 reps 不可信,而非假裝它就是 0。
 *
 * @returns 被收尾的列數
 */
export function finalizeOrphanedSessions(db: SqlDriver, log: (m: string) => void = () => {}): number {
  const orphans = db
    .prepare('SELECT id FROM sessions WHERE endTime IS NULL')
    .all() as { id: number }[]
  if (orphans.length === 0) return 0

  db.exec(`
    UPDATE sessions
       SET endTime = COALESCE(
             (SELECT max(timestamp) FROM sensor_data WHERE sensor_data.sessionId = sessions.id),
             startTime
           ),
           abandoned = 1
     WHERE endTime IS NULL;
  `)
  log(`[db] finalized ${orphans.length} orphaned session(s) from a previous run`)
  return orphans.length
}
