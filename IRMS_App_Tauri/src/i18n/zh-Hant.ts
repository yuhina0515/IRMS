// i18n/zh-Hant.ts
// --- 繁體中文訊息字典(主檔 master)---
// 這個檔案的「形狀」就是 Messages 型別:其他語系以 `satisfies Messages` 對齊,
// 少一個 key、多一個 key、或函式訊息的參數不符,typecheck 就會失敗。
//
// 慣例:
// - 純字串訊息直接寫字串;需要插值或各語系語序不同的訊息寫成函式,參數一律是
//   **已格式化好的字串**(數字格式化由呼叫端以 i18n/format.ts 依語系處理)。
// - `clinical` 命名空間收納臨床/安全相關用語,任何語系的修改都需要人工審閱。
// - 需要粗體強調的訊息以 **文字** 標記,由 i18n/rich.tsx 的 rich() 轉成 <b>(各語系可依語序放強調)。
// - 語言選單的語言名稱(繁體中文/English)刻意不翻譯,放在 SettingsView 的 LANGUAGE_NAMES。
// - 不在此翻譯:SQLite 中的預設動作名稱(使用者資料)、CSV 標頭/中繼資料 key(機器可讀)。

export const zhHant = {
  /** 臨床與安全用語:修改或新增翻譯前需人工審閱 */
  clinical: {
    /** 膝角超過使用者個人極限範圍時的緊急回落提示 */
    overLimit: (p: { deg: string }) => `⚠ 超出極限範圍 ${p.deg}°,請立即回落`,
    /** segment 類動作的前置條件:膝蓋需近乎打直 */
    straightenKnee: (p: { deg: string }) => `膝蓋再打直 ${p.deg}°`,
    /** 主指標名稱(movementMetric.metricInfo) */
    metric: {
      kneeAngle: '膝關節夾角',
      thighElevation: '大腿仰角',
      thighExtension: '大腿後伸'
    },
    /** 往目標方向移動的動詞,依主指標語意 */
    movementVerb: {
      kneeAngle: '彎曲',
      thighElevation: '抬高',
      thighExtension: '後伸'
    },
    /** 判定型別短名(views/actionLabels.ts TRIGGER_SHORT) */
    triggerShort: {
      joint_angle: '關節角度',
      segment_elevation: '肢段抬高',
      segment_extension: '肢段後伸'
    },
    /** 判定型別長名(動作編輯器的判定規則選單;shared/types TRIGGER_TYPES 的顯示文字) */
    triggerLong: {
      joint_angle: 'Joint Flexion (關節角度達標)',
      segment_elevation: 'Segment Elevation (直膝抬腿)',
      segment_extension: 'Segment Extension (直膝後擺)'
    },
    /** 關節協定(shared/types JOINT_PROTOCOLS 的顯示文字) */
    protocol: {
      knee: 'Knee Flexion (膝彎曲)',
      elbow: 'Elbow Flexion (肘彎曲) — 尚未支援',
      shoulder: 'Shoulder Abduction (肩外展) — 尚未支援'
    },
    /** 跨畫面共用的解剖/處方用語 */
    terms: {
      comfortAngle: '舒適角度',
      limitRange: '極限範圍',
      targetZone: '目標區間',
      thigh: '大腿',
      shin: '小腿',
      leftLeg: '左腿',
      rightLeg: '右腿',
      varusValgus: '內外翻',
      valgus: '外翻',
      varus: '內翻'
    },
    /** 即時監測的安全/教練提示 */
    dashboard: {
      sensorFault: (p: { code: string }) => `感測器異常 · ${p.code}`,
      sensorFaultSub: '已停止回饋輸出,等待感測器復原;可隨時結束療程',
      overLimitTitle: '超出極限範圍,請停止加深',
      overLimitSub: (p: { knee: string; limit: string }) => `膝角 ${p.knee}° · 你的極限範圍 ${p.limit}°`,
      holding: '很好,保持這個位置',
      holdingSub: (p: { sec: string }) => `已進入目標區間,保持滿 ${p.sec} 秒`,
      restPending: '已完成,請回到起始位',
      overComfort: (p: { knee: string; comfort: string }) =>
        `! 已超出舒適角度(膝角 ${p.knee}° > ${p.comfort}°),可能開始疼痛`,
      kneeStraight: (p: { max: string }) => `膝蓋需保持近直(≤ ${p.max}°)`,
      rangeComfort: (p: { deg: string }) => `舒適角度 ${p.deg}°`,
      rangeLimit: (p: { deg: string }) => ` · 極限範圍 ${p.deg}°`,
      rangeNotMeasured: '尚未量測個人角度範圍',
      rulerComfort: (p: { deg: string }) => `${p.deg} 舒適`,
      rulerLimit: (p: { deg: string }) => `${p.deg} 極限`,
      protocolUnsupportedSub: '判定目前只支援膝關節,請到設定切換回膝關節',
      captionAxes: '✓ 零位與屈曲軸已建立',
      captionLateral: ' · 側向角度未驗證',
      caption3d: ' · 姿態為方向示意',
      captionRoll: ' · Roll 僅供安裝排錯'
    },
    /** 診斷數值表:名稱與註記 */
    diagnostics: {
      thigh: '大腿角度',
      shin: '小腿角度',
      knee: '膝關節夾角',
      thighRoll: '大腿感測器 Roll',
      shinRoll: '小腿感測器 Roll',
      rollDiff: '兩感測器 Roll 差',
      relativeToZero: '相對站直零位',
      kneeNote: '大腿與小腿角度差',
      rollNote: '安裝／軸向排錯用',
      rollDiffNote: '未驗證,非內外翻量測'
    },
    /** 動作處方:肢段動作的膝蓋條件 */
    segmentKneeHint: (p: { max: string }) => `肢段動作另需膝蓋保持近直(≤ ${p.max}°)。`,
    /** 療程回顧的臨床摘要 */
    history: {
      overComfort: '超出舒適角度',
      overLimit: '超出極限範圍',
      demoNote: '這是示範模式產生的模擬資料,不是真實量測,不可作為臨床判讀依據。'
    },
    /** 校準精靈的姿勢指示(患者照做的動作描述) */
    calibration: {
      step1Desc:
        '確認兩顆感測器已固定:**大腿感測器**(含 ESP32，0x69)綁於大腿外側、**小腿外接感測器**(0x68)綁於**脛骨前緣(小腿前側的硬骨邊)旁邊**(見下圖,不是側面)。**方向與角度不必在意**——精靈會自動偵測貼歪 90°(軸對調)與方向反相並校正,但過程中感測器不可鬆動移位。',
      step1Side:
        '請選擇這次配戴的**腿側**:「外側」在左右腿是互為鏡像的方向,換邊配戴時內外翻(roll)方向可能相反,精靈需要知道才能在第 5 步提醒你。',
      tibialCrest: '脛骨前緣',
      tibialCrestBeside: '(緊鄰旁邊貼)',
      step2Title: '步驟 2/6 · 站直捕捉零位',
      step2Desc: '請自然站直、雙腿垂直於地面,按下按鈕後保持靜止約 4 秒。',
      step3Title: '步驟 3/6 · 向前抬起大腿',
      step3Desc: '向**前方**抬起大腿(膝蓋可彎),抬到明顯高度(約 45° 以上)後定住,按下按鈕保持姿勢約 4 秒。',
      step4Title: '步驟 4/6 · 站立後勾小腿',
      step4Desc: '大腿保持直立,將**腳跟向後上方勾起**(彎膝),勾到明顯角度(約 45°)後定住,按下按鈕保持姿勢約 4 秒。',
      step5Title: '步驟 5/6 · 腿向外側擺(選配)',
      step5Display:
        '這一步**只影響顯示**:3D 姿態、內外翻數值與圖表的正負方向。**達標判定、次數計算與極限範圍警示都不使用這個資料**,略過不會讓校準不完整。',
      step5How:
        '需要單腳站立,若平衡不便請直接略過。要做的話:全腿伸直,將整條腿向**身體外側**側擺約 20–30° 後定住,按下按鈕保持約 4 秒。大腿與小腿分開判定,某一側幅度不足時該側沿用現有設定,不影響另一側。',
      sideChanged: (p: { now: string; before: string }) =>
        `⚠ 你這次選的是「${p.now}」,上次校準是「${p.before}」。「外側」在左右腿是互為鏡像的方向,**略過這一步會沿用上次那一側判定出的內外翻方向,現在很可能左右相反**(只影響顯示,不影響達標/警報判定)。強烈建議完成這一步。`,
      step6Desc:
        '方向校正已計算完成(尚未套用)。請實際動動看:**站直時數值應接近 0°、前抬大腿時「大腿」變大(正值)、腿向外側擺時內外翻顯示「外翻」**。確認無誤再按套用。',
      coupling: (p: { parts: string }) =>
        `⚠ 偵測到殘留耦合:${p.parts}外展時,除了內外翻之外,前後角度也明顯跟著變化——外展理應是單純的左右動作。這通常代表感測器實際貼裝的位置跟精靈假設的貼法有落差(例如貼在正面而非外側),這次算出的旋轉角可能沒有完全修正貼歪的角度。**不影響本次套用**,但建議之後有機會用真機時,對照貼裝位置重新檢查。`,
      thighDeltaTooSmall: '大腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉',
      shinDeltaTooSmall: '小腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉',
      thighPitch: '大腿 Pitch',
      shinPitch: '小腿 Pitch',
      kneeAngle: '膝夾角',
      wizardHint:
        '感測器不需要貼得很正:精靈會從「抬大腿」與「勾小腿」兩個動作算出各自的屈曲軸。抬大腿至少 20°(建議 40–60°),勾小腿時大腿保持不動。側向方向只影響 3D 與診斷數值,不影響達標與角度範圍判定。'
    },
    /** 個人角度範圍的輸入驗證(services/angleRange.ts) */
    angleRange: {
      comfortOutOfRange: '舒適角度必須在 0–180° 之間',
      limitOutOfRange: '極限範圍必須介於舒適角度與 180° 之間',
      sessionRunning: '療程進行中無法變更角度範圍'
    },
    /** 開始療程前未量測個人角度範圍的提醒 */
    noRangeTitle: '尚未量測個人角度範圍',
    noRangeBody:
      '還沒有量測你的舒適角度與極限範圍,療程中不會有任何角度提示或警示。建議先到「設定 → 模組 → 角度範圍測量」量測。仍要開始療程嗎?',
    /** 療程中禁止 OTA 的安全理由 */
    firmwareSessionLock:
      'Session 進行中無法更新韌體——flash 寫入會讓感測器取樣與回饋短暫卡頓,患者仍佩戴著裝置時不能冒這個險。請先結束 Session。'
  },

  /** 教練提示(services/guidance.ts)中非安全性的引導 */
  guidance: {
    noData: '等待感測資料…',
    raise: (p: { verb: string; deg: string }) => `再${p.verb} ${p.deg}°`,
    lower: (p: { deg: string }) => `回降 ${p.deg}° 進入目標區`,
    hold: (p: { held: string; total: string }) => `保持!${p.held}s / ${p.total}s`,
    returnToRest: (p: { deg: string }) => `完成!回到起始位(再回 ${p.deg}°)`,
    atRest: '完成!已回起始位'
  },

  /** 示範模式情境名稱(services/simulation/scenarios.ts),key = 情境 id */
  scenarios: {
    'rep-cycle': '正常療程 — 連續三下達標',
    'over-limit': '極限範圍 — 彎膝超過個人極限並停留 45 秒(需先量測)',
    'hardware-error': '硬體錯誤 — ERR:1 後復原',
    'truncated-link': 'MTU 過小 — 每個封包被切到 20 bytes',
    garbage: '壞封包 — 每 10 筆混入 1 筆亂碼',
    dropout: '連線中斷 — 封包停止後鏈路失守'
  },

  /** 裝置韌體閒置自動更新(services/firmwareAutoUpdate*.ts) */
  firmware: {
    deferredSession: 'Session 進行中,韌體檢查延後到結束後',
    incompatible: (p: { version: string }) => `韌體 ${p.version} 需要較新的 App,請先更新 App`,
    alreadyFailed: (p: { version: string }) => `自動更新到 ${p.version} 已失敗過一次,請到設定頁手動更新`,
    deferredStateChanged: '狀態改變,韌體更新延後',
    done: (p: { version: string }) => `裝置韌體已更新到 ${p.version},裝置重新啟動中`,
    deviceStateChanged: '裝置狀態改變，更新已延後',
    updatingToast: (p: { version: string }) => `正在自動更新裝置韌體到 ${p.version},請勿關閉 App 或讓裝置斷電`,
    errorToast: (p: { message: string }) => `韌體自動更新:${p.message}`
  },

  /** 連線狀態顯示(對應 store 的 ConnectionStatus;供 UI 改版後的 view 使用) */
  connection: {
    disconnected: '未連線',
    connecting: '連線中…',
    deviceNotFound: '找不到裝置',
    connectionFailed: '連線失敗',
    reconnecting: (p: { attempt: number; max: number }) => `重新連線中 ${p.attempt}/${p.max}`,
    connected: (p: { name: string }) => `已連線 · ${p.name}`
  },

  /** 跨畫面共用的按鈕與短語 */
  common: {
    cancel: '取消',
    confirm: '確認',
    save: '儲存',
    delete: '刪除',
    edit: '編輯',
    retry: '重試',
    start: '開始',
    prevPage: '上一頁',
    nextPage: '下一頁',
    backToList: '← 返回列表',
    goToSettings: '前往設定',
    advanced: '進階',
    checking: '檢查中…',
    selectPlaceholder: '請選擇',
    noOptions: '無可用選項',
    connectDevice: '連線裝置',
    disconnect: '中斷連線',
    demoModeActive: '示範模式中',
    endAndSaveSession: '結束並儲存 Session',
    followSystem: '跟隨系統',
    notMeasured: '未量測',
    notSet: '未設定',
    /** 列舉清單的分隔符 */
    listSeparator: '、',
    seconds: (p: { n: string }) => `${p.n} 秒`,
    reps: (p: { n: number }) => `${p.n} 次`
  },

  /** 主導覽分頁(也作為錯誤邊界的區塊名稱) */
  nav: {
    ariaLabel: '主要功能',
    dashboard: '即時監測',
    actions: '動作處方',
    history: '療程紀錄',
    tools: '工具',
    settings: '設定'
  },

  app: {
    demoBanner: '⚠ 示範模式 — 畫面上的資料由模擬器產生,不是真實量測',
    footerBrand: 'IRMS 智慧復健監測 · BETA',
    footerDemo: '示範資料 · 不是真實量測',
    footerLocal: '本機紀錄 · 遙測預設關閉'
  },

  topNav: {
    connected: '裝置已連線',
    demoTooltip: '示範模式進行中,無法連線真實裝置——請先於設定頁結束示範模式'
  },

  errorOverlay: {
    title: '硬體異常',
    lost: (p: { code: string }) => `感測器 I2C 連線脫落(${p.code}),系統嘗試重新連線中…`,
    frozen: '即時數據已凍結、資料寫入已暫停,以避免記錄無效讀數。',
    hint: '感測器接回後警示會自動消失;若無法恢復,請先結束 Session 以保住已記錄的資料。'
  },

  errorBoundary: {
    title: '⚠ 這個區塊發生錯誤',
    body: (p: { name: string }) => `${p.name} 無法顯示,但 App 的其餘部分仍可使用。`,
    running: ' 目前有 Session 進行中——請先結束並儲存,以免資料變成未完成紀錄。'
  },

  updateBanner: {
    ready: (p: { version: string }) => `新版本 ${p.version} 已下載完成,重新啟動即可套用`,
    sessionNote: '(Session 進行中,建議結束後再重啟)',
    restartBlocked: 'Session 進行中無法重啟——結束後這個按鈕會恢復可用',
    restartNow: '立即重新啟動'
  },

  pose: {
    ariaLabel: '側面姿態示意',
    forward: '前方 →',
    sensorFault: '感測器異常 · 姿態不可用',
    noData: '尚無即時資料'
  },

  tools: {
    title: '工具',
    subtitle: '已安裝模組提供的操作頁面;安裝、啟用與更新請至「設定 → 模組」。',
    empty: '目前沒有提供操作頁面的模組',
    groupAria: '模組',
    panelFailed: (p: { message: string }) => `模組介面載入失敗:${p.message}`
  },

  modules: {
    heading: 'Modules 模組',
    intro:
      '第一方功能模組由 IRMS-Modules 發布,啟動時自動下載並驗證簽章;不需要重裝 App 就能更新。此頁只管理模組:重新啟用立即載入,操作介面在「工具」頁。',
    check: '檢查模組更新',
    upToDate: (p: { time: string }) => `已是最新版本(${p.time})`,
    updatesFound: (p: { count: number; list: string }) =>
      `發現 ${p.count} 個更新,已下載,重新啟動 App 後套用:${p.list}`,
    newInstall: '新安裝 ',
    syncing: '同步模組中…',
    syncFailed: (p: { error: string }) => `模組同步失敗:${p.error}`,
    offline: '目前離線,使用本機已驗證的模組。',
    none: '沒有可用的模組。',
    loadFailed: (p: { error: string }) => ` · 載入失敗:${p.error}`,
    enableAria: (p: { name: string }) => `啟用 ${p.name}`,
    enabled: '啟用',
    disabled: '停用',
    loading: '載入中…',
    openModule: (p: { name: string }) => `開啟 ${p.name}`,
    noActivate: '模組沒有匯出 activate()'
  },

  telemetry: {
    heading: 'Telemetry 即時遙測上傳',
    confirmTitle: '開啟即時遙測上傳?',
    confirmBody:
      '訓練開始時會一併上傳「動作名稱」。如果你曾用病人或個人姓名命名動作,請先到動作頁改名,或不要開啟上傳。其餘上傳內容不含姓名、帳號或電腦名稱,可隨時關閉。',
    enabledToast: '已開啟即時遙測上傳',
    intro:
      '開啟後,App 會把即時資料上傳到 IRMS 開發團隊的伺服器,用來分析感測器與連線問題、改善 App。你可以隨時關閉,關閉時尚未送出的資料會直接捨棄。',
    sent: '會上傳:感測器原始角度封包、連線/斷線狀態、韌體更新狀態、訓練開始與結束(含動作名稱、目標參數、校準參數)、App 日誌。動作名稱是你自己取的,請勿使用病人或個人姓名。',
    notSent: '不會上傳:姓名、帳號、電腦名稱或其他可直接識別你的資料。每次啟動 App 使用一組新的隨機 ID。',
    retention: '伺服器保留 90 天後自動刪除。本機紀錄照常保存,上傳失敗不影響量測。',
    toggle: '上傳即時遙測資料',
    status: (p: { sent: number; pending: number }) => `已上傳 ${p.sent} 筆 · 待傳 ${p.pending} 筆`,
    dropped: (p: { n: number }) => ` · 已捨棄 ${p.n} 筆`,
    lastError: (p: { error: string }) => ` · 上次失敗:${p.error}`,
    runId: (p: { id: string }) => `本次執行 ID:${p.id}(回報問題時可提供給開發者)`,
    endpoint: '伺服器網址',
    endpointHint: '一般不需要修改。開啟上傳時無法變更,請先關閉。'
  },

  sessionDock: {
    blocker: {
      running: '療程進行中',
      protocolUnsupported: '此協定尚未支援',
      firmwareUpdating: '韌體更新中',
      notConnected: '請先連線裝置',
      noAction: '請先選擇動作',
      notCalibrated: '請先完成校準'
    },
    firmwareUpdatingPct: (p: { pct: number }) => `韌體更新中 ${p.pct}%`,
    started: '療程已開始',
    startFailed: '無法開始療程',
    ended: '療程已結束並儲存',
    completed: '已完成',
    repsUnit: ' 次',
    currentHold: '本次保持',
    holdOf: (p: { total: string }) => ` / ${p.total} 秒`,
    sessionTime: '療程時間',
    end: '結束療程',
    action: '動作',
    noActions: '本協定尚無動作',
    selectAction: '請選擇動作',
    target: '目標 (°)',
    tolerance: '容許 (±°)',
    hold: '保持 (秒)',
    calibrate: '開始校準',
    start: '開始療程'
  },

  dashboard: {
    title: '即時監測',
    subtitle: (p: { metric: string; trigger: string; zone: string; hold: string }) =>
      `${p.metric} · ${p.trigger} · 目標 ${p.zone} · 保持 ${p.hold} 秒`,
    calibratedChip: (p: { time: string }) => `✓ 校準完成 · ${p.time}`,
    recalibrate: '重新校準',
    notCalibratedChip: '! 尚未校準 · 開始校準',
    liveAria: '即時監測',
    protocolUnsupported: '此協定尚未支援',
    notConnected: '裝置未連線',
    notConnectedSub: '請從右上角連線裝置',
    notCalibrated: '請先完成校準',
    notCalibratedSub: '未校準時角度方向與大小都可能不正確,完成校準後才能開始療程',
    selectAction: '請選擇動作',
    selectActionSub: '在下方選擇動作處方',
    ready: '準備開始',
    readySub: '確認動作與參數後按「開始療程」',
    holdRemain: (p: { sec: string }) => `再保持 ${p.sec} 秒`,
    repNumber: (p: { n: number }) => `第 ${p.n} 次`,
    metricLabel: (p: { label: string }) => `主指標 · ${p.label}`,
    zoneSuffix: ' 目標區間 · ',
    sensorValues: '感測器數值',
    poseTitle: '動作姿態',
    poseAria: '姿態顯示',
    view2d: '2D 側面',
    values: '數值',
    loading3d: '載入 3D…',
    notCalibratedCaption: '! 尚未校準'
  },

  actions: {
    title: '動作處方',
    subtitle: '每個動作都寫清楚目標與保持時間;舒適角度與極限範圍屬於個人量測,不隨動作設定。',
    nameRequired: '動作名稱不可為空',
    updated: '動作已更新',
    created: '動作已建立',
    saveFailed: '儲存失敗',
    deleteTitle: '刪除動作',
    deleteBody: (p: { name: string }) => `確定要刪除「${p.name}」嗎?此操作不可撤銷。`,
    deleted: '動作已刪除',
    restoreTitle: '還原預設',
    restoreBody: '這將清除所有自訂動作並重建預設範本,確定嗎?',
    restored: '已還原預設動作範本',
    restore: '還原預設',
    add: '+ 新增動作',
    searchPlaceholder: '搜尋名稱或說明…',
    searchAria: '搜尋動作',
    sortName: '依名稱',
    sortTarget: '依目標角度',
    sortCreated: '依建立順序',
    groupNone: '不分組',
    groupTrigger: '依判定型別',
    emptyProtocol: '此協定尚無動作範本',
    loadDefaults: '載入預設範本',
    noMatch: (p: { query: string }) => `找不到符合「${p.query}」的動作`,
    clearSearch: '清除搜尋',
    target: '目標',
    hold: '保持',
    pager: (p: { total: number; page: number; pages: number }) => `共 ${p.total} 個動作 · 第 ${p.page} / ${p.pages} 頁`,
    inspectorAria: '動作內容',
    editTitle: '編輯動作',
    newTitle: '新增動作',
    name: '動作名稱',
    description: '說明',
    triggerRule: '判定規則',
    targetDeg: '目標 (°)',
    tolerance: '容許 (±°)',
    holdSec: '保持 (秒)',
    currentMetric: (p: { label: string }) => `目前 ${p.label}:`,
    capture: '擷取目前角度為目標',
    captureHint: '連線裝置後,可讓患者擺出目標姿勢並一鍵擷取角度,不必憑空輸入',
    noDescription: '沒有說明。',
    useLive: '用於即時監測',
    emptyInspector: '選擇左側的動作查看內容,或新增一個動作。'
  },

  history: {
    title: '療程紀錄',
    subtitle: '每一場療程的處方、次數與來源;點「回顧」查看完整分析。',
    exported: '紀錄已匯出',
    exportFailed: (p: { message: string }) => `匯出失敗:${p.message}`,
    loadFailed: '載入歷史失敗',
    deleteTitle: '刪除紀錄',
    deleteBody: (p: { id: number }) => `確定刪除療程 #${p.id} 的紀錄嗎?`,
    deleted: (p: { id: number }) => `療程 #${p.id} 已刪除`,
    targetMin: '目標下限',
    targetMax: '目標上限',
    chartAria: (p: { label: string }) => `${p.label}隨時間變化圖`,
    reps: '完成次數',
    peak: (p: { label: string }) => `峰值 ${p.label}`,
    mean: '平均',
    inZone: '目標區時間',
    overLimitValue: (p: { events: number; sec: string }) => `${p.events} 次 · ${p.sec} 秒`,
    active: '有效量測',
    reviewTitle: '療程回顧',
    unknownAction: '未知動作',
    sessionNo: (p: { id: number }) => `療程 #${p.id}`,
    demoSuffix: ' · 示範資料',
    export: '匯出紀錄',
    summaryAria: '訓練摘要',
    detailsAria: '療程細節',
    abandonedNote: '這場療程未正常結束(關窗或當機),結束時間為推估值,次數可能不完整。',
    prescription: '處方(當時生效)',
    trigger: '判定',
    legacy: '—(舊資料)',
    hold: '保持',
    duration: '療程時間',
    calibration: '校準',
    noSnapshot: '無校準快照(建立於本功能之前),無法確認可比性。',
    drift: (p: { keys: string }) =>
      `校準已變更:這場的 ${p.keys} 與目前設定不同。曲線的零點或方向可能與現在不一致,請勿直接與近期紀錄比較。`,
    sameCalibration: '與目前校準相同。',
    perRep: '逐次分析',
    perRepNote:
      '目前紀錄只保存連續角度與完成次數,尚未保存每一次動作的開始與結束事件,因此不提供逐次峰值與保持時間,以免呈現推測出的精確度。',
    colStart: '開始時間',
    colAction: '動作',
    colDone: '完成',
    colDuration: '時長',
    colOps: '操作',
    empty: '尚無療程紀錄',
    demoBadgeTitle: '這場是示範模式產生的模擬資料,不是真實量測',
    demoBadge: '示範資料',
    abandonedTitle: '這場療程未正常結束(關窗或當機),結束時間為推估值,次數可能不完整',
    abandonedBadge: '未正常結束',
    review: '回顧',
    deleteAria: (p: { id: number }) => `刪除療程 #${p.id}`,
    pager: (p: { total: number; page: number; pages: number }) => `共 ${p.total} 場 · 第 ${p.page} / ${p.pages} 頁`
  },

  calibration: {
    title: '感測器校準精靈',
    unstable: '偵測到晃動,請於捕捉期間保持靜止後重試',
    singularBaseline:
      '目前站姿使感測器落在量測奇異區(Pitch/Roll 接近 90°),角度會因極小雜訊跳動。已停止套用錯誤校正；請先更新支援原始重力向量的感測器韌體,或依硬體安裝指南調整感測器貼裝面後重試。',
    insufficientData: '感測資料不足,請確認裝置連線正常後重試',
    shaking: '偵測到晃動,請保持靜止後重試',
    applied: '校準完成,已套用至偵測與 3D/2D 顯示',
    capturing: '捕捉中…',
    captureButton: '開始捕捉(倒數 3 秒)',
    handsFree: (p: { sec: string }) => `免手擷取:擺好姿勢並穩住 ${p.sec} 秒即自動開始`,
    back: '← 上一步(重捕)',
    step1Title: '步驟 1/6 · 佩戴確認',
    notConnected: '⚠ 裝置未連線,請先於頂部連線後再開始。',
    chooseSide: '請先選擇配戴側。',
    mtuTruncated:
      '⚠ BLE 連線的 MTU 沒有協商成功,冠狀面(roll)資料沒有送達,目前恆為 0°。這一步校的就是 roll 方向,現在做只會得到一份無意義的校準,請直接略過。重新連線或重新燒錄韌體後可再校正顯示方向。',
    skip: '略過,直接完成校準',
    calibrateAnyway: '仍要校正顯示方向(倒數 3 秒)',
    step6Title: '步驟 6/6 · 預覽確認',
    recalibrate: '重新校準',
    apply: '確認套用'
  },

  calibrationB: {
    title: '校準 B',
    beta: 'beta',
    intro: '依平常方式佩戴感測器,**隔著衣物也可以**。先保持四個靜止姿勢,再做兩個簡單的腿部動作。精靈會用重力(有陀螺儀時一併使用)推算每個感測器的安裝方向。',
    sideHint: '請選擇佩戴感測器的那一側腿。',
    rawChecking: '正在偵測原始運動資料串流…',
    rawOn: '已偵測到原始運動串流:將使用地面階段與陀螺儀。',
    rawOff: '未偵測到原始運動串流(感測器韌體較舊),將僅以重力繼續校準。',
    progress: (p: { n: string; total: string }) => `第 ${p.n} / ${p.total} 步`,
    capture: '開始擷取(3 秒倒數)',
    recording: '錄製中…',
    noData: '感測資料不足,請檢查連線後重試。',
    noRaw: '未收到原始運動資料,請檢查感測器韌體後重試。',
    floorTitle: '地面階段',
    faceDesc: (p: { face: string }) => `將**感測器組**放在平面上,**${p.face}** 面朝上,並保持不動。`,
    skipFloor: '略過地面階段',
    faces: { '+x': '+X', '-x': '-X', '+y': '+Y', '-y': '-Y', '+z': '+Z', '-z': '-Z' },
    poses: {
      standing: { title: '姿勢:站立', desc: '**自然站直放鬆**,雙腿伸直,保持不動。' },
      seated: { title: '姿勢:坐姿', desc: '坐下使**大腿水平**、小腿自然垂直向下,保持不動。' },
      supine: { title: '姿勢:仰躺', desc: '**平躺仰臥**,雙腿伸直,保持不動。' },
      prone: { title: '姿勢:俯臥', desc: '**平躺俯臥**,雙腿伸直,保持不動。' },
      sideLying: { title: '姿勢:側躺', desc: '朝**感測器所在的那一側**側躺,雙腿伸直,保持不動。' }
    },
    sweepTitle: (p: { limb: string }) => `動作:${p.limb}`,
    sweeps: {
      thigh: '站立,**大腿向前抬起**再放下,緩慢重複數次,共約 6 秒。',
      shin: '站立,**腳跟向後踢**(彎曲膝蓋)再放下,緩慢重複數次,共約 6 秒。'
    },
    gyroMissing: '沒有陀螺儀資料,此動作僅使用重力。',
    resultTitle: '校準結果',
    resultLine: (p: { limb: string; confidence: string; rms: string; gyro: string }) =>
      `${p.limb}:信心 ${p.confidence}、殘差 ${p.rms}°、${p.gyro}。`,
    confidence: { high: '高', medium: '中', low: '低' },
    gyroUsed: '已使用陀螺儀',
    gyroNotUsed: '僅用重力',
    rejected: (p: { poses: string }) => `已忽略的姿勢:${p.poses}。`,
    failed: (p: { limb: string; reason: string }) => `無法校準${p.limb}:${p.reason}`,
    unverified: '這是 **beta** 版。套用後請確認抬腿時畫面角度會變大。',
    errors: {
      invalidInput: '資料無效',
      signAmbiguous: '動作方向不明確',
      underdetermined: '姿勢種類不足',
      inconsistent: '各姿勢之間互相矛盾',
      sweepTooSmall: '動作幅度太小',
      sweepNotPlanar: '動作不是乾淨的前後擺動',
      gyroDisagrees: '陀螺儀與重力不一致,已忽略陀螺儀',
      gyroWeak: '陀螺儀訊號太弱,已忽略陀螺儀'
    }
  },

  settings: {
    title: '系統設定',
    subtitle: '裝置準備、資料選擇,都有各自的位置。',
    indexAria: '設定分類',
    footer: '設定會立即儲存於本機',
    back: '返回監測',
    categories: {
      device: { label: '裝置與連線', title: '裝置與連線', hint: '連線狀態與判定協定' },
      calibration: { label: '校準', title: '感測器校準', hint: '零位、屈曲軸與佩戴方向' },
      display: { label: '顯示', title: '顯示', hint: '語言、主題、姿態預設與圖表' },
      software: { label: '軟體與韌體', title: '軟體與韌體更新', hint: 'App 更新頻道與裝置韌體' },
      modules: { label: '模組', title: '功能模組', hint: '第一方模組與啟用狀態' },
      privacy: { label: '資料與隱私', title: '資料與隱私', hint: '即時遙測上傳(預設關閉)' },
      demo: { label: '示範模式', title: '示範模式', hint: '不需硬體的完整流程演練' }
    },
    device: {
      heading: '裝置',
      sensorFault: (p: { code: string }) => ` · 感測器異常 ${p.code}`,
      connectHint: '連線只代表收得到資料;角度是否可信取決於校準。',
      protocol: '判定協定',
      protocolHint: '判定目前只支援膝關節;其他協定會擋下開始療程。'
    },
    calibration: {
      noLiveData: '尚無即時資料,無法歸零',
      quickZeroPitchOnly: '已套用快速歸零校準(僅 Pitch:BLE 未送達 roll 資料)',
      quickZeroFull: '已套用快速歸零校準(含 Roll)',
      zeroCaptured: '零位已捕捉',
      thighAxis: '大腿軸已建立',
      shinAxis: '小腿軸已建立',
      rollVerified: '側向方向已驗證',
      wizard: '校準精靈',
      lastCalibrated: (p: { time: string }) => `上次校準:${p.time}`,
      notCalibrated: '尚未校準——未校準時無法開始療程',
      recalibrate: '重新校準',
      start: '開始校準',
      needConnection: '校準需要即時感測器數值,請先連線裝置。',
      locked: '療程進行中無法變更校準——一場的資料必須全程由同一組轉換產生。請先結束療程。',
      manualSummary: '進階手動校準(一般情況請使用精靈)',
      manualHint: 'Zero 欄位是「站直姿勢當下,感測器的原始讀值」,不是要加減的偏移量——多數情況請用「快速歸零」。',
      invertThigh: 'Invert Thigh 反相',
      invertShin: 'Invert Shin 反相',
      quickZero: '快速歸零'
    },
    display: {
      language: '語言',
      languageHint: '「跟隨系統」會依作業系統語言切換,不支援的語言顯示繁體中文。',
      theme: '主題',
      light: '日間',
      dark: '夜間',
      poseDefault: '即時監測姿態預設',
      pose2d: '2D 側面(建議)',
      poseHint: '2D 只呈現判定平面的屈伸;3D 的側向角度尚未驗證,僅作方向示意。',
      maxChartPoints: '即時圖表最大點數',
      flushInterval: '資料寫入間隔 (秒)'
    },
    autoPhase: {
      idle: '連線裝置後自動檢查',
      checking: '檢查最新韌體中…',
      up_to_date: '已是最新版',
      deferred: 'Session 進行中,結束後再檢查',
      incompatible: '最新韌體需要較新的 App',
      downloading: '下載並驗證韌體中…',
      updating: '傳輸到裝置中',
      done: '更新完成,裝置重新啟動中',
      error: '自動更新失敗'
    },
    autoLabel: '自動更新(閒置時):',
    autoVersions: (p: { device: string; latest: string }) => ` · 裝置 ${p.device} / 最新 ${p.latest}`,
    unknownOldFirmware: '未知(舊韌體)',
    updateStatus: {
      checking: '檢查中…',
      available: (p: { version: string }) => `發現新版本 ${p.version},準備下載…`,
      downloading: (p: { pct: number }) => `下載中…${p.pct}%`,
      downloaded: (p: { version: string }) => `新版本 ${p.version} 已下載完成,見下方橫幅重新啟動套用`,
      notAvailable: '已是最新版本',
      error: (p: { message: string }) => `檢查失敗:${p.message}`
    },
    software: {
      heading: 'Software Update 軟體更新',
      intro:
        '新版本會在背景自動下載,不會跳出安裝精靈;下載完成後畫面下方會出現提示,按下重啟即可套用(或直接關閉 App,下次啟動時自動套用)。',
      currentVersion: (p: { version: string }) => `目前版本:${p.version}`,
      downloadedWaiting: '已下載，等待套用',
      processing: '更新處理中…',
      checkNow: '立即檢查更新',
      beta: '接收 Beta 版更新',
      betaHint: '關閉後只會收到正式版推播;已安裝的版本不受影響,只影響「下一次」自動更新推的是哪一種版本。'
    },
    firmware: {
      heading: 'Firmware Update 裝置韌體更新',
      intro:
        '透過既有 BLE 連線把新韌體推送到 ESP32,取代原本每次都要拆開裝置、接 USB 到 COM7 手動燒錄的流程。傳輸協定與安全性說明見專案文件 OPTIMIZATION.md 的 OTA 條目。',
      needDevice: '需要先於頂部連線真實裝置',
      demoNoFirmware: 'Demo 模式沒有真實裝置,無法更新韌體',
      deviceNotConnected: '裝置未連線',
      readFailedOld: '讀取失敗,裝置可能是舊韌體(尚未支援 OTA)',
      readFileFailed: (p: { message: string }) => `讀取韌體失敗：${p.message}`,
      emptyFile: '選擇的檔案是空的,請重新選擇 .bin',
      sameVersionWarn: (p: { version: string }) => `\n⚠ 填寫的版本標籤與裝置目前版本相同(${p.version}),確定仍要重新燒錄?`,
      confirmTitle: '開始更新裝置韌體?',
      confirmBody: (p: { kb: string; warn: string }) =>
        `即將透過 BLE 傳送 ${p.kb} KB 的韌體到已連線裝置。傳輸中請勿關閉 App 或讓裝置斷電——` +
        `中途中斷不會讓裝置變磚(新韌體寫入未啟用的分區,失敗時自動維持原本可開機的版本),` +
        `但這次更新會失敗,需要重新開始。${p.warn}`,
      abortSent: '已送出中止指令',
      querying: '查詢中…',
      queryVersion: '查詢裝置目前版本',
      deviceVersion: (p: { version: string }) => `裝置目前版本:${p.version}`,
      pickFile: '選擇韌體檔案 (.bin)',
      labelField: '這個檔案的版本標籤(選填,僅供比對提示)',
      labelPlaceholder: '例如 1.0.1',
      starting: '啟動更新…',
      transferring: (p: { pct: number }) => `傳輸中… ${p.pct}%`,
      finalizing: '寫入完成,裝置驗證中…',
      done: '✅ 完成,裝置重新開機中',
      failed: '更新失敗',
      aborted: '已中止',
      start: '開始更新',
      abort: '中止'
    },
    demo: {
      heading: 'Demo Mode 示範模式',
      intro:
        '不需要硬體即可演練完整流程:即時量表、達標判定、舒適角度與極限範圍提示、校準精靈、歷史與匯出。資料由模擬器產生並明確標記,不會被誤認為真實量測。',
      confirmTitle: '啟用示範模式?',
      confirmBody:
        '此模式的資料由模擬器產生,不是真實量測。產生的 Session 會標記為「示範資料」並寫入資料庫,可隨時以下方按鈕清除。示範模式期間無法連線真實裝置。',
      purgeTitle: '清除所有示範紀錄?',
      purgeBody: '將永久刪除所有標記為「示範資料」的 Session 及其感測資料。真實量測的紀錄不受影響。',
      purged: (p: { n: number }) => `已清除 ${p.n} 筆示範紀錄`,
      nothingToPurge: '沒有示範紀錄需要清除',
      purgeFailed: (p: { message: string }) => `清除失敗:${p.message}`,
      scenario: '情境',
      end: '結束示範模式',
      start: '啟用示範模式',
      stopPlayback: '停止播放',
      startPlayback: '開始播放',
      sessionLock:
        'Session 進行中無法切換示範模式——一場紀錄的來源必須全程一致,否則資料庫裡會出現前半真實、後半模擬卻只有單一標記的 Session。請先結束 Session。',
      purgeButton: '清除所有示範紀錄',
      purgeHint:
        '示範紀錄刻意不從歷史列表隱藏——藏起來的資料在任何一份資料庫副本裡依然存在,只是更難察覺。這個按鈕讓「資料庫裡還有沒有假資料」變成一個回答得了的問題。'
    }
  },

  liveShare: {
    sessionRunning: '療程進行中,不接受遠端變更設定',
    notANumber: (p: { key: string }) => `${p.key} 不是有效數字`
  }
}

/** 所有語系必須符合的訊息形狀(由主檔推導) */
export type Messages = typeof zhHant
