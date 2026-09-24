// English locale. Typed as `Messages` (derived from zh-TW.ts) so a missing or extra key fails
// typecheck — the two language files cannot drift apart silently.
import type { Messages } from './zh-TW'

export const en: Messages = {
  meta: { languageName: 'English' },

  common: {
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    close: 'Close',
    edit: 'Edit',
    delete: 'Delete',
    retry: 'Retry',
    back: 'Back',
    none: '—',
    notSet: 'Not set',
    deg: (n) => `${n}°`,
    endAndSaveSession: 'End and save session',
    left: 'Left leg',
    right: 'Right leg',
    thigh: 'thigh',
    shin: 'shin',
    listSep: ', ',
    limbField: (limb, field) => (limb ? `${limb} ${field}` : field)
  },

  workspaces: {
    dashboard: { index: '01', short: 'Monitor', title: 'Live Monitoring' },
    actions: { index: '02', short: 'Actions', title: 'Action Protocols' },
    history: { index: '03', short: 'Sessions', title: 'Session Records' },
    settings: { index: '04', short: 'Settings', title: 'System Settings' }
  },

  shell: {
    navLabel: 'Main navigation',
    beta: 'BETA',
    focus: 'Focus',
    focusOn: 'Enter focus mode (hide evidence, enlarge the main reading)',
    focusOff: 'Exit focus mode',
    themeSystem: 'Theme: follow system',
    themeLight: 'Theme: Daylight',
    themeDark: 'Theme: Low-light',
    connect: 'Connect device',
    disconnect: 'Disconnect',
    demoActive: 'Demo mode',
    demoConnectBlocked: 'Demo mode is on, so a real device cannot be connected. End demo mode in Settings first.',
    statusConnected: 'Connected',
    statusDisconnected: 'Disconnected',
    statusConnecting: 'Connecting…',
    statusNotFound: 'Device not found',
    statusFailed: 'Connection failed',
    statusReconnecting: (attempt, max) => `Reconnecting ${attempt}/${max}`,
    demoBanner: 'Demo mode — the data on screen is simulated, not a real measurement',
    minimize: 'Minimize',
    maximize: 'Maximize',
    restore: 'Restore',
    closeWindow: 'Close'
  },

  protocols: {
    knee: 'Knee',
    elbow: 'Elbow (not yet supported)',
    shoulder: 'Shoulder (not yet supported)'
  },
  triggerTypes: {
    joint_angle: 'Joint angle in target',
    segment_elevation: 'Straight-leg raise',
    segment_extension: 'Straight-leg extension'
  },

  metrics: {
    kneeAngle: 'Knee angle',
    thighElevation: 'Thigh elevation',
    thighExtension: 'Thigh extension'
  },

  guidance: {
    noData: 'Waiting for sensor data…',
    overLimit: (excess) => `Over limit by ${excess}° — lower now`,
    straightenKnee: (excess) => `Straighten the knee ${excess}° more`,
    raise: (metric, delta) =>
      `${metric === 'kneeAngle' ? 'Bend' : metric === 'thighExtension' ? 'Extend' : 'Raise'} ${delta}° more`,
    lower: (delta) => `Lower ${delta}° into the target zone`,
    hold: (held, total) => `Hold! ${held}s / ${total}s`,
    returnToRest: (delta) => `Done! Return to start (${delta}° to go)`,
    atRest: 'Done! Back at start'
  },

  phase: { idle: 'Ready', holding: 'Hold', restPending: 'Return' },

  dashboard: {
    notCalibrated: 'Not calibrated — detection and display direction may be wrong',
    startWizard: 'Start calibration wizard',
    blocked: {
      hardwareError: {
        title: 'Sensor fault',
        body: 'The sensor I2C link dropped and the system is recovering. Live values are frozen and recording is paused.'
      },
      unsupported: {
        title: 'Protocol not supported yet',
        body: 'Only the knee is supported: the sensors sit on the thigh and shin, so the gauge and detection read leg angles.',
        action: 'Go to Settings'
      },
      disconnected: {
        title: 'Device not connected',
        body: 'Connect the wearable device to start monitoring.',
        action: 'Connect device'
      },
      noAction: {
        title: 'No action selected',
        body: 'Pick this session’s exercise from the list on the right, or create one in Action Protocols.',
        action: 'Go to Action Protocols'
      }
    },
    noActionName: 'No action selected',
    metricLabel: (label) => `Main reading: ${label}`,
    stale: 'Values are stale · reconnecting',
    unsupportedGauge: (label) => `Protocol not supported — the gauge still reads ${label}`,
    target: (min, max) => `Target ${min}–${max}°`,
    targetAtLeast: (min) => `Target ≥ ${min}°`,
    rest: (deg) => `Rest ≤ ${deg}°`,
    overLimitAt: (deg) => `Limit ${deg}°`,
    inZone: 'In target',
    kneeGate: (knee, max) => `Knee straight gate: ${knee}° / needs ≤ ${max}°`,
    alarmTitle: (excess) => `Over safety limit by ${excess}°`,
    alarmTitleNoValue: 'Over safety limit',
    silence: 'Silence 30 s',
    silenced: (sec) => `Silenced ${sec}s`,
    reps: 'Reps',
    hold: 'Hold',
    holdSeconds: (held, total) => `${held} / ${total}s`,
    evidence: 'Evidence',
    showEvidence: 'Show evidence',
    hideEvidence: 'Hide evidence',
    tabs: { chart: 'Trend', detail: 'Values', pose3d: '3D pose', pose2d: '2D pose' },
    detail: {
      thigh: 'Thigh',
      shin: 'Shin',
      knee: 'Knee',
      thighRoll: 'Thigh roll',
      shinRoll: 'Shin roll',
      varusValgus: 'Varus/valgus',
      valgus: 'valgus',
      varus: 'varus'
    }
  },

  session: {
    action: 'Action',
    noActionsInProtocol: 'No actions in this protocol',
    chooseAction: 'Choose an action',
    target: 'Target (°)',
    tolerance: 'Tolerance (±°)',
    holdMs: 'Hold (ms)',
    recording: 'Recording',
    start: 'Start session',
    end: 'End session',
    connectFirst: 'Connect a device first',
    unsupported: 'Protocol not supported yet',
    unsupportedHint:
      'Only the knee is supported. Starting a session under this protocol would record leg data as another joint, so it is blocked.',
    started: 'Session started',
    startFailed: 'Failed to start session',
    endedSaved: 'Session ended and saved',
    shortcutHint: 'Ctrl+Enter'
  },

  chart: {
    knee: 'Knee',
    thigh: 'Thigh',
    shin: 'Shin',
    varusValgus: 'Varus/valgus',
    targetMin: 'Target min',
    targetMax: 'Target max',
    overLimit: 'Safety limit',
    varusValgusDisplay: 'Varus/valgus (display only)'
  },

  actions: {
    subtitle: 'Manage exercise templates for each joint protocol',
    restoreDefaults: 'Restore defaults',
    create: 'New action',
    search: 'Search name or description…',
    sortLabel: 'Sort',
    groupLabel: 'Group',
    sortName: 'By name',
    sortTarget: 'By target angle',
    sortCreated: 'By creation order',
    groupNone: 'No grouping',
    groupTrigger: 'By rule type',
    emptyProtocol: 'This protocol has no action templates',
    loadDefaults: 'Load default templates',
    noMatch: (q) => `No action matches “${q}”`,
    clearSearch: 'Clear search',
    params: (target, tol, hold) => `Target ${target}° · Tolerance ±${tol}° · Hold ${hold}ms`,
    safetyLimit: 'Safety limit',
    safetyDerived: (deg) => `${deg}° (derived)`,
    editTitle: 'Edit action',
    createTitle: 'New action',
    name: 'Name',
    description: 'Description',
    triggerType: 'Rule',
    target: 'Target (°)',
    tolerance: 'Tolerance (±°)',
    holdMs: 'Hold (ms)',
    safetyLabel: (margin) => `Safety limit (°) — leave empty to use target + tolerance + ${margin}`,
    safetyPlaceholder: (deg) => `Not set (currently derived as ${deg}°)`,
    safetyHint:
      'Going past this angle triggers the continuous alarm. It is an anatomical ceiling, unrelated to whether a rep counts — widening the tolerance to make targets easier should not push this value out.',
    recordLive: (label) => `Current ${label}: `,
    recordCapture: 'Use current angle as target',
    recordHint: 'With a device connected, the patient can hold the target pose and you capture the angle in one click.',
    nameRequired: 'Name cannot be empty',
    updated: 'Action updated',
    created: 'Action created',
    saveFailed: 'Save failed',
    deleteTitle: 'Delete action',
    deleteConfirm: (name) => `Delete “${name}”? This cannot be undone.`,
    deleted: 'Action deleted',
    restoreTitle: 'Restore defaults',
    restoreConfirm: 'This removes all custom actions and rebuilds the default templates. Continue?',
    restored: 'Default action templates restored',
    protocolLabel: 'Protocol'
  },

  history: {
    subtitle: 'Review and analyse past sessions',
    empty: 'No sessions recorded yet',
    loadFailed: 'Failed to load sessions',
    colId: 'ID',
    colStart: 'Started',
    colAction: 'Action',
    colReps: 'Reps',
    colOps: 'Actions',
    analyze: 'Analyse',
    deleteLabel: (id) => `Delete session #${id}`,
    demoBadge: 'Demo',
    demoTitle: 'Simulated data from demo mode, not a real measurement',
    abandonedBadge: 'Incomplete',
    abandonedTitle: 'This session did not end normally (window closed or crash); the end time is estimated and reps may be incomplete',
    deleteTitle: 'Delete record',
    deleteConfirm: (id) => `Delete the record for session #${id}?`,
    deleted: (id) => `Session #${id} deleted`,
    analysisTitle: (id) => `Session #${id} analysis`,
    demoWarning: 'This is simulated demo data, not a real measurement. Do not use it for clinical interpretation.',
    noSnapshot: 'This session has no calibration snapshot (recorded before the feature existed), so it cannot be compared with the current setup.',
    drift: (fields) =>
      `This session’s calibration differs from the current settings (${fields}). The curve’s zero point or sign may not match today’s; do not compare it directly with recent records.`,
    legacyAxis: (limbs) =>
      `The ${limbs} mounting axis in this session was converted from the legacy calibration logic and has not been re-verified with real movement.`,
    pointsSummary: (points, reps) => `${points} points (downsampled) · ${reps} reps`,
    exportCsv: 'Export CSV',
    calibrationFields: {
      axisRotation: 'mount rotation',
      invert: 'invert',
      zero: 'zero',
      rollInvert: 'roll invert',
      rollZero: 'roll zero',
      kneeZero: 'knee zero',
      zeroAccel: 'gravity zero',
      hingeAxis: 'hinge axis'
    }
  },

  settings: {
    subtitle: 'Sensor calibration and system parameters',
    calibration: 'Sensor calibration',
    lastCalibrated: (when) => `Last wizard calibration: ${when}`,
    neverCalibrated: 'The calibration wizard has not been run — run it once to detect mounting direction and zero the sensors',
    rollUnverified: (limbs) =>
      `Varus/valgus (roll) display direction not verified by the abduction step: ${limbs}. Detection and alarms are unaffected; only the 3D pose, varus/valgus values and chart sign may be flipped.`,
    startWizard: 'Start calibration wizard',
    wizardNeedsConnection: 'Calibration needs live sensor values. Connect the device first.',
    calibrationLocked:
      'Calibration cannot change during a session — the whole session must use one transform. End the session first.',
    advanced: 'Advanced manual calibration (use the wizard in normal cases)',
    advancedHint:
      'Zero fields are the raw sensor reading while standing straight, not an offset to add — use Quick zero to fill them from the current pose.',
    thighZero: 'Thigh zero (raw °)',
    shinZero: 'Shin zero (raw °)',
    invertThigh: 'Invert thigh',
    invertShin: 'Invert shin',
    thighRollZero: 'Thigh roll zero (raw °)',
    shinRollZero: 'Shin roll zero (raw °)',
    invertThighRoll: 'Invert thigh roll',
    invertShinRoll: 'Invert shin roll',
    quickZero: 'Quick zero',
    quickZeroNoData: 'No live data yet — cannot zero',
    quickZeroPitchOnly: 'Quick zero applied (pitch only: BLE did not deliver roll data)',
    quickZeroDone: 'Quick zero applied (including roll)',
    appSideNote: 'Calibration is applied entirely in the app; the firmware only reports raw angles.',
    general: 'General',
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'Follow system',
    themeLight: 'Daylight',
    themeDark: 'Low-light',
    defaultProtocol: 'Default protocol',
    chartMaxPoints: 'Chart max points',
    flushInterval: 'Write interval (s)',
    showKneeRoll: 'Plot varus/valgus on the live chart',
    showKneeRollHint:
      'Uses a separate right-hand scale (±20°), positive = valgus, negative = varus. Not used for detection or alarms.',
    showTrendChart: 'Show trend chart on Monitor',
    show3D2DPose: 'Show 3D/2D pose on Monitor',
    evidenceHint: 'Both are off by default; turning them off does not stop data collection.',
    update: {
      title: 'Software update',
      body: 'New versions download in the background. When ready, a banner appears at the bottom — restart to apply, or it applies on next launch.',
      current: (v) => `Current version: ${v}`,
      check: 'Check for updates',
      checking: 'Checking…',
      available: (v) => `Version ${v} found, preparing download…`,
      downloading: (pct) => `Downloading… ${pct}%`,
      downloaded: (v) => `Version ${v} downloaded — restart from the banner below to apply`,
      upToDate: 'You are on the latest version',
      error: (msg) => `Check failed: ${msg}`,
      beta: 'Receive beta updates',
      betaHint: 'When off, only stable releases are offered; the installed version is unaffected.'
    },
    ota: {
      title: 'Device firmware update',
      risk: 'Risky',
      body: 'Push new firmware to the ESP32 over the existing BLE link instead of opening the device and flashing it over USB.',
      needConnection: 'Connect a real device first',
      demoBlocked: 'Demo mode has no real device, so firmware cannot be updated',
      sessionBlocked:
        'Firmware cannot be updated during a session — flash writes briefly stall sensor sampling and feedback while the patient is wearing the device. End the session first.',
      checkVersion: 'Read device version',
      checkingVersion: 'Reading…',
      deviceVersion: (v) => `Device version: ${v}`,
      versionReadFailed: 'Read failed — the device may run older firmware without OTA support',
      pickFile: 'Choose firmware file (.bin)',
      readFailed: (msg) => `Failed to read firmware: ${msg}`,
      label: 'Version label for this file (optional, for comparison only)',
      labelPlaceholder: 'e.g. 1.0.1',
      emptyFile: 'The selected file is empty — choose a .bin again',
      sameVersion: (v) => `\n⚠ The label matches the device’s current version (${v}). Flash it again anyway?`,
      confirmTitle: 'Start the firmware update?',
      confirmBody: (kb, warn) =>
        `About to send ${kb} KB of firmware to the connected device over BLE. Do not close the app or power off the device during transfer — an interruption will not brick it (the new image goes to an inactive partition and the old one stays bootable), but the update will fail and must be restarted.${warn}`,
      starting: 'Starting update…',
      transferring: (pct) => `Transferring… ${pct}%`,
      finalizing: 'Written — device is verifying…',
      done: 'Done — device is rebooting',
      failed: 'Update failed',
      aborted: 'Aborted',
      start: 'Start update',
      abort: 'Abort',
      abortSent: 'Abort command sent'
    },
    demo: {
      title: 'Demo mode',
      body: 'Rehearse the full flow without hardware: live gauge, rep detection, over-limit alarm, calibration wizard, records and export. Data is simulated and clearly labelled.',
      scenario: 'Scenario',
      enable: 'Enable demo mode',
      disable: 'End demo mode',
      play: 'Play',
      confirmTitle: 'Enable demo mode?',
      confirmBody:
        'Data in this mode is simulated, not measured. Sessions it creates are labelled “demo” and written to the database, and can be cleared with the button below. Real devices cannot be connected while it is on.',
      sessionBlocked:
        'Demo mode cannot be toggled during a session — a record must come from one source throughout. End the session first.',
      purge: 'Clear all demo records',
      purgeTitle: 'Clear all demo records?',
      purgeBody: 'Permanently deletes every session labelled as demo data and its sensor readings. Real measurements are unaffected.',
      purged: (n) => `Cleared ${n} demo records`,
      nothingToPurge: 'No demo records to clear',
      purgeFailed: (msg) => `Clear failed: ${msg}`,
      purgeHint: 'Demo records are deliberately not hidden from the list — this button makes “is there fake data in the database?” answerable.',
      scenarios: {
        'rep-cycle': 'Normal session — three reps in a row',
        'over-limit': 'Over-limit alarm — climbs past the limit and stays 45 s',
        'hardware-error': 'Hardware error — ERR:1 then recovery',
        'truncated-link': 'Small MTU — every packet cut to 20 bytes',
        garbage: 'Bad packets — 1 in 10 is garbage',
        dropout: 'Link loss — packets stop and the link drops'
      }
    }
  },

  wizard: {
    title: 'Sensor calibration wizard',
    autoCapture: (sec) => `Hands-free capture: hold the pose steady for ${sec} s and capture starts automatically`,
    back: 'Previous step (recapture)',
    step: (n) => `Step ${n}/6`,
    captureButton: 'Capture (3 s countdown)',
    capturing: 'Capturing…',
    errors: {
      unstable: 'Movement detected — stay still during capture and try again',
      singularBaseline:
        'The current stance puts a sensor in the measurement singularity (pitch/roll near 90°), where tiny noise makes the angle jump. Correction was not applied; update to firmware that sends the raw gravity vector, or remount the sensor per the hardware guide and retry.',
      thighDeltaTooSmall: 'Thigh movement too small (needs ≥ 20°) — move further and capture again',
      shinDeltaTooSmall: 'Shin movement too small (needs ≥ 20°) — move further and capture again',
      notEnoughData: 'Not enough sensor data — check the device connection and retry',
      shaking: 'Movement detected — stay still and retry'
    },
    s1: {
      title: 'Check mounting',
      body: 'Make sure both sensors are secured: the thigh sensor (with the ESP32, 0x69) on the outer thigh, and the shin sensor (0x68) right next to the front edge of the shinbone (see diagram — not on the side). Orientation does not matter — the wizard detects tilted mounting and inverted direction — but the sensors must not shift during the process.',
      diagramBone: 'Shinbone edge',
      diagramHint: '(mount next to it)',
      side: 'Choose which leg the sensors are on this time. “Outside” is mirrored between legs, so switching sides can flip varus/valgus; the wizard needs this to warn you at step 5.',
      notConnected: 'Device not connected — connect it first.',
      chooseSide: 'Choose a leg first.',
      start: 'Start'
    },
    s2: { title: 'Stand straight — capture zero', body: 'Stand naturally with both legs vertical, press the button and stay still for about 4 seconds.' },
    s3: {
      title: 'Raise the thigh forward',
      body: 'Raise the thigh forward (knee may bend) to a clear height (about 45° or more), hold it, then press the button and keep the pose for about 4 seconds.'
    },
    s4: {
      title: 'Bend the knee backward',
      body: 'Keep the thigh upright and lift the heel back and up (bend the knee) to about 45°, hold it, then press the button and keep the pose for about 4 seconds.'
    },
    s5: {
      title: 'Swing the leg outward (optional)',
      displayOnly:
        'This step only affects display: the 3D pose, varus/valgus values and chart sign. Rep detection, counting and the over-limit alarm do not use it, so skipping it leaves calibration complete.',
      body: 'Requires standing on one leg — skip it if balance is a concern. To do it: keep the leg straight, swing it about 20–30° out to the side, hold for about 4 seconds. Thigh and shin are judged separately; a side with too little movement keeps its current setting.',
      sideChanged: (now, before) =>
        `You chose “${now}” this time, but last calibration was “${before}”. Skipping this step keeps the varus/valgus direction from the other side, which is probably flipped now (display only, detection unaffected). Completing this step is strongly recommended.`,
      truncated:
        'BLE MTU negotiation failed, so coronal-plane (roll) data is not arriving and reads 0°. Doing this step now would produce a meaningless calibration — skip it.',
      skip: 'Skip and finish calibration',
      doIt: 'Calibrate display direction anyway (3 s countdown)'
    },
    s6: {
      title: 'Preview and confirm',
      body: 'The direction correction is computed but not applied yet. Try moving: standing straight should read about 0°, raising the thigh should increase “Thigh” (positive), and swinging the leg outward should show “valgus”. Apply once it looks right.',
      coupling: (limbs) =>
        `Residual coupling detected: during abduction the ${limbs} pitch also changed noticeably. The sensor is probably mounted differently from what the wizard assumes, so the computed rotation may not fully correct it. This does not block applying, but recheck the mounting later.`,
      thighPitch: 'Thigh pitch',
      shinPitch: 'Shin pitch',
      knee: 'Knee angle',
      varusValgus: 'Varus/valgus',
      recalibrate: 'Recalibrate',
      apply: 'Apply'
    },
    applied: 'Calibration applied to detection and the 3D/2D display'
  },

  dialogs: {
    errorBoundaryTitle: 'This section hit an error',
    errorBoundaryBody: (name) => `${name} cannot be shown, but the rest of the app still works.`,
    errorBoundaryRunning: 'A session is running — end and save it so the data is not left incomplete.',
    hwTitle: 'Hardware fault',
    hwBody: (code) =>
      `The sensor I2C link dropped (${code}); reconnecting… Live data is frozen and recording is paused to avoid storing invalid readings.`,
    hwHint: 'The warning clears once the sensor is back. If it does not recover, end the session to keep what was recorded.',
    updateReady: (v) => `Version ${v} is downloaded — restart to apply`,
    updateSessionRunning: ' (a session is running; restart after it ends)',
    updateRestartBlocked: 'Cannot restart during a session — this button re-enables when it ends',
    restartNow: 'Restart now',
    dropdownEmpty: 'No options',
    dropdownPlaceholder: 'Choose…'
  }
}
