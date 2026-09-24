// 硬體錯誤(ERR:1)全螢幕警示遮罩。出現時凍結畫面;BluetoothService 於收到 ERR 時即停止餵入角度,
// 資料寫入也自動暫停。
//
// 遮罩蓋住整個 App——I2C 故障期間使用者實體上按不到「結束療程」,唯一出路是強殺 App,
// 而強殺會讓該場 session 留下 endTime=NULL / repsCompleted=0 的孤兒列。
// 因此遮罩一律提供逃生出口:結束並儲存療程、中斷連線。
import { useT } from '../i18n'
import { useStore } from '../store/useStore'
import { sessionController } from '../services/sessionController'
import { bluetoothService } from '../services/bluetooth'
import { AlertIcon } from './Icons'

export function ErrorOverlay(): JSX.Element | null {
  const t = useT()
  const hardwareError = useStore((s) => s.hardwareError)
  const running = useStore((s) => s.session.running)
  if (!hardwareError) return null

  return (
    <div className="hw-overlay" role="alertdialog" aria-modal="true" aria-labelledby="hw-title">
      <div className="hw-overlay__card">
        <h2 id="hw-title">
          <AlertIcon size={32} />
          {t.dialogs.hwTitle}
        </h2>
        <p>{t.dialogs.hwBody(hardwareError)}</p>
        <div className="row">
          {running && (
            <button type="button" className="btn btn--primary btn--lg" onClick={() => void sessionController.endSession()}>
              {t.common.endAndSaveSession}
            </button>
          )}
          <button type="button" className="btn btn--lg" onClick={() => bluetoothService.disconnect()}>
            {t.shell.disconnect}
          </button>
        </div>
        <p className="field__hint">{t.dialogs.hwHint}</p>
      </div>
    </div>
  )
}
