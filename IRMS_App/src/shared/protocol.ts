// shared/protocol.ts
// --- BLE 通訊協定常數 ---
// 此檔為「前端 BluetoothService」與「ESP32 韌體 (IRMS_Sensor.ino)」之間的協定契約。
// 任何變更都必須同步修改兩端,否則會造成裝置無法解析。

/** ESP32 BLE 廣播名稱(前端以 includes 比對自動配對) */
export const DEVICE_NAME_PREFIX = 'IRMS'

/** GATT Service UUID */
export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'

/** 角度推播特徵值 (ESP32 → App,Notify,10Hz) */
export const CHAR_ANGLE_TX = 'beb5483e-36e1-4688-b7f5-ea07361b26a8'

/** 參數/指令接收特徵值 (App → ESP32,Write) */
export const CHAR_PROFILE_RX = 'beb5483f-36e1-4688-b7f5-ea07361b26a8'

/**
 * App → ESP32 的控制指令字串。
 * 韌體於 Profile RX 的 onWrite 解碼 `CMD:` 前綴指令。
 */
export const BleCommand = {
  /** 點亮目標達標回饋 LED (GPIO 25) */
  LED_ON: 'CMD:LED_ON',
  /** 熄滅目標達標回饋 LED */
  LED_OFF: 'CMD:LED_OFF',
  /** 達標:蜂鳴器雙短響 (GPIO 26) */
  GOAL: 'CMD:GOAL',
  /** 超限安全警報:蜂鳴器持續長鳴 */
  ALARM_ON: 'CMD:ALARM_ON',
  /** 解除超限安全警報 */
  ALARM_OFF: 'CMD:ALARM_OFF'
} as const

export type BleCommand = (typeof BleCommand)[keyof typeof BleCommand]

/**
 * 組出校準同步指令:`CMD:SYNC,大腿offset,小腿offset`
 * @deprecated 現行韌體 (IRMS_Sensor.ino) 的 onWrite 未實作 SYNC 解析;
 * v2 校準已完全在 App 端套用 (applyCalibration),UI 不再呼叫此函式。
 */
export function buildSyncCommand(thighOffset: number, shinOffset: number): string {
  return `CMD:SYNC,${thighOffset.toFixed(1)},${shinOffset.toFixed(1)}`
}

/**
 * 組出參數設定檔寫入字串:`目標角度,容錯範圍,維持時間ms`
 * @deprecated 現行韌體無 Task_Logic/NVS,不解析 Profile(舊版 IRMS_Sensor_Full.bak 才支援);
 * v2 的達標判定完全在 App 端 (TriggerEngine),UI 不再呼叫此函式。
 */
export function buildProfilePayload(targetAngle: number, tolerance: number, holdTimeMs: number): string {
  return `${targetAngle.toFixed(1)},${tolerance.toFixed(1)},${Math.round(holdTimeMs)}`
}

/** 硬體錯誤代碼前綴(I2C 斷線等) */
export const ERROR_PREFIX = 'ERR:'

/**
 * 解析後的即時角度資料。
 * corrected* 為套用校準(反相/偏移)後的值;raw* 為韌體原始值(供校準 UI 使用)。
 */
export interface LiveAngles {
  /** 膝關節夾角(大腿與小腿矢狀面夾角絕對值) */
  knee: number
  /** 大腿矢狀面角度 (Pitch) */
  thigh: number
  /** 小腿矢狀面角度 (Pitch) */
  shin: number
  /** 膝關節冠狀面內外翻角度(帶符號 shinRoll − thighRoll:正 = 外翻 valgus、負 = 內翻 varus) */
  kneeRoll: number
  /** 大腿冠狀面角度 (Roll) */
  thighRoll: number
  /** 小腿冠狀面角度 (Roll) */
  shinRoll: number
  /** 原始大腿 Pitch(未校準) */
  rawThigh: number
  /** 原始小腿 Pitch(未校準) */
  rawShin: number
  /** 原始大腿 Roll(未校準) */
  rawThighRoll: number
  /** 原始小腿 Roll(未校準) */
  rawShinRoll: number
}

/** BLE 封包解析結果:成功 / 硬體錯誤 / 格式錯誤 */
export type ParsedPacket =
  | { kind: 'angles'; raw: RawAngles }
  | { kind: 'error'; code: string }
  | { kind: 'malformed'; value: string }

/** 韌體原始角度(套用校準前) */
export interface RawAngles {
  thigh: number
  shin: number
  thighRoll: number
  shinRoll: number
}

/**
 * 解析 ESP32 角度推播封包。
 * 正常格式:`T:12.5,S:-45.2,K:57.7`(可含 TR/SR/KR 冠狀面欄位)
 * 錯誤格式:`ERR:1`
 * 純數字(舊韌體相容):僅膝夾角
 */
export function parseAnglePacket(value: string): ParsedPacket {
  const trimmed = value.trim()

  if (trimmed.startsWith(ERROR_PREFIX)) {
    return { kind: 'error', code: trimmed }
  }

  let thigh = 0
  let shin = 0
  let thighRoll = 0
  let shinRoll = 0

  const parts = trimmed.split(',')
  if (parts.length >= 3) {
    for (const p of parts) {
      // 注意:先比對較長的前綴 (TR/SR/KR),避免 'T:' 誤吃 'TR:'
      if (p.startsWith('TR:')) thighRoll = parseFloat(p.slice(3))
      else if (p.startsWith('SR:')) shinRoll = parseFloat(p.slice(3))
      else if (p.startsWith('KR:')) {
        /* KR 為衍生值,前端會自行由 Roll 差值計算,此處忽略 */
      } else if (p.startsWith('T:')) thigh = parseFloat(p.slice(2))
      else if (p.startsWith('S:')) shin = parseFloat(p.slice(2))
      else if (p.startsWith('K:')) {
        /* K 為衍生夾角,前端由 thigh/shin 計算,此處忽略 */
      }
    }
  } else {
    // 舊韌體相容:整個字串視為膝夾角(以小腿欄位承載,大腿為 0)
    shin = parseFloat(trimmed)
  }

  if ([thigh, shin, thighRoll, shinRoll].some((n) => Number.isNaN(n))) {
    return { kind: 'malformed', value: trimmed }
  }

  return { kind: 'angles', raw: { thigh, shin, thighRoll, shinRoll } }
}
