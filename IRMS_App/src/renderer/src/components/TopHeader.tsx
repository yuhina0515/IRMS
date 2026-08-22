// renderer/components/TopHeader.tsx
// 頂部狀態列:取代舊側欄的 logo/連線狀態/Connect 按鈕,橫向玻璃 bar。
import { useStore } from '../store/useStore'
import { bluetoothService } from '../services/bluetooth'
import logoIcon from '../assets/logo-icon-only.png'

export function TopHeader(): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const statusText = useStore((s) => s.statusText)

  return (
    <header className="top-header glass">
      <div className="logo">
        <img src={logoIcon} alt="" className="logo-mark" />
        <h1>
          IRMS<span>.</span>
        </h1>
      </div>

      <div className="conn">
        <span className={`dot${isConnected ? ' on' : ''}`} />
        <span className="conn-text">{statusText}</span>
      </div>

      <button
        className={`btn btn-sm ${isConnected ? 'btn-danger-ghost' : 'btn-primary'}`}
        onClick={() => void bluetoothService.connect()}
      >
        {isConnected ? 'Disconnect' : 'Connect Device'}
      </button>
    </header>
  )
}
