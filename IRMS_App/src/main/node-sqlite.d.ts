// 最小的 node:sqlite 型別宣告。
//
// 專案的 @types/node 是 20.x(對齊 Electron 33 的 Node),尚未包含 node:sqlite;
// 但實際執行測試的是本機 Node 24,該模組存在。只有 migrations.test.ts 用到它——
// migrations.ts 本身是 driver-agnostic,正式執行走 better-sqlite3。
//
// 為什麼測試要用 node:sqlite:better-sqlite3 經 electron-rebuild 後是針對
// Electron ABI 編譯的,在 vitest 的純 Node 環境會以 NODE_MODULE_VERSION 不符
// 載入失敗,因此無法用它測 migration。node:sqlite 是同一個 SQLite 引擎,
// 讓 migration 的 DDL / CHECK / 交易行為得到真實驗證而非模擬。
declare module 'node:sqlite' {
  export interface StatementSync {
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    run(...params: unknown[]): unknown
  }
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
