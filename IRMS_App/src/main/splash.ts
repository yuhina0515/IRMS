// main/splash.ts — boot-splash window lifecycle: a small frameless/transparent/always-on-top
// window that plays the stage-1 logo animation, then grows its own bounds to match the real
// window and hands off to it. Windows has no native animated setBounds, so growth is done by
// stepping setBounds manually on a timer.
import { BrowserWindow, screen, type Rectangle } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IpcChannel } from '@shared/ipc'
import {
  SPLASH_ADVANCE_LEAD_MS,
  SPLASH_ASSEMBLY_FLOOR_MS,
  SPLASH_FRAME_FADE_OUT_MS,
  SPLASH_GROWTH_DURATION_MS
} from '@shared/splashTiming'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Splash now covers the whole primary display's work area (was a small 260×260 box) so the
 * renderer's finger/mainstem strokes have real off-screen space to travel in from — see
 * renderer/src/splash.ts's setupFullScreenAssembly(). It shares the exact same display/work-area
 * lookup `initialWindowSize()` (main/index.ts) uses for the real window, and mainWindow is created
 * with no explicit x/y — Electron auto-centers it on that same primary display — so the logo's
 * assembly point (screen center) and the real window's eventual center coincide without any
 * position math to keep in sync between the two files.
 */
export function createSplashWindow(): BrowserWindow {
  const work = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    x: work.x,
    y: work.y,
    width: work.width,
    height: work.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/splash.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  // Now that this window covers the whole screen, it would otherwise block every click on the
  // user's desktop underneath for the ~1.7s stage 1 + orbit floor takes to run.
  win.setIgnoreMouseEvents(true, { forward: true })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/splash.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/splash.html'))
  }

  return win
}

/** Waits for the splash page to finish loading; rejects on load failure so callers can fall back. */
export function waitForSplashReady(splash: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    splash.webContents.once('did-finish-load', () => resolve())
    splash.webContents.once('did-fail-load', (_e, code, description) => {
      reject(new Error(`splash did-fail-load: ${code} ${description}`))
    })
  })
}

/** No OS-level cross-platform API for this exists in main; the splash renderer already knows via matchMedia. */
export async function queryReducedMotion(splash: BrowserWindow): Promise<boolean> {
  if (splash.isDestroyed()) return true
  try {
    return await splash.webContents.executeJavaScript(
      "matchMedia('(prefers-reduced-motion: reduce)').matches"
    )
  } catch {
    return false
  }
}

/** How long stage 1 must stay visible before advancing, honoring reduced motion. */
export function assemblyFloorMs(reducedMotion: boolean): number {
  return reducedMotion ? 0 : SPLASH_ASSEMBLY_FLOOR_MS
}

async function animateBounds(
  win: BrowserWindow,
  from: Rectangle,
  to: Rectangle,
  durationMs: number
): Promise<void> {
  if (durationMs <= 0) {
    if (!win.isDestroyed()) win.setBounds(to)
    return
  }
  const frameMs = 16
  const steps = Math.max(1, Math.round(durationMs / frameMs))
  for (let i = 1; i <= steps; i++) {
    if (win.isDestroyed()) return
    const t = easeOutCubic(i / steps)
    win.setBounds({
      x: Math.round(from.x + (to.x - from.x) * t),
      y: Math.round(from.y + (to.y - from.y) * t),
      width: Math.round(from.width + (to.width - from.width) * t),
      height: Math.round(from.height + (to.height - from.height) * t)
    })
    await sleep(frameMs)
  }
  if (!win.isDestroyed()) win.setBounds(to)
}

/**
 * Stage 2: tells the splash renderer to cross-fade from logo to frame-border, grows the splash
 * window's real OS bounds to match mainWindow exactly (the border is a plain CSS `inset` div, so
 * it re-renders at the new size for free on every resize tick — no per-frame IPC needed), shows
 * mainWindow underneath it, then fades the border out and closes the splash.
 */
export async function handoffToMainWindow(
  splash: BrowserWindow,
  mainWindow: BrowserWindow,
  reducedMotion: boolean
): Promise<void> {
  const from = splash.getBounds()
  const to = mainWindow.getBounds()

  splash.webContents.send(IpcChannel.SPLASH_ADVANCE)
  await sleep(reducedMotion ? 0 : SPLASH_ADVANCE_LEAD_MS)
  await animateBounds(splash, from, to, reducedMotion ? 0 : SPLASH_GROWTH_DURATION_MS)

  if (!mainWindow.isDestroyed()) mainWindow.show()
  if (splash.isDestroyed()) return

  splash.webContents.send(IpcChannel.SPLASH_FADE_OUT_FRAME)
  await sleep(reducedMotion ? 0 : SPLASH_FRAME_FADE_OUT_MS)
  if (!splash.isDestroyed()) splash.close()
}
