// renderer/components/ErrorOverlay.tsx
// 補回舊版重構時遺失的功能:硬體錯誤(ERR:1)紅色全螢幕警示遮罩。
// 出現時凍結畫面;BluetoothService 於收到 ERR 時即停止餵入角度,故資料寫入也自動暫停。
//
// 2026-08-01 會議 F(意見清單 #6):此遮罩原本沒有任何按鈕,而它是
// `position:fixed; inset:0; z-index:1500`——I2C 故障期間使用者實體上按不到
// 「結束 Session」,唯一出路是強殺 App,而強殺會讓該場 session 留下
// endTime=NULL / repsCompleted=0 的孤兒列(真實資料變成 0 reps)。
// 因此遮罩一律提供逃生出口:結束並儲存 Session、中斷連線。
import { useStore } from '../store/useStore'
import { sessionController } from '../services/sessionController'
import { bluetoothService } from '../services/bluetooth'

export function ErrorOverlay(): JSX.Element | null {
  const hardwareError = useStore((s) => s.hardwareError)
  const running = useStore((s) => s.session.running)
  if (!hardwareError) return null

  return (
    <div className="error-overlay">
      <div className="icon">🚨</div>
      <h2>硬體異常</h2>
      <p>
        感測器 I2C 連線脫落({hardwareError}),系統嘗試重新連線中…
        <br />
        即時數據已凍結、資料寫入已暫停,以避免記錄無效讀數。
      </p>
      <div className="error-overlay-actions">
        {running && (
          <button className="btn btn-primary" onClick={() => void sessionController.endSession()}>
            結束並儲存 Session
          </button>
        )}
        <button className="btn" onClick={() => bluetoothService.disconnect()}>
          中斷連線
        </button>
      </div>
      <p className="error-overlay-hint">
        感測器接回後警示會自動消失;若無法恢復,請先結束 Session 以保住已記錄的資料。
      </p>
    </div>
  )
}
