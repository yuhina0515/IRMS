// i18n/en.ts
// --- 英文訊息字典 ---
// `satisfies Messages`:與主檔 zh-Hant.ts 形狀不符(缺 key、多 key、函式參數不同)即 typecheck 失敗。
// clinical 命名空間的英文用語尚待人工臨床審閱。
import type { Messages } from './zh-Hant'

export const en = {
  clinical: {
    overLimit: (p: { deg: string }) => `⚠ ${p.deg}° past your limit range. Lower your leg now`,
    straightenKnee: (p: { deg: string }) => `Straighten your knee ${p.deg}° more`,
    metric: {
      kneeAngle: 'Knee joint angle',
      thighElevation: 'Thigh elevation',
      thighExtension: 'Thigh extension'
    },
    movementVerb: {
      kneeAngle: 'Bend',
      thighElevation: 'Raise',
      thighExtension: 'Extend'
    },
    triggerShort: {
      joint_angle: 'Joint angle',
      segment_elevation: 'Segment elevation',
      segment_extension: 'Segment extension'
    },
    triggerLong: {
      joint_angle: 'Joint Flexion (joint angle reaches target)',
      segment_elevation: 'Segment Elevation (straight-leg raise)',
      segment_extension: 'Segment Extension (straight-leg backward swing)'
    },
    protocol: {
      knee: 'Knee Flexion',
      elbow: 'Elbow Flexion — not supported yet',
      shoulder: 'Shoulder Abduction — not supported yet'
    },
    terms: {
      comfortAngle: 'Comfort angle',
      limitRange: 'Limit range',
      targetZone: 'Target zone',
      thigh: 'Thigh',
      shin: 'Lower leg',
      leftLeg: 'Left leg',
      rightLeg: 'Right leg',
      varusValgus: 'Varus/valgus',
      valgus: 'valgus',
      varus: 'varus'
    },
    dashboard: {
      sensorFault: (p: { code: string }) => `Sensor fault · ${p.code}`,
      sensorFaultSub: 'Feedback is paused until the sensor recovers. You can end the session at any time',
      overLimitTitle: 'Past your limit range. Stop going deeper',
      overLimitSub: (p: { knee: string; limit: string }) => `Knee angle ${p.knee}° · your limit range ${p.limit}°`,
      holding: 'Good, hold this position',
      holdingSub: (p: { sec: string }) => `In the target zone. Hold for ${p.sec} s`,
      restPending: 'Done. Return to the start position',
      overComfort: (p: { knee: string; comfort: string }) =>
        `! Past your comfort angle (knee ${p.knee}° > ${p.comfort}°); this may start to hurt`,
      kneeStraight: (p: { max: string }) => `Keep the knee nearly straight (≤ ${p.max}°)`,
      rangeComfort: (p: { deg: string }) => `Comfort angle ${p.deg}°`,
      rangeLimit: (p: { deg: string }) => ` · limit range ${p.deg}°`,
      rangeNotMeasured: 'Personal angle range not measured',
      rulerComfort: (p: { deg: string }) => `${p.deg} comfort`,
      rulerLimit: (p: { deg: string }) => `${p.deg} limit`,
      protocolUnsupportedSub: 'Detection supports the knee only for now. Switch back to the knee protocol in Settings',
      captionAxes: '✓ Zero and flexion axes set',
      captionLateral: ' · lateral angles unvalidated',
      caption3d: ' · pose shows direction only',
      captionRoll: ' · roll is for mounting checks only'
    },
    diagnostics: {
      thigh: 'Thigh angle',
      shin: 'Lower-leg angle',
      knee: 'Knee joint angle',
      thighRoll: 'Thigh sensor roll',
      shinRoll: 'Lower-leg sensor roll',
      rollDiff: 'Roll difference between sensors',
      relativeToZero: 'Relative to standing zero',
      kneeNote: 'Thigh minus lower-leg angle',
      rollNote: 'For mounting/axis troubleshooting',
      rollDiffNote: 'Unvalidated; not a varus/valgus measurement'
    },
    segmentKneeHint: (p: { max: string }) => `Segment exercises also require the knee to stay nearly straight (≤ ${p.max}°).`,
    history: {
      overComfort: 'Past comfort angle',
      overLimit: 'Past limit range',
      demoNote: 'This is simulated demo-mode data, not a real measurement. Do not use it for clinical interpretation.'
    },
    calibration: {
      step1Desc:
        'Make sure both sensors are secure: the **thigh sensor** (with the ESP32, 0x69) strapped to the outer thigh, and the **external lower-leg sensor** (0x68) strapped **right beside the tibial crest (the hard bony edge at the front of the lower leg)** (see the diagram; not on the side). **Orientation and angle do not matter**: the wizard detects and corrects a 90° twist (swapped axes) and a reversed direction, but the sensors must not loosen or shift during the process.',
      step1Side:
        'Choose which **leg** the sensors are on this time. "Outer side" is mirrored between the left and right leg, so switching legs can reverse the varus/valgus (roll) direction. The wizard needs to know so it can warn you in step 5.',
      tibialCrest: 'Tibial crest',
      tibialCrestBeside: '(mount beside it)',
      step2Title: 'Step 2/6 · Stand straight to capture zero',
      step2Desc: 'Stand naturally straight with both legs vertical. Press the button, then hold still for about 4 seconds.',
      step3Title: 'Step 3/6 · Raise the thigh forward',
      step3Desc:
        'Raise the thigh **forward** (the knee may bend) to a clear height (about 45° or more) and hold it there. Press the button and keep the pose for about 4 seconds.',
      step4Title: 'Step 4/6 · Bend the lower leg back while standing',
      step4Desc:
        'Keep the thigh upright and **lift the heel back and up** (bend the knee) to a clear angle (about 45°), then hold. Press the button and keep the pose for about 4 seconds.',
      step5Title: 'Step 5/6 · Swing the leg outward (optional)',
      step5Display:
        'This step **only affects the display**: the 3D pose, the varus/valgus value and the sign in charts. **Target detection, rep counting and limit-range alerts do not use this data**, so skipping it does not leave calibration incomplete.',
      step5How:
        'This needs standing on one leg; skip it if balance is difficult. To do it: keep the whole leg straight, swing it **away from the body** by about 20–30° and hold, then press the button and hold for about 4 seconds. Thigh and lower leg are judged separately; if one side moves too little it keeps its current setting without affecting the other.',
      sideChanged: (p: { now: string; before: string }) =>
        `⚠ You chose "${p.now}" this time, but the last calibration used "${p.before}". "Outer side" is mirrored between legs, so **skipping this step keeps the varus/valgus direction from the other leg, which is now likely reversed** (display only; target and alert detection are unaffected). Completing this step is strongly recommended.`,
      step6Desc:
        'The direction correction is calculated but not applied yet. Move around to check it: **standing straight should read close to 0°, raising the thigh forward should make "Thigh" increase (positive), and swinging the leg outward should show "valgus"**. Apply once it looks right.',
      coupling: (p: { parts: string }) =>
        `⚠ Residual coupling detected (${p.parts}): during the outward swing the front-back angle also changed noticeably, not only varus/valgus. The swing should be a purely sideways movement. This usually means the sensor is mounted differently from what the wizard assumes (for example on the front instead of the outer side), so the calculated rotation may not fully correct the tilt. **You can still apply this calibration**, but recheck the mounting position when you next use the real device.`,
      thighDeltaTooSmall: 'Thigh movement too small (needs ≥ 20°). Move further and capture again',
      shinDeltaTooSmall: 'Lower-leg movement too small (needs ≥ 20°). Move further and capture again',
      thighPitch: 'Thigh pitch',
      shinPitch: 'Lower-leg pitch',
      kneeAngle: 'Knee angle',
      wizardHint:
        'The sensors do not have to sit perfectly straight: the wizard works out each flexion axis from two movements, raising the thigh and bending the lower leg back. Raise the thigh at least 20° (40–60° recommended) and keep the thigh still while bending the lower leg. Lateral direction only affects the 3D view and diagnostic values, not target or angle-range detection.'
    },
    angleRange: {
      comfortOutOfRange: 'Comfort angle must be between 0 and 180°',
      limitOutOfRange: 'Limit range must be between the comfort angle and 180°',
      sessionRunning: 'The angle range cannot change during a session'
    },
    noRangeTitle: 'Personal angle range not measured',
    noRangeBody:
      'Your comfort angle and limit range have not been measured, so this session will have no angle prompts or alerts. Measure them first under Settings → Modules → angle range measurement. Start the session anyway?',
    firmwareSessionLock:
      'Firmware cannot be updated during a session: writing flash briefly stalls sensor sampling and feedback, which is not safe while the patient is wearing the device. End the session first.'
  },

  guidance: {
    noData: 'Waiting for sensor data…',
    raise: (p: { verb: string; deg: string }) => `${p.verb} ${p.deg}° more`,
    lower: (p: { deg: string }) => `Come back ${p.deg}° into the target zone`,
    hold: (p: { held: string; total: string }) => `Hold! ${p.held}s / ${p.total}s`,
    returnToRest: (p: { deg: string }) => `Done! Return to the start position (${p.deg}° to go)`,
    atRest: 'Done! Back at the start position'
  },

  scenarios: {
    'rep-cycle': 'Normal session — three reps in a row',
    'over-limit': 'Limit range — knee bent past the personal limit for 45 s (measure the range first)',
    'hardware-error': 'Hardware error — ERR:1, then recovery',
    'truncated-link': 'MTU too small — every packet cut to 20 bytes',
    garbage: 'Corrupt packets — 1 garbled packet in every 10',
    dropout: 'Connection drop — packets stop, then the link is lost'
  },

  firmware: {
    deferredSession: 'Session in progress; firmware check postponed until it ends',
    incompatible: (p: { version: string }) => `Firmware ${p.version} needs a newer app. Update the app first`,
    alreadyFailed: (p: { version: string }) =>
      `Automatic update to ${p.version} already failed once. Update manually in Settings`,
    deferredStateChanged: 'State changed; firmware update postponed',
    done: (p: { version: string }) => `Device firmware updated to ${p.version}. The device is restarting`,
    deviceStateChanged: 'Device state changed; update postponed',
    updatingToast: (p: { version: string }) =>
      `Updating device firmware to ${p.version}. Do not close the app or power off the device`,
    errorToast: (p: { message: string }) => `Automatic firmware update: ${p.message}`
  },

  connection: {
    disconnected: 'Disconnected',
    connecting: 'Connecting…',
    deviceNotFound: 'Device not found',
    connectionFailed: 'Connection failed',
    reconnecting: (p: { attempt: number; max: number }) => `Reconnecting ${p.attempt}/${p.max}`,
    connected: (p: { name: string }) => `Connected · ${p.name}`
  },

  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    retry: 'Retry',
    start: 'Start',
    prevPage: 'Previous',
    nextPage: 'Next',
    backToList: '← Back to list',
    goToSettings: 'Go to Settings',
    advanced: 'Advanced',
    checking: 'Checking…',
    selectPlaceholder: 'Select…',
    noOptions: 'No options',
    connectDevice: 'Connect',
    disconnect: 'Disconnect',
    demoModeActive: 'Demo mode',
    endAndSaveSession: 'End and save session',
    followSystem: 'Follow system',
    notMeasured: 'Not measured',
    notSet: 'Not set',
    listSeparator: ', ',
    seconds: (p: { n: string }) => `${p.n} s`,
    reps: (p: { n: number }) => `${p.n} ${p.n === 1 ? 'rep' : 'reps'}`
  },

  nav: {
    ariaLabel: 'Main navigation',
    dashboard: 'Live',
    actions: 'Exercises',
    history: 'History',
    tools: 'Tools',
    settings: 'Settings'
  },

  app: {
    demoBanner: '⚠ Demo mode — the data on screen comes from a simulator, not real measurements',
    footerBrand: 'IRMS Smart Rehab Monitoring · BETA',
    footerDemo: 'Demo data · not real measurements',
    footerLocal: 'Stored on this device · telemetry off by default'
  },

  topNav: {
    connected: 'Device connected',
    demoTooltip: 'Demo mode is on, so a real device cannot be connected. Turn off demo mode in Settings first'
  },

  errorOverlay: {
    title: 'Hardware fault',
    lost: (p: { code: string }) => `Sensor I2C connection lost (${p.code}). Trying to reconnect…`,
    frozen: 'Live data is frozen and recording is paused so invalid readings are not saved.',
    hint: 'This alert clears on its own once the sensor reconnects. If it does not recover, end the session to keep the data recorded so far.'
  },

  errorBoundary: {
    title: '⚠ This section hit an error',
    body: (p: { name: string }) => `${p.name} cannot be shown, but the rest of the app still works.`,
    running: ' A session is in progress. End and save it first so the data is not left as an incomplete record.'
  },

  updateBanner: {
    ready: (p: { version: string }) => `Version ${p.version} is downloaded. Restart to apply it`,
    sessionNote: ' (session in progress; restart after it ends)',
    restartBlocked: 'You cannot restart during a session. This button becomes available once the session ends',
    restartNow: 'Restart now'
  },

  pose: {
    ariaLabel: 'Side view of the leg pose',
    forward: 'Front →',
    sensorFault: 'Sensor fault · pose unavailable',
    noData: 'No live data yet'
  },

  tools: {
    title: 'Tools',
    subtitle: 'Pages provided by installed modules. Install, enable and update modules in Settings → Modules.',
    empty: 'No module provides a page yet',
    groupAria: 'Modules',
    panelFailed: (p: { message: string }) => `Module page failed to load: ${p.message}`
  },

  modules: {
    heading: 'Modules',
    intro:
      'First-party modules are published by IRMS-Modules, downloaded at startup and signature-checked, so they update without reinstalling the app. This page only manages modules: re-enabling loads a module immediately, and module pages are on the Tools tab.',
    check: 'Check for module updates',
    upToDate: (p: { time: string }) => `Up to date (${p.time})`,
    updatesFound: (p: { count: number; list: string }) =>
      `${p.count} ${p.count === 1 ? 'update' : 'updates'} downloaded. Restart the app to apply: ${p.list}`,
    newInstall: 'new ',
    syncing: 'Syncing modules…',
    syncFailed: (p: { error: string }) => `Module sync failed: ${p.error}`,
    offline: 'Offline; using the verified modules on this device.',
    none: 'No modules available.',
    loadFailed: (p: { error: string }) => ` · failed to load: ${p.error}`,
    enableAria: (p: { name: string }) => `Enable ${p.name}`,
    enabled: 'On',
    disabled: 'Off',
    loading: 'Loading…',
    openModule: (p: { name: string }) => `Open ${p.name}`,
    noActivate: 'The module does not export activate()'
  },

  telemetry: {
    heading: 'Telemetry upload',
    confirmTitle: 'Turn on live telemetry upload?',
    confirmBody:
      'The exercise name is uploaded when a session starts. If you have named exercises after patients or other people, rename them on the Exercises page first, or leave upload off. Nothing else that is uploaded contains names, accounts or the computer name. You can turn it off at any time.',
    enabledToast: 'Live telemetry upload is on',
    intro:
      'When on, the app uploads live data to the IRMS development team’s server to diagnose sensor and connection problems and improve the app. You can turn it off at any time; data not yet sent is discarded.',
    sent: 'Uploaded: raw sensor angle packets, connect/disconnect status, firmware update status, session start and end (with exercise name, target parameters and calibration parameters) and app logs. You choose exercise names yourself; do not use patient or personal names.',
    notSent: 'Not uploaded: names, accounts, the computer name or anything else that directly identifies you. Each app launch uses a new random ID.',
    retention: 'The server deletes data after 90 days. Local records are kept as usual, and upload failures do not affect measurement.',
    toggle: 'Upload live telemetry',
    status: (p: { sent: number; pending: number }) => `Sent ${p.sent} · pending ${p.pending}`,
    dropped: (p: { n: number }) => ` · discarded ${p.n}`,
    lastError: (p: { error: string }) => ` · last failure: ${p.error}`,
    runId: (p: { id: string }) => `Run ID: ${p.id} (give this to the developers when reporting a problem)`,
    endpoint: 'Server URL',
    endpointHint: 'Usually no need to change this. It is locked while upload is on; turn upload off first.'
  },

  sessionDock: {
    blocker: {
      running: 'Session in progress',
      protocolUnsupported: 'Protocol not supported yet',
      firmwareUpdating: 'Updating firmware',
      notConnected: 'Connect a device first',
      noAction: 'Select an exercise first',
      notCalibrated: 'Calibrate first'
    },
    firmwareUpdatingPct: (p: { pct: number }) => `Updating firmware ${p.pct}%`,
    started: 'Session started',
    startFailed: 'Could not start the session',
    ended: 'Session ended and saved',
    completed: 'Completed',
    repsUnit: ' reps',
    currentHold: 'Current hold',
    holdOf: (p: { total: string }) => ` / ${p.total} s`,
    sessionTime: 'Session time',
    end: 'End session',
    action: 'Exercise',
    noActions: 'No exercises for this protocol',
    selectAction: 'Select an exercise',
    target: 'Target (°)',
    tolerance: 'Tolerance (±°)',
    hold: 'Hold (s)',
    calibrate: 'Calibrate',
    start: 'Start session'
  },

  dashboard: {
    title: 'Live monitoring',
    subtitle: (p: { metric: string; trigger: string; zone: string; hold: string }) =>
      `${p.metric} · ${p.trigger} · target ${p.zone} · hold ${p.hold} s`,
    calibratedChip: (p: { time: string }) => `✓ Calibrated · ${p.time}`,
    recalibrate: 'Recalibrate',
    notCalibratedChip: '! Not calibrated · Calibrate',
    liveAria: 'Live monitoring',
    protocolUnsupported: 'Protocol not supported yet',
    notConnected: 'Device not connected',
    notConnectedSub: 'Connect a device from the top right',
    notCalibrated: 'Calibrate first',
    notCalibratedSub: 'Without calibration the angle direction and size may be wrong. Calibrate before starting a session',
    selectAction: 'Select an exercise',
    selectActionSub: 'Choose an exercise below',
    ready: 'Ready to start',
    readySub: 'Check the exercise and settings, then press "Start session"',
    holdRemain: (p: { sec: string }) => `Hold ${p.sec} s more`,
    repNumber: (p: { n: number }) => `Rep ${p.n}`,
    metricLabel: (p: { label: string }) => `Primary metric · ${p.label}`,
    zoneSuffix: ' target zone · ',
    sensorValues: 'Sensor values',
    poseTitle: 'Pose',
    poseAria: 'Pose view',
    view2d: '2D side',
    values: 'Values',
    loading3d: 'Loading 3D…',
    notCalibratedCaption: '! Not calibrated'
  },

  actions: {
    title: 'Exercises',
    subtitle:
      'Each exercise states its target and hold time. Comfort angle and limit range are personal measurements and are not set per exercise.',
    nameRequired: 'Exercise name is required',
    updated: 'Exercise updated',
    created: 'Exercise created',
    saveFailed: 'Save failed',
    deleteTitle: 'Delete exercise',
    deleteBody: (p: { name: string }) => `Delete "${p.name}"? This cannot be undone.`,
    deleted: 'Exercise deleted',
    restoreTitle: 'Restore defaults',
    restoreBody: 'This deletes all custom exercises and recreates the default templates. Continue?',
    restored: 'Default exercise templates restored',
    restore: 'Restore defaults',
    add: '+ New exercise',
    searchPlaceholder: 'Search name or description…',
    searchAria: 'Search exercises',
    sortName: 'By name',
    sortTarget: 'By target',
    sortCreated: 'By date added',
    groupNone: 'No grouping',
    groupTrigger: 'By detection',
    emptyProtocol: 'No exercise templates for this protocol',
    loadDefaults: 'Load default templates',
    noMatch: (p: { query: string }) => `No exercises match "${p.query}"`,
    clearSearch: 'Clear search',
    target: 'Target',
    hold: 'Hold',
    pager: (p: { total: number; page: number; pages: number }) =>
      `${p.total} ${p.total === 1 ? 'exercise' : 'exercises'} · page ${p.page} / ${p.pages}`,
    inspectorAria: 'Exercise details',
    editTitle: 'Edit exercise',
    newTitle: 'New exercise',
    name: 'Exercise name',
    description: 'Description',
    triggerRule: 'Detection rule',
    targetDeg: 'Target (°)',
    tolerance: 'Tolerance (±°)',
    holdSec: 'Hold (s)',
    currentMetric: (p: { label: string }) => `Current ${p.label}: `,
    capture: 'Use current angle as target',
    captureHint:
      'With a device connected, the patient can hold the target pose and you can capture the angle in one tap instead of typing it',
    noDescription: 'No description.',
    useLive: 'Use in live monitoring',
    emptyInspector: 'Select an exercise on the left to see it, or create a new one.'
  },

  history: {
    title: 'Session history',
    subtitle: 'Prescription, reps and source for every session. Choose "Review" for the full analysis.',
    exported: 'Session exported',
    exportFailed: (p: { message: string }) => `Export failed: ${p.message}`,
    loadFailed: 'Could not load history',
    deleteTitle: 'Delete session',
    deleteBody: (p: { id: number }) => `Delete the record of session #${p.id}?`,
    deleted: (p: { id: number }) => `Session #${p.id} deleted`,
    targetMin: 'Target min',
    targetMax: 'Target max',
    chartAria: (p: { label: string }) => `${p.label} over time`,
    reps: 'Reps completed',
    peak: (p: { label: string }) => `Peak ${p.label}`,
    mean: 'Mean',
    inZone: 'Time in target zone',
    overLimitValue: (p: { events: number; sec: string }) => `${p.events}× · ${p.sec} s`,
    active: 'Measured time',
    reviewTitle: 'Session review',
    unknownAction: 'Unknown exercise',
    sessionNo: (p: { id: number }) => `Session #${p.id}`,
    demoSuffix: ' · demo data',
    export: 'Export',
    summaryAria: 'Session summary',
    detailsAria: 'Session details',
    abandonedNote:
      'This session did not end normally (window closed or crash). The end time is estimated and the rep count may be incomplete.',
    prescription: 'Prescription (as used)',
    trigger: 'Detection',
    legacy: '— (legacy data)',
    hold: 'Hold',
    duration: 'Duration',
    calibration: 'Calibration',
    noSnapshot: 'No calibration snapshot (recorded before this feature), so comparability cannot be confirmed.',
    drift: (p: { keys: string }) =>
      `Calibration changed: this session's ${p.keys} differ from the current settings. The curve's zero or direction may not match today's, so do not compare it directly with recent sessions.`,
    sameCalibration: 'Same as the current calibration.',
    perRep: 'Per-rep analysis',
    perRepNote:
      'Sessions currently store only the continuous angle and the rep count, not when each rep starts and ends, so per-rep peaks and hold times are not shown rather than implying precision the data does not have.',
    colStart: 'Started',
    colAction: 'Exercise',
    colDone: 'Reps',
    colDuration: 'Duration',
    colOps: 'Actions',
    empty: 'No sessions yet',
    demoBadgeTitle: 'This session is simulated demo-mode data, not a real measurement',
    demoBadge: 'Demo',
    abandonedTitle:
      'This session did not end normally (window closed or crash). The end time is estimated and the rep count may be incomplete',
    abandonedBadge: 'Interrupted',
    review: 'Review',
    deleteAria: (p: { id: number }) => `Delete session #${p.id}`,
    pager: (p: { total: number; page: number; pages: number }) =>
      `${p.total} ${p.total === 1 ? 'session' : 'sessions'} · page ${p.page} / ${p.pages}`
  },

  calibration: {
    title: 'Sensor calibration wizard',
    unstable: 'Movement detected. Hold still during capture and try again',
    singularBaseline:
      'In this standing pose a sensor is in a measurement singularity (pitch/roll near 90°), so tiny noise makes the angle jump. The faulty correction was not applied. Update to sensor firmware that reports the raw gravity vector, or adjust the sensor mounting surface following the hardware installation guide, then try again.',
    insufficientData: 'Not enough sensor data. Check the device connection and try again',
    shaking: 'Movement detected. Hold still and try again',
    applied: 'Calibration done and applied to detection and the 3D/2D views',
    capturing: 'Capturing…',
    captureButton: 'Capture (3 s countdown)',
    handsFree: (p: { sec: string }) => `Hands-free capture: hold the pose steady for ${p.sec} s to start automatically`,
    back: '← Previous step (recapture)',
    step1Title: 'Step 1/6 · Check sensor placement',
    notConnected: '⚠ Device not connected. Connect it from the top bar first.',
    chooseSide: 'Choose a leg first.',
    mtuTruncated:
      '⚠ BLE MTU negotiation failed, so coronal-plane (roll) data is not arriving and always reads 0°. This step calibrates exactly that roll direction, so doing it now would give a meaningless result; skip it. You can correct the display direction after reconnecting or reflashing the firmware.',
    skip: 'Skip and finish calibration',
    calibrateAnyway: 'Calibrate display direction anyway (3 s countdown)',
    step6Title: 'Step 6/6 · Preview and confirm',
    recalibrate: 'Recalibrate',
    apply: 'Apply'
  },

  settings: {
    title: 'Settings',
    subtitle: 'Device setup and data choices each have their own place.',
    indexAria: 'Settings categories',
    footer: 'Settings are saved on this device immediately',
    back: 'Back to monitoring',
    categories: {
      device: { label: 'Device', title: 'Device & connection', hint: 'Connection status and detection protocol' },
      calibration: { label: 'Calibration', title: 'Sensor calibration', hint: 'Zero position, flexion axes and mounting' },
      display: { label: 'Display', title: 'Display', hint: 'Language, theme, pose view and charts' },
      software: { label: 'Updates', title: 'Software & firmware updates', hint: 'App update channel and device firmware' },
      modules: { label: 'Modules', title: 'Feature modules', hint: 'First-party modules and their status' },
      privacy: { label: 'Privacy', title: 'Data & privacy', hint: 'Live telemetry upload (off by default)' },
      demo: { label: 'Demo mode', title: 'Demo mode', hint: 'Full walkthrough without hardware' }
    },
    device: {
      heading: 'Device',
      sensorFault: (p: { code: string }) => ` · sensor fault ${p.code}`,
      connectHint: 'Being connected only means data is arriving; whether the angles can be trusted depends on calibration.',
      protocol: 'Detection protocol',
      protocolHint: 'Detection supports the knee only for now; other protocols block starting a session.'
    },
    calibration: {
      noLiveData: 'No live data yet, so zeroing is not possible',
      quickZeroPitchOnly: 'Quick zero applied (pitch only: BLE did not deliver roll data)',
      quickZeroFull: 'Quick zero applied (including roll)',
      zeroCaptured: 'Zero position captured',
      thighAxis: 'Thigh axis set',
      shinAxis: 'Lower-leg axis set',
      rollVerified: 'Lateral direction verified',
      wizard: 'Calibration wizard',
      lastCalibrated: (p: { time: string }) => `Last calibrated: ${p.time}`,
      notCalibrated: 'Not calibrated. Sessions cannot start until you calibrate',
      recalibrate: 'Recalibrate',
      start: 'Start calibration',
      needConnection: 'Calibration needs live sensor values. Connect a device first.',
      locked:
        "Calibration cannot change during a session; all of a session's data must come from one set of conversions. End the session first.",
      manualSummary: 'Advanced manual calibration (use the wizard in most cases)',
      manualHint:
        'The Zero fields are the raw sensor readings while standing straight, not offsets to add or subtract. In most cases use "Quick zero".',
      invertThigh: 'Invert Thigh',
      invertShin: 'Invert Shin',
      quickZero: 'Quick zero'
    },
    display: {
      language: 'Language',
      languageHint: '"Follow system" uses the operating system language; unsupported languages show Traditional Chinese.',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      poseDefault: 'Default pose view',
      pose2d: '2D side (recommended)',
      poseHint: '2D shows only flexion/extension in the detection plane. 3D lateral angles are unvalidated and show direction only.',
      maxChartPoints: 'Max live chart points',
      flushInterval: 'Data write interval (s)'
    },
    autoPhase: {
      idle: 'Checks automatically once a device connects',
      checking: 'Checking for the latest firmware…',
      up_to_date: 'Up to date',
      deferred: 'Session in progress; will check after it ends',
      incompatible: 'The latest firmware needs a newer app',
      downloading: 'Downloading and verifying firmware…',
      updating: 'Sending to the device',
      done: 'Update complete; the device is restarting',
      error: 'Automatic update failed'
    },
    autoLabel: 'Automatic update (when idle): ',
    autoVersions: (p: { device: string; latest: string }) => ` · device ${p.device} / latest ${p.latest}`,
    unknownOldFirmware: 'unknown (old firmware)',
    updateStatus: {
      checking: 'Checking…',
      available: (p: { version: string }) => `Found version ${p.version}; preparing to download…`,
      downloading: (p: { pct: number }) => `Downloading… ${p.pct}%`,
      downloaded: (p: { version: string }) => `Version ${p.version} downloaded. Use the banner below to restart and apply it`,
      notAvailable: 'You have the latest version',
      error: (p: { message: string }) => `Check failed: ${p.message}`
    },
    software: {
      heading: 'Software update',
      intro:
        'New versions download in the background without an installer. When a download finishes, a prompt appears at the bottom; restart to apply it (or just close the app and it applies on the next start).',
      currentVersion: (p: { version: string }) => `Current version: ${p.version}`,
      downloadedWaiting: 'Downloaded, waiting to apply',
      processing: 'Updating…',
      checkNow: 'Check for updates',
      beta: 'Receive beta updates',
      betaHint:
        'When off, only stable releases are offered. The installed version is not affected; this only changes which kind of version the next automatic update delivers.'
    },
    firmware: {
      heading: 'Firmware update',
      intro:
        'Pushes new firmware to the ESP32 over the existing BLE connection, instead of opening the device and flashing it over USB (COM7) every time. See the OTA entry in OPTIMIZATION.md for the transfer protocol and safety notes.',
      needDevice: 'Connect a real device from the top bar first',
      demoNoFirmware: 'Demo mode has no real device, so firmware cannot be updated',
      deviceNotConnected: 'Device not connected',
      readFailedOld: 'Read failed; the device may have old firmware without OTA support',
      readFileFailed: (p: { message: string }) => `Could not read firmware: ${p.message}`,
      emptyFile: 'The selected file is empty. Choose a .bin file again',
      sameVersionWarn: (p: { version: string }) =>
        `\n⚠ The version label matches the device's current version (${p.version}). Flash it again anyway?`,
      confirmTitle: 'Update device firmware?',
      confirmBody: (p: { kb: string; warn: string }) =>
        `About to send ${p.kb} KB of firmware to the connected device over BLE. Do not close the app or power off the device during the transfer. ` +
        `An interruption will not brick the device (the new firmware goes to an inactive partition and the working version stays bootable on failure), ` +
        `but this update will fail and must be restarted.${p.warn}`,
      abortSent: 'Abort command sent',
      querying: 'Checking…',
      queryVersion: 'Check device version',
      deviceVersion: (p: { version: string }) => `Device version: ${p.version}`,
      pickFile: 'Choose firmware file (.bin)',
      labelField: 'Version label for this file (optional, for comparison only)',
      labelPlaceholder: 'e.g. 1.0.1',
      starting: 'Starting update…',
      transferring: (p: { pct: number }) => `Transferring… ${p.pct}%`,
      finalizing: 'Written; the device is verifying…',
      done: '✅ Done; the device is restarting',
      failed: 'Update failed',
      aborted: 'Aborted',
      start: 'Start update',
      abort: 'Abort'
    },
    demo: {
      heading: 'Demo mode',
      intro:
        'Rehearse the full flow without hardware: live gauge, target detection, comfort-angle and limit-range prompts, calibration wizard, history and export. The data comes from a simulator and is clearly marked so it cannot be mistaken for real measurements.',
      confirmTitle: 'Turn on demo mode?',
      confirmBody:
        'Data in this mode comes from a simulator, not real measurements. Sessions it creates are marked "demo data" and written to the database, and you can clear them at any time with the button below. A real device cannot be connected while demo mode is on.',
      purgeTitle: 'Clear all demo sessions?',
      purgeBody: 'Permanently deletes every session marked "demo data" and its sensor data. Real measurements are not affected.',
      purged: (p: { n: number }) => `Cleared ${p.n} demo ${p.n === 1 ? 'session' : 'sessions'}`,
      nothingToPurge: 'No demo sessions to clear',
      purgeFailed: (p: { message: string }) => `Clear failed: ${p.message}`,
      scenario: 'Scenario',
      end: 'Turn off demo mode',
      start: 'Turn on demo mode',
      stopPlayback: 'Stop playback',
      startPlayback: 'Start playback',
      sessionLock:
        "Demo mode cannot be switched during a session. A session's source must stay the same throughout, or the database would hold a session that is half real and half simulated under a single label. End the session first.",
      purgeButton: 'Clear all demo sessions',
      purgeHint:
        'Demo sessions are deliberately not hidden from the history list: hidden data still exists in every copy of the database, it is just harder to notice. This button makes "is there still fake data in the database?" a question you can answer.'
    }
  },

  liveShare: {
    sessionRunning: 'Session in progress; remote setting changes are not accepted',
    notANumber: (p: { key: string }) => `${p.key} is not a valid number`
  }
} satisfies Messages
