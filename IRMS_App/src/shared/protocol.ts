// shared/protocol.ts
// --- BLE 通訊協定常數 ---
// 此檔為「前端 BluetoothService」與「ESP32 韌體 (IRMS_Sensor.ino)」之間的協定契約。
// 任何變更都必須同步修改兩端,否則會造成裝置無法解析。

/** ESP32 BLE 廣播名稱(前端以 includes 比對自動配對) */
export const DEVICE_NAME_PREFIX = 'IRMS'

/** GATT Service UUID */
export const SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b'

/** 角度推播特徵值 (ESP32 → App,Notify,25Hz — 韌體 config.h `COMM_PERIOD_MS = 40`) */
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
 * OTA(2026-09-04,Phase B/C):獨立於上面感測器 service 之外的另一個 GATT service,
 * 刻意不與 `SERVICE_UUID` 共用——韌體端理由同上,新增 OTA 不動到既有感測器契約一個位元。
 * 對應韌體端定義見 `IRMS_Sensor/config.h` 的「OTA」區塊,UUID 必須逐字相同。
 */
export const OTA_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c3319150'

/** App → ESP32,Write:OTA 控制指令(`OTA:START:<bytes>:<md5hex32>` / `OTA:END` / `OTA:ABORT`) */
export const CHAR_OTA_CONTROL = 'beb5483e-36e1-4688-b7f5-ea07361b28a8'

/** App → ESP32,Write No Response:韌體二進位分塊,每塊大小受目前協商到的 BLE MTU 限制 */
export const CHAR_OTA_DATA = 'beb5483f-36e1-4688-b7f5-ea07361b28a8'

/** ESP32 → App,Notify:OTA 進度/結果(`OTA:READY` / `OTA:PROGRESS:<n>` / `OTA:DONE` / `OTA:ERROR:<code>` / `OTA:ABORTED`) */
export const CHAR_OTA_STATUS = 'beb54840-36e1-4688-b7f5-ea07361b28a8'

/** ESP32 → App,Read:裝置目前已燒錄的韌體版本字串(韌體端 `config.h` 的 `IRMS_FW_VERSION`) */
export const CHAR_FW_VERSION = 'beb54841-36e1-4688-b7f5-ea07361b28a8'

/**
 * 韌體端 `Update.end()` 回傳 false 時,`Update.errorString()` 常見值的中文對照——
 * 給 UI 顯示用,不是拿來做程式判斷的 enum(韌體端本來就是自由文字,不是固定代碼表)。
 * 沒對到表的一律照原字串顯示,而不是吞掉或顯示「未知錯誤」。
 */
export const OTA_ERROR_HINTS: Readonly<Record<string, string>> = {
  NO_SPACE: '裝置回報空間不足,無法開始寫入新韌體',
  BAD_START: '啟動參數格式錯誤(App 端 bug,不應該發生)',
  ALREADY_RUNNING: '裝置已有進行中的更新,請先等待或中止',
  NOT_STARTED: '尚未送出 OTA:START 就收到 END',
  SIZE_MISMATCH: '實際收到的位元組數與宣告的大小不符,更新已中止',
  WRITE_FAIL: '寫入 flash 失敗,更新已中止(裝置仍執行原本的韌體,不會變磚)'
}

// 已移除:buildSyncCommand / buildProfilePayload。
// 兩者是 @deprecated 死碼,零呼叫端,卻仍在文件化一份韌體並不實作的協定
// (現行韌體無 SYNC 解析、無 Task_Logic/NVS,判定 100% 在 App 端 —— ROADMAP 決策 D1)。
// 讀 protocol.ts 想知道「App 與韌體之間到底講什麼」的人會被它們誤導,故刪除。
// 若日後要做 D1 後果條款裡的 Standalone 離線模式,應依當時的韌體重新設計,
// 而不是復活這兩個函式。

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
  | {
      kind: 'angles'
      raw: RawAngles
      /**
       * 這個封包是否真的帶了 `TR:`/`SR:` 冠狀面欄位。
       *
       * `raw.thighRoll`/`raw.shinRoll` 在缺欄時填 0,而 0 是一個**合法的角度值**——
       * 「感測器擺平」與「這條鏈路沒送 Roll 過來」在數字上完全一樣。Roll 餵的是
       * 外展 / 內外翻判定,把後者當成前者,等於在患者其實沒做到位時判定達標。
       * 呼叫端據此把「缺 Roll」當成可見的異常回報,而不是靜靜地用 0 算下去。
       */
      hasRoll: boolean
      /**
       * 這個封包尾端被切掉了可辨識的殘骸——實務上就是 BLE MTU 沒協商上去。
       *
       * 與 `hasRoll` 分開表示,因為兩者的成因不同:3 欄舊韌體是「本來就沒有 Roll」
       * (`hasRoll` false、`truncated` false),MTU 截斷是「送了但沒收到」
       * (兩者皆 true)。呼叫端要據此提示使用者的是後者。
       *
       * 切點剛好落在數值邊界時(`T:12.5,S:-45.2,K:57.`)兩者仍無法區分,此時
       * 回報 false——寧可漏報也不誤報,不在解析層猜。
       */
      truncated: boolean
    }
  | { kind: 'error'; code: string }
  | { kind: 'malformed'; value: string }

