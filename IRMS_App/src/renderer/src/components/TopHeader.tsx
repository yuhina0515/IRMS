// renderer/components/TopHeader.tsx
// 頂部狀態列:取代舊側欄的 logo/連線狀態/Connect 按鈕,橫向玻璃 bar。
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import logoIcon from '../assets/logo-icon-only.png'

export function TopHeader(): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const statusText = useStore((s) => s.statusText)
  const demoMode = useUiStore((s) => s.demoMode)
  const reconnect = useStore((s) => s.reconnect)

  // Ctrl/Cmd+K 連線切換。守衛與按鈕的 disabled 同一條(demoMode),
  // 快捷鍵不得成為繞過示範模式互斥的後門。
  useGlobalShortcut({ key: 'k' }, demoMode ? null : () => void bluetoothService.connect())

  return (
    <header className="top-header glass">
      <div className="logo">
        <img src={logoIcon} alt="" className="logo-mark" />
        <h1>
          IRMS<span>.</span>
        </h1>
      </div>

      <div className="conn">
        <span className={`dot${isConnected ? ' on' : ''}${reconnect ? ' retrying' : ''}`} />
        {/* 重連中顯示確定性進度而非一句籠統的狀態文字:使用者要判斷的是
            「還會不會好」還是「該去看裝置了」,而那取決於還剩幾次。 */}
        {reconnect ? (
          <span className="conn-text">
            重新連線中 {reconnect.attempt}/{reconnect.max}
            <span className="reconnect-track" aria-hidden>
              <span
                className="reconnect-fill"
                style={{ width: `${(reconnect.attempt / reconnect.max) * 100}%` }}
              />
            </span>
          </span>
        ) : (
          <span className="conn-text">{statusText}</span>
        )}
      </div>

      {/* 示範模式下停用真實連線,並把理由講出來而不是留一個按不動的按鈕
          (沿用 SettingsView 已建立的慣例)。bluetoothService.connect() 內另有
          一道提前 return,擋掉任何繞過 UI 的路徑。 */}
      <button
        className={`btn btn-sm ${isConnected ? 'btn-danger-ghost' : 'btn-primary'}`}
        disabled={demoMode}
        title={demoMode ? '示範模式進行中,無法連線真實裝置——請先於設定頁結束示範模式' : undefined}
        onClick={() => void bluetoothService.connect()}
      >
        {demoMode ? '示範模式中' : isConnected ? 'Disconnect' : 'Connect Device'}
      </button>
    </header>
  )
}
