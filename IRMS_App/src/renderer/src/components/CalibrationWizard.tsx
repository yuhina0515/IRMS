// 校準精靈:五步引導,自動推導 invert/offset。套用前不寫任何 settings;
// 最後一步以暫存 patch 即時預覽,使用者確認「抬腿時數字變大」才寫入。
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
  type CalibrationError,
  type CaptureStats
} from '../services/calibration'
import { useEscapeKey } from '../hooks/useEscapeKey'

const SAMPLE_COUNT = 30
const CAPTURE_TIMEOUT_MS = 3000

/**
 * 免手觸發:姿勢連續穩定這麼久就自動開始擷取。
 *
 * 原本每一步都要求「維持姿勢」同時「按下滑鼠」,但第 3、4、5 步(前抬大腿、
 * 後勾小腿、單腳外展)正是拿不到滑鼠的姿勢——患者得先擺好、按鈕、再擺回去,
 * 而按鈕本身就會破壞剛擺好的姿勢(2026-08-01 意見清單 #16)。
 */
const AUTO_STABLE_MS = 1500
/** 判定穩定所需的最少樣本數(25Hz 下 1.5 秒約 37 筆,取保守值) */
const AUTO_MIN_SAMPLES = 20

const ERROR_TEXT: Record<CalibrationError, string> = {
  unstable: '偵測到晃動,請於捕捉期間保持靜止後重試',
  thighDeltaTooSmall: '大腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉',
  shinDeltaTooSmall: '小腿動作幅度不足(需 ≥ 20°),請加大幅度重新捕捉'
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Props {
  onClose: () => void
}

export function CalibrationWizard({ onClose }: Props): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const rawAngles = useStore((s) => s.rawAngles)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const showToast = useUiStore((s) => s.showToast)

  const [step, setStep] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [patch, setPatch] = useState<Partial<Settings> | null>(null)
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
      setErrMsg('感測資料不足,請確認裝置連線正常後重試')
      return null
    }
    const stats = computeCaptureStats(samples)
    if (stats.maxStdDev > stdLimit) {
      setErrMsg('偵測到晃動,請保持靜止後重試')
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
      setErrMsg(ERROR_TEXT[result.error])
      // 幅度錯誤退回對應步驟重捕
      if (result.error === 'thighDeltaTooSmall') setStep(2)
      else if (result.error === 'shinDeltaTooSmall') setStep(3)
      return
    }
    setPatch(result.patch)
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
      { limit: number; minDelta: number; axes: readonly (keyof RawAngles)[]; run: () => Promise<void> }
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

  // 擷取進行中不讓 Esc 中斷,避免倒數到一半被誤觸而不知道發生什麼事
  useEscapeKey(capturing ? null : onClose)

  const apply = (): void => {
    if (!patch) return
    setSettings({ ...patch, lastCalibratedAt: new Date().toISOString() })
    showToast('校準完成,已套用至偵測與 3D/2D 顯示', 'success')
    onClose()
  }

  // 預覽:以暫存 patch 即時換算(尚未寫入 settings)
  const preview = patch && rawAngles ? applyCalibration(rawAngles, { ...settings, ...patch }) : null

  const captureButton = (key: 'baseline' | 'thighRaise' | 'kneeFlex', next: number): JSX.Element => (
    <button className="btn btn-primary" disabled={capturing} onClick={() => void handleCapture(key, next)}>
      {capturing ? (countdown != null ? `${countdown}…` : '捕捉中…') : '開始捕捉(倒數 3 秒)'}
    </button>
  )

  return (
    <div className="overlay">
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>感測器校準精靈</h3>
          <button className="close-x" onClick={onClose}>
            ×
          </button>
        </div>

        {/* 免手模式與返回:兩者都是為了「擺好姿勢的人拿不到滑鼠」這件事而存在 */}
        <div className="wizard-toolbar">
          <label className="wizard-auto">
            <input
              type="checkbox"
              checked={autoCapture}
              onChange={(e) => {
                // 重新勾選視為「我要再試一次」——清掉已嘗試記錄,否則打開開關卻沒反應
                if (e.target.checked) autoTriedRef.current.clear()
                setAutoCapture(e.target.checked)
              }}
            />
            免手擷取:擺好姿勢並穩住 {AUTO_STABLE_MS / 1000} 秒即自動開始
          </label>
          {step > 0 && step < 5 && (
            <button
              className="btn btn-secondary btn-sm"
              disabled={capturing}
              onClick={() => {
                // 回上一步是明確的「重捕」意圖,該步必須重新允許自動擷取
                autoTriedRef.current.delete(step - 1)
                setStep(step - 1)
              }}
            >
              ← 上一步(重捕)
            </button>
          )}
        </div>

        <div className="wizard-steps-nav">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`dot-step${i <= step ? ' done' : ''}`} />
          ))}
        </div>

        {countdown != null && <div className="wizard-count">{countdown}</div>}

        {step === 0 && (
          <div className="wizard-step">
            <h4>步驟 1/6 · 佩戴確認</h4>
            <p className="desc">
              確認兩顆感測器已固定:<b>大腿感測器</b>(0x68)綁於大腿外側、
              <b>小腿感測器</b>(0x69)綁於小腿外側。<b>方向與角度不必在意</b>——精靈會
              自動偵測貼歪 90°(軸對調)與方向反相並校正,但過程中感測器不可鬆動移位。
            </p>
            {!isConnected && <p className="wizard-err">⚠ 裝置未連線,請先於頂部連線後再開始。</p>}
            <button className="btn btn-primary" disabled={!isConnected} onClick={() => setStep(1)}>
              開始
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-step">
            <h4>步驟 2/6 · 站直捕捉零位</h4>
            <p className="desc">請自然站直、雙腿垂直於地面,按下按鈕後保持靜止約 4 秒。</p>
            {errMsg && <p className="wizard-err">{errMsg}</p>}
            {captureButton('baseline', 2)}
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <h4>步驟 3/6 · 向前抬起大腿</h4>
            <p className="desc">
              向<b>前方</b>抬起大腿(膝蓋可彎),抬到明顯高度(約 45° 以上)後定住,
              按下按鈕保持姿勢約 4 秒。
            </p>
            {errMsg && <p className="wizard-err">{errMsg}</p>}
            {captureButton('thighRaise', 3)}
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <h4>步驟 4/6 · 站立後勾小腿</h4>
            <p className="desc">
              大腿保持直立,將<b>腳跟向後上方勾起</b>(彎膝),勾到明顯角度(約 45°)後定住,
              按下按鈕保持姿勢約 4 秒。
            </p>
            {errMsg && <p className="wizard-err">{errMsg}</p>}
            {captureButton('kneeFlex', 4)}
          </div>
        )}

        {step === 4 && (
          <div className="wizard-step">
            {/* 2026-08-01 會議連帶決議:這一步是全精靈唯一需要單腳站立的動作,
                對平衡受限的復健患者最困難——而它校準的 roll invert 完全不進入判定路徑
                (達標、次數、超限警報都不讀 roll)。因此明確標示為選配,且把「略過」
                做成與「捕捉」同等份量的主要動作,而不是看起來像放棄的次要按鈕。 */}
            <h4>步驟 5/6 · 腿向外側擺(選配)</h4>
            <p className="desc">
              這一步<b>只影響顯示</b>:3D 姿態、內外翻數值與圖表的正負方向。
              <b>達標判定、次數計算與超限警報都不使用這個資料</b>,略過不會讓校準不完整。
            </p>
            <p className="desc">
              需要單腳站立,若平衡不便請直接略過。要做的話:全腿伸直,將整條腿向
              <b>身體外側</b>側擺約 20–30° 後定住,按下按鈕保持約 4 秒。大腿與小腿分開判定,
              某一側幅度不足時該側沿用現有設定,不影響另一側。
            </p>
            {errMsg && <p className="wizard-err">{errMsg}</p>}
            <div className="row">
              <button className="btn btn-primary" disabled={capturing} onClick={() => void finish(false)}>
                略過,直接完成校準
              </button>
              <button className="btn btn-secondary" disabled={capturing} onClick={() => void finish(true)}>
                {capturing
                  ? countdown != null
                    ? `${countdown}…`
                    : '捕捉中…'
                  : '仍要校正顯示方向(倒數 3 秒)'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="wizard-step">
            <h4>步驟 6/6 · 預覽確認</h4>
            <p className="desc">
              方向校正已計算完成(尚未套用)。請實際動動看:<b>站直時數值應接近 0°、
              前抬大腿時「大腿」變大(正值)、腿向外側擺時內外翻顯示「外翻」</b>。確認無誤再按套用。
            </p>
            <div className="wizard-preview">
              <div className="cell">
                <div className="metric-sub">大腿 Pitch</div>
                <div className="v">{preview ? `${preview.thigh.toFixed(1)}°` : '--'}</div>
              </div>
              <div className="cell">
                <div className="metric-sub">小腿 Pitch</div>
                <div className="v">{preview ? `${preview.shin.toFixed(1)}°` : '--'}</div>
              </div>
              <div className="cell">
                <div className="metric-sub">膝夾角</div>
                <div className="v">{preview ? `${preview.knee.toFixed(1)}°` : '--'}</div>
              </div>
              <div className="cell">
                <div className="metric-sub">內外翻</div>
                <div className="v">
                  {preview
                    ? `${Math.abs(preview.kneeRoll).toFixed(1)}° ${preview.kneeRoll >= 0 ? '外翻' : '內翻'}`
                    : '--'}
                </div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>
                重新校準
              </button>
              <button className="btn btn-success" onClick={apply}>
                確認套用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