/** 韌體原始角度(套用校準前) */
export interface RawAngles {
  thigh: number
  shin: number
  thighRoll: number
  shinRoll: number
}

/** 韌體會送出的欄位前綴。順序有意義:較長的 TR/SR/KR 必須先比,否則 'T:' 會誤吃 'TR:'。 */
const FIELD_PREFIXES = ['TR:', 'SR:', 'KR:', 'T:', 'S:', 'K:'] as const

/**
 * 解析 ESP32 角度推播封包。
 * 正常格式:`T:12.5,S:-45.2,K:57.7`(可含 TR/SR/KR 冠狀面欄位)
 * 錯誤格式:`ERR:1`
 * 純數字(舊韌體相容):僅膝夾角
 *
 * **逐軸降級而非整包丟棄(2026-08-22,issue #2)。** 韌體 6 軸封包最長 54 bytes;若 BLE MTU
 * 沒協商到 `config.h` 的 128 而停在預設 23,notify 承載只剩 20 bytes,封包被硬切。
 * 舊解析器對切出來的殘骸照單全收,Roll 靜靜變成 0,使用者看不到任何錯誤。
 *
 * 但整包丟棄是過度反應:`T:` 與 `S:` 最壞情況(`T:-180.0,S:-180.0,`)只佔 18 bytes,
 * **在 20 bytes 的切點下必定完整存活**,而判定只讀 Pitch(`computeMetricSample` 不碰 Roll)。
 * 丟掉整包會把一條臨床上仍然正確的 Pitch 資料流變成什麼都不顯示。
 *
 * 因此:T/S 缺席或不合法 → malformed(判定來源不可信,必須拒絕);尾端切碎的殘骸 →
 * 丟掉該欄並升起 `truncated`;中段就壞掉 → malformed(那不是截斷,是真的亂碼)。
 * 靜默的部分由 `hasRoll` / `truncated` 消除,由呼叫端可見地回報。
 */
export function parseAnglePacket(value: string): ParsedPacket {
  const trimmed = value.trim()

  if (trimmed.startsWith(ERROR_PREFIX)) {
    return { kind: 'error', code: trimmed }
  }

  const malformed = { kind: 'malformed', value: trimmed } as const

  const parts = trimmed.split(',')
  if (parts.length < 3) {
    // 舊韌體相容:整個字串視為膝夾角(以小腿欄位承載,大腿為 0)
    const knee = Number(trimmed)
    if (trimmed === '' || !Number.isFinite(knee)) return malformed
    return {
      kind: 'angles',
      raw: { thigh: 0, shin: knee, thighRoll: 0, shinRoll: 0 },
      hasRoll: false,
      truncated: false
    }
  }

  const field = new Map<string, number>()
  let truncated = false

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const prefix = FIELD_PREFIXES.find((f) => part.startsWith(f))
    // 空字串必須另外擋:`Number('')` 是 0 而不是 NaN,只看 isFinite 會讓 `K:` 過關,
    // 而 `K:` 正是 20 bytes 切點最典型的殘骸。
    const rawValue = prefix === undefined ? '' : part.slice(prefix.length)
    const n = Number(rawValue)
    const bad = prefix === undefined || field.has(prefix) || rawValue.trim() === '' || !Number.isFinite(n)

    if (bad) {
      // 只有「最後一段」壞掉才可能是截斷;中段壞掉代表這根本不是完整的協定封包
      if (i === parts.length - 1) {
        truncated = true
        break
      }
      return malformed
    }
    field.set(prefix, n)
  }

  // T/S 餵判定,缺任何一個都不得放行——這是拒絕與降級的分界
  const thigh = field.get('T:')
  const shin = field.get('S:')
  if (thigh === undefined || shin === undefined) return malformed

  // 只剩一邊的 Roll 必然是尾端被切:韌體要嘛兩個都送,要嘛(舊版)都不送。
  // 單獨一個 TR 沒有意義,丟掉並記為截斷,而不是拿它去算內外翻。
  const thighRoll = field.get('TR:')
  const shinRoll = field.get('SR:')
  const hasRoll = thighRoll !== undefined && shinRoll !== undefined
  if (!hasRoll && (thighRoll !== undefined || shinRoll !== undefined)) truncated = true

  return {
    kind: 'angles',
    raw: { thigh, shin, thighRoll: hasRoll ? thighRoll : 0, shinRoll: hasRoll ? shinRoll : 0 },
    hasRoll,
    truncated
  }
}
