// 繁體中文語言檔——介面文字的單一來源(2026-09-24 使用者裁定:語言檔分為英文與中文)。
// en.ts 以 `Messages`(本檔推導出的型別)宣告,缺鍵或多鍵都會在 typecheck 失敗,
// 兩份語言檔因此不會悄悄漂移。帶參數的句子寫成函式,讓語序由各語言自己決定。
import type { JointProtocol, TriggerType } from '@shared/types'

type ProtocolLabels = Record<JointProtocol, string>
type TriggerLabels = Record<TriggerType, string>

const protocols: ProtocolLabels = {
  knee: '膝關節',
  elbow: '肘關節(尚未支援)',
  shoulder: '肩關節(尚未支援)'
}

const triggerTypes: TriggerLabels = {
  joint_angle: '關節角度達標',
  segment_elevation: '直膝抬腿',
  segment_extension: '直膝後擺'
}

export const zhTW = {
  meta: { languageName: '繁體中文' },

  common: {
    cancel: '取消',
    confirm: '確認',
    save: '儲存',
    close: '關閉',
    edit: '編輯',
    delete: '刪除',
    retry: '重試',
    back: '返回',
    none: '—',
    notSet: '未設定',
    deg: (n: string) => `${n}°`,
    endAndSaveSession: '結束並儲存療程',
    left: '左腿',
    right: '右腿',
    thigh: '大腿',
    shin: '小腿',
    listSep: '、',
    limbField: (limb: string, field: string) => `${limb}${field}`
  },

  workspaces: {
    dashboard: { index: '01', short: '監測', title: '即時監測' },
    actions: { index: '02', short: '動作', title: '動作處方' },
    history: { index: '03', short: '紀錄', title: '療程紀錄' },
    settings: { index: '04', short: '設定', title: '系統設定' }
  },

  shell: {
    navLabel: '主要功能',
    beta: 'BETA',
    focus: '專注',
    focusOn: '開啟專注模式(隱藏證據層,放大主指標)',
    focusOff: '結束專注模式',
    themeSystem: '主題:跟隨系統',
    themeLight: '主題:日間',
    themeDark: '主題:低光',
    connect: '連線裝置',
    disconnect: '中斷連線',
    demoActive: '示範模式中',
    demoConnectBlocked: '示範模式進行中,無法連線真實裝置——請先於設定頁結束示範模式',
    statusConnected: '已連線',
    statusDisconnected: '未連線',
    statusConnecting: '連線中…',
    statusNotFound: '找不到裝置',
    statusFailed: '連線失敗',
    statusReconnecting: (attempt: number, max: number) => `重新連線中 ${attempt}/${max}`,
    demoBanner: '示範模式 — 畫面上的資料由模擬器產生,不是真實量測',
    minimize: '最小化',
    maximize: '最大化',
    restore: '還原',
    closeWindow: '關閉'
  },

  protocols,
  triggerTypes,

  metrics: {
    kneeAngle: '膝關節夾角',
    thighElevation: '大腿仰角',
    thighExtension: '大腿後伸'
  },

  guidance: {
    noData: '等待感測資料…',
    overLimit: (excess: string) => `超限 ${excess}°,請立即回落`,
    straightenKnee: (excess: string) => `膝蓋再打直 ${excess}°`,
    raise: (metric: 'kneeAngle' | 'thighElevation' | 'thighExtension', delta: string) =>
      `再${metric === 'kneeAngle' ? '彎曲' : metric === 'thighExtension' ? '後伸' : '抬高'} ${delta}°`,
    lower: (delta: string) => `回降 ${delta}° 進入目標區`,
    hold: (held: string, total: string) => `保持!${held}s / ${total}s`,
    returnToRest: (delta: string) => `完成!回到起始位(再回 ${delta}°)`,
    atRest: '完成!已回起始位'
  },

  phase: { idle: '準備', holding: '保持', restPending: '回位' },

  dashboard: {
    notCalibrated: '尚未校準——偵測與顯示方向可能不正確',
    startWizard: '啟動校準精靈',
    blocked: {
      hardwareError: {
        title: '感測器異常',
        body: '感測器 I2C 連線中斷,系統正在自動復原。即時數值已凍結、資料寫入已暫停。'
      },
      unsupported: {
        title: '此協定尚未支援',
        body: '判定目前只支援膝關節:感測器裝在大腿與小腿,量表與判定讀的都是腿部角度。',
        action: '前往設定'
      },
      disconnected: {
        title: '裝置未連線',
        body: '連線穿戴裝置後才能開始監測。',
        action: '連線裝置'
      },
      noAction: {
        title: '尚未選擇動作',
        body: '從右側清單選擇本次療程的復健動作,或到動作處方建立新動作。',
        action: '前往動作處方'
      }
    },
    noActionName: '未選擇動作',
    metricLabel: (label: string) => `主指標:${label}`,
    stale: '數值已過期 · 重新連線中',
    unsupportedGauge: (label: string) => `此協定尚未支援 — 量表讀的仍是${label}`,
    target: (min: number, max: number) => `目標 ${min}–${max}°`,
    targetAtLeast: (min: number) => `目標 ≥ ${min}°`,
    rest: (deg: number) => `回位 ≤ ${deg}°`,
    overLimitAt: (deg: number) => `超限 ${deg}°`,
    inZone: '目標區',
    kneeGate: (knee: string, max: number) => `膝直前置:${knee}° / 需 ≤ ${max}°`,
    alarmTitle: (excess: string) => `超出安全上限 ${excess}°`,
    alarmTitleNoValue: '超出安全上限',
    silence: '靜音 30 秒',
    silenced: (sec: number) => `靜音中 ${sec}s`,
    reps: '次數',
    hold: '保持',
    holdSeconds: (held: string, total: string) => `${held} / ${total}s`,
    evidence: '證據層',
    showEvidence: '展開證據層',
    hideEvidence: '收合證據層',
    tabs: { chart: '趨勢圖', detail: '詳細數值', pose3d: '3D 姿態', pose2d: '2D 姿態' },
    detail: {
      thigh: '大腿',
      shin: '小腿',
      knee: '膝夾角',
      thighRoll: '大腿 Roll',
      shinRoll: '小腿 Roll',
      varusValgus: '內外翻',
      valgus: '外翻',
      varus: '內翻'
    }
  },

  session: {
    action: '指定動作',
    noActionsInProtocol: '本協定尚無動作',
    chooseAction: '請選擇動作',
    target: '目標 (°)',
    tolerance: '容錯 (±°)',
    holdMs: '保持 (ms)',
    recording: '記錄中',
    start: '開始療程',
    end: '結束療程',
    connectFirst: '請先連線裝置',
    unsupported: '此協定尚未支援',
    unsupportedHint:
      '判定目前只支援膝關節:在此協定下開始療程會把腿的資料錄成該關節的紀錄,故先行擋下。',
    started: '療程已開始',
    startFailed: '療程開始失敗',
    endedSaved: '療程已結束並儲存',
    shortcutHint: 'Ctrl+Enter'
  },

  chart: {
    knee: '膝夾角',
    thigh: '大腿',
    shin: '小腿',
    varusValgus: '內外翻',
    targetMin: '目標下限',
    targetMax: '目標上限',
    overLimit: '超限門檻',
    varusValgusDisplay: '內外翻(顯示用)'
  },

  actions: {
    subtitle: '管理各關節協定的復健動作範本',
    restoreDefaults: '還原預設',
    create: '新增動作',
    search: '搜尋名稱或說明…',
    sortLabel: '排序',
    groupLabel: '分組',
    sortName: '依名稱',
    sortTarget: '依目標角度',
    sortCreated: '依建立順序',
    groupNone: '不分組',
    groupTrigger: '依判定型別',
    emptyProtocol: '此協定尚無動作範本',
    loadDefaults: '載入預設範本',
    noMatch: (q: string) => `找不到符合「${q}」的動作`,
    clearSearch: '清除搜尋',
    params: (target: number, tol: number, hold: number) => `目標 ${target}° · 容錯 ±${tol}° · 保持 ${hold}ms`,
    safetyLimit: '安全上限',
    safetyDerived: (deg: number) => `${deg}°(導出)`,
    editTitle: '編輯動作',
    createTitle: '新增動作',
    name: '動作名稱',
    description: '說明',
    triggerType: '判定規則',
    target: '目標 (°)',
    tolerance: '容錯 (±°)',
    holdMs: '保持 (ms)',
    safetyLabel: (margin: number) => `安全上限 (°) — 留空則沿用 目標 + 容錯 + ${margin}`,
    safetyPlaceholder: (deg: number) => `未設定(目前導出為 ${deg}°)`,
    safetyHint:
      '超過此角度會觸發長鳴警報。這是解剖上的上限,與「算不算達標」無關——放寬容錯讓患者容易達標時,不應該連帶把這個值往外推。',
    recordLive: (label: string) => `目前 ${label}:`,
    recordCapture: '擷取目前角度為目標',
    recordHint: '連線裝置後,可讓患者擺出目標姿勢並一鍵擷取角度,不必憑空輸入',
    nameRequired: '動作名稱不可為空',
    updated: '動作已更新',
    created: '動作已建立',
    saveFailed: '儲存失敗',
    deleteTitle: '刪除動作',
    deleteConfirm: (name: string) => `確定要刪除「${name}」嗎?此操作不可撤銷。`,
    deleted: '動作已刪除',
    restoreTitle: '還原預設',
    restoreConfirm: '這將清除所有自訂動作並重建預設範本,確定嗎?',
    restored: '已還原預設動作範本',
    protocolLabel: '協定'
  },

  history: {
    subtitle: '檢視與分析過往療程',
    empty: '尚無療程紀錄',
    loadFailed: '載入紀錄失敗',
    colId: '編號',
    colStart: '開始時間',
    colAction: '動作',
    colReps: '次數',
    colOps: '操作',
    analyze: '分析',
    deleteLabel: (id: number) => `刪除療程 #${id}`,
    demoBadge: '示範',
    demoTitle: '這場是示範模式產生的模擬資料,不是真實量測',
    abandonedBadge: '未完成',
    abandonedTitle: '這場療程未正常結束(關窗或當機),結束時間為推估值,次數可能不完整',
    deleteTitle: '刪除紀錄',
    deleteConfirm: (id: number) => `確定刪除療程 #${id} 的紀錄嗎?`,
    deleted: (id: number) => `療程 #${id} 已刪除`,
    analysisTitle: (id: number) => `療程 #${id} 分析`,
    demoWarning: '這是示範模式產生的模擬資料,不是真實量測,不可作為臨床判讀依據。',
    noSnapshot: '這場沒有校準快照(建立於本功能之前),無法確認它與目前設定是否為同一組轉換。',
    drift: (fields: string) =>
      `這場的校準與目前設定不同(${fields}),曲線的零點或正負方向可能與現在不一致,請勿與近期紀錄直接比較。`,
    legacyAxis: (limbs: string) =>
      `這場的${limbs}貼裝軸向判定沿用舊版校準邏輯換算而來,尚未經新方法以真實動作重新驗證。`,
    pointsSummary: (points: number, reps: number) => `${points} 點(圖表抽樣後) · ${reps} 次`,
    exportCsv: '匯出 CSV',
    calibrationFields: {
      axisRotation: '貼裝旋轉角',
      invert: '反相',
      zero: '零位',
      rollInvert: 'Roll 反相',
      rollZero: 'Roll 零位',
      kneeZero: '膝零位',
      zeroAccel: '重力零位',
      hingeAxis: '屈曲軸'
    }
  },

  settings: {
    subtitle: '感測器校準與系統參數',
    calibration: '感測器校準',
    lastCalibrated: (when: string) => `上次精靈校準:${when}`,
    neverCalibrated: '尚未執行校準精靈——建議先跑一次,自動判斷佩戴方向並歸零',
    rollUnverified: (limbs: string) =>
      `內外翻(roll)顯示方向未經外展步驟驗證:${limbs}。不影響達標與超限判定,僅可能讓 3D 姿態、內外翻數值與圖表的正負方向相反。`,
    startWizard: '啟動校準精靈',
    wizardNeedsConnection: '校準需要即時感測器數值,請先連線裝置。',
    calibrationLocked:
      '療程進行中無法變更校準——這一場的資料必須全程由同一組轉換產生。請先結束療程。',
    advanced: '進階手動校準(一般情況請使用精靈)',
    advancedHint:
      'Zero 欄位是「站直姿勢當下,感測器的原始讀值」,不是要加減的偏移量——多數情況請用「快速歸零」按當下姿勢自動填入。',
    thighZero: '大腿零位 (原始 °)',
    shinZero: '小腿零位 (原始 °)',
    invertThigh: '大腿反相',
    invertShin: '小腿反相',
    thighRollZero: '大腿 Roll 零位 (原始 °)',
    shinRollZero: '小腿 Roll 零位 (原始 °)',
    invertThighRoll: '大腿 Roll 反相',
    invertShinRoll: '小腿 Roll 反相',
    quickZero: '快速歸零',
    quickZeroNoData: '尚無即時資料,無法歸零',
    quickZeroPitchOnly: '已套用快速歸零(僅 Pitch:BLE 未送達 roll 資料)',
    quickZeroDone: '已套用快速歸零(含 Roll)',
    appSideNote: '校準完全在 App 端套用;韌體僅回傳原始角度,無需同步。',
    general: '一般',
    language: '介面語言',
    theme: '主題',
    themeSystem: '跟隨系統',
    themeLight: '日間',
    themeDark: '低光',
    defaultProtocol: '預設協定',
    chartMaxPoints: '圖表最大點數',
    flushInterval: '寫入間隔 (秒)',
    showKneeRoll: '即時圖表加畫內外翻曲線',
    showKneeRollHint:
      '走右側獨立刻度(±20°),正 = 外翻、負 = 內翻。不參與達標與超限判定,純粹供判讀。',
    showTrendChart: '監測頁顯示趨勢圖',
    show3D2DPose: '監測頁顯示 3D/2D 姿態',
    evidenceHint: '兩者預設關閉;關閉不影響資料收集,開啟後立刻看得到累積的曲線與姿態。',
    update: {
      title: '軟體更新',
      body: '新版本會在背景自動下載;下載完成後畫面下方會出現提示,按下重新啟動即可套用(或下次啟動時自動套用)。',
      current: (v: string) => `目前版本:${v}`,
      check: '立即檢查更新',
      checking: '檢查中…',
      available: (v: string) => `發現新版本 ${v},準備下載…`,
      downloading: (pct: number) => `下載中… ${pct}%`,
      downloaded: (v: string) => `新版本 ${v} 已下載完成,見下方橫幅重新啟動套用`,
      upToDate: '已是最新版本',
      error: (msg: string) => `檢查失敗:${msg}`,
      beta: '接收 Beta 版更新',
      betaHint: '關閉後只會收到正式版;已安裝的版本不受影響。'
    },
    ota: {
      title: '裝置韌體更新',
      risk: '有風險',
      body: '透過既有 BLE 連線把新韌體推送到 ESP32,取代拆開裝置接 USB 手動燒錄的流程。',
      needConnection: '需要先連線真實裝置',
      demoBlocked: '示範模式沒有真實裝置,無法更新韌體',
      sessionBlocked:
        '療程進行中無法更新韌體——flash 寫入會讓感測器取樣與回饋短暫卡頓,患者仍佩戴著裝置時不能冒這個險。請先結束療程。',
      checkVersion: '查詢裝置目前版本',
      checkingVersion: '查詢中…',
      deviceVersion: (v: string) => `裝置目前版本:${v}`,
      versionReadFailed: '讀取失敗,裝置可能是舊韌體(尚未支援 OTA)',
      pickFile: '選擇韌體檔案 (.bin)',
      readFailed: (msg: string) => `讀取韌體失敗:${msg}`,
      label: '這個檔案的版本標籤(選填,僅供比對提示)',
      labelPlaceholder: '例如 1.0.1',
      emptyFile: '選擇的檔案是空的,請重新選擇 .bin',
      sameVersion: (v: string) => `\n⚠ 填寫的版本標籤與裝置目前版本相同(${v}),確定仍要重新燒錄?`,
      confirmTitle: '開始更新裝置韌體?',
      confirmBody: (kb: string, warn: string) =>
        `即將透過 BLE 傳送 ${kb} KB 的韌體到已連線裝置。傳輸中請勿關閉 App 或讓裝置斷電——中途中斷不會讓裝置變磚(新韌體寫入未啟用的分區,失敗時自動維持原本可開機的版本),但這次更新會失敗,需要重新開始。${warn}`,
      starting: '啟動更新…',
      transferring: (pct: number) => `傳輸中… ${pct}%`,
      finalizing: '寫入完成,裝置驗證中…',
      done: '完成,裝置重新開機中',
      failed: '更新失敗',
      aborted: '已中止',
      start: '開始更新',
      abort: '中止',
      abortSent: '已送出中止指令'
    },
    demo: {
      title: '示範模式',
      body: '不需要硬體即可演練完整流程:即時量表、達標判定、超限警報、校準精靈、紀錄與匯出。資料由模擬器產生並明確標記。',
      scenario: '情境',
      enable: '啟用示範模式',
      disable: '結束示範模式',
      play: '開始播放',
      confirmTitle: '啟用示範模式?',
      confirmBody:
        '此模式的資料由模擬器產生,不是真實量測。產生的療程會標記為「示範資料」並寫入資料庫,可隨時以下方按鈕清除。示範模式期間無法連線真實裝置。',
      sessionBlocked:
        '療程進行中無法切換示範模式——一場紀錄的來源必須全程一致。請先結束療程。',
      purge: '清除所有示範紀錄',
      purgeTitle: '清除所有示範紀錄?',
      purgeBody: '將永久刪除所有標記為「示範資料」的療程及其感測資料。真實量測的紀錄不受影響。',
      purged: (n: number) => `已清除 ${n} 筆示範紀錄`,
      nothingToPurge: '沒有示範紀錄需要清除',
      purgeFailed: (msg: string) => `清除失敗:${msg}`,
      purgeHint: '示範紀錄刻意不從紀錄列表隱藏——這個按鈕讓「資料庫裡還有沒有假資料」變成一個回答得了的問題。',
      scenarios: {
        'rep-cycle': '正常療程 — 連續三下達標',
        'over-limit': '超限警報 — 爬過安全上限並停留 45 秒',
        'hardware-error': '硬體錯誤 — ERR:1 後復原',
        'truncated-link': 'MTU 過小 — 每個封包被切到 20 bytes',
        garbage: '壞封包 — 每 10 筆混入 1 筆亂碼',
        dropout: '連線中斷 — 封包停止後鏈路失守'
      } as Record<string, string>
    }
  },

  wizard: {
    title: '感測器校準精靈',
    autoCapture: (sec: number) => `免手擷取:擺好姿勢並穩住 ${sec} 秒即自動開始`,
    back: '上一步(重捕)',
    step: (n: number) => `步驟 ${n}/6`,
    captureButton: '開始捕捉(倒數 3 秒)',
    capturing: '捕捉中…',
    errors: {
      unstable: '偵測到晃動,請於捕捉期間保持靜止後重試',
      singularBaseline:
        '目前站姿使感測器落在量測奇異區(Pitch/Roll 接近 90°),角度會因極小雜訊跳動。已停止套用錯誤校正;請先更新支援原始重力向量的感測器韌體,或依硬體安裝指南調整感測器貼裝面後重試。',
      thighDeltaTooSmall: '大腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉',
      shinDeltaTooSmall: '小腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉',
      notEnoughData: '感測資料不足,請確認裝置連線正常後重試',
      shaking: '偵測到晃動,請保持靜止後重試'
    },
    s1: {
      title: '佩戴確認',
      body: '確認兩顆感測器已固定:大腿感測器(含 ESP32,0x69)綁於大腿外側、小腿外接感測器(0x68)綁於脛骨前緣(小腿前側的硬骨邊)旁邊(見下圖,不是側面)。方向與角度不必在意——精靈會自動偵測貼歪與方向反相並校正,但過程中感測器不可鬆動移位。',
      diagramBone: '脛骨前緣',
      diagramHint: '(緊鄰旁邊貼)',
      side: '請選擇這次配戴的腿側:「外側」在左右腿是互為鏡像的方向,換邊配戴時內外翻方向可能相反,精靈需要知道才能在第 5 步提醒你。',
      notConnected: '裝置未連線,請先連線後再開始。',
      chooseSide: '請先選擇配戴側。',
      start: '開始'
    },
    s2: { title: '站直捕捉零位', body: '請自然站直、雙腿垂直於地面,按下按鈕後保持靜止約 4 秒。' },
    s3: {
      title: '向前抬起大腿',
      body: '向前方抬起大腿(膝蓋可彎),抬到明顯高度(約 45° 以上)後定住,按下按鈕保持姿勢約 4 秒。'
    },
    s4: {
      title: '站立後勾小腿',
      body: '大腿保持直立,將腳跟向後上方勾起(彎膝),勾到明顯角度(約 45°)後定住,按下按鈕保持姿勢約 4 秒。'
    },
    s5: {
      title: '腿向外側擺(選配)',
      displayOnly:
        '這一步只影響顯示:3D 姿態、內外翻數值與圖表的正負方向。達標判定、次數計算與超限警報都不使用這個資料,略過不會讓校準不完整。',
      body: '需要單腳站立,若平衡不便請直接略過。要做的話:全腿伸直,將整條腿向身體外側側擺約 20–30° 後定住,保持約 4 秒。大腿與小腿分開判定,某一側幅度不足時該側沿用現有設定。',
      sideChanged: (now: string, before: string) =>
        `你這次選的是「${now}」,上次校準是「${before}」。略過這一步會沿用上次那一側判定出的內外翻方向,現在很可能左右相反(只影響顯示,不影響判定)。強烈建議完成這一步。`,
      truncated:
        'BLE 連線的 MTU 沒有協商成功,冠狀面(roll)資料沒有送達,目前恆為 0°。這一步現在做只會得到無意義的校準,請直接略過。',
      skip: '略過,直接完成校準',
      doIt: '仍要校正顯示方向(倒數 3 秒)'
    },
    s6: {
      title: '預覽確認',
      body: '方向校正已計算完成(尚未套用)。請實際動動看:站直時數值應接近 0°、前抬大腿時「大腿」變大(正值)、腿向外側擺時內外翻顯示「外翻」。確認無誤再按套用。',
      coupling: (limbs: string) =>
        `偵測到殘留耦合:${limbs}外展時前後角度也明顯跟著變化。這通常代表感測器實際貼裝位置與精靈假設的貼法有落差,這次算出的旋轉角可能沒有完全修正。不影響本次套用,但建議之後對照貼裝位置重新檢查。`,
      thighPitch: '大腿 Pitch',
      shinPitch: '小腿 Pitch',
      knee: '膝夾角',
      varusValgus: '內外翻',
      recalibrate: '重新校準',
      apply: '確認套用'
    },
    applied: '校準完成,已套用至偵測與 3D/2D 顯示'
  },

  dialogs: {
    errorBoundaryTitle: '這個區塊發生錯誤',
    errorBoundaryBody: (name: string) => `${name}無法顯示,但 App 的其餘部分仍可使用。`,
    errorBoundaryRunning: '目前有療程進行中——請先結束並儲存,以免資料變成未完成紀錄。',
    hwTitle: '硬體異常',
    hwBody: (code: string) =>
      `感測器 I2C 連線脫落(${code}),系統嘗試重新連線中…即時數據已凍結、資料寫入已暫停,以避免記錄無效讀數。`,
    hwHint: '感測器接回後警示會自動消失;若無法恢復,請先結束療程以保住已記錄的資料。',
    updateReady: (v: string) => `新版本 ${v} 已下載完成,重新啟動即可套用`,
    updateSessionRunning: '(療程進行中,建議結束後再重啟)',
    updateRestartBlocked: '療程進行中無法重啟——結束後這個按鈕會恢復可用',
    restartNow: '立即重新啟動',
    dropdownEmpty: '無可用選項',
    dropdownPlaceholder: '請選擇'
  }
}

export type Messages = typeof zhTW
