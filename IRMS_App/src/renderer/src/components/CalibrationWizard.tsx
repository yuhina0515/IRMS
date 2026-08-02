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
  type CalibrationError,
  type CaptureStats
} from '../services/calibration'

const SAMPLE_COUNT = 30
const CAPTURE_TIMEOUT_MS = 3000

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
  const capturesRef = useRef<{
    baseline?: CaptureStats
    thighRaise?: CaptureStats
    kneeFlex?: CaptureStats
  }>({})
  const cancelledRef = useRef(false)

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
