// test/irmsApiStub.ts (Tauri port of IRMS_App's renderer/src/test/irmsStub.ts)
// --- platform/irmsApi 的可記錄測試替身,模組層級版 ---
//
// Electron 版 monkeypatch globalThis.window.irms(一個 contextBridge 注入的全域);
// Tauri 版沒有這個 global——call site 一律
// `import { irms } from '<相對路徑>/platform/irmsApi'`,`irms` 是 import 時就綁定的
// 具名匯出,不是每次都重新查一個全域變數。所以這裡改成
// `vi.mock('@renderer/platform/irmsApi', () => mockIrmsApiModule)` 掉整個模組,
// 把 stub 灌到它匯出的 `irms` 物件的屬性上——呼叫端讀到的仍是同一個 `irms`
// binding,只是它底下各方法的實作被換掉,call site 完全不用知道差異。
//
// mockIrmsApiModule 是整個測試檔案生命週期只建立「一次」的物件(vi.mock 的
// factory 只在該模組第一次被 import 時跑一次):installIrmsStub 之後只重新指派
// 它 sessions/data/actions 底下的各個方法,不重建這三個子物件本身——這是 Phase 2a
// 那次 stale-reference bug(見 doc/coding log/log_20260907_tauri_phase2a_platform_adapter.md）
// 的教訓搬到 module mock 世界的對應防線:若改成每次 installIrmsStub 都回傳一個
// 全新的 `irms` 或全新的 `irms.sessions` 物件,mid-test 的第二次
// installIrmsStub(overrides) 呼叫就會被呼叫端已經持有的舊 binding 悄悄忽略
// ——跟 Electron 版當初踩到的是同一個坑,只是換了個介面形狀。做法反過來:
// 物件參考永遠不變,變的只是參考底下的葉節點方法。
//
// 為什麼是「可呼叫模組」而不是只寫在 setup 檔裡:node project(sessionController /
// demoMode / simulator / reconnect 等測試,見各檔案自己的 vi.mock 呼叫)刻意不掛
// setupFiles,好讓環境與純函式測試逐字相同;dom project 的 test/setup.ts 才會
// 自動呼叫一次 installIrmsStub() 當預設值,元件測試需要特定回傳值時再自行呼叫
// 第二次覆蓋。

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
  /** 保留與 Electron 版相同的呼叫慣例(afterEach 都會呼叫它)。模組 mock 沒有
   *  「移除替身還原全域」這回事——下一次 installIrmsStub()(setup.ts 的自動安裝,
   *  或下一個測試自己呼叫)本來就會整批覆寫掉這裡的方法,所以這裡是 no-op。 */
  uninstall(): void
}

/** 各命名空間的預設實作可被逐一覆寫(例如讓 sessions.list 回傳指定歷史列) */
export interface IrmsStubOverrides {
  sessions?: Partial<IrmsApi['sessions']>
  data?: Partial<IrmsApi['data']>
  actions?: Partial<IrmsApi['actions']>
}

/**
 * `vi.mock('@renderer/platform/irmsApi', () => mockIrmsApiModule)` 的回傳值。
 * 各測試檔案在自己的 vi.mock 呼叫裡直接回傳這個物件的參考(不是重新建構一個),
 * 讓 installIrmsStub 之後對 sessions/data/actions 的原地重新指派對所有 call site
 * 都可見。firmware/windowControls/updates 目前沒有任何已搬遷的測試需要
 * ——Electron 版的 IrmsStub 同樣沒有實作它們(該檔案沒有這三個命名空間),
 * 真的用到時再補,而不是先猜一個形狀。
 */
export const mockIrmsApiModule: { irms: Pick<IrmsApi, 'sessions' | 'data' | 'actions'> } = {
  irms: {
    sessions: {} as IrmsApi['sessions'],
    data: {} as IrmsApi['data'],
    actions: {} as IrmsApi['actions']
  }
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

  const sessionsStub = wrap(defaults.sessions, overrides.sessions)
  const dataStub = wrap(defaults.data, overrides.data)
  const actionsStub = wrap(defaults.actions, overrides.actions)

  // 原地重新指派 mockIrmsApiModule.irms.{sessions,data,actions} 底下的葉節點,
  // 不重建這三個子物件本身——見檔頭關於 stale-reference 的說明。
  Object.assign(mockIrmsApiModule.irms.sessions, sessionsStub)
  Object.assign(mockIrmsApiModule.irms.data, dataStub)
  Object.assign(mockIrmsApiModule.irms.actions, actionsStub)

  return {
    sessions: sessionsStub as IrmsStub['sessions'],
    data: dataStub as IrmsStub['data'],
    actions: actionsStub as IrmsStub['actions'],
    appended,
    uninstall: () => {}
  }
}
