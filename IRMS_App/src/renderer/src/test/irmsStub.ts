// renderer/test/irmsStub.ts
// --- window.irms 的可記錄測試替身 ---
//
// 為什麼是「可呼叫模組」而不是只寫在 setup 檔裡:真正要測的那批(CMD: 指令稽核)
// 是 service 層的 .test.ts,跑在 node project——那個 project 刻意不掛 setupFiles,
// 好讓既有 173 個純函式測試的環境一個位元都不變。所以安裝動作必須是顯式的。
//
// 顯式安裝本身也是個優點:測試不會因為某個環境自動塞了替身、把你以為會斷言到的
// 呼叫默默吞掉而「通過」。要用就要自己叫。
//
// 在 node 環境下 globalThis.window 不存在,這裡會補一個最小殼,
// 讓 sessionController 的 `window.irms.sessions.progress(...)` 直接可跑。

import { vi, type Mock } from 'vitest'
import type {
  CustomAction,
  IrmsApi,
  SensorReading,
  Session,
  SessionStartInput,
  StoredReading
} from '@shared/types'

/** 每個 API 方法都換成 Mock,供測試直接斷言呼叫參數與次數 */
export interface IrmsStub {
  sessions: { [K in keyof IrmsApi['sessions']]: Mock }
  data: { [K in keyof IrmsApi['data']]: Mock }
  actions: { [K in keyof IrmsApi['actions']]: Mock }
  /**
   * 依呼叫順序攤平的所有 appendBatch 讀數。
   * 省去測試自己去拆 data.appendBatch.mock.calls[i][1] 再 flat——
   * 「這場總共寫進去幾筆、內容是什麼」是緩衝/flush 測試最常問的問題。
   */
  appended: SensorReading[]
  /** 移除替身,還原全域(afterEach 用) */
  uninstall(): void
}

/** 各命名空間的預設實作可被逐一覆寫(例如讓 sessions.list 回傳指定歷史列) */
export interface IrmsStubOverrides {
  sessions?: Partial<IrmsApi['sessions']>
  data?: Partial<IrmsApi['data']>
  actions?: Partial<IrmsApi['actions']>
}

export function installIrmsStub(overrides: IrmsStubOverrides = {}): IrmsStub {
  const appended: SensorReading[] = []
  let nextSessionId = 1

  // 預設實作一律「成功且回傳空集合」:測試只需覆寫它實際關心的那一兩個方法。
  const defaults = {
    sessions: {
      start: async (_input: SessionStartInput) => ({ sessionId: nextSessionId++ }),
      end: async (_sessionId: number, _repsCompleted: number) => ({ success: true as const }),
      progress: async (_sessionId: number, _reps: number) => ({ success: true as const }),
      list: async (): Promise<Session[]> => [],
      getData: async (_sessionId: number, _maxPoints?: number): Promise<StoredReading[]> => [],
      delete: async (_sessionId: number) => ({ success: true as const })
    },
    data: {
      appendBatch: async (_sessionId: number, readings: SensorReading[]) => {
        appended.push(...readings)
        return { count: readings.length }
      }
    },
    actions: {
      list: async (): Promise<CustomAction[]> => [],
      create: async (input: unknown) => ({ id: 1, ...(input as object) }) as CustomAction,
      update: async (id: number, input: unknown) => ({ id, ...(input as object) }) as CustomAction,
      delete: async (_id: number) => ({ success: true as const }),
      restoreDefaults: async (): Promise<CustomAction[]> => []
    }
  }

  const wrap = <T extends Record<string, unknown>>(
    base: T,
    over: Partial<T> | undefined
  ): Record<string, Mock> =>
    Object.fromEntries(
      Object.keys(base).map((k) => [k, vi.fn((over?.[k] ?? base[k]) as (...a: unknown[]) => unknown)])
    )

  const stub = {
    sessions: wrap(defaults.sessions, overrides.sessions),
    data: wrap(defaults.data, overrides.data),
    actions: wrap(defaults.actions, overrides.actions)
  }

  // node project 沒有 window;補一個最小殼,讓 renderer 程式碼的 window.irms.* 直接可跑
  const g = globalThis as { window?: unknown }
  if (typeof g.window === 'undefined') g.window = globalThis
  ;(globalThis as unknown as { window: { irms: unknown } }).window.irms = stub

  return {
    ...stub,
    appended,
    uninstall: () => {
      delete (globalThis as unknown as { window: { irms?: unknown } }).window.irms
    }
  } as IrmsStub
}
