// renderer/components/ErrorOverlay.tsx
// 硬體錯誤(ERR:1)紅色全螢幕警示遮罩。
// 出現時凍結畫面;BluetoothService 於收到 ERR 時即停止餵入角度,故資料寫入也自動暫停。
//
// 此遮罩是 `position:fixed; inset:0; z-index:1500`——I2C 故障期間使用者實體上按不到
// 「結束 Session」,唯一出路是強殺 App,而強殺會讓該場 session 留下
// endTime=NULL / repsCompleted=0 的孤兒列(真實資料變成 0 reps)。
// 因此遮罩一律提供逃生出口:結束並儲存 Session、中斷連線。
import { useStore } from '../store/useStore'
import { sessionController } from '../services/sessionController'
import { bluetoothService } from '../services/bluetooth'
import { useT } from '../i18n'

export function ErrorOverlay(): JSX.Element | null {
  const hardwareError = useStore((s) => s.hardwareError)
  const running = useStore((s) => s.session.running)
  const m = useT()
  if (!hardwareError) return null

  return (
    <div className="error-overlay">
      <div className="icon">🚨</div>
      <h2>{m.errorOverlay.title}</h2>
      <p>
        {m.errorOverlay.lost({ code: hardwareError })}
        <br />
        {m.errorOverlay.frozen}
      </p>
      <div className="error-overlay-actions">
        {running && (
          <button className="btn btn-primary" onClick={() => void sessionController.endSession()}>
            {m.common.endAndSaveSession}
          </button>
        )}
        <button className="btn" onClick={() => bluetoothService.disconnect()}>
          {m.common.disconnect}
        </button>
      </div>
      <p className="error-overlay-hint">
        {m.errorOverlay.hint}
      </p>
    </div>
  )
}
