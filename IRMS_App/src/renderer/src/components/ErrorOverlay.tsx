// renderer/components/ErrorOverlay.tsx
// 補回舊版重構時遺失的功能:硬體錯誤(ERR:1)紅色全螢幕警示遮罩。
// 出現時凍結畫面;BluetoothService 於收到 ERR 時即停止餵入角度,故資料寫入也自動暫停。
import { useStore } from '../store/useStore'

export function ErrorOverlay(): JSX.Element | null {
  const hardwareError = useStore((s) => s.hardwareError)
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
    </div>
  )
}
