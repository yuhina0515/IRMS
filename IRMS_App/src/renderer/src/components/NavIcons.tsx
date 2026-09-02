// renderer/components/NavIcons.tsx
// Sidebar 導覽圖示(還原自 legacy-ui-liquid-glass 封存分支——極簡線條圖示本身跟
// Apple 語系無關,值得留用):24x24 viewBox、stroke="currentColor" 跟隨按鈕文字色
// (inactive=dim、active=accent)。
type IconProps = { size?: number }

export function DashboardIcon({ size = 22 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 13a8 8 0 0 1 16 0M4 13a1 1 0 0 1-1-1 9 9 0 0 1 18 0 1 1 0 0 1-1 1M12 13l4-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="1.4" fill="currentColor" />
    </svg>
  )
}

export function ActionsIcon({ size = 22 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 6h11M8 12h11M8 18h11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 5.3l.9.9L6.6 4.4M4 11.3l.9.9 1.7-1.8M4 17.3l.9.9 1.7-1.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function HistoryIcon({ size = 22 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function SettingsIcon({ size = 22 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
