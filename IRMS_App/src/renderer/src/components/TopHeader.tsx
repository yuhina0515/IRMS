// renderer/components/TopHeader.tsx
// 頂部狀態列:logo/連線狀態/Connect 按鈕/主題切換/(自訂標題列時)拖曳與視窗控制鈕。
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import { irms } from '../platform/irmsApi'
import logoIcon from '../assets/logo-icon-only.png'

function SunIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MinimizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function MaximizeIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function RestoreIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      {/* 後方方框只畫「沒被前方方框蓋住」的那段 L 形外框——不靠填色蓋住重疊角,
          避免 hover 時按鈕背景色一換,這裡的填色沒跟著換而穿幫。 */}
      <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

function CloseIcon(): JSX.Element {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * 自訂視窗控制鈕。RDP session(main process 判定 hasCustomTitlebar=false)不渲染這一段——
 * 那種 session 本來就有原生框與原生按鈕,兩份疊在一起會很奇怪(見 main/index.ts 註解)。
 */
function WindowControls(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    irms.windowControls.isMaximized().then(setIsMaximized)
    return irms.windowControls.onMaximizedChange(setIsMaximized)
  }, [])

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-btn"
        aria-label="最小化"
        onClick={() => void irms.windowControls.minimize()}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label={isMaximized ? '還原' : '最大化'}
        onClick={() => void irms.windowControls.toggleMaximize()}
      >
        {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>
      <button
        type="button"
        className="window-btn window-btn-close"
        aria-label="關閉"
        onClick={() => void irms.windowControls.close()}
      >
        <CloseIcon />
      </button>
    </div>
  )
}

export function TopHeader(): JSX.Element {
  const isConnected = useStore((s) => s.isConnected)
  const statusText = useStore((s) => s.statusText)
  const demoMode = useUiStore((s) => s.demoMode)
  const reconnect = useStore((s) => s.reconnect)
  const themeMode = useStore((s) => s.settings.themeMode)
  const setSettings = useStore((s) => s.setSettings)
  const [hasCustomTitlebar, setHasCustomTitlebar] = useState(false)

  // Ctrl/Cmd+K 連線切換。守衛與按鈕的 disabled 同一條(demoMode),
  // 快捷鍵不得成為繞過示範模式互斥的後門。
  useGlobalShortcut({ key: 'k' }, demoMode ? null : () => void bluetoothService.connect())

  useEffect(() => {
    irms.windowControls.hasCustomTitlebar().then(setHasCustomTitlebar)
  }, [])

  return (
    <header
      className={`top-header glass${hasCustomTitlebar ? ' draggable' : ''}`}
      // 雙擊拖曳列切換最大化/還原——比照 Windows/macOS 原生標題列的標準手感。
      // RDP session(hasCustomTitlebar=false)已有原生框自帶這個行為,不重複掛。
      onDoubleClick={hasCustomTitlebar ? () => void irms.windowControls.toggleMaximize() : undefined}
    >
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
      <div className="row" style={{ gap: 10 }}>
        <button
          className="btn btn-secondary btn-sm"
          title={themeMode === 'dark' ? '切換為 Precision Lab Light' : '切換為 Data-Console Dark'}
          onClick={() => setSettings({ themeMode: themeMode === 'dark' ? 'light' : 'dark' })}
        >
          {themeMode === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className={`btn btn-sm ${isConnected ? 'btn-danger-ghost' : 'btn-primary'}`}
          disabled={demoMode}
          title={demoMode ? '示範模式進行中,無法連線真實裝置——請先於設定頁結束示範模式' : undefined}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? '示範模式中' : isConnected ? 'Disconnect' : 'Connect Device'}
        </button>
      </div>

      {hasCustomTitlebar && <WindowControls />}
    </header>
  )
}
