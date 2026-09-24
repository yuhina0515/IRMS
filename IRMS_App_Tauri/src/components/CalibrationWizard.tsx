// 校準精靈:六個畫面(UI 標示 1/6–6/6),自動推導 invert/axisRotationDeg/offset。
// 其中第 2–5 步是擷取動作,第 1 步為佩戴確認、第 6 步為預覽。
// 套用前不寫任何 settings;最後一步以暫存 patch 即時預覽,
// 使用者確認「抬腿時數字變大」才寫入。
import { useEffect, useRef, useState } from 'react'
import type { RawAngles } from '@shared/protocol'
import { applyCalibration, useStore, type Settings } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import {
  buildCalibrationPatch,
  computeCaptureStats,
  CAPTURE_STD_LIMIT,
  CAPTURE_STD_LIMIT_ABDUCTION,
  CAPTURE_DELTA_MIN,
  CAPTURE_ROLL_DELTA_MIN,
  PITCH_AXES,
  ROLL_AXES,
  maxAxisDelta,
  type CaptureStats
} from '../services/calibration'
import { createTrailingThrottle } from '../services/uiThrottle'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useT } from '../i18n'
import { AlertIcon, CloseIcon } from './Icons'

const SAMPLE_COUNT = 30
const CAPTURE_TIMEOUT_MS = 3000
/** 步驟 6 預覽面板的重繪節流——只是給人看的靜態數字,不是擷取取樣來源(那條路徑
 * 直接用 useStore.subscribe,不經過 React state),25Hz 全速重繪整個 Liquid Glass
 * modal(含 backdrop-filter)沒有必要,是「確認頁卡頓」的根因 */
const PREVIEW_SYNC_MS = 80

/**
 * 免手觸發:姿勢連續穩定這麼久就自動開始擷取。
 *
 * 原本每一步都要求「維持姿勢」同時「按下滑鼠」,但第 3、4、5 步(前抬大腿、
 * 後勾小腿、單腳外展)正是拿不到滑鼠的姿勢——患者得先擺好、按鈕、再擺回去,
 * 而按鈕本身就會破壞剛擺好的姿勢。
 */
const AUTO_STABLE_MS = 1500
/** 判定穩定所需的最少樣本數(25Hz 下 1.5 秒約 37 筆,取保守值) */
const AUTO_MIN_SAMPLES = 20


const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 小腿貼裝位置示意圖(2026-09-15 會議)。
 *
 * 根因是「外側」對獨自作業的患者/照護者是個沒有骨性標記、沒有清楚邊界的模糊目標
 * (README §2.1 建議的貼法),而小腿的脛骨前緣是全身最容易自行盲摸定位的標記之一。
 * 與會三方交叉詰問後收斂於「不該用文字定義面向,該用圖示釘死一個解剖上好找的具體
 * 點」——這張圖只釘小腿:先用手指摸到脛骨前緣(小腿前側中央那條硬骨邊),感測器
 * 貼在緊鄰它旁邊(不要壓在骨頭邊緣本身上,會不舒服),不是貼在側面。大腿的標記點
 * 留待真機驗證後再定案(大腿沒有同等明確的骨性邊界),暫時維持原有文字指示。
 */
function ShinMountDiagram({ bone, hint }: { bone: string; hint: string }): JSX.Element {
  return (
    <svg className="shin-diagram" width="180" height="150" viewBox="0 0 180 150" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M28 4 C20 40 18 90 24 140 L72 140 C70 95 72 40 66 4 Z" strokeWidth="2" />
      <line x1="48" y1="10" x2="48" y2="138" strokeWidth="1" strokeDasharray="3 4" opacity="0.4" />
      <circle cx="46" cy="52" r="5" strokeWidth="2" />
      <line x1="51" y1="52" x2="80" y2="52" strokeWidth="1" />
      <text x="82" y="56" fontSize="11" fill="currentColor" stroke="none">
        {bone}
      </text>
      <text x="82" y="70" fontSize="10" fill="currentColor" stroke="none" opacity="0.7">
        {hint}
      </text>
    </svg>
  )
}

interface Props {
  onClose: () => void
}

