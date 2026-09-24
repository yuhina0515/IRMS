// UI 重建視覺驗證(2026-09-24):對 vite dev server 截圖,Tauri IPC 以 __TAURI_INTERNALS__ mock 取代。
// 不是 CI 的一部分(Linux 字型渲染與 Windows 不同),用來做改版前後的人工審閱與溢位檢查。
// 用法:
//   1. cd IRMS_App_Tauri && npx vite --port 1420   (另開一個終端)
//   2. 在任一暫存目錄 npm install playwright,把本檔複製過去
//   3. node visual-check.mjs <輸出資料夾>   (Chromium 路徑見 launch() 的 executablePath)
// 每張圖印出 ok 或 OVERFLOW(body 超出 viewport,違反「只有工作區可以捲動」)。
import { chromium } from 'playwright'

const BASE = 'http://localhost:1420/'
const OUT = process.argv[2]

const initMock = () => {
  const actions = [
    { id: 1, name: '深蹲屈膝', description: '站姿屈膝至目標角度並維持', protocol: 'knee', targetAngle: 90, tolerance: 10, holdTimeMs: 3000, triggerType: 'joint_angle', safetyLimit: null },
    { id: 2, name: '直膝抬腿', description: '保持膝伸直,將大腿抬至目標仰角', protocol: 'knee', targetAngle: 45, tolerance: 5, holdTimeMs: 2000, triggerType: 'segment_elevation', safetyLimit: 70 },
    { id: 3, name: '直膝後擺', description: '保持膝伸直,將大腿向後伸展至目標角度', protocol: 'knee', targetAngle: 15, tolerance: 5, holdTimeMs: 2000, triggerType: 'segment_extension', safetyLimit: null }
  ]
  const s = (o) => ({ id: 1, startTime: '2026-09-20T09:30:00.000Z', endTime: '2026-09-20T09:40:00.000Z', targetAngle: 90, tolerance: 10, holdTimeMs: 3000, actionId: 1, actionName: '深蹲屈膝', protocol: 'knee', repsCompleted: 12, safetyLimit: null, triggerType: 'joint_angle', calibration: null, abandoned: 0, source: 'device', ...o })
  const sessions = [s({ id: 14 }), s({ id: 13, actionName: '直膝抬腿', repsCompleted: 8, source: 'demo' }), s({ id: 12, repsCompleted: 3, abandoned: 1 })]
  let cb = 1
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    transformCallback: () => cb++,
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    invoke: async (cmd) => {
      if (cmd === 'actions_list') return actions
      if (cmd === 'sessions_list') return sessions
      if (cmd === 'sessions_get_data') return []
      if (cmd === 'plugin:event|listen') return cb++
      if (cmd.includes('version')) return '1.2.0-beta.10'
      if (cmd.startsWith('plugin:window|is_')) return false
      return null
    }
  }
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} }
}

async function setup(page, { theme = 'light', lang = 'zh-TW', focus = false, calibrated = true } = {}) {
  await page.addInitScript(initMock)
  await page.addInitScript(
    ([theme, lang, focus, calibrated]) => {
      localStorage.setItem(
        'irms-settings',
        JSON.stringify({
          state: { settings: { themeMode: theme, language: lang, focusMode: focus, lastCalibratedAt: calibrated ? '2026-09-20T09:00:00.000Z' : null, showTrendChart: true, show3D2DPose: true } },
          version: 13
        })
      )
    },
    [theme, lang, focus, calibrated]
  )
  await page.goto(BASE)
  await page.waitForSelector('.rail')
  await page.waitForTimeout(400)
}

async function setState(page, patch) {
  await page.evaluate(async (patch) => {
    const { useStore } = await import('/src/store/useStore.ts')
    const cur = useStore.getState()
    useStore.setState({ ...patch, session: { ...cur.session, ...(patch.session ?? {}) } })
    // 連線轉換會觸發 sessionController.resetFeedbackState()(清掉 alarmActive/holding),
    // 與真實流程一致;session 狀態因此在連線之後再套一次
    await new Promise((r) => setTimeout(r, 50))
    if (patch.session) useStore.setState({ session: { ...useStore.getState().session, ...patch.session } })
  }, patch)
  await page.waitForTimeout(250)
}

const angles = (knee) => ({ thigh: 42.3, shin: 42.3 - knee, knee, thighRoll: 1.2, shinRoll: -2.1, kneeRoll: -3.3 })
const connected = (knee, session = {}) => ({
  isConnected: true,
  deviceName: 'IRMS-Knee',
  selectedActionId: 1,
  angles: angles(knee),
  session: { running: true, reps: 4, elapsedSec: 312, holdProgress: 0, phase: 'idle', alarmActive: false, ...session }
})

async function shot(browser, name, { w = 1280, h = 720, ...opts } = {}, state, after) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  await setup(page, opts)
  if (state) await setState(page, state)
  if (after) await after(page)
  const overflow = await page.evaluate(() => ({ sw: document.body.scrollWidth, sh: document.body.scrollHeight, vw: innerWidth, vh: innerHeight }))
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(name, overflow.sw > overflow.vw || overflow.sh > overflow.vh ? `OVERFLOW ${JSON.stringify(overflow)}` : 'ok')
  await page.close()
}

const nav = (label) => async (page) => {
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForTimeout(500)
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
await shot(browser, '01-dashboard-disconnected-light', { calibrated: false })
await shot(browser, '02-dashboard-active-light', {}, connected(72))
await shot(browser, '03-dashboard-inzone-light', {}, connected(88))
await shot(browser, '04-dashboard-holding-light', {}, connected(91, { phase: 'holding', holdProgress: 55 }))
await shot(browser, '05-dashboard-alarm-light', {}, connected(117, { alarmActive: true }))
await shot(browser, '06-dashboard-alarm-dark', { theme: 'dark' }, connected(117, { alarmActive: true }))
await shot(browser, '07-dashboard-active-dark', { theme: 'dark' }, connected(72))
await shot(browser, '08-dashboard-focus-light', { focus: true }, connected(88))
await shot(browser, '09-dashboard-en-light', { lang: 'en' }, connected(72))
await shot(browser, '10-dashboard-1024x600', { w: 1024, h: 600 }, connected(72))
await shot(browser, '11-dashboard-evidence-open', { h: 1000 }, connected(72))
await shot(browser, '12-actions-light', {}, null, nav('動作'))
await shot(browser, '13-history-light', {}, null, nav('紀錄'))
await shot(browser, '14-settings-light', {}, null, nav('設定'))
await shot(browser, '15-settings-dark', { theme: 'dark' }, null, nav('設定'))
await shot(browser, '16-actions-en-dark', { theme: 'dark', lang: 'en' }, null, nav('Actions'))
await shot(browser, '17-dashboard-hwerror', {}, { ...connected(72), hardwareError: null }, async (page) => {
  await setState(page, { hardwareError: 'ERR:1' })
})
await shot(browser, '18-wizard-dialog', { calibrated: false }, { isConnected: true, deviceName: 'IRMS-Knee', selectedActionId: 1 }, async (page) => {
  await page.getByRole('button', { name: '啟動校準精靈' }).click()
  await page.waitForTimeout(400)
})
await shot(browser, '19-action-edit-dialog-dark', { theme: 'dark' }, null, async (page) => {
  await nav('動作')(page)
  await page.getByRole('button', { name: '編輯' }).first().click()
  await page.waitForTimeout(400)
})
await browser.close()
