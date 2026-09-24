// 情境命令列:目前工作區、裝置狀態與全域操作。不是第二條標題列——Windows 原生
// decorations 保留(175% DPI 自訂框點擊偏移問題,見 UI_REDESIGN.md)。
import { useEffect, useState } from 'react'
import { useT, type Messages } from '../i18n'
import { useStore } from '../store/useStore'
import { useUiStore } from '../store/useUiStore'
import { bluetoothService } from '../services/bluetooth'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'
import { irms } from '../platform/irmsApi'
import { CloseIcon, FocusIcon, MoonIcon, SunIcon, SystemThemeIcon } from './Icons'
import type { ThemeMode } from '../services/theme'

const NEXT_THEME: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }

/** bluetooth.ts 寫入的暫態狀態字串 → 目前語言(未知字串原樣顯示,不吞掉資訊) */
function describeStatus(t: Messages, statusText: string): string {
  if (statusText === 'Connecting...') return t.shell.statusConnecting
  if (statusText === 'Device not found') return t.shell.statusNotFound
  if (statusText === 'Connection failed') return t.shell.statusFailed
  if (statusText === 'Disconnected') return t.shell.statusDisconnected
  return statusText
}

/**
 * 自訂視窗控制鈕。只有 main process 判定使用自訂標題列時才渲染;目前 tauri.conf.json
 * decorations:true,正常情況不會出現,保留以免未來切回自訂框時少了關閉鈕。
 */
function WindowControls(): JSX.Element {
  const t = useT()
  const [isMaximized, setIsMaximized] = useState(false)
  useEffect(() => {
    irms.windowControls.isMaximized().then(setIsMaximized)
    return irms.windowControls.onMaximizedChange(setIsMaximized)
  }, [])
  return (
    <div className="window-controls">
      <button type="button" aria-label={t.shell.minimize} onClick={() => void irms.windowControls.minimize()}>
        –
      </button>
      <button
        type="button"
        aria-label={isMaximized ? t.shell.restore : t.shell.maximize}
        onClick={() => void irms.windowControls.toggleMaximize()}
      >
        {isMaximized ? '❐' : '□'}
      </button>
      <button
        type="button"
        className="is-close"
        aria-label={t.shell.closeWindow}
        onClick={() => void irms.windowControls.close()}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  )
}

export function CommandBar(): JSX.Element {
  const t = useT()
  const view = useUiStore((s) => s.view)
  const demoMode = useUiStore((s) => s.demoMode)
  const isConnected = useStore((s) => s.isConnected)
  const deviceName = useStore((s) => s.deviceName)
  const statusText = useStore((s) => s.statusText)
  const reconnect = useStore((s) => s.reconnect)
  const themeMode = useStore((s) => s.settings.themeMode)
  const focusMode = useStore((s) => s.settings.focusMode)
  const setSettings = useStore((s) => s.setSettings)
  const [hasCustomTitlebar, setHasCustomTitlebar] = useState(false)

  // Ctrl/Cmd+K 連線切換。守衛與按鈕的 disabled 同一條(demoMode),
  // 快捷鍵不得成為繞過示範模式互斥的後門。
  useGlobalShortcut({ key: 'k' }, demoMode ? null : () => void bluetoothService.connect())

  useEffect(() => {
    irms.windowControls.hasCustomTitlebar().then(setHasCustomTitlebar)
  }, [])

  const meta = t.workspaces[view]
  const themeLabel =
    themeMode === 'system' ? t.shell.themeSystem : themeMode === 'light' ? t.shell.themeLight : t.shell.themeDark
  const ThemeIcon = themeMode === 'system' ? SystemThemeIcon : themeMode === 'light' ? SunIcon : MoonIcon

  // 狀態膠片:已連線 success 實心點、重連中 warning + 確定性進度、其餘中性(§7)
  const pillClass = reconnect ? ' status-pill--retry' : isConnected ? ' status-pill--on' : ''
  const statusLabel = reconnect
    ? t.shell.statusReconnecting(reconnect.attempt, reconnect.max)
    : isConnected
      ? deviceName
        ? `${t.shell.statusConnected} · ${deviceName}`
        : t.shell.statusConnected
      : describeStatus(t, statusText)

  return (
    <header
      className="cmdbar"
      onDoubleClick={hasCustomTitlebar ? () => void irms.windowControls.toggleMaximize() : undefined}
      {...(hasCustomTitlebar ? { 'data-tauri-drag-region': true } : {})}
    >
      <div className="cmdbar__title">
        <span className="cmdbar__index">{meta.index}</span>
        <h1>{meta.title}</h1>
      </div>

      <div className="cmdbar__status">
        <span className={`status-pill${pillClass}`} role="status">
          <span className="status-dot" aria-hidden />
          <span>{statusLabel}</span>
          {reconnect && (
            <span className="status-track" aria-hidden>
              <span style={{ width: `${(reconnect.attempt / reconnect.max) * 100}%` }} />
            </span>
          )}
        </span>
      </div>

      <div className="cmdbar__actions">
        {view === 'dashboard' && (
          <button
            type="button"
            className={`btn btn--sm${focusMode ? ' btn--selected' : ''}`}
            aria-pressed={focusMode}
            title={focusMode ? t.shell.focusOff : t.shell.focusOn}
            onClick={() => setSettings({ focusMode: !focusMode })}
          >
            <FocusIcon size={16} />
            {t.shell.focus}
          </button>
        )}
        <button
          type="button"
          className="btn btn--sm btn--icon"
          aria-label={themeLabel}
          title={themeLabel}
          onClick={() => setSettings({ themeMode: NEXT_THEME[themeMode] })}
        >
          <ThemeIcon size={16} />
        </button>
        {/* 示範模式下停用真實連線,並把理由講出來;bluetoothService.connect() 內另有一道提前 return */}
        <button
          type="button"
          className={`btn btn--sm ${isConnected ? 'btn--danger-ghost' : 'btn--primary'}`}
          disabled={demoMode}
          title={demoMode ? t.shell.demoConnectBlocked : undefined}
          onClick={() => void bluetoothService.connect()}
        >
          {demoMode ? t.shell.demoActive : isConnected ? t.shell.disconnect : t.shell.connect}
        </button>
      </div>

      {hasCustomTitlebar && <WindowControls />}
    </header>
  )
}