export function CalibrationWizard({ onClose }: Props): JSX.Element {
  const t = useT()
  const w = t.wizard
  const isConnected = useStore((s) => s.isConnected)
  // BLE MTU 沒協商上去時 Roll 欄位根本沒送到,rawAngles 的兩個 roll 會恆為 0。
  // 這一步校的正是 roll 方向,拿一串 0 去算會得出一份看似成功、實則無意義的校準。
  const linkTruncated = useStore((s) => s.linkTruncated)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [patch, setPatch] = useState<Partial<Settings> | null>(null)
  /** 外展耦合殘留警示(2026-09-15 會議)——null 表示該軸未做外展或幅度不足,不是「沒問題」 */
  const [couplingWarning, setCouplingWarning] = useState<{
    proximal: boolean | null
    distal: boolean | null
  } | null>(null)
  /** 免手模式:擺好姿勢並穩住即自動擷取,不必伸手按滑鼠 */
  const [autoCapture, setAutoCapture] = useState(true)
  const capturesRef = useRef<{
    baseline?: CaptureStats
    thighRaise?: CaptureStats
    kneeFlex?: CaptureStats
  }>({})
  const cancelledRef = useRef(false)
  /** 已自動嘗試過的步驟——每步只放行一次,避免失敗後立刻重新武裝造成迴圈 */
  const autoTriedRef = useRef<Set<number>>(new Set())
  /** 步驟 6 預覽用的節流角度——僅在該步驟訂閱,其餘步驟不必為了沒人看的畫面陪著全速重繪 */
  const [previewRaw, setPreviewRaw] = useState<RawAngles | null>(null)
  /** 本次配戴側,步驟 1 要求選擇後才能開始 */
  const [wearSide, setWearSide] = useState<'left' | 'right' | null>(settings.wearSide)
  /** 進精靈當下已經套用的配戴側(而非本次選的)——用來判斷「這次是不是換邊了」 */
  const previousWearSideRef = useRef(settings.wearSide)

  useEffect(() => {
    // StrictMode(dev)會刻意 mount→unmount→remount 一次來抓漏清理的 bug;
    // 若只在 cleanup 設 true、不在 effect 本體重設回 false,這個旗標會在
    // 「模擬 unmount」後永久卡在 true,即使元件其實正常掛載中 —— 任何倒數
    // 都會在第一個 tick 後被誤判為「已取消」而提早返回,數字就此凍結。
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  /** 倒數 3 秒 → 收集 ~30 筆 rawAngles → 統計。stdLimit 依步驟不同(外展單腳站立較晃,門檻略寬)。 */
  const capture = async (stdLimit: number = CAPTURE_STD_LIMIT): Promise<CaptureStats | null> => {
    setErrMsg(null)
    setCapturing(true)
    for (let c = 3; c > 0; c--) {
      setCountdown(c)
      await delay(1000)
      if (cancelledRef.current) return null
    }
    setCountdown(null)

    const samples: RawAngles[] = []
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        unsub()
        resolve()
      }, CAPTURE_TIMEOUT_MS)
      const unsub = useStore.subscribe((s, prev) => {
        if (s.rawAngles && s.rawAngles !== prev.rawAngles) {
          samples.push(s.rawAngles)
          if (samples.length >= SAMPLE_COUNT) {
            clearTimeout(timer)
            unsub()
            resolve()
          }
        }
      })
    })
    setCapturing(false)
    if (cancelledRef.current) return null
    if (samples.length < 10) {
      setErrMsg(w.errors.notEnoughData)
      return null
    }
    const stats = computeCaptureStats(samples)
    if (stats.maxStdDev > stdLimit) {
      setErrMsg(w.errors.shaking)
      return null
    }
    return stats
  }

  const handleCapture = async (key: 'baseline' | 'thighRaise' | 'kneeFlex', nextStep: number): Promise<void> => {
    const stats = await capture()
    if (!stats) return
    capturesRef.current[key] = stats
    setStep(nextStep)
  }

  /** 最終步:外展捕捉(或跳過)→ 計算方向校正 patch → 預覽 */
  const finish = async (withAbduction: boolean): Promise<void> => {
    let abduction: CaptureStats | null = null
    if (withAbduction) {
      const stats = await capture(CAPTURE_STD_LIMIT_ABDUCTION)
      if (!stats) return
      abduction = stats
    }
    const { baseline, thighRaise, kneeFlex } = capturesRef.current
    if (!baseline || !thighRaise || !kneeFlex) return
    const result = buildCalibrationPatch(baseline, thighRaise, kneeFlex, abduction, settings)
    if (!result.ok) {
      setErrMsg(w.errors[result.error])
      // 幅度錯誤退回對應步驟重捕
      if (result.error === 'thighDeltaTooSmall') setStep(2)
      else if (result.error === 'shinDeltaTooSmall') setStep(3)
      return
    }
    setPatch({ ...result.patch, wearSide })
    setCouplingWarning(result.couplingWarning)
    setStep(5)
  }

  /**
   * 免手自動觸發。
   *
   * 只有「穩定」是不夠的:第 2–5 步若在患者還站直不動時就觸發,會把站姿當成
   * 抬腿姿勢捕捉下來,接著必然以「幅度不足」失敗。因此除了穩定,還要求姿勢
   * 相對站直基準確實移動過——這同時也讓「站著不動」不會誤觸外展步驟。
   */
  useEffect(() => {
    if (!autoCapture || capturing || !isConnected) return
    // 每一步只自動嘗試一次。失敗後若立刻重新武裝,患者會落入
    // 倒數 →「偵測到晃動」→ 倒數 的迴圈,而擷取期間按鈕全部 disabled、Esc 也停用,
    // 只剩約 1.35 秒的空檔可以按到按鈕——這正好打在平衡受限的患者身上。
    // 失敗就把控制權交還給人,由他自己決定重試或略過。
    if (autoTriedRef.current.has(step)) return
    const stepSpec: Record<
      number,
      {
        limit: number
        minDelta: number
        axes: readonly ('thigh' | 'shin' | 'thighRoll' | 'shinRoll')[]
        run: () => Promise<void>
      }
    > = {
      1: { limit: CAPTURE_STD_LIMIT, minDelta: 0, axes: [], run: () => handleCapture('baseline', 2) },
      2: {
        limit: CAPTURE_STD_LIMIT,
        minDelta: CAPTURE_DELTA_MIN,
        axes: PITCH_AXES,
        run: () => handleCapture('thighRaise', 3)
      },
      3: {
        limit: CAPTURE_STD_LIMIT,
        minDelta: CAPTURE_DELTA_MIN,
        axes: PITCH_AXES,
        run: () => handleCapture('kneeFlex', 4)
      },
      // 外展只看 roll。取四軸最大會讓這一步在上一步(後勾小腿)的殘留姿勢下
      // 直接自我觸發——pitch 早已遠超門檻,患者根本沒有外展過。
      // 改成只看 roll 之後,做不到外展的患者不會被自動擷取搶走「略過」的選擇,
      // 做得到的患者仍然享有免手擷取。
      4: {
        limit: CAPTURE_STD_LIMIT_ABDUCTION,
        minDelta: CAPTURE_ROLL_DELTA_MIN,
        axes: ROLL_AXES,
        run: () => finish(true)
      }
    }
    const spec = stepSpec[step]
    if (!spec) return

    const buf: { t: number; a: RawAngles }[] = []
    let fired = false
    const unsub = useStore.subscribe((s, prev) => {
      if (fired || !s.rawAngles || s.rawAngles === prev.rawAngles) return
      const now = Date.now()
      buf.push({ t: now, a: s.rawAngles })
      while (buf.length > 0 && now - buf[0].t > AUTO_STABLE_MS) buf.shift()
      if (buf.length < AUTO_MIN_SAMPLES || now - buf[0].t < AUTO_STABLE_MS * 0.9) return

      const stats = computeCaptureStats(buf.map((b) => b.a))
      if (stats.maxStdDev > spec.limit) return
      // 相對站直基準的實際移動量(取四軸最大);基準步驟本身不設此門檻
      if (spec.minDelta > 0) {
        const base = capturesRef.current.baseline
        if (!base) return
        if (maxAxisDelta(base.mean, stats.mean, spec.axes) < spec.minDelta) return
      }
      fired = true
      autoTriedRef.current.add(step)
      unsub()
      void spec.run()
    })
    return unsub
  }, [autoCapture, capturing, step, isConnected])

  // 步驟 6 預覽:節流訂閱 rawAngles,不採用元件層級的全速 hook——擷取步驟(0–4)
  // 完全不顯示這個值,陪著 25Hz 重繪整個 modal 純屬浪費,正是「確認頁卡頓」的成因
  useEffect(() => {
    if (step !== 5) return
    setPreviewRaw(useStore.getState().rawAngles)
    const throttle = createTrailingThrottle<RawAngles>(PREVIEW_SYNC_MS, setPreviewRaw)
    const unsub = useStore.subscribe((s, prev) => {
      if (s.rawAngles && s.rawAngles !== prev.rawAngles) throttle.queue(s.rawAngles)
    })
    return () => {
      unsub()
      throttle.cancel()
    }
  }, [step])

  // 擷取進行中不讓 Esc 中斷,避免倒數到一半被誤觸而不知道發生什麼事
  useEscapeKey(capturing ? null : onClose)

  const apply = (): void => {
    if (!patch) return
    setSettings({ ...patch, lastCalibratedAt: new Date().toISOString() })
    showToast(w.applied, 'success')
    onClose()
  }

  // 預覽:以暫存 patch 即時換算(尚未寫入 settings)
  const preview = patch && previewRaw ? applyCalibration(previewRaw, { ...settings, ...patch }) : null

  const sideName = (side: 'left' | 'right'): string => (side === 'left' ? t.common.left : t.common.right)
  const limbs = (proximal: boolean | null, distal: boolean | null): string =>
    [proximal && t.common.thigh, distal && t.common.shin].filter(Boolean).join(t.common.listSep)
  const title = (n: number, text: string): string => `${w.step(n)} · ${text}`
  const error = (msg: string | null): JSX.Element | null =>
    msg ? (
      <div className="notice notice--danger" role="alert">
        <AlertIcon />
        {msg}
      </div>
    ) : null

  const captureButton = (key: 'baseline' | 'thighRaise' | 'kneeFlex', next: number): JSX.Element => (
    <button type="button" className="btn btn--primary btn--lg" disabled={capturing} onClick={() => void handleCapture(key, next)}>
      {capturing ? (countdown != null ? `${countdown}…` : w.capturing) : w.captureButton}
    </button>
  )

  return (
    <div className="overlay">
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog__header">
          <h2 id="wizard-title" className="dialog__title">
            {w.title}
          </h2>
          <button type="button" className="btn btn--ghost btn--icon" aria-label={t.common.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="dialog__body">
          <div className="wizard-steps" aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={i <= step ? 'is-done' : undefined} />
            ))}
          </div>

          {/* 免手模式與返回:兩者都是為了「擺好姿勢的人拿不到滑鼠」這件事而存在 */}
          <div className="row row--between">
            <label className="check">
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={(e) => {
                  // 重新勾選視為「我要再試一次」——清掉已嘗試記錄,否則打開開關卻沒反應
                  if (e.target.checked) autoTriedRef.current.clear()
                  setAutoCapture(e.target.checked)
                }}
              />
              {w.autoCapture(AUTO_STABLE_MS / 1000)}
            </label>
            {step > 0 && step < 5 && (
              <button
                type="button"
                className="btn btn--sm"
                disabled={capturing}
                onClick={() => {
                  // 回上一步是明確的「重捕」意圖,該步必須重新允許自動擷取
                  autoTriedRef.current.delete(step - 1)
                  setStep(step - 1)
                }}
              >
                ← {w.back}
              </button>
            )}
          </div>

          {countdown != null && (
            <div className="wizard-count" aria-live="assertive">
              {countdown}
            </div>
          )}

          {step === 0 && (
            <div className="wizard-step">
              <h3>{title(1, w.s1.title)}</h3>
              <p>{w.s1.body}</p>
              <ShinMountDiagram bone={w.s1.diagramBone} hint={w.s1.diagramHint} />
              <p>{w.s1.side}</p>
              <div className="row">
                <button
                  type="button"
                  className={`btn btn--lg${wearSide === 'left' ? ' btn--selected' : ''}`}
                  aria-pressed={wearSide === 'left'}
                  onClick={() => setWearSide('left')}
                >
                  {t.common.left}
                </button>
                <button
                  type="button"
                  className={`btn btn--lg${wearSide === 'right' ? ' btn--selected' : ''}`}
                  aria-pressed={wearSide === 'right'}
                  onClick={() => setWearSide('right')}
                >
                  {t.common.right}
                </button>
              </div>
              {!isConnected && error(w.s1.notConnected)}
              {isConnected && wearSide == null && <p className="field__hint">{w.s1.chooseSide}</p>}
              <div>
                <button
                  type="button"
                  className="btn btn--primary btn--lg"
                  disabled={!isConnected || wearSide == null}
                  onClick={() => setStep(1)}
                >
                  {w.s1.start}
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="wizard-step">
              <h3>{title(2, w.s2.title)}</h3>
              <p>{w.s2.body}</p>
              {error(errMsg)}
              <div>{captureButton('baseline', 2)}</div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <h3>{title(3, w.s3.title)}</h3>
              <p>{w.s3.body}</p>
              {error(errMsg)}
              <div>{captureButton('thighRaise', 3)}</div>
            </div>
          )}

          {step === 3 && (
            <div className="wizard-step">
              <h3>{title(4, w.s4.title)}</h3>
              <p>{w.s4.body}</p>
              {error(errMsg)}
              <div>{captureButton('kneeFlex', 4)}</div>
            </div>
          )}

          {step === 4 && (
            <div className="wizard-step">
              {/* 全精靈唯一需要單腳站立的步驟,對平衡受限的患者最困難——而它校準的 roll invert
                  完全不進入判定路徑。因此明確標示為選配,且「略過」與「捕捉」同等份量。 */}
              <h3>{title(5, w.s5.title)}</h3>
              <div className="notice notice--info">{w.s5.displayOnly}</div>
              <p>{w.s5.body}</p>
              {wearSide != null && previousWearSideRef.current != null && wearSide !== previousWearSideRef.current && (
                <div className="notice notice--warning">
                  <AlertIcon />
                  {w.s5.sideChanged(sideName(wearSide), sideName(previousWearSideRef.current))}
                </div>
              )}
              {linkTruncated && (
                <div className="notice notice--warning">
                  <AlertIcon />
                  {w.s5.truncated}
                </div>
              )}
              {error(errMsg)}
              <div className="row">
                <button type="button" className="btn btn--primary btn--lg" disabled={capturing} onClick={() => void finish(false)}>
                  {w.s5.skip}
                </button>
                <button
                  type="button"
                  className="btn btn--lg"
                  disabled={capturing || linkTruncated}
                  onClick={() => void finish(true)}
                >
                  {capturing ? (countdown != null ? `${countdown}…` : w.capturing) : w.s5.doIt}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="wizard-step">
              <h3>{title(6, w.s6.title)}</h3>
              <p>{w.s6.body}</p>
              {couplingWarning != null && (couplingWarning.proximal || couplingWarning.distal) && (
                <div className="notice notice--warning">
                  <AlertIcon />
                  {w.s6.coupling(limbs(couplingWarning.proximal, couplingWarning.distal))}
                </div>
              )}
              <div className="wizard-preview">
                <div className="stat">
                  <div className="stat__label">{w.s6.thighPitch}</div>
                  <div className="stat__value">{preview ? `${preview.thigh.toFixed(1)}°` : '--'}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">{w.s6.shinPitch}</div>
                  <div className="stat__value">{preview ? `${preview.shin.toFixed(1)}°` : '--'}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">{w.s6.knee}</div>
                  <div className="stat__value">{preview ? `${preview.knee.toFixed(1)}°` : '--'}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">{w.s6.varusValgus}</div>
                  <div className="stat__value">
                    {preview
                      ? `${Math.abs(preview.kneeRoll).toFixed(1)}° ${preview.kneeRoll >= 0 ? t.dashboard.detail.valgus : t.dashboard.detail.varus}`
                      : '--'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {step === 5 && (
          <div className="dialog__footer">
            <button type="button" className="btn" onClick={() => setStep(1)}>
              {w.s6.recalibrate}
            </button>
            <button type="button" className="btn btn--primary" onClick={apply}>
              {w.s6.apply}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
